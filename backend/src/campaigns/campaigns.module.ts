// src/campaigns/campaigns.module.ts
import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { SheetsService } from '../shared/sheets.service';

@Module({
  imports: [],
  controllers: [CampaignsController],
  providers: [CampaignsService, SheetsService],
  exports: [CampaignsService, SheetsService], // 👈 exporta para outros módulos (AppModule) poderem usar
})
export class CampaignsModule {}
