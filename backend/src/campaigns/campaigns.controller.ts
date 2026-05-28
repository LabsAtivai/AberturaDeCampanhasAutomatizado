import {
  Controller,
  Post,
  Body,
  Get,
  Res,
  Param,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { SheetsService } from '../shared/sheets.service';
import { GetCampaignsDto } from './dto/get-campaigns.dto';
import type { Response } from 'express';

@Controller('campaigns')
export class CampaignsController {
  private readonly logger = new Logger(CampaignsController.name);

  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly sheetsService: SheetsService,
  ) {}

  @Get('get-emails')
  async getEmails() {
    const clients = await this.sheetsService.readClientsFromSheet();
    return clients.map((c) => ({
      emailSnovio: c.emailSnovio,
      totalCampaigns: c.totalCampaigns || 0,
    }));
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async getCampaigns(@Body() body: GetCampaignsDto) {
    const { emailsSnovio, startDate, endDate } = body;

    this.logger.log(`Processando ${emailsSnovio.length} cliente(s)...`);

    const clients = await this.sheetsService.readClientsFromSheet();

    const allData: Array<any> = [];
    const countsByEmail: Record<string, number> = {};
    const countsByCampaign: Record<string, number> = {};

    const results = await Promise.all(
      emailsSnovio.map(async (email) => {
        const client = clients.find((c) => c.emailSnovio === email);
        if (!client) {
          this.logger.warn(`Cliente não encontrado: ${email}`);
          return { data: [], countsByEmail: {}, countsByCampaign: {} };
        }

        try {
          const accessToken = await this.campaignsService.getAccessToken(
            client.clientId,
            client.clientSecret,
          );

          const campaigns = await this.campaignsService.getUserCampaigns(accessToken);
          this.logger.log(`${email}: ${campaigns.length} campanhas`);

          if (!campaigns.length) {
            return { data: [], countsByEmail: {}, countsByCampaign: {} };
          }

          const emailsOpened = await this.campaignsService.getEmailsOpenedFast(
            accessToken,
            campaigns,
            startDate,
            endDate,
          );

          const withClient = emailsOpened.map((item) => ({
            clientEmail: email,
            ...item,
          }));

          const localEmail: Record<string, number> = {};
          const localCampaign: Record<string, number> = {};

          emailsOpened.forEach((item) => {
            if (item.prospectEmail) localEmail[item.prospectEmail] = (localEmail[item.prospectEmail] || 0) + 1;
            if (item.campaign) localCampaign[item.campaign] = (localCampaign[item.campaign] || 0) + 1;
          });

          return { data: withClient, countsByEmail: localEmail, countsByCampaign: localCampaign };
        } catch (err: any) {
          this.logger.error(`Erro em ${email}: ${err.message}`);
          return { data: [], countsByEmail: {}, countsByCampaign: {} };
        }
      }),
    );

    results.forEach((r) => {
      allData.push(...r.data);
      Object.entries(r.countsByEmail).forEach(([k, v]) => {
        countsByEmail[k] = (countsByEmail[k] || 0) + (v as number);
      });
      Object.entries(r.countsByCampaign).forEach(([k, v]) => {
        countsByCampaign[k] = (countsByCampaign[k] || 0) + (v as number);
      });
    });

    this.logger.log(`Total de aberturas: ${allData.length}`);

    return {
      success: true,
      message: allData.length > 0 ? 'Relatório gerado!' : 'Nenhuma abertura encontrada no período.',
      totalOpenings: allData.length,
      countsByEmail,
      countsByCampaign,
      processedClients: emailsSnovio.length,
    };
  }

  // Download CSV gerado em memória — sem arquivo em disco
  @Post('download')
  @HttpCode(HttpStatus.OK)
  async downloadCsv(@Body() body: GetCampaignsDto, @Res() res: Response) {
    const { emailsSnovio, startDate, endDate } = body;

    const clients = await this.sheetsService.readClientsFromSheet();
    const allData: Array<any> = [];

    await Promise.all(
      emailsSnovio.map(async (email) => {
        const client = clients.find((c) => c.emailSnovio === email);
        if (!client) return;
        try {
          const accessToken = await this.campaignsService.getAccessToken(
            client.clientId,
            client.clientSecret,
          );
          const campaigns = await this.campaignsService.getUserCampaigns(accessToken);
          const emailsOpened = await this.campaignsService.getEmailsOpenedFast(
            accessToken,
            campaigns,
            startDate,
            endDate,
          );
          emailsOpened.forEach((item) => allData.push({ clientEmail: email, ...item }));
        } catch (err: any) {
          this.logger.error(`Download - Erro em ${email}: ${err.message}`);
        }
      }),
    );

    const buffer = this.campaignsService.generateCsvBuffer(allData);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="AberturasDeCampanhas.csv"');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  @Get('test/:emailSnovio')
  async testClient(@Param('emailSnovio') emailSnovio: string) {
    const clients = await this.sheetsService.readClientsFromSheet();
    const client = clients.find((c) => c.emailSnovio === emailSnovio);

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
        sampleCampaigns: campaigns.slice(0, 5),
      },
    };
  }
}
