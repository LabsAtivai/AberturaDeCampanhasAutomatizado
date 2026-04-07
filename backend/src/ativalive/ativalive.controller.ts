// backend/src/ativalive/ativalive.controller.ts
import { Controller, Post, Body, Res } from '@nestjs/common';
import { Get } from '@nestjs/common';
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

  /** Lista todos os clientes distintos que têm registros em `consultas` */
  @Get('clientes')
  async getClientes() {
    return this.ativaliveService.listClientes();
  }

  /** Retorna estatísticas de consultas por cliente no período */
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

  /** Gera e faz download do CSV das consultas no período */
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

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="ConsultasAtivalive.csv"',
    );
    res.send('\uFEFF' + csv); // BOM para Excel
  }
}