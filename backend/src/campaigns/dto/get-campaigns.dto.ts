import { IsArray, IsString, ArrayMinSize, ArrayMaxSize, Matches, Validate } from 'class-validator';
import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';
import { validateBrRange } from '../../common/br-date';

@ValidatorConstraint({ name: 'brDateRange', async: false })
class BrDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const { startDate, endDate } = args.object as GetCampaignsDto;
    return validateBrRange(startDate, endDate) === null;
  }

  defaultMessage(args: ValidationArguments) {
    const { startDate, endDate } = args.object as GetCampaignsDto;
    return validateBrRange(startDate, endDate) ?? 'Intervalo de datas inválido.';
  }
}

export class GetCampaignsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecione pelo menos um email Snov.io.' })
  @ArrayMaxSize(500)
  @IsString({ each: true })
  emailsSnovio: string[];

  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/, { message: 'startDate deve estar no formato dd/mm/yyyy.' })
  startDate: string;

  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/, { message: 'endDate deve estar no formato dd/mm/yyyy.' })
  @Validate(BrDateRangeConstraint)
  endDate: string;
}
