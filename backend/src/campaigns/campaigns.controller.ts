// src/campaigns/campaigns.controller.ts
import { Controller, Post, Body, Get, Res } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { SheetsService } from '../shared/sheets.service';
import type { Response } from 'express';


@Controller('api/campaigns')
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly sheetsService: SheetsService,
  ) {}

  @Get('get-emails')
  async getEmails() {
    const clients = await this.sheetsService.readClientsFromSheet();
    return clients.map((client) => client.emailSnovio); // options do select no front
  }

  @Post()
  async getCampaigns(
    @Body() body: { emailSnovio: string; startDate: string; endDate: string },
  ) {
    const { emailSnovio, startDate, endDate } = body;

    // 1) Encontra o cliente pela coluna Email Snovio
    const clients = await this.sheetsService.readClientsFromSheet();
    const client = clients.find((c) => c.emailSnovio === emailSnovio);
    if (!client) {
      throw new Error('Cliente não encontrado');
    }

    // 2) Token + campanhas
    const accessToken = await this.campaignsService.getAccessToken(
      client.clientId,
      client.clientSecret,
    );
    const campaigns = await this.campaignsService.getUserCampaigns(accessToken);

    // 3) Coleta aberturas e adiciona o clientEmail
    const allData: any[] = [];
for (const campaign of campaigns) {
  const emailsOpened = await this.campaignsService.getEmailsOpened(
    accessToken,
    campaign.id,
    campaign.name,
    startDate,
    endDate,
  );;

  const withClient = emailsOpened.map(item => ({
    clientEmail: client.emailSnovio,
    ...item,
  }));

  allData.push(...withClient);
}

    // 4) Salva CSV no servidor
    await this.campaignsService.saveToCsv(allData);

    return { message: 'CSV gerado com sucesso!' };
  }

  // NOVA ROTA: download do CSV
  @Get('download')
  async downloadCsv(@Res() res: Response) {
    const filePath = this.campaignsService.getCsvFilePath();
    const fileName = 'AberturasDeCampanhas.csv';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    return res.download(filePath, fileName);
  }
}
