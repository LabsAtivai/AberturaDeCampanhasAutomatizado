import { Controller, Post, Body, Res, Get, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { IsArray, IsString, ArrayMinSize } from 'class-validator';
import { AtivaliveService } from './ativalive.service';
import type { Response } from 'express';

class ConsultasDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  clientes: string[];

  @IsString()
  startDate: string;

  @IsString()
  endDate: string;
}

@Controller('ativalive')
export class AtivaliveController {
  private readonly logger = new Logger(AtivaliveController.name);

  constructor(private readonly ativaliveService: AtivaliveService) {}

  @Get('clientes')
  async getClientes() {
    return this.ativaliveService.listClientes();
  }

  @Post('consultas')
  @HttpCode(HttpStatus.OK)
  async getConsultas(@Body() body: ConsultasDto) {
    const { clientes, startDate, endDate } = body;
    const data = await this.ativaliveService.getConsultasPorCliente(clientes, startDate, endDate);
    return { success: true, data };
  }

  @Post('download')
  @HttpCode(HttpStatus.OK)
  async downloadCsv(@Body() body: ConsultasDto, @Res() res: Response) {
    const { clientes, startDate, endDate } = body;

    const rows = await this.ativaliveService.getConsultasDetalhe(clientes, startDate, endDate);

    const BOM = '\uFEFF';
    const header = 'cliente,horario,tipo,domain,gastou_api\n';
    const csv =
      header +
      rows
        .map(
          (r) =>
            `"${r.cliente}","${r.horario}","${r.type ?? ''}","${r.domain ?? ''}","${r.gastou_api}"`,
        )
        .join('\n');

    const buffer = Buffer.from(BOM + csv, 'utf-8');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ConsultasAtivalive.csv"');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }
}
