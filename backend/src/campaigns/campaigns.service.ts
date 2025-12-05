import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { SheetsService } from '../shared/sheets.service';
import { createObjectCsvWriter } from 'csv-writer';
import * as path from 'path';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CampaignsService {
  constructor(private readonly sheetsService: SheetsService) {}
  private readonly csvFileName = 'AberturasDeCampanhas.csv';

  getCsvFilePath(): string {
    return path.resolve(process.cwd(), this.csvFileName);
  }

  // === CRON DIÁRIO: atualiza contagem de campanhas na planilha ===
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async refreshCampaignCounts() {
    console.log('⏰ [CRON] Atualizando contagem de campanhas (00:00)...');

    try {
      const clients = await this.sheetsService.readClientsFromSheet();

      for (const client of clients) {
        try {
          const accessToken = await this.getAccessToken(
            client.clientId,
            client.clientSecret,
          );
          const campaigns = await this.getUserCampaigns(accessToken);
          const total = campaigns.length || 0;

          await this.sheetsService.updateClientCampaignCount(
            client.emailSnovio,
            total,
          );
        } catch (err: any) {
          console.error(
            `[CRON] Erro ao atualizar campanhas para ${client.emailSnovio}:`,
            err?.message || err,
          );
        }
      }

      console.log('✅ [CRON] Contagem de campanhas atualizada com sucesso.');
    } catch (err) {
      console.error('❌ [CRON] Erro geral ao atualizar contagens:', err);
    }
  }

  // === SNOV.IO ===

  async getAccessToken(clientId: string, clientSecret: string) {
    const url = 'https://api.snov.io/v1/oauth/access_token';

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    try {
      const { data } = await axios.post(url, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      });

      if (!data.access_token) {
        console.error('Resposta do Snov NÃO tem access_token:', data);
        throw new Error('Snov não retornou access_token');
      }

      return data.access_token;
    } catch (err: any) {
      console.error('Erro ao obter token do Snov.io:', {
        status: err.response?.status,
        data: err.response?.data,
        clientIdSnippet: clientId?.slice(0, 6),
      });
      throw new Error('Falha ao obter access token');
    }
  }

  async getUserCampaigns(accessToken: string) {
    const url = 'https://api.snov.io/v1/get-user-campaigns';
    try {
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!Array.isArray(data)) return [];

      return data.map((c: any) => ({
        id: c.id,
        name: c.name,
      }));
    } catch (err: any) {
      console.error('Erro ao obter campanhas:', err.message || err);
      throw new Error('Falha ao obter campanhas');
    }
  }

  // Parse dd/mm/yyyy
  private parseBrDate(brDate: string): Date {
    const [day, month, year] = brDate.split('/').map((n) => parseInt(n, 10));
    return new Date(year, month - 1, day);
  }

  async getEmailsOpened(
    accessToken: string,
    campaignId: string,
    campaignName: string,
    startDate: string,
    endDate: string,
  ) {
    const url = 'https://api.snov.io/v1/get-emails-opened';
    try {
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { campaignId },
      });

      if (!Array.isArray(data)) return [];

      const start = this.parseBrDate(startDate);
      const end = this.parseBrDate(endDate);

      return data
        .filter((item: any) => {
          const visitedAt = new Date(item.visitedAt);
          return visitedAt >= start && visitedAt <= end;
        })
        .map((item: any) => {
          const visitedDate = new Date(item.visitedAt);
          const day = String(visitedDate.getDate()).padStart(2, '0');
          const month = String(visitedDate.getMonth() + 1).padStart(2, '0');
          const year = visitedDate.getFullYear();
          const formattedDate = `${day}-${month}-${year}`; // dd-mm-yyyy

          return {
            campaignId,
            campaign: campaignName || 'N/A',
            prospectEmail: item.prospectEmail || '',
            sourcePage: item.sourcePage || '',
            visitedAt: formattedDate,
          };
        });
    } catch (err: any) {
      console.error('Erro ao obter aberturas:', err.message || err);
      throw new Error('Falha ao obter aberturas');
    }
  }

  async saveToCsv(allData: any[]) {
    if (!allData.length) {
      console.warn('Nenhum dado para salvar no CSV.');
      return;
    }

    const csvPath = this.getCsvFilePath();

    const csvWriter = createObjectCsvWriter({
      path: csvPath,
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
    console.log(`CSV gerado com sucesso em: ${csvPath}`);
  }

    // Se em algum momento você quiser usar todos os clientes de uma vez
  async getCampaignsForAllClients(startDate: string, endDate: string) {
    const clients = await this.sheetsService.readClientsFromSheet();
    const allData: any[] = [];

    for (const client of clients) {
      try {
        const accessToken = await this.getAccessToken(
          client.clientId,
          client.clientSecret,
        );

        const campaigns = await this.getUserCampaigns(accessToken);

        for (const campaign of campaigns) {
          const emailsOpened = await this.getEmailsOpened(
            accessToken,
            campaign.id,
            campaign.name,
            startDate, // dd/mm/yyyy
            endDate,   // dd/mm/yyyy
          );

          const withClient = emailsOpened.map((item) => ({
            clientEmail: client.emailSnovio,
            ...item,
          }));

          allData.push(...withClient);
        }
      } catch (err: any) {
        console.error(
          `Erro ao coletar campanhas para cliente ${client.emailSnovio}:`,
          err?.message || err,
        );
      }
    }

    return allData;
  }
}
