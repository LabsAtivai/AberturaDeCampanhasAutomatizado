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

  private sendCsv(res: Response, csvContent: string, filename: string): void {
    const BOM = '﻿';
    const buffer = Buffer.from(BOM + csvContent, 'utf-8');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

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

    const header = 'cliente,horario,tipo,domain,gastou_api\n';
    const csv =
      header +
      rows
        .map(
          (r) =>
            `"${r.cliente}","${r.horario}","${r.type ?? ''}","${r.domain ?? ''}","${r.gastou_api}"`,
        )
        .join('\n');

    this.sendCsv(res, csv, 'ConsultasAtivalive.csv');
  }

  @Get('semanal')
  async getSemanal() {
    return this.ativaliveService.getBaseSemanal();
  }

  @Get('semanal/download')
  async downloadSemanal(@Res() res: Response) {
    const { label, rows } = await this.ativaliveService.getBaseSemanalDetalhe();

    const header = 'cliente,tipo,horario,tipo_consulta,domain,gastou_api,expira_em\n';
    const csv =
      header +
      rows
        .map(
          (r) =>
            `"${r.cliente}","${r.tipo}","${r.horario}","${r.tipo_consulta}","${r.domain}","${r.gastou_api}","${r.expira_em}"`,
        )
        .join('\n');

    const semanaFormatada = label.replace(/\//g, '-').replace(/ a /g, '_a_');
    this.sendCsv(res, csv, `BaseSemanal_Ativalive_${semanaFormatada}.csv`);
  }
}
