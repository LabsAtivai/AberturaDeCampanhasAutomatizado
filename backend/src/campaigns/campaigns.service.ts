import { Injectable, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { CredentialsApiService } from '../shared/credentials-api.service';
import { createObjectCsvWriter } from 'csv-writer';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface SnovCampaign {
  id: string;
  name: string;
  createdAt: number | null; // epoch em segundos
}

export interface FailedCampaign {
  campaignId: string;
  campaign: string;
  reason: string;
}

interface OpenedItem {
  visitedAtMs: number;
  prospectEmail: string;
  sourcePage: string;
}

// Limita requisições simultâneas à API do Snov.io (todas as contas/campanhas somadas).
class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

// Snov.io: 60 requisições/minuto por conta (estourar bloqueia por ~5 min).
// Janela deslizante por chave, com folga, e fila serializada por chave.
class RateWindow {
  private readonly windows = new Map<string, { ts: number[]; chain: Promise<void> }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  async acquire(key: string): Promise<void> {
    let w = this.windows.get(key);
    if (!w) {
      w = { ts: [], chain: Promise.resolve() };
      this.windows.set(key, w);
    }

    const prev = w.chain;
    let release!: () => void;
    w.chain = new Promise<void>((resolve) => (release = resolve));
    await prev;

    try {
      while (true) {
        const now = Date.now();
        while (w.ts.length && w.ts[0] <= now - this.windowMs) w.ts.shift();
        if (w.ts.length < this.max) {
          w.ts.push(now);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, w.ts[0] + this.windowMs - now + 50));
      }
    } finally {
      release();
      if (this.windows.size > 1000) {
        const now = Date.now();
        for (const [k, v] of this.windows) {
          if (!v.ts.length || v.ts[v.ts.length - 1] <= now - this.windowMs) this.windows.delete(k);
        }
      }
    }
  }
}

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000; // America/Sao_Paulo = UTC-3 (sem horário de verão)

@Injectable()
export class CampaignsService implements OnModuleInit {
  constructor(private readonly credentialsApiService: CredentialsApiService) {}

  private readonly snovLimiter = new Semaphore(12);
  private readonly accountRate = new RateWindow(55, 60 * 1000);
  private readonly maxAttempts = 3;

  // Cache curto do histórico de aberturas por campanha (a API não filtra por data).
  private readonly openedCacheTtlMs = 5 * 60 * 1000;
  private readonly openedCacheMaxEntries = 200;
  private readonly openedCache = new Map<string, { expiresAt: number; items: OpenedItem[] }>();

  // CSVs gerados ficam em diretório temporário, um arquivo por relatório.
  private readonly reportsDir = path.join(os.tmpdir(), 'aberturas-reports');
  private readonly reportTtlMs = 60 * 60 * 1000;

  // Cache em memória da contagem de campanhas por cliente, atualizado pelo cron diário
  // e uma vez na inicialização (substitui a antiga escrita na coluna "totalCampanhas" do Google Sheets).
  private readonly campaignCounts = new Map<string, number>();

  onModuleInit() {
    // Sem await: não atrasa a subida da aplicação.
    void this.refreshCampaignCounts();
  }

  getCampaignCount(emailSnovio: string): number {
    return this.campaignCounts.get(emailSnovio) || 0;
  }

  // === CRON DIÁRIO: atualiza contagem de campanhas em cache ===
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async refreshCampaignCounts() {
    console.log('⏰ Atualizando contagem de campanhas...');

    try {
      const clients = await this.credentialsApiService.getActiveClients(true);
      const CHUNK = 5;
      let failures = 0;

      for (let i = 0; i < clients.length; i += CHUNK) {
        await Promise.all(
          clients.slice(i, i + CHUNK).map(async (client) => {
            try {
              const accessToken = await this.getAccessToken(client.clientId, client.clientSecret);
              const campaigns = await this.getUserCampaigns(accessToken);
              this.campaignCounts.set(client.emailSnovio, campaigns.length);
            } catch (err: any) {
              failures++;
              console.error(
                `Erro ao atualizar campanhas para ${client.emailSnovio}:`,
                err?.message || err,
              );
            }
          }),
        );
      }

      console.log(`✅ Contagem atualizada: ${clients.length - failures}/${clients.length} clientes.`);
    } catch (err) {
      console.error('❌ Erro geral ao atualizar contagens:', err);
    }
  }

  // === SNOV.IO ===

  private isRetryable(err: any): boolean {
    // 429 não é retentado: o Snov.io bloqueia a conta por ~5 min, retry imediato só piora.
    const status = err?.response?.status;
    return !status || status >= 500;
  }

  // GET com limite por conta (60/min), concorrência global e retry com backoff (5xx/timeout).
  private async snovGet(url: string, accessToken: string, params?: Record<string, any>, timeout = 20000) {
    let lastErr: any;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        await this.accountRate.acquire(accessToken);
        return await this.snovLimiter.run(() =>
          axios.get(url, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
            params,
            timeout,
          }),
        );
      } catch (err: any) {
        lastErr = err;
        if (attempt === this.maxAttempts || !this.isRetryable(err)) break;

        const retryAfter = Number(err?.response?.headers?.['retry-after']);
        const delay = retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastErr;
  }

  async getAccessToken(clientId: string, clientSecret: string) {
    const url = 'https://api.snov.io/v1/oauth/access_token';
    const body = {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    };

    let lastErr: any;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        await this.accountRate.acquire(`client:${clientId}`);
        const { data } = await this.snovLimiter.run(() =>
          axios.post(url, body, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            timeout: 10000,
          }),
        );

        if (!data.access_token) throw new Error('Snov não retornou access_token');
        return data.access_token as string;
      } catch (err: any) {
        lastErr = err;
        if (attempt === this.maxAttempts || !this.isRetryable(err)) break;
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
      }
    }

    console.error('❌ Erro ao obter token do Snov.io:', {
      status: lastErr?.response?.status,
      data: lastErr?.response?.data,
      message: lastErr?.message,
    });
    throw new Error(`Falha ao obter access token: ${lastErr?.response?.data?.error || lastErr?.message}`);
  }

  // A rota get-campaign-analytics retorna 404, então usamos direto get-user-campaigns.
  // Nesta API o nome vem no campo "campaign" (não "name").
  async getUserCampaigns(accessToken: string): Promise<SnovCampaign[]> {
    try {
      const { data } = await this.snovGet('https://api.snov.io/v1/get-user-campaigns', accessToken);

      if (!Array.isArray(data)) return [];

      return data
        .filter((c: any) => c?.id != null)
        .map((c: any) => ({
          id: String(c.id),
          name: c.campaign || c.name || 'Campanha sem nome',
          createdAt: typeof c.created_at === 'number' ? c.created_at : null,
        }));
    } catch (err: any) {
      console.error('❌ Não foi possível obter campanhas:', err?.message);
      throw new Error('Não foi possível obter campanhas');
    }
  }

  // === DATAS (dd/mm/yyyy interpretadas em BRT; visitedAt da API vem em UTC) ===

  private parseBrDateStartMs(brDate: string): number {
    const [day, month, year] = brDate.split('/').map((n) => parseInt(n, 10));
    return Date.UTC(year, month - 1, day) + BRT_OFFSET_MS;
  }

  private parseBrDateEndMs(brDate: string): number {
    return this.parseBrDateStartMs(brDate) + 24 * 60 * 60 * 1000 - 1;
  }

  private formatBrt(ms: number): string {
    const d = new Date(ms - BRT_OFFSET_MS);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${day}-${month}-${d.getUTCFullYear()}`;
  }

  // === ABERTURAS ===

  private async fetchOpened(accessToken: string, campaignId: string): Promise<OpenedItem[]> {
    const cached = this.openedCache.get(campaignId);
    if (cached && cached.expiresAt > Date.now()) return cached.items;

    const { data } = await this.snovGet(
      'https://api.snov.io/v1/get-emails-opened',
      accessToken,
      { campaignId },
      30000,
    );

    const items: OpenedItem[] = Array.isArray(data)
      ? data
          .map((item: any) => ({
            visitedAtMs: new Date(item.visitedAt).getTime(),
            prospectEmail: item.prospectEmail || '',
            sourcePage: item.sourcePage || '',
          }))
          .filter((i) => !Number.isNaN(i.visitedAtMs))
      : [];

    this.storeOpenedCache(campaignId, items);
    return items;
  }

  private storeOpenedCache(campaignId: string, items: OpenedItem[]) {
    const now = Date.now();
    if (this.openedCache.size >= this.openedCacheMaxEntries) {
      for (const [key, value] of this.openedCache) {
        if (value.expiresAt <= now) this.openedCache.delete(key);
      }
      // Ainda cheio: descarta a entrada mais antiga (Map preserva ordem de inserção).
      if (this.openedCache.size >= this.openedCacheMaxEntries) {
        const oldest = this.openedCache.keys().next().value;
        if (oldest !== undefined) this.openedCache.delete(oldest);
      }
    }
    this.openedCache.set(campaignId, { expiresAt: now + this.openedCacheTtlMs, items });
  }

  async getEmailsOpenedFast(
    accessToken: string,
    campaigns: SnovCampaign[],
    startDate: string,
    endDate: string,
  ): Promise<{ data: any[]; failedCampaigns: FailedCampaign[] }> {
    const startMs = this.parseBrDateStartMs(startDate);
    const endMs = this.parseBrDateEndMs(endDate);

    // Campanha criada depois do fim do período não pode ter aberturas nele.
    // (updated_at NÃO é confiável para isso: aberturas chegam depois da última atualização.)
    const relevant = campaigns.filter((c) => c.createdAt == null || c.createdAt * 1000 <= endMs);

    const failedCampaigns: FailedCampaign[] = [];
    const results = await Promise.all(
      relevant.map(async (campaign) => {
        try {
          const items = await this.fetchOpened(accessToken, campaign.id);
          return items
            .filter((i) => i.visitedAtMs >= startMs && i.visitedAtMs <= endMs)
            .map((i) => ({
              campaignId: campaign.id,
              campaign: campaign.name || 'N/A',
              prospectEmail: i.prospectEmail,
              sourcePage: i.sourcePage,
              visitedAt: this.formatBrt(i.visitedAtMs),
            }));
        } catch (err: any) {
          failedCampaigns.push({
            campaignId: campaign.id,
            campaign: campaign.name,
            reason: err?.response?.status ? `HTTP ${err.response.status}` : err?.message || 'erro',
          });
          return [];
        }
      }),
    );

    return { data: results.flat(), failedCampaigns };
  }

  // === CSV ===

  private csvPathFor(id: string) {
    return path.join(this.reportsDir, `AberturasDeCampanhas-${id}.csv`);
  }

  private cleanupOldReports() {
    try {
      const now = Date.now();
      for (const file of fs.readdirSync(this.reportsDir)) {
        const full = path.join(this.reportsDir, file);
        if (now - fs.statSync(full).mtimeMs > this.reportTtlMs) fs.unlinkSync(full);
      }
    } catch {
      // limpeza é best-effort
    }
  }

  // Retorna o caminho do CSV do relatório "id"; sem id, o mais recente (compatibilidade).
  getCsvFilePath(id?: string): string | null {
    if (id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const p = this.csvPathFor(id);
      return fs.existsSync(p) ? p : null;
    }

    try {
      const files = fs
        .readdirSync(this.reportsDir)
        .map((f) => ({ f, t: fs.statSync(path.join(this.reportsDir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      return files.length ? path.join(this.reportsDir, files[0].f) : null;
    } catch {
      return null;
    }
  }

  async saveToCsv(allData: any[]): Promise<string | null> {
    if (!allData.length) return null;

    fs.mkdirSync(this.reportsDir, { recursive: true });
    this.cleanupOldReports();

    const id = randomUUID();
    const csvWriter = createObjectCsvWriter({
      path: this.csvPathFor(id),
      header: [
        { id: 'clientEmail', title: 'Email do cliente' },
        { id: 'campaign', title: 'Campanha' },
        { id: 'prospectEmail', title: 'Email do prospect' },
        { id: 'sourcePage', title: 'Linkedin' },
        { id: 'visitedAt', title: 'Data de abertura' },
      ],
      encoding: 'utf8',
    });

    await csvWriter.writeRecords(allData);
    return id;
  }

  // Se em algum momento você quiser usar todos os clientes de uma vez
  async getCampaignsForAllClients(startDate: string, endDate: string) {
    const clients = await this.credentialsApiService.getActiveClients();
    const allData: any[] = [];

    for (const client of clients) {
      try {
        const accessToken = await this.getAccessToken(client.clientId, client.clientSecret);
        const campaigns = await this.getUserCampaigns(accessToken);
        const { data } = await this.getEmailsOpenedFast(accessToken, campaigns, startDate, endDate);

        allData.push(...data.map((item) => ({ clientEmail: client.emailSnovio, ...item })));
      } catch (err: any) {
        console.error(`Erro ao coletar campanhas para cliente ${client.emailSnovio}:`, err?.message || err);
      }
    }

    return allData;
  }
}
