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
  console.log('🔑 Obtendo token do Snov.io (formato JSON)...');
  
  const url = 'https://api.snov.io/v1/oauth/access_token';

  // USE O MESMO FORMATO DO CÓDIGO FUNCIONAL (JSON)
  const body = {
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  };

  try {
    const { data } = await axios.post(url, body, {
      headers: { 
        'Content-Type': 'application/json', // MUDADO DE 'x-www-form-urlencoded'
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    console.log('✅ Token obtido com sucesso!');

    if (!data.access_token) {
      console.error('❌ Snov não retornou access_token:', data);
      throw new Error('Snov não retornou access_token');
    }

    return data.access_token;
  } catch (err: any) {
    console.error('❌ Erro ao obter token do Snov.io:', {
      status: err.response?.status,
      data: err.response?.data,
      message: err.message,
    });
    throw new Error(`Falha ao obter access token: ${err.response?.data?.error || err.message}`);
  }
}

    async getUserCampaigns(accessToken: string) {
    console.log('📊 Obtendo campanhas com nomes...');
    
    // TENTA PRIMEIRO A NOVA API (get-campaign-analytics)
    try {
      const url = 'https://api.snov.io/v1/get-campaign-analytics';
      const { data } = await axios.get(url, {
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 20000,
      });

      console.log('✅ Resposta da API analytics recebida');
      
      // Verifica se é array
      if (!Array.isArray(data)) {
        console.warn('⚠️ Resposta não é array. Estrutura:', typeof data);
        
        // Se for objeto, tenta encontrar array dentro
        if (data && typeof data === 'object') {
          const keys = Object.keys(data);
          const campaignsKey = keys.find(key => 
            key.toLowerCase().includes('campaign') && Array.isArray(data[key])
          );
          
          if (campaignsKey) {
            console.log(`✅ Encontrado array em: "${campaignsKey}"`);
            data = data[campaignsKey];
          }
        }
      }

      // Se ainda não for array, vai para fallback
      if (!Array.isArray(data)) {
        throw new Error('Formato inválido da API analytics');
      }

      // Processa as campanhas
      const campaigns = data
        .map((campaign: any) => {
          // Extrai ID - tenta várias possibilidades
          const campaignId = 
            campaign.campaign_id || 
            campaign.id || 
            campaign.campaignId ||
            campaign.campaignID;
          
          // Extrai NOME - tenta várias possibilidades
          const campaignName = 
            campaign.campaign_name || 
            campaign.name || 
            campaign.campaignName ||
            campaign.campaign ||
            'Campanha sem nome';

          if (!campaignId) {
            console.warn('Campanha sem ID:', campaign);
            return null;
          }

          return {
            id: String(campaignId),
            name: campaignName,
          };
        })
        .filter((campaign: any) => campaign !== null);

      console.log(`✅ ${campaigns.length} campanhas encontradas com nomes`);
      
      if (campaigns.length > 0) {
        console.log('📋 Exemplo:', campaigns[0]);
      }
      
      return campaigns;

    } catch (analyticsErr: any) {
      console.log(`❌ API analytics falhou: ${analyticsErr.message}`);
      console.log('🔄 Usando API fallback (get-user-campaigns)...');
      
      // FALLBACK: usa a API antiga
      try {
        const fallbackUrl = 'https://api.snov.io/v1/get-user-campaigns';
        const { data } = await axios.get(fallbackUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15000,
        });

        if (!Array.isArray(data)) {
          console.warn('Fallback não retornou array');
          return [];
        }

        const campaigns = data.map((c: any) => ({
          id: c.id || 'unknown',
          name: c.name || 'Campanha sem nome',
        }));

        console.log(`✅ Fallback: ${campaigns.length} campanhas`);
        return campaigns;
        
      } catch (fallbackErr: any) {
        console.error('❌ Ambas APIs falharam:', fallbackErr.message);
        throw new Error('Não foi possível obter campanhas');
      }
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



