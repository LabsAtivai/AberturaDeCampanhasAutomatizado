import { Module } from '@nestjs/common';
import { AtivaliveController } from './ativalive.controller';
import { AtivaliveService } from './ativalive.service';
 
@Module({
  controllers: [AtivaliveController],
  providers: [AtivaliveService],
})
export class AtivaliveModule {}