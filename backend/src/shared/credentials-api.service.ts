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

  // Substitui a antiga leitura da aba "aberturas" do Google Sheets.
  // Retorna o mesmo formato consumido pelo resto do módulo: { email, clientId, clientSecret, emailSnovio, senha }
  async getActiveClients(): Promise<CredentialClient[]> {
    const http = this.client();
    const accounts = await this.fetchActiveAccounts(http);

    const clients: CredentialClient[] = [];
    for (const account of accounts) {
      try {
        const creds = await this.fetchCredentials(http, account.id);
        clients.push({
          id: account.id,
          email: account.email,
          clientId: creds.snov_id,
          clientSecret: creds.snov_secret,
          emailSnovio: creds.snov_email,
          senha: creds.snov_password,
          totalCampaigns: 0,
        });
      } catch (err: any) {
        this.logger.error(`Erro ao buscar credencial de ${account.email}: ${err.message}`);
      }
    }

    return clients.filter((c) => c.clientId && c.clientSecret && c.emailSnovio);
  }
}
