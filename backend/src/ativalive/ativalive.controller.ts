import { Controller, Post, Body, Res, Get } from '@nestjs/common';
import { AtivaliveService } from './ativalive.service';
import type { Response } from 'express';

interface ConsultasBody {
  clientes: string[];
  startDate: string; // yyyy-mm-dd
  endDate: string;   // yyyy-mm-dd
}

@Controller('ativalive')
export class AtivaliveController {
  constructor(private readonly ativaliveService: AtivaliveService) {}

  private sendCsv(res: Response, csvContent: string, filename: string): void {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csvContent);
  }

  @Get('clientes')
  async getClientes() {
    return this.ativaliveService.listClientes();
  }

  @Post('consultas')
  async getConsultas(@Body() body: ConsultasBody) {
    const { clientes, startDate, endDate } = body;

    if (!clientes?.length) throw new Error('Informe ao menos um cliente.');
    if (!startDate || !endDate) throw new Error('Informe as datas de início e fim.');

    const data = await this.ativaliveService.getConsultasPorCliente(
      clientes,
      startDate,
      endDate,
    );

    return { success: true, data };
  }

  @Post('download')
  async downloadCsv(@Body() body: ConsultasBody, @Res() res: Response) {
    const { clientes, startDate, endDate } = body;

    const rows = await this.ativaliveService.getConsultasDetalhe(
      clientes,
      startDate,
      endDate,
    );

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
