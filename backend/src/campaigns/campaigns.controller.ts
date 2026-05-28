import { Controller, Post, Body, Get, Res, Param } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { SheetsService } from '../shared/sheets.service';
import type { Response } from 'express';

interface CampaignsBody {
  emailSnovio?: string;
  emailsSnovio?: string[];
  startDate: string;
  endDate: string;
}

@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly sheetsService: SheetsService,
  ) {}

  @Get('get-emails')
  async getEmails() {
    const clients = await this.sheetsService.readClientsFromSheet();
    return clients.map((client) => ({
      emailSnovio: client.emailSnovio,
      totalCampaigns: client.totalCampaigns || 0,
    }));
  }

  @Post()
  async getCampaigns(@Body() body: CampaignsBody) {
    console.log('📥 Recebendo requisição para gerar relatório...');
    
    const { emailSnovio, emailsSnovio, startDate, endDate } = body;
    const selectedEmails: string[] = emailsSnovio?.length 
      ? emailsSnovio 
      : emailSnovio 
      ? [emailSnovio] 
      : [];

    if (!selectedEmails.length) {
      throw new Error('Nenhum email Snovio informado');
    }

    if (!startDate || !endDate) {
      throw new Error('Datas de início e fim são obrigatórias');
    }

    console.log(`🎯 Processando ${selectedEmails.length} cliente(s)...`);
    
    const clients = await this.sheetsService.readClientsFromSheet();
    const allData: any[] = [];
    const countsByEmail: Record<string, number> = {};
    const countsByCampaign: Record<string, number> = {};
    
    // Processa clientes em PARALELO
    const clientPromises = selectedEmails.map(async (email) => {
      console.log(`\n🔍 Processando: ${email}`);
      const client = clients.find((c) => c.emailSnovio === email);
      
      if (!client) {
        console.warn(`⚠️ Cliente não encontrado: ${email}`);
        return { data: [], counts: {}, campaignCounts: {} };
      }

      try {
        const accessToken = await this.campaignsService.getAccessToken(
          client.clientId,
          client.clientSecret,
        );
        
        const campaigns = await this.campaignsService.getUserCampaigns(accessToken);
        console.log(`📊 ${email}: ${campaigns.length} campanhas`);
        
        if (campaigns.length === 0) {
          return { data: [], counts: {}, campaignCounts: {} };
        }
        
        const emailsOpened = await this.campaignsService.getEmailsOpenedFast(
          accessToken,
          campaigns,
          startDate,
          endDate,
        );
        
        console.log(`✅ ${email}: ${emailsOpened.length} aberturas`);
        
        const withClient = emailsOpened.map((item) => ({
          clientEmail: client.emailSnovio,
          ...item,
        }));
        
        const clientCounts: Record<string, number> = {};
        const clientCampaignCounts: Record<string, number> = {};
        emailsOpened.forEach(item => {
          const p = item.prospectEmail || '';
          if (p) clientCounts[p] = (clientCounts[p] || 0) + 1;
          
          const c = item.campaign || 'Desconhecida';
          clientCampaignCounts[c] = (clientCampaignCounts[c] || 0) + 1;
        });
        
        return { data: withClient, counts: clientCounts, campaignCounts: clientCampaignCounts };
        
      } catch (err: any) {
        console.error(`❌ Erro em ${email}:`, err.message);
        return { data: [], counts: {}, campaignCounts: {} };
      }
    });
    
    // CORREÇÃO: await está DENTRO da função async, então está correto
    const results = await Promise.all(clientPromises);
    
    results.forEach(result => {
      allData.push(...result.data);
      Object.entries(result.counts).forEach(([email, count]) => {
        countsByEmail[email] = (countsByEmail[email] || 0) + (count as number);
      });
      Object.entries(result.campaignCounts).forEach(([campaign, count]) => {
        countsByCampaign[campaign] = (countsByCampaign[campaign] || 0) + (count as number);
      });
    });
    
    if (allData.length > 0) {
      await this.campaignsService.saveToCsv(allData);
    }
    
    console.log(`🏁 Total de aberturas: ${allData.length}`);
    
    return {
      success: true,
      message: allData.length > 0 ? 'Relatório gerado!' : 'Nenhuma abertura',
      totalOpenings: allData.length,
      countsByEmail,
      countsByCampaign,
      processedClients: selectedEmails.length,
    };
  }

  @Get('download')
  async downloadCsv(@Res() res: Response) {
    const filePath = this.campaignsService.getCsvFilePath();
    const fileName = 'AberturasDeCampanhas.csv';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    return res.download(filePath, fileName);
  }

  @Get('test/:emailSnovio')
  async testClient(@Param('emailSnovio') emailSnovio: string) {
    console.log(`🧪 Testando: ${emailSnovio}`);
    
    try {
      const clients = await this.sheetsService.readClientsFromSheet();
      const client = clients.find(c => c.emailSnovio === emailSnovio);
      
      if (!client) {
        return { success: false, message: 'Cliente não encontrado' };
      }

      const accessToken = await this.campaignsService.getAccessToken(
        client.clientId,
        client.clientSecret,
      );

      const campaigns = await this.campaignsService.getUserCampaigns(accessToken);

      return {
        success: true,
        data: {
          clientEmail: client.emailSnovio,
          hasToken: !!accessToken,
          campaignCount: campaigns.length,
          sampleCampaigns: campaigns.slice(0, 3),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Erro: ${error.message}`,
      };
    }
  }
}

