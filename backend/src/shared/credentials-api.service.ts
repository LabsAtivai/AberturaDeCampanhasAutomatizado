import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface CredentialClient {
  id: string;
  email: string;
  clientId: string;
  clientSecret: string;
  emailSnovio: string;
  totalCampaigns: number;
}

const CRAWL_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789._-';

@Injectable()
export class CredentialsApiService {
  private readonly logger = new Logger(CredentialsApiService.name);

  // A lista de contas é reconsultada a cada minuto (cliente novo aparece logo);
  // as credenciais só são buscadas de novo para contas novas ou alteradas (updated_at).
  private readonly cacheTtlMs = 60 * 1000;
  private readonly credentialsById = new Map<string, { updatedAt: string; client: CredentialClient }>();
  // Carga com falhas parciais é cacheada por pouco tempo, para a conta ausente voltar logo.
  private readonly partialCacheTtlMs = 30 * 1000;
  private readonly credentialsConcurrency = 10;
  private cache: { clients: CredentialClient[]; expiresAt: number } | null = null;
  private inFlight: Promise<CredentialClient[]> | null = null;

  // A paginação de GET /api/accounts da snov-am-api é instável (repete contas e pula outras,
  // pois a ordenação não tem desempate). Por isso as contas descobertas ficam acumuladas aqui,
  // em vez de depender de uma única leitura completa da lista.
  private readonly knownAccounts = new Map<string, any>();
  private lastTotal = 0;
  private crawling = false;
  private lastCrawlAt = 0;
  private readonly crawlMinGapMs = 10 * 60 * 1000;
  private readonly crawlDelayMs = 800;
  private readonly crawlMaxRequests = 300;
  private readonly extraPageSizes = [89, 73];

  constructor(private readonly config: ConfigService) {}

  private client(): AxiosInstance {
    const baseURL = this.config.get<string>('CREDENTIALS_API_URL');
    const apiKey = this.config.get<string>('CREDENTIALS_API_KEY');

    if (!baseURL || !apiKey) {
      throw new Error(
        'CREDENTIALS_API_URL e CREDENTIALS_API_KEY precisam estar definidos no ambiente.',
      );
    }

    return axios.create({
      baseURL,
      headers: { 'X-API-Key': apiKey },
      timeout: 15000,
    });
  }

  // Percorre a listagem paginada acumulando contas (dedupe por id). Retorna o total informado pela API.
  private async pagePass(http: AxiosInstance, pageSize: number): Promise<number> {
    let page = 1;
    let seen = 0;
    let total = 0;

    while (true) {
      const { data } = await http.get('/api/accounts', {
        params: { status: 'ACTIVE', page, page_size: pageSize },
      });
      total = data.total;
      for (const a of data.items) this.knownAccounts.set(a.id, a);
      seen += data.items.length;
      if (seen >= total || data.items.length === 0) break;
      page += 1;
    }

    return total;
  }

  private async refreshAccounts(http: AxiosInstance) {
    this.lastTotal = await this.pagePass(http, 100);

    // Contas desativadas saem da lista conhecida (a lista de INACTIVE é pequena, uma página).
    try {
      const { data } = await http.get('/api/accounts', {
        params: { status: 'INACTIVE', page: 1, page_size: 100 },
      });
      for (const a of data.items) this.knownAccounts.delete(a.id);
    } catch (err: any) {
      this.logger.warn(`Falha ao ler contas inativas: ${err.message}`);
    }

    // A paginação pula contas: tenta outros tamanhos de página antes do varrimento lento.
    for (const size of this.extraPageSizes) {
      if (this.knownAccounts.size >= this.lastTotal) break;
      this.lastTotal = await this.pagePass(http, size);
    }

    if (this.knownAccounts.size < this.lastTotal) void this.crawlMissing(http);
  }

  // Varre a API com buscas curtas (q=), em ritmo lento e em segundo plano, até conhecer todas as contas.
  // Cada busca com até 100 resultados vem completa numa única página (sem depender da paginação).
  private async crawlMissing(http: AxiosInstance) {
    if (this.crawling || Date.now() - this.lastCrawlAt < this.crawlMinGapMs) return;
    this.crawling = true;
    this.lastCrawlAt = Date.now();

    const queue: string[] = [...CRAWL_ALPHABET];
    let requests = 0;
    const before = this.knownAccounts.size;

    try {
      while (queue.length && requests < this.crawlMaxRequests && this.knownAccounts.size < this.lastTotal) {
        const term = queue.shift() as string;
        const { data } = await http.get('/api/accounts', {
          params: { status: 'ACTIVE', page: 1, page_size: 100, q: term },
        });
        requests++;

        if (data.total <= 100) {
          for (const a of data.items) this.knownAccounts.set(a.id, a);
        } else if (term.length < 2) {
          // Termo comum demais: refina com mais um caractere.
          for (const c of CRAWL_ALPHABET) queue.push(term + c);
        }
        await new Promise((r) => setTimeout(r, this.crawlDelayMs));
      }
    } catch (err: any) {
      // 429 ou indisponibilidade: tenta de novo na próxima janela.
      this.logger.warn(`Varrimento de contas interrompido: ${err.message}`);
    } finally {
      this.crawling = false;
      const found = this.knownAccounts.size - before;
      this.logger.log(
        `Varrimento de contas: +${found} (${this.knownAccounts.size}/${this.lastTotal}) em ${requests} chamadas.`,
      );
      if (found > 0) this.cache = null; // próxima leitura já inclui as contas novas
    }
  }

  private async fetchCredentials(http: AxiosInstance, accountId: string) {
    const { data } = await http.get(`/api/internal/accounts/${accountId}/credentials`);
    return data;
  }

  private async buildClients(http: AxiosInstance): Promise<{ clients: CredentialClient[]; partial: boolean }> {
    const accounts = [...this.knownAccounts.values()];
    const clients: CredentialClient[] = [];
    let partial = false;

    // Reaproveita credenciais já carregadas; busca só as de contas novas ou alteradas.
    const toFetch: any[] = [];
    for (const account of accounts) {
      const known = this.credentialsById.get(account.id);
      if (known && known.updatedAt === account.updated_at) clients.push(known.client);
      else toFetch.push(account);
    }

    // Busca credenciais em lotes paralelos.
    for (let i = 0; i < toFetch.length; i += this.credentialsConcurrency) {
      const batch = toFetch.slice(i, i + this.credentialsConcurrency);
      const results = await Promise.all(
        batch.map(async (account): Promise<CredentialClient | null> => {
          try {
            const creds = await this.fetchCredentials(http, account.id);
            const client: CredentialClient = {
              id: account.id,
              email: account.email,
              clientId: creds.snov_id,
              clientSecret: creds.snov_secret,
              emailSnovio: creds.snov_email,
              totalCampaigns: 0,
            };
            this.credentialsById.set(account.id, { updatedAt: account.updated_at, client });
            return client;
          } catch (err: any) {
            this.logger.error(`Erro ao buscar credencial de ${account.email}: ${err.message}`);
            partial = true;
            return null;
          }
        }),
      );
      for (const r of results) if (r) clients.push(r);
    }

    // Esquece credenciais de contas que saíram da lista conhecida.
    for (const id of this.credentialsById.keys()) {
      if (!this.knownAccounts.has(id)) this.credentialsById.delete(id);
    }

    return {
      clients: clients.filter((c) => c.clientId && c.clientSecret && c.emailSnovio),
      partial,
    };
  }

  private async loadActiveClients(): Promise<{ clients: CredentialClient[]; partial: boolean }> {
    const http = this.client();
    await this.refreshAccounts(http);
    return this.buildClients(http);
  }

  // Busca contas por trecho do email (q=) e as inclui na lista. Cobre contas que a paginação não entrega.
  async searchAccounts(term: string): Promise<CredentialClient[]> {
    const q = term.trim();
    if (q.length < 3) return [];

    const http = this.client();
    const { data } = await http.get('/api/accounts', {
      params: { status: 'ACTIVE', page: 1, page_size: 100, q },
    });
    for (const a of data.items) this.knownAccounts.set(a.id, a);

    const { clients } = await this.buildClients(http);
    this.cache = { clients, expiresAt: Date.now() + this.cacheTtlMs };
    return clients;
  }

  // Substitui a antiga leitura da aba "aberturas" do Google Sheets.
  // Retorna o mesmo formato consumido pelo resto do módulo: { email, clientId, clientSecret, emailSnovio }
  async getActiveClients(forceRefresh = false): Promise<CredentialClient[]> {
    if (!forceRefresh && this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.clients;
    }

    // Requisições simultâneas compartilham a mesma carga.
    if (!this.inFlight) {
      this.inFlight = this.loadActiveClients()
        .then(({ clients, partial }) => {
          const ttl = partial ? this.partialCacheTtlMs : this.cacheTtlMs;
          this.cache = { clients, expiresAt: Date.now() + ttl };
          return clients;
        })
        .finally(() => {
          this.inFlight = null;
        });
    }

    return this.inFlight;
  }
}
