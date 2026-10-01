import {
  BadRequestException,
  Controller,
  Post,
  Body,
  Get,
  Query,
  Res,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { CampaignsService, FailedCampaign } from './campaigns.service';
import { CredentialsApiService } from '../shared/credentials-api.service';
import type { Response } from 'express';

interface CampaignsBody {
  emailSnovio?: string;
  emailsSnovio?: string[];
  startDate: string; // dd/mm/yyyy
  endDate: string; // dd/mm/yyyy
}

const BR_DATE = /^\d{2}\/\d{2}\/\d{4}$/;

@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly credentialsApiService: CredentialsApiService,
  ) {}

  @Get('get-emails')
  async getEmails() {
    const clients = await this.credentialsApiService.getActiveClients();
    return clients.map((client) => ({
      emailSnovio: client.emailSnovio,
      totalCampaigns: this.campaignsService.getCampaignCount(client.emailSnovio),
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
      throw new BadRequestException('Nenhum email Snovio informado');
    }

    if (!startDate || !endDate) {
      throw new BadRequestException('Datas de início e fim são obrigatórias');
    }

    if (!BR_DATE.test(startDate) || !BR_DATE.test(endDate)) {
      throw new BadRequestException('Datas devem estar no formato dd/mm/yyyy');
    }

    const clients = await this.credentialsApiService.getActiveClients();
    const allData: any[] = [];
    const countsByEmail: Record<string, number> = {};
    const failedCampaigns: Array<FailedCampaign & { clientEmail: string }> = [];
    const failedClients: string[] = [];

    // Clientes em paralelo; a concorrência real é limitada pelo semáforo do CampaignsService.
    const results = await Promise.all(
      selectedEmails.map(async (email) => {
        const client = clients.find((c) => c.emailSnovio === email);

        if (!client) {
          failedClients.push(email);
          return [];
        }

        try {
          const accessToken = await this.campaignsService.getAccessToken(
            client.clientId,
            client.clientSecret,
          );
          const campaigns = await this.campaignsService.getUserCampaigns(accessToken);
          if (campaigns.length === 0) return [];

          const { data, failedCampaigns: failed } =
            await this.campaignsService.getEmailsOpenedFast(
              accessToken,
              campaigns,
              startDate,
              endDate,
            );

          failedCampaigns.push(...failed.map((f) => ({ ...f, clientEmail: email })));
          return data.map((item) => ({ clientEmail: client.emailSnovio, ...item }));
        } catch (err: any) {
          console.error(`❌ Erro em ${email}:`, err.message);
          failedClients.push(email);
          return [];
        }
      }),
    );

    for (const rows of results) allData.push(...rows);

    const uniqueProspects = new Set<string>();
    for (const item of allData) {
      const p = item.prospectEmail || '';
      if (p) {
        countsByEmail[p] = (countsByEmail[p] || 0) + 1;
        uniqueProspects.add(p);
      }
    }

    const reportId = await this.campaignsService.saveToCsv(allData);
    const incomplete = failedClients.length > 0 || failedCampaigns.length > 0;

    console.log(
      `🏁 Relatório: ${selectedEmails.length} cliente(s), ${allData.length} aberturas, ` +
        `${failedClients.length} cliente(s) e ${failedCampaigns.length} campanha(s) com falha.`,
    );

    return {
      success: true,
      message: allData.length > 0 ? 'Relatório gerado!' : 'Nenhuma abertura',
      totalOpenings: allData.length,
      uniqueProspects: uniqueProspects.size,
      countsByEmail,
      processedClients: selectedEmails.length,
      reportId,
      incomplete,
      failedClients,
      failedCampaigns,
    };
  }

  @Get('download')
  async downloadCsv(@Res() res: Response, @Query('id') id?: string) {
    const filePath = this.campaignsService.getCsvFilePath(id);
    if (!filePath) {
      throw new NotFoundException('Relatório não encontrado ou expirado. Gere novamente.');
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.download(filePath, 'AberturasDeCampanhas.csv');
  }

  @Get('test/:emailSnovio')
  async testClient(@Param('emailSnovio') emailSnovio: string) {
    try {
      const client = await this.credentialsApiService.getClientByEmailSnovio(emailSnovio);

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
