import { Module } from '@nestjs/common';

import { CampaignsModule } from './campaigns/campaigns.module';
import { SheetsService } from './shared/sheets.service';

@Module({
  imports: [CampaignsModule],
  controllers: [],
  providers: [SheetsService],
})
export class AppModule {}
