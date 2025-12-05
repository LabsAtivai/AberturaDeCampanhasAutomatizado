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

  @Post()
  async getCampaigns(@Body() body: CampaignsBody) {
    console.log('📥 Recebendo requisição para gerar relatório...');
    console.log('📥 Body recebido:', JSON.stringify(body, null, 2));
    
    const { emailSnovio, emailsSnovio, startDate, endDate } = body;

    const selectedEmails: string[] = emailsSnovio?.length
      ? emailsSnovio
      : emailSnovio
      ? [emailSnovio]
      : [];

    console.log('📝 Emails a processar:', selectedEmails);

    if (!selectedEmails.length) {
      console.error('❌ Nenhum email selecionado');
      throw new Error('Nenhum email Snovio informado');
    }

    const allData: any[] = [];
    const countsByEmail: Record<string, number> = {};

    console.log('📋 Lendo clientes da planilha...');
    const clients = await this.sheetsService.readClientsFromSheet();
    console.log(`📊 Total de clientes na planilha: ${clients.length}`);
    
    for (const email of selectedEmails) {
      console.log(`\n🔍 Processando: ${email}`);
      const client = clients.find((c) => c.emailSnovio === email);
      
      if (!client) {
        console.warn(`⚠️ Cliente não encontrado para emailSnovio: ${email}`);
        console.warn(`📋 Clientes disponíveis:`, clients.map(c => c.emailSnovio));
        continue;
      }

      console.log(`✅ Cliente encontrado:`, {
        email: client.email,
        clientIdPreview: client.clientId?.slice(0, 8) + '...',
        emailSnovio: client.emailSnovio,
      });

      try {
        const accessToken = await this.campaignsService.getAccessToken(
          client.clientId,
          client.clientSecret,
        );
        
        console.log(`✅ Token obtido para ${email}`);
        
        const campaigns = await this.campaignsService.getUserCampaigns(accessToken);
        console.log(`📊 Campanhas encontradas: ${campaigns.length}`);
        
        // Processa cada campanha
        for (const campaign of campaigns) {
          console.log(`   📧 Processando campanha: ${campaign.name}`);
          
          const emailsOpened = await this.campaignsService.getEmailsOpened(
            accessToken,
            campaign.id,
            campaign.name,
            startDate,
            endDate,
          );

          console.log(`   📊 Aberturas encontradas: ${emailsOpened.length}`);
          
          // Adiciona os dados do cliente
          const withClient = emailsOpened.map((item) => ({
            clientEmail: client.emailSnovio,
            ...item,
          }));

          allData.push(...withClient);

          // Conta aberturas por prospect
          for (const item of emailsOpened) {
            const p = item.prospectEmail || '';
            if (!p) continue;
            countsByEmail[p] = (countsByEmail[p] || 0) + 1;
          }
        }
        
        console.log(`✅ ${email} processado com sucesso`);
      } catch (err: any) {
        console.error(`❌ Erro ao processar ${email}:`, err.message);
        console.error(`❌ Stack:`, err.stack);
      }
    }

    // Salva CSV (caso haja dados)
    if (allData.length > 0) {
      await this.campaignsService.saveToCsv(allData);
    } else {
      console.log('📭 Nenhum dado encontrado para o período');
    }

    const totalOpenings = allData.length;

    return {
      success: true,
      message: 'Relatório gerado com sucesso!',
      totalOpenings,
      countsByEmail,
      data: allData.slice(0, 10), // Retorna apenas 10 primeiros para preview
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
