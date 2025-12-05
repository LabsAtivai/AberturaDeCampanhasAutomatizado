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
  
  // Rate limiting
  private readonly rateLimitDelay = 100; // ms entre requisições
  private lastRequestTime = 0;

  getCsvFilePath(): string {
    return path.resolve(process.cwd(), this.csvFileName);
  }

  private async rateLimitedRequest(config: any) {
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    
    if (timeSinceLast < this.rateLimitDelay) {
      await new Promise(resolve => 
        setTimeout(resolve, this.rateLimitDelay - timeSinceLast)
      );
    }
    
    this.lastRequestTime = Date.now();
    return axios(config);
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

    const body = {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    };

    try {
      const { data } = await axios.post(url, body, {
        headers: { 
          'Content-Type': 'application/json',
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
      let campaignsData = data;
      if (!Array.isArray(campaignsData)) {
        console.warn('⚠️ Resposta não é array. Estrutura:', typeof campaignsData);
        
        // Se for objeto, tenta encontrar array dentro
        if (campaignsData && typeof campaignsData === 'object') {
          const keys = Object.keys(campaignsData);
          const campaignsKey = keys.find(key => 
            key.toLowerCase().includes('campaign') && Array.isArray(campaignsData[key])
          );
          
          if (campaignsKey) {
            console.log(`✅ Encontrado array em: "${campaignsKey}"`);
            campaignsData = campaignsData[campaignsKey];
          }
        }
      }

      // Se ainda não for array, vai para fallback
      if (!Array.isArray(campaignsData)) {
        throw new Error('Formato inválido da API analytics');
      }

      // Processa as campanhas
      const campaigns = campaignsData
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

  // FUNÇÃO ORIGINAL (mantida para compatibilidade)
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
          const formattedDate = `${day}-${month}-${year}`;

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

  // NOVA FUNÇÃO RÁPIDA COM PARALELISMO
  async getEmailsOpenedFast(
    accessToken: string,
    campaigns: Array<{id: string, name: string}>,
    startDate: string,
    endDate: string,
  ) {
    console.log(`🚀 Processando ${campaigns.length} campanhas em paralelo...`);
    
    const start = this.parseBrDate(startDate);
    const end = this.parseBrDate(endDate);
    
    // Processa até 10 campanhas por lote
    const BATCH_SIZE = 10;
    const allData: any[] = [];
    
    for (let i = 0; i < campaigns.length; i += BATCH_SIZE) {
      const batch = campaigns.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(campaigns.length / BATCH_SIZE);
      
      console.log(`📦 Lote ${batchNumber}/${totalBatches} (${batch.length} campanhas)`);
      
      const promises = batch.map(campaign => 
        this.getSingleCampaignEmails(accessToken, campaign, start, end)
      );
      
      const batchResults = await Promise.all(promises);
      allData.push(...batchResults.flat());
      
      // Pequena pausa entre lotes
      if (i + BATCH_SIZE < campaigns.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    console.log(`✅ Total de aberturas: ${allData.length}`);
    return allData;
  }

  private async getSingleCampaignEmails(
    accessToken: string,
    campaign: {id: string, name: string},
    start: Date,
    end: Date
  ) {
    const url = 'https://api.snov.io/v1/get-emails-opened';
    
    try {
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { campaignId: campaign.id },
        timeout: 10000,
      });

      if (!Array.isArray(data)) return [];

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
          const formattedDate = `${day}-${month}-${year}`;

          return {
            campaignId: campaign.id,
            campaign: campaign.name || 'N/A',
            prospectEmail: item.prospectEmail || '',
            sourcePage: item.sourcePage || '',
            visitedAt: formattedDate,
          };
        });
    } catch (err: any) {
      console.error(`❌ Campanha ${campaign.id}:`, err.message);
      return [];
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
            startDate,
            endDate,
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
