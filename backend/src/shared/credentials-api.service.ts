import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface CredentialClient {
  id: string;
  email: string;
  clientId: string;
  clientSecret: string;
  emailSnovio: string;
  senha: string;
  totalCampaigns: number;
}

@Injectable()
export class CredentialsApiService {
  private readonly logger = new Logger(CredentialsApiService.name);

  // Lista de contas + credenciais muda raramente; evita 1 + N chamadas a cada requisição.
  private readonly cacheTtlMs = 10 * 60 * 1000;
  private readonly credentialsConcurrency = 10;
  private cache: { clients: CredentialClient[]; expiresAt: number } | null = null;
  private inFlight: Promise<CredentialClient[]> | null = null;

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

  private async fetchActiveAccounts(http: AxiosInstance) {
    const accounts: any[] = [];
    let page = 1;
    const pageSize = 100;

    while (true) {
      const { data } = await http.get('/api/accounts', {
        params: { status: 'ACTIVE', page, page_size: pageSize },
      });
      accounts.push(...data.items);
      if (accounts.length >= data.total || data.items.length === 0) break;
      page += 1;
    }

    return accounts;
  }

  private async fetchCredentials(http: AxiosInstance, accountId: string) {
    const { data } = await http.get(`/api/internal/accounts/${accountId}/credentials`);
    return data;
  }

  private async loadActiveClients(): Promise<CredentialClient[]> {
    const http = this.client();
    const accounts = await this.fetchActiveAccounts(http);
    const clients: CredentialClient[] = [];

    // Busca credenciais em lotes paralelos (antes era sequencial: uma chamada por conta, em fila).
    for (let i = 0; i < accounts.length; i += this.credentialsConcurrency) {
      const batch = accounts.slice(i, i + this.credentialsConcurrency);
      const results = await Promise.all(
        batch.map(async (account): Promise<CredentialClient | null> => {
          try {
            const creds = await this.fetchCredentials(http, account.id);
            return {
              id: account.id,
              email: account.email,
              clientId: creds.snov_id,
              clientSecret: creds.snov_secret,
              emailSnovio: creds.snov_email,
              senha: creds.snov_password,
              totalCampaigns: 0,
            };
          } catch (err: any) {
            this.logger.error(`Erro ao buscar credencial de ${account.email}: ${err.message}`);
            return null;
          }
        }),
      );
      for (const r of results) if (r) clients.push(r);
    }

    return clients.filter((c) => c.clientId && c.clientSecret && c.emailSnovio);
  }

  // Substitui a antiga leitura da aba "aberturas" do Google Sheets.
  // Retorna o mesmo formato consumido pelo resto do módulo: { email, clientId, clientSecret, emailSnovio, senha }
  async getActiveClients(forceRefresh = false): Promise<CredentialClient[]> {
    if (!forceRefresh && this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.clients;
    }

    // Requisições simultâneas compartilham a mesma carga.
    if (!this.inFlight) {
      this.inFlight = this.loadActiveClients()
        .then((clients) => {
          this.cache = { clients, expiresAt: Date.now() + this.cacheTtlMs };
          return clients;
        })
        .finally(() => {
          this.inFlight = null;
        });
    }

    return this.inFlight;
  }
}
