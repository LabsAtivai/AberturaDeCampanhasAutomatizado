import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CampaignsModule } from './campaigns/campaigns.module';
import { AtivaliveModule } from './ativalive/ativalive.module';
 
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),  // <-- adicionar
    ScheduleModule.forRoot(),
    CampaignsModule,
    AtivaliveModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}