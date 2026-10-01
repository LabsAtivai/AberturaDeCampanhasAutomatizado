import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { CredentialsApiService } from '../shared/credentials-api.service';
import { Cron, CronExpression } from '@nestjs/schedule';

interface Campaign {
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

// Limita requisições simultâneas à API do Snov.io (todas as contas somadas).
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

interface EmailOpening {
  campaignId: string;
  campaign: string;
  prospectEmail: string;
  sourcePage: string;
  visitedAt: string;
}

@Injectable()
export class CampaignsService implements OnModuleInit {
  private readonly logger = new Logger(CampaignsService.name);

  // Cache de tokens por clientId → { token, expiresAt }
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();

  private readonly snovLimiter = new Semaphore(12);
  private readonly accountRate = new RateWindow(55, 60 * 1000);

  // Cache curto do histórico de aberturas por campanha (a API não filtra por data;
  // relatório e download repetem as mesmas consultas).
  private readonly openedCacheTtlMs = 5 * 60 * 1000;
  private readonly openedCacheMaxEntries = 200;
  private readonly openedCache = new Map<string, { expiresAt: number; items: OpenedItem[] }>();

  // Cache em memória da contagem de campanhas por cliente, atualizado pelo cron diário
  // (substitui a antiga escrita na coluna "totalCampanhas" do Google Sheets).
  private readonly campaignCounts = new Map<string, number>();

  constructor(private readonly credentialsApiService: CredentialsApiService) {}

  onModuleInit() {
    // Sem await: não atrasa a subida da aplicação.
    void this.refreshCampaignCounts();
  }

  getCampaignCount(emailSnovio: string): number {
    return this.campaignCounts.get(emailSnovio) || 0;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  // dd/mm/yyyy interpretadas em BRT; visitedAt da API vem em UTC.
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

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    attempts = 3,
    delayMs = 500,
  ): Promise<T> {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err: any) {
        const isLast = i === attempts - 1;
        const status = err?.response?.status;
        // Não tenta de novo em erro de autenticação/client. 429 também não: o Snov.io
        // bloqueia a conta por ~5 min e repetir só prolonga o bloqueio.
        if (status === 401 || status === 403 || status === 400 || status === 429 || isLast) throw err;
        this.logger.warn(`Tentativa ${i + 1} falhou, aguardando ${delayMs}ms...`);
        await this.sleep(delayMs * (i + 1));
      }
    }
    throw new Error('Não deveria chegar aqui');
  }

  // ── CRON ─────────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async refreshCampaignCounts() {
    this.logger.log('Atualizando contagem de campanhas...');
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
              this.logger.error(`Falha em ${client.emailSnovio}: ${err?.message}`);
            }
          }),
        );
      }

      this.logger.log(`Contagem atualizada: ${clients.length - failures}/${clients.length} clientes.`);
    } catch (err) {
      this.logger.error('Erro geral ao atualizar contagens:', err);
    }
  }

  // ── Snov.io ───────────────────────────────────────────────────────────────

  // GET com limite por conta (60/min), concorrência global e retry (5xx/timeout).
  private snovGet(url: string, accessToken: string, params?: Record<string, any>, timeout = 20000) {
    return this.withRetry(async () => {
      await this.accountRate.acquire(accessToken);
      return this.snovLimiter.run(() =>
        axios.get(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params,
          timeout,
        }),
      );
    });
  }

  async getAccessToken(clientId: string, clientSecret: string): Promise<string> {
    const cacheKey = clientId;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    this.logger.debug(`Obtendo token para clientId ${clientId}...`);

    const { data } = await this.withRetry(async () => {
      await this.accountRate.acquire(`client:${clientId}`);
      return this.snovLimiter.run(() =>
        axios.post(
          'https://api.snov.io/v1/oauth/access_token',
          { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret },
          { headers: { 'Content-Type': 'application/json' }, timeout: 10000 },
        ),
      );
    });

    if (!data.access_token) {
      throw new Error('Snov.io não retornou access_token');
    }

    // Cache por 50 minutos (tokens duram ~1h)
    this.tokenCache.set(cacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + 50 * 60 * 1000,
    });

    return data.access_token;
  }

  async getUserCampaigns(accessToken: string): Promise<Campaign[]> {
    this.logger.debug('Obtendo campanhas...');

    // API correta conforme documentação: /v1/get-user-campaigns
    // O campo de nome é "campaign" (não "name")
    const { data } = await this.snovGet(
      'https://api.snov.io/v1/get-user-campaigns',
      accessToken,
      undefined,
      15000,
    );

    if (!Array.isArray(data)) {
      this.logger.warn('get-user-campaigns não retornou array. Resposta:', typeof data);
      return [];
    }

    const campaigns: Campaign[] = data
      .map((c: any) => ({
        id: String(c.id || ''),
        name: c.campaign || c.name || 'Campanha sem nome',
        createdAt: typeof c.created_at === 'number' ? c.created_at : null,
      }))
      .filter((c) => c.id);

    this.logger.log(`${campaigns.length} campanhas obtidas.`);
    return campaigns;
  }

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
    campaigns: Campaign[],
    startDate: string,
    endDate: string,
  ): Promise<{ emails: EmailOpening[]; failedCampaigns: FailedCampaign[] }> {
    const startMs = this.parseBrDateStartMs(startDate);
    const endMs = this.parseBrDateEndMs(endDate);

    // Campanha criada depois do fim do período não pode ter aberturas nele.
    // (updated_at NÃO é confiável para isso: aberturas chegam depois da última atualização.)
    const relevant = campaigns.filter((c) => c.createdAt == null || c.createdAt * 1000 <= endMs);

    this.logger.log(`Processando ${relevant.length}/${campaigns.length} campanhas...`);

    const failedCampaigns: FailedCampaign[] = [];
    const results = await Promise.all(
      relevant.map(async (campaign) => {
        try {
          const items = await this.fetchOpened(accessToken, campaign.id);
          return items
            .filter((i) => i.visitedAtMs >= startMs && i.visitedAtMs <= endMs)
            .map((i) => ({
              campaignId: campaign.id,
              campaign: campaign.name,
              prospectEmail: i.prospectEmail,
              sourcePage: i.sourcePage,
              visitedAt: this.formatBrt(i.visitedAtMs),
            }));
        } catch (err: any) {
          this.logger.error(`Campanha ${campaign.id} (${campaign.name}): ${err.message}`);
          failedCampaigns.push({
            campaignId: campaign.id,
            campaign: campaign.name,
            reason: err?.response?.status ? `HTTP ${err.response.status}` : err?.message || 'erro',
          });
          return [];
        }
      }),
    );

    if (failedCampaigns.length > 0) {
      this.logger.error(
        `${failedCampaigns.length} de ${relevant.length} campanhas falharam ao buscar aberturas.`,
      );
    }

    // Falha total não é "zero aberturas" — é indisponibilidade da Snov.io.
    // Propaga erro em vez de devolver relatório/CSV vazio como se fosse sucesso.
    if (relevant.length > 0 && failedCampaigns.length === relevant.length) {
      throw new Error(
        `Falha ao consultar a Snov.io: todas as ${relevant.length} campanhas retornaram erro.`,
      );
    }

    const emails = results.flat();
    this.logger.log(`Total de aberturas coletadas: ${emails.length}`);
    return { emails, failedCampaigns };
  }

  // Gera CSV em memória — não salva em disco
  generateCsvBuffer(allData: Array<EmailOpening & { clientEmail: string }>): Buffer {
    const BOM = '\uFEFF';
    const header = 'Email do cliente,Campanha,Email do prospect,Linkedin,Data de abertura\n';
    const rows = allData
      .map((r) =>
        [
          `"${r.clientEmail}"`,
          `"${r.campaign}"`,
          `"${r.prospectEmail}"`,
          `"${r.sourcePage}"`,
          `"${r.visitedAt}"`,
        ].join(','),
      )
      .join('\n');

    return Buffer.from(BOM + header + rows, 'utf-8');
  }
}
