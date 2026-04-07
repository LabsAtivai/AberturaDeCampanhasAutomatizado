// backend/src/ativalive/ativalive.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as mysql from 'mysql2/promise';

@Injectable()
export class AtivaliveService implements OnModuleInit, OnModuleDestroy {
  private pool: mysql.Pool;

  async onModuleInit() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'extensao',
      waitForConnections: true,
      connectionLimit: 10,
      timezone: 'Z',
    });
    console.log('✅ AtivaliveService: pool MySQL iniciado.');
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  /**
   * Lista todos os clientes distintos da tabela `consultas`,
   * junto com a contagem total de registros de cada um.
   * Retorna ordenado pelo nome do cliente.
   */
  async listClientes(): Promise<Array<{ cliente: string; total: number }>> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT cliente, COUNT(*) AS total
       FROM consultas
       WHERE cliente IS NOT NULL AND cliente != ''
       GROUP BY cliente
       ORDER BY cliente ASC`,
    );
    return rows.map((r) => ({
      cliente: r.cliente as string,
      total: Number(r.total),
    }));
  }

  /**
   * Retorna um resumo por cliente: total de consultas, primeira e última data.
   */
  async getConsultasPorCliente(
    clientes: string[],
    startDate: string,
    endDate: string,
  ): Promise<
    Array<{
      cliente: string;
      total: number;
      primeiraConsulta: string;
      ultimaConsulta: string;
    }>
  > {
    const placeholders = clientes.map(() => '?').join(',');

    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT
         cliente,
         COUNT(*)                             AS total,
         DATE_FORMAT(MIN(horario), '%d/%m/%Y') AS primeiraConsulta,
         DATE_FORMAT(MAX(horario), '%d/%m/%Y') AS ultimaConsulta
       FROM consultas
       WHERE cliente IN (${placeholders})
         AND horario BETWEEN ? AND ?
       GROUP BY cliente
       ORDER BY total DESC`,
      [...clientes, `${startDate} 00:00:00`, `${endDate} 23:59:59`],
    );

    return rows.map((r) => ({
      cliente: r.cliente as string,
      total: Number(r.total),
      primeiraConsulta: r.primeiraConsulta as string,
      ultimaConsulta: r.ultimaConsulta as string,
    }));
  }

  /**
   * Retorna o detalhe linha a linha para geração do CSV.
   */
  async getConsultasDetalhe(
    clientes: string[],
    startDate: string,
    endDate: string,
  ): Promise<
    Array<{
      cliente: string;
      horario: string;
      type: string | null;
      domain: string | null;
      gastou_api: number;
    }>
  > {
    const placeholders = clientes.map(() => '?').join(',');

    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT
         cliente,
         DATE_FORMAT(horario, '%d/%m/%Y %H:%i:%s') AS horario,
         type,
         domain,
         gastou_api
       FROM consultas
       WHERE cliente IN (${placeholders})
         AND horario BETWEEN ? AND ?
       ORDER BY horario DESC`,
      [...clientes, `${startDate} 00:00:00`, `${endDate} 23:59:59`],
    );

    return rows.map((r) => ({
      cliente: r.cliente as string,
      horario: r.horario as string,
      type: r.type as string | null,
      domain: r.domain as string | null,
      gastou_api: Number(r.gastou_api),
    }));
  }
}