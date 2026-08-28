import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { CredentialsApiService } from '../shared/credentials-api.service';
import { Cron, CronExpression } from '@nestjs/schedule';

interface Campaign {
  id: string;
  name: string;
}

interface EmailOpening {
  campaignId: string;
  campaign: string;
  prospectEmail: string;
  sourcePage: string;
  visitedAt: string;
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  // Cache de tokens por clientId → { token, expiresAt }
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();

  // Cache em memória da contagem de campanhas por cliente, atualizado pelo cron diário
  // (substitui a antiga escrita na coluna "totalCampanhas" do Google Sheets).
  private readonly campaignCounts = new Map<string, number>();

  constructor(private readonly credentialsApiService: CredentialsApiService) {}

  getCampaignCount(emailSnovio: string): number {
    return this.campaignCounts.get(emailSnovio) || 0;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private parseBrDate(brDate: string): Date {
    const [day, month, year] = brDate.split('/').map((n) => parseInt(n, 10));
    return new Date(year, month - 1, day);
  }

  private formatDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}-${month}-${date.getFullYear()}`;
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
        // Não tenta de novo em erros de autenticação/client
        if (status === 401 || status === 403 || status === 400 || isLast) throw err;
        this.logger.warn(`Tentativa ${i + 1} falhou, aguardando ${delayMs}ms...`);
        await this.sleep(delayMs * (i + 1));
      }
    }
    throw new Error('Não deveria chegar aqui');
  }

  // ── CRON ─────────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async refreshCampaignCounts() {
    this.logger.log('[CRON] Atualizando contagem de campanhas...');
    try {
      const clients = await this.credentialsApiService.getActiveClients();
      for (const client of clients) {
        try {
          const accessToken = await this.getAccessToken(client.clientId, client.clientSecret);
          const campaigns = await this.getUserCampaigns(accessToken);
          this.campaignCounts.set(client.emailSnovio, campaigns.length);
        } catch (err: any) {
          this.logger.error(`[CRON] Falha em ${client.emailSnovio}: ${err?.message}`);
        }
      }
      this.logger.log('[CRON] Contagem atualizada.');
    } catch (err) {
      this.logger.error('[CRON] Erro geral:', err);
    }
  }

  // ── Snov.io ───────────────────────────────────────────────────────────────

  async getAccessToken(clientId: string, clientSecret: string): Promise<string> {
    const cacheKey = clientId;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    this.logger.debug(`Obtendo token para clientId ${clientId}...`);

    const { data } = await this.withRetry(() =>
      axios.post(
        'https://api.snov.io/v1/oauth/access_token',
        { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret },
        { headers: { 'Content-Type': 'application/json' }, timeout: 10000 },
      ),
    );

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
    const { data } = await this.withRetry(() =>
      axios.get('https://api.snov.io/v1/get-user-campaigns', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000,
      }),
    );

    if (!Array.isArray(data)) {
      this.logger.warn('get-user-campaigns não retornou array. Resposta:', typeof data);
      return [];
    }

    const campaigns: Campaign[] = data
      .map((c: any) => ({
        id: String(c.id || ''),
        name: c.campaign || c.name || 'Campanha sem nome',
      }))
      .filter((c) => c.id);

    this.logger.log(`${campaigns.length} campanhas obtidas.`);
    return campaigns;
  }

  async getEmailsOpenedFast(
    accessToken: string,
    campaigns: Campaign[],
    startDate: string,
    endDate: string,
  ): Promise<EmailOpening[]> {
    const start = this.parseBrDate(startDate);
    const end = this.parseBrDate(endDate);
    // inclui o dia final até 23:59:59
    end.setHours(23, 59, 59, 999);

    this.logger.log(`Processando ${campaigns.length} campanhas em paralelo...`);

    const BATCH_SIZE = 10;
    const all: EmailOpening[] = [];

    for (let i = 0; i < campaigns.length; i += BATCH_SIZE) {
      const batch = campaigns.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((c) => this.getSingleCampaignEmails(accessToken, c, start, end)),
      );
      all.push(...results.flat());

      if (i + BATCH_SIZE < campaigns.length) {
        await this.sleep(300);
      }
    }

    this.logger.log(`Total de aberturas coletadas: ${all.length}`);
    return all;
  }

  private async getSingleCampaignEmails(
    accessToken: string,
    campaign: Campaign,
    start: Date,
    end: Date,
  ): Promise<EmailOpening[]> {
    try {
      const { data } = await this.withRetry(() =>
        axios.get('https://api.snov.io/v1/get-emails-opened', {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { campaignId: campaign.id },
          timeout: 10000,
        }),
      );

      if (!Array.isArray(data)) return [];

      return data
        .filter((item: any) => {
          const d = new Date(item.visitedAt);
          return d >= start && d <= end;
        })
        .map((item: any) => ({
          campaignId: campaign.id,
          campaign: campaign.name,
          prospectEmail: item.prospectEmail || '',
          sourcePage: item.sourcePage || '',
          visitedAt: this.formatDate(new Date(item.visitedAt)),
        }));
    } catch (err: any) {
      this.logger.error(`Campanha ${campaign.id} (${campaign.name}): ${err.message}`);
      return [];
    }
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
