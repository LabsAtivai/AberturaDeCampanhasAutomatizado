import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { SheetsService } from '../shared/sheets.service'; // Importando o SheetsService

@Module({
  imports: [],  // Se necessário, adicione outros módulos aqui
  controllers: [CampaignsController],
  providers: [CampaignsService, SheetsService],  // Adicionando o SheetsService ao providers
})
export class CampaignsModule {}
