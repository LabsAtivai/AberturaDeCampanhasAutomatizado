import { Controller, Post, Body, Get, Res } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { SheetsService } from '../shared/sheets.service';
import type { Response } from 'express';

interface CampaignsBody {
  emailSnovio?: string;
  emailsSnovio?: string[];
  startDate: string; // dd/mm/yyyy
  endDate: string;   // dd/mm/yyyy
}

@Controller('api/campaigns')
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly sheetsService: SheetsService,
  ) {}

  @Get('get-emails')
  async getEmails() {
    const clients = await this.sheetsService.readClientsFromSheet();
    // Agora devolve email + total de campanhas
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
      
      // ... resto do código ...
    } catch (err: any) {
      console.error(`❌ Erro ao processar ${email}:`, err.message);
      console.error(`❌ Stack:`, err.stack);
    }
  }

    // Salva CSV (caso haja dados)
    await this.campaignsService.saveToCsv(allData);

    const totalOpenings = allData.length;

    return {
      message: 'CSV gerado com sucesso!',
      totalOpenings,
      countsByEmail,
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
}

