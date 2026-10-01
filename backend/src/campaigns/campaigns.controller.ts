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
import { CampaignsService, FailedCampaign } from './campaigns.service';
import { CredentialsApiService } from '../shared/credentials-api.service';
import { GetCampaignsDto } from './dto/get-campaigns.dto';
import type { Response } from 'express';

@Controller('campaigns')
export class CampaignsController {
  private readonly logger = new Logger(CampaignsController.name);

  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly credentialsApiService: CredentialsApiService,
  ) {}

  @Get('get-emails')
  async getEmails() {
    const clients = await this.credentialsApiService.getActiveClients();
    return clients.map((c) => ({
      emailSnovio: c.emailSnovio,
      totalCampaigns: this.campaignsService.getCampaignCount(c.emailSnovio),
    }));
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async getCampaigns(@Body() body: GetCampaignsDto) {
    const { emailsSnovio, startDate, endDate } = body;

    this.logger.log(`Processando ${emailsSnovio.length} cliente(s)...`);

    const clients = await this.credentialsApiService.getActiveClients();

    const allData: Array<any> = [];
    const countsByEmail: Record<string, number> = {};
    const countsByCampaign: Record<string, number> = {};
    const failedCampaigns: Array<FailedCampaign & { clientEmail: string }> = [];

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

          const { emails: emailsOpened, failedCampaigns: failed } =
            await this.campaignsService.getEmailsOpenedFast(
              accessToken,
              campaigns,
              startDate,
              endDate,
            );
          failedCampaigns.push(...failed.map((f) => ({ ...f, clientEmail: email })));

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

          return { data: withClient, countsByEmail: localEmail, countsByCampaign: localCampaign, failed: false };
        } catch (err: any) {
          this.logger.error(`Erro em ${email}: ${err.message}`);
          return { data: [], countsByEmail: {}, countsByCampaign: {}, failed: true };
        }
      }),
    );

    const failedEmails: string[] = [];

    results.forEach((r, idx) => {
      allData.push(...r.data);
      if (r.failed) failedEmails.push(emailsSnovio[idx]);
      Object.entries(r.countsByEmail).forEach(([k, v]) => {
        countsByEmail[k] = (countsByEmail[k] || 0) + (v as number);
      });
      Object.entries(r.countsByCampaign).forEach(([k, v]) => {
        countsByCampaign[k] = (countsByCampaign[k] || 0) + (v as number);
      });
    });

    this.logger.log(`Total de aberturas: ${allData.length}`);

    const incomplete = failedEmails.length > 0 || failedCampaigns.length > 0;

    return {
      success: failedEmails.length < emailsSnovio.length,
      message:
        failedEmails.length > 0
          ? `Falha ao consultar a Snov.io para: ${failedEmails.join(', ')}. Resultado pode estar incompleto.`
          : failedCampaigns.length > 0
            ? `${failedCampaigns.length} campanha(s) não puderam ser consultadas. Resultado pode estar incompleto.`
            : allData.length > 0
            ? 'Relatório gerado!'
            : 'Nenhuma abertura encontrada no período.',
      totalOpenings: allData.length,
      countsByEmail,
      countsByCampaign,
      processedClients: emailsSnovio.length,
      failedEmails,
      failedCampaigns,
      incomplete,
    };
  }

  // Download CSV gerado em memória — sem arquivo em disco
  @Post('download')
  @HttpCode(HttpStatus.OK)
  async downloadCsv(@Body() body: GetCampaignsDto, @Res() res: Response) {
    const { emailsSnovio, startDate, endDate } = body;

    const clients = await this.credentialsApiService.getActiveClients();
    const allData: Array<any> = [];
    const failedEmails: string[] = [];
    let failedCampaignsCount = 0;

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
          const { emails: emailsOpened, failedCampaigns } =
            await this.campaignsService.getEmailsOpenedFast(
              accessToken,
              campaigns,
              startDate,
              endDate,
            );
          failedCampaignsCount += failedCampaigns.length;
          emailsOpened.forEach((item) => allData.push({ clientEmail: email, ...item }));
        } catch (err: any) {
          this.logger.error(`Download - Erro em ${email}: ${err.message}`);
          failedEmails.push(email);
        }
      }),
    );

    // Todos os clientes falharam (ex.: rate limit da Snov.io) — não devolve CSV vazio como sucesso.
    if (failedEmails.length > 0 && failedEmails.length === emailsSnovio.length) {
      res.status(HttpStatus.BAD_GATEWAY).json({
        success: false,
        message:
          'Falha ao consultar a Snov.io para todos os clientes selecionados. Tente novamente em instantes.',
        failedEmails,
      });
      return;
    }

    const buffer = this.campaignsService.generateCsvBuffer(allData);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="AberturasDeCampanhas.csv"');
    res.setHeader('Content-Length', buffer.length);
    // Sinaliza ao frontend que o CSV pode estar incompleto (clientes/campanhas com falha).
    res.setHeader('X-Report-Incomplete', String(failedEmails.length > 0 || failedCampaignsCount > 0));
    res.send(buffer);
  }

  @Get('test/:emailSnovio')
  async testClient(@Param('emailSnovio') emailSnovio: string) {
    const clients = await this.credentialsApiService.getActiveClients();
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
