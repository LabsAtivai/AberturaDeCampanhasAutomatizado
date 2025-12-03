// src/campaigns/campaigns.service.ts
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { SheetsService } from '../shared/sheets.service';
import { createObjectCsvWriter } from 'csv-writer';
import pLimit from 'p-limit';
import * as path from 'path';

@Injectable()
export class CampaignsService {
  constructor(private readonly sheetsService: SheetsService) {}

  private readonly limitClient = pLimit(5);
  private readonly limitCampaign = pLimit(10);

  // nome fixo do arquivo
  private readonly csvFileName = 'AberturasDeCampanhas.csv';

  getCsvFilePath(): string {
    // caminho absoluto no diretório onde você roda o backend
    return path.resolve(process.cwd(), this.csvFileName);
  }

  // Se em algum momento você quiser voltar a usar "todos os clientes"
  async getCampaignsForAllClients(startDate: string, endDate: string) {
    const clients = await this.sheetsService.readClientsFromSheet();
    const allData: any[] = [];

    for (const client of clients) {
      const accessToken = await this.getAccessToken(
        client.clientId,
        client.clientSecret,
      );
      const campaigns = await this.getUserCampaigns(accessToken);

      for (const campaign of campaigns) {
        const emailsOpened = await this.getEmailsOpened(
          accessToken,
          campaign.id, // id da campanha
          campaign.name, // nome da campanha
          startDate,
          endDate,
        );

        // adiciona o emailSnovio como "clientEmail" para bater com o header do CSV
        const withClient = emailsOpened.map((item) => ({
          clientEmail: client.emailSnovio,
          ...item,
        }));

        allData.push(...withClient);
      }
    }

    return allData;
  }

  // === SNOV.IO ===

  async getAccessToken(clientId: string, clientSecret: string) {
    const url = 'https://api.snov.io/v1/oauth/access_token';

    // Snov.io prefere x-www-form-urlencoded
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    try {
      const { data } = await axios.post(url, body.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      });

      if (!data.access_token) {
        console.error(
          'Resposta do Snov ao pedir token NÃO tem access_token:',
          data,
        );
        throw new Error('Snov não retornou access_token');
      }

      return data.access_token;
    } catch (err: any) {
      console.error('Erro ao obter token do Snov.io:', {
        status: err.response?.status,
        data: err.response?.data,
        clientIdSnippet: clientId?.slice(0, 6), // pra conferir qual clientId está indo
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

      // Garante que volta sempre num formato padronizado
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

  // Função para obter as aberturas dos emails
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

      const start = new Date(startDate);
      const end = new Date(endDate);

      return data
        .filter((item: any) => {
          const visitedAt = new Date(item.visitedAt);
          return visitedAt >= start && visitedAt <= end;
        })
        .map((item: any) => ({
          campaignId,
          campaign: campaignName || 'N/A', // 👈 agora vem do parâmetro
          prospectEmail: item.prospectEmail || '',
          sourcePage: item.sourcePage || '',
          visitedAt: item.visitedAt,
        }));
    } catch (err: any) {
      console.error('Erro ao obter aberturas:', err.message || err);
      throw new Error('Falha ao obter aberturas');
    }
  }

  // === CSV ===

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
}
