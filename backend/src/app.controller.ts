import { Controller, Get, Post, Body } from '@nestjs/common';
import { CampaignsService } from './campaigns/campaigns.service';
import { SheetsService } from './shared/sheets.service';

@Controller('api')
export class AppController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly sheetsService: SheetsService,  // Injetando o SheetsService
  ) {}

  @Get('get-emails')  // Nova rota para retornar os Emails Snovio
  async getEmails() {
    const clients = await this.sheetsService.readClientsFromSheet();  // Lê os clientes da planilha
    const emails = clients.map(client => client.emailSnovio);  // Pega os Emails Snovio
    return emails;  // Retorna os Emails Snovio para o frontend
  }

  @Post('campaigns')
  async getCampaigns(@Body() body: { emailSnovio: string; startDate: string; endDate: string }) {
    const { emailSnovio, startDate, endDate } = body;
    const campaignsData = await this.campaignsService.getCampaignsForAllClients(startDate, endDate);
    await this.campaignsService.saveToCsv(campaignsData);
    return { message: 'CSV gerado com sucesso!' };
  }
}
