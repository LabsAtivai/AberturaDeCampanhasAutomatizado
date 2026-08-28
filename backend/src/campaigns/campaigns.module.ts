// src/campaigns/campaigns.module.ts
import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CredentialsApiService } from '../shared/credentials-api.service';

@Module({
  imports: [],
  controllers: [CampaignsController],
  providers: [CampaignsService, CredentialsApiService],
  exports: [CampaignsService, CredentialsApiService], // 👈 exporta para outros módulos (AppModule) poderem usar
})
export class CampaignsModule {}
