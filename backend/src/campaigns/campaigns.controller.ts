import { Controller, Post, Body, Get, Res, Param } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { SheetsService } from '../shared/sheets.service';
import type { Response } from 'express';

interface CampaignsBody {
  emailSnovio?: string;
  emailsSnovio?: string[];
  startDate: string; // dd/mm/yyyy
  endDate: string;   // dd/mm/yyyy
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

  @@Post()
async getCampaigns(@Body() body: CampaignsBody) {
  console.log('📥 Recebendo requisição para gerar relatório...');
  
  const { emailSnovio, emailsSnovio, startDate, endDate } = body;
  const selectedEmails: string[] = emailsSnovio?.length ? emailsSnovio : emailSnovio ? [emailSnovio] : [];

  if (!selectedEmails.length) {
    throw new Error('Nenhum email Snovio informado');
  }

  console.log(`🎯 Processando ${selectedEmails.length} cliente(s)...`);
  
  const clients = await this.sheetsService.readClientsFromSheet();
  const allData: any[] = [];
  const countsByEmail: Record<string, number> = {};
  
  // Processa clientes em PARALELO
  const clientPromises = selectedEmails.map(async (email) => {
    console.log(`\n🔍 Iniciando processamento paralelo: ${email}`);
    const client = clients.find((c) => c.emailSnovio === email);
    
    if (!client) {
      console.warn(`⚠️ Cliente não encontrado: ${email}`);
      return { data: [], counts: {} };
    }

    try {
      // 1. Obtém token
      const accessToken = await this.campaignsService.getAccessToken(
        client.clientId,
        client.clientSecret,
      );
      
      // 2. Obtém TODAS as campanhas
      const campaigns = await this.campaignsService.getUserCampaigns(accessToken);
      console.log(`📊 ${email}: ${campaigns.length} campanhas encontradas`);
      
      // 3. Processa aberturas EM PARALELO (nova função)
      const emailsOpened = await this.campaignsService.getEmailsOpenedFast(
        accessToken,
        campaigns,
        startDate,
        endDate,
      );
      
      console.log(`✅ ${email}: ${emailsOpened.length} aberturas no período`);
      
      // 4. Adiciona email do cliente
      const withClient = emailsOpened.map((item) => ({
        clientEmail: client.emailSnovio,
        ...item,
      }));
      
      // 5. Contabiliza
      const clientCounts: Record<string, number> = {};
      emailsOpened.forEach(item => {
        const p = item.prospectEmail || '';
        if (p) clientCounts[p] = (clientCounts[p] || 0) + 1;
      });
      
      return { data: withClient, counts: clientCounts };
      
    } catch (err: any) {
      console.error(`❌ Erro em ${email}:`, err.message);
      return { data: [], counts: {} };
    }
  });
  
  // Aguarda TODOS os clientes processarem
  const results = await Promise.all(clientPromises);
  
  // Consolida resultados
  results.forEach(result => {
    allData.push(...result.data);
    Object.entries(result.counts).forEach(([email, count]) => {
      countsByEmail[email] = (countsByEmail[email] || 0) + count;
    });
  });
  
  // Salva CSV e retorna
  if (allData.length > 0) {
    await this.campaignsService.saveToCsv(allData);
  }
  
  console.log(`🏁 Processamento concluído! Total: ${allData.length} aberturas`);
  
  return {
    success: true,
    message: 'Relatório gerado com sucesso!',
    totalOpenings: allData.length,
    countsByEmail,
    processedClients: selectedEmails.length,
    clientsWithData: results.filter(r => r.data.length > 0).length,
  };
}

  @Get('download')
  async downloadCsv(@Res() res: Response) {
    const filePath = this.campaignsService.getCsvFilePath();
    const fileName = 'AberturasDeCampanhas.csv';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    return res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('❌ Erro ao baixar CSV:', err);
        res.status(500).json({ error: 'Erro ao baixar arquivo' });
      }
    });
  }

  @Get('test/:emailSnovio')
  async testClient(@Param('emailSnovio') emailSnovio: string) {
    console.log(`🧪 Testando cliente: ${emailSnovio}`);
    
    try {
      const clients = await this.sheetsService.readClientsFromSheet();
      const client = clients.find(c => c.emailSnovio === emailSnovio);
      
      if (!client) {
        return {
          success: false,
          message: `Cliente ${emailSnovio} não encontrado na planilha`,
          availableClients: clients.map(c => c.emailSnovio),
        };
      }

      console.log('📋 Cliente encontrado:', {
        email: client.email,
        clientIdPreview: client.clientId?.slice(0, 8) + '...',
        clientSecretPreview: '***' + client.clientSecret?.slice(-4),
        emailSnovio: client.emailSnovio,
      });

      // Teste 1: Obter token
      const accessToken = await this.campaignsService.getAccessToken(
        client.clientId,
        client.clientSecret,
      );

      // Teste 2: Obter campanhas
      const campaigns = await this.campaignsService.getUserCampaigns(accessToken);

      return {
        success: true,
        message: 'Integração testada com sucesso!',
        data: {
          clientEmail: client.emailSnovio,
          hasToken: !!accessToken,
          tokenPreview: accessToken?.substring(0, 20) + '...',
          campaignCount: campaigns.length,
          campaigns: campaigns.slice(0, 5),
        },
      };
    } catch (error: any) {
      console.error('❌ Erro no teste:', error);
      return {
        success: false,
        message: `Erro: ${error.message}`,
        error: error.response?.data || error.toString(),
        stack: error.stack,
      };
    }
  }
}

