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
  NotFoundException,
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
      email: c.email,
      totalCampaigns: this.campaignsService.getCampaignCount(c.emailSnovio),
    }));
  }

  // Coleta as aberturas de cada email Snov.io; nunca lança — falhas viram failedEmails/failedCampaigns.
  private async collect(emailsSnovio: string[], startDate: string, endDate: string) {
    const clients = await this.credentialsApiService.getActiveClients();
    const failedEmails: string[] = [];
    const failedCampaigns: Array<FailedCampaign & { clientEmail: string }> = [];

    const results = await Promise.all(
      emailsSnovio.map(async (email) => {
        const client = clients.find((c) => c.emailSnovio === email);
        if (!client) {
          // Conta fora da lista ativa: conta como falha, para o relatório não parecer completo.
          this.logger.warn(`Cliente não encontrado: ${email}`);
          failedEmails.push(email);
          return [];
        }

        try {
          const accessToken = await this.campaignsService.getAccessToken(
            client.clientId,
            client.clientSecret,
          );
          const campaigns = await this.campaignsService.getUserCampaigns(accessToken);
          this.logger.log(`${email}: ${campaigns.length} campanhas`);
          if (!campaigns.length) return [];

          const { emails: opened, failedCampaigns: failed } =
            await this.campaignsService.getEmailsOpenedFast(
              accessToken,
              campaigns,
              startDate,
              endDate,
            );
          failedCampaigns.push(...failed.map((f) => ({ ...f, clientEmail: email })));
          return opened.map((item) => ({ clientEmail: email, ...item }));
        } catch (err: any) {
          this.logger.error(`Erro em ${email}: ${err.message}`);
          failedEmails.push(email);
          return [];
        }
      }),
    );

    return { data: results.flat(), failedEmails, failedCampaigns };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async getCampaigns(@Body() body: GetCampaignsDto) {
    const { emailsSnovio, startDate, endDate } = body;

    this.logger.log(`Processando ${emailsSnovio.length} cliente(s)...`);

    const { data, failedEmails, failedCampaigns } = await this.collect(
      emailsSnovio,
      startDate,
      endDate,
    );

    const countsByEmail: Record<string, number> = {};
    const countsByCampaign: Record<string, number> = {};
    for (const item of data) {
      if (item.prospectEmail) countsByEmail[item.prospectEmail] = (countsByEmail[item.prospectEmail] || 0) + 1;
      if (item.campaign) countsByCampaign[item.campaign] = (countsByCampaign[item.campaign] || 0) + 1;
    }

    this.logger.log(`Total de aberturas: ${data.length}`);

    const incomplete = failedEmails.length > 0 || failedCampaigns.length > 0;

    return {
      success: failedEmails.length < emailsSnovio.length,
      message:
        failedEmails.length > 0
          ? `Falha ao consultar a Snov.io para: ${failedEmails.join(', ')}. Resultado pode estar incompleto.`
          : failedCampaigns.length > 0
            ? `${failedCampaigns.length} campanha(s) não puderam ser consultadas. Resultado pode estar incompleto.`
            : data.length > 0
              ? 'Relatório gerado!'
              : 'Nenhuma abertura encontrada no período.',
      totalOpenings: data.length,
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

    const { data, failedEmails, failedCampaigns } = await this.collect(
      emailsSnovio,
      startDate,
      endDate,
    );

    // Todos os clientes falharam (ex.: rate limit da Snov.io) — não devolve CSV vazio como sucesso.
    if (failedEmails.length === emailsSnovio.length) {
      res.status(HttpStatus.BAD_GATEWAY).json({
        success: false,
        message:
          'Falha ao consultar a Snov.io para todos os clientes selecionados. Tente novamente em instantes.',
        failedEmails,
      });
      return;
    }

    const buffer = this.campaignsService.generateCsvBuffer(data);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="AberturasDeCampanhas.csv"');
    res.setHeader('Content-Length', buffer.length);
    // Sinaliza ao frontend que o CSV pode estar incompleto (clientes/campanhas com falha).
    res.setHeader('X-Report-Incomplete', String(failedEmails.length > 0 || failedCampaigns.length > 0));
    res.send(buffer);
  }

  @Get('test/:emailSnovio')
  async testClient(@Param('emailSnovio') emailSnovio: string) {
    const clients = await this.credentialsApiService.getActiveClients();
    const client = clients.find((c) => c.emailSnovio === emailSnovio);

    if (!client) {
      throw new NotFoundException('Cliente não encontrado');
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
