import { IsArray, IsString, ArrayMinSize, Matches } from 'class-validator';

export class GetCampaignsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecione pelo menos um email Snov.io.' })
  @IsString({ each: true })
  emailsSnovio: string[];

  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/, { message: 'startDate deve estar no formato dd/mm/yyyy.' })
  startDate: string;

  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/, { message: 'endDate deve estar no formato dd/mm/yyyy.' })
  endDate: string;
}
