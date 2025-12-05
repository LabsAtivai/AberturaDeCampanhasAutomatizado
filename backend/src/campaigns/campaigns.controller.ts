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
    const { emailSnovio, emailsSnovio, startDate, endDate } = body;

    const selectedEmails: string[] = emailsSnovio?.length
      ? emailsSnovio
      : emailSnovio
      ? [emailSnovio]
      : [];

    if (!selectedEmails.length) {
      throw new Error('Nenhum email Snovio informado');
    }

    const allData: any[] = [];
    const countsByEmail: Record<string, number> = {};

    const clients = await this.sheetsService.readClientsFromSheet();

    for (const email of selectedEmails) {
      const client = clients.find((c) => c.emailSnovio === email);
      if (!client) {
        console.warn(`Cliente não encontrado para emailSnovio: ${email}`);
        continue;
      }

      const accessToken = await this.campaignsService.getAccessToken(
        client.clientId,
        client.clientSecret,
      );
      const campaigns = await this.campaignsService.getUserCampaigns(accessToken);

      for (const campaign of campaigns) {
        const emailsOpened = await this.campaignsService.getEmailsOpened(
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

        for (const item of emailsOpened) {
          const p = item.prospectEmail || '';
          if (!p) continue;
          countsByEmail[p] = (countsByEmail[p] || 0) + 1;
        }
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
