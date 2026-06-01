// backend/src/ativalive/ativalive.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as mysql from 'mysql2/promise';

interface SemanaInfo {
  startDate: string;
  endDate: string;
  label: string;
  labelShort: string;
}

interface ClienteSemanal {
  cliente: string;
  tipo: 'LEGACY' | 'TRIAL_ATIVO' | 'TRIAL_EXPIRADO';
  total: number;
  primeiraConsulta: string;
  ultimaConsulta: string;
  expiresAt: string | null;
  diasRestantes: number | null;
}

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

  getInicioFimSemana(): SemanaInfo {
    // Semana corrente em BRT (UTC-3): segunda → domingo
    const now = new Date();
    const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);

    const dayOfWeek = brtNow.getUTCDay(); // 0=Dom, 1=Seg ... 6=Sab
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const monday = new Date(brtNow);
    monday.setUTCDate(brtNow.getUTCDate() - daysToMonday);

    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    const fmtSQL = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

    const fmtBR = (d: Date) =>
      `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

    const fmtBRShort = (d: Date) =>
      `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

    return {
      startDate: fmtSQL(monday),
      endDate: fmtSQL(sunday),
      label: `${fmtBR(monday)} a ${fmtBR(sunday)}`,
      labelShort: `${fmtBRShort(monday)} a ${fmtBRShort(sunday)}`,
    };
  }

  async getBaseSemanal() {
    const { startDate, endDate, label, labelShort } = this.getInicioFimSemana();

    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT
         c.cliente,
         CASE
           WHEN cl.id IS NULL THEN 'SEM_CADASTRO'
           WHEN cl.tipo = 'LEGACY' THEN 'LEGACY'
           WHEN cl.tipo = 'TRIAL' AND cl.expires_at > NOW() THEN 'TRIAL_ATIVO'
           WHEN cl.tipo = 'TRIAL' AND cl.expires_at <= NOW() THEN 'TRIAL_EXPIRADO'
           ELSE 'LEGACY'
         END AS tipo_interno,
         cl.expires_at,
         TIMESTAMPDIFF(DAY, NOW(), cl.expires_at) AS diasRestantes,
         COUNT(*) AS total,
         DATE_FORMAT(MIN(c.horario), '%d/%m/%Y') AS primeiraConsulta,
         DATE_FORMAT(MAX(c.horario), '%d/%m/%Y') AS ultimaConsulta
       FROM consultas c
       LEFT JOIN cliente cl ON cl.nome = c.cliente
       WHERE c.horario BETWEEN ? AND ?
         AND c.cliente IS NOT NULL AND c.cliente != ''
       GROUP BY c.cliente, cl.id, cl.tipo, cl.expires_at
       ORDER BY tipo_interno ASC, total DESC`,
      [`${startDate} 00:00:00`, `${endDate} 23:59:59`],
    );

    const clientes: ClienteSemanal[] = rows.map((r) => {
      const tipoInterno = r.tipo_interno as string;
      const tipo: 'LEGACY' | 'TRIAL_ATIVO' | 'TRIAL_EXPIRADO' =
        tipoInterno === 'TRIAL_ATIVO'
          ? 'TRIAL_ATIVO'
          : tipoInterno === 'TRIAL_EXPIRADO'
            ? 'TRIAL_EXPIRADO'
            : 'LEGACY';

      const expiresAt =
        r.expires_at != null
          ? new Date(r.expires_at).toLocaleDateString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
            })
          : null;

      return {
        cliente: r.cliente as string,
        tipo,
        total: Number(r.total),
        primeiraConsulta: r.primeiraConsulta as string,
        ultimaConsulta: r.ultimaConsulta as string,
        expiresAt,
        diasRestantes: r.diasRestantes != null ? Number(r.diasRestantes) : null,
      };
    });

    const totais = {
      legacy: rows.filter((r) => r.tipo_interno === 'LEGACY').length,
      trialAtivo: rows.filter((r) => r.tipo_interno === 'TRIAL_ATIVO').length,
      trialExpirado: rows.filter((r) => r.tipo_interno === 'TRIAL_EXPIRADO').length,
      semCadastro: rows.filter((r) => r.tipo_interno === 'SEM_CADASTRO').length,
    };

    const totalConsultas = {
      legacy: rows.filter((r) => r.tipo_interno === 'LEGACY').reduce((s, r) => s + Number(r.total), 0),
      trialAtivo: rows.filter((r) => r.tipo_interno === 'TRIAL_ATIVO').reduce((s, r) => s + Number(r.total), 0),
      trialExpirado: rows.filter((r) => r.tipo_interno === 'TRIAL_EXPIRADO').reduce((s, r) => s + Number(r.total), 0),
      semCadastro: rows.filter((r) => r.tipo_interno === 'SEM_CADASTRO').reduce((s, r) => s + Number(r.total), 0),
    };

    return { semana: label, labelShort, startDate, endDate, totais, totalConsultas, clientes };
  }

  async getBaseSemanalDetalhe() {
    const { startDate, endDate, label } = this.getInicioFimSemana();

    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT
         c.cliente,
         CASE
           WHEN cl.id IS NULL THEN 'LEGACY'
           WHEN cl.tipo = 'LEGACY' THEN 'LEGACY'
           WHEN cl.tipo = 'TRIAL' AND cl.expires_at > NOW() THEN 'TRIAL_ATIVO'
           WHEN cl.tipo = 'TRIAL' AND cl.expires_at <= NOW() THEN 'TRIAL_EXPIRADO'
           ELSE 'LEGACY'
         END AS tipo,
         DATE_FORMAT(c.horario, '%d/%m/%Y %H:%i:%s') AS horario,
         c.type AS tipo_consulta,
         c.domain,
         c.gastou_api,
         cl.expires_at
       FROM consultas c
       LEFT JOIN cliente cl ON cl.nome = c.cliente
       WHERE c.horario BETWEEN ? AND ?
         AND c.cliente IS NOT NULL AND c.cliente != ''
       ORDER BY c.horario DESC`,
      [`${startDate} 00:00:00`, `${endDate} 23:59:59`],
    );

    return {
      label,
      rows: rows.map((r) => ({
        cliente: r.cliente as string,
        tipo: r.tipo as string,
        horario: r.horario as string,
        tipo_consulta: (r.tipo_consulta as string | null) ?? '',
        domain: (r.domain as string | null) ?? '',
        gastou_api: Number(r.gastou_api),
        expira_em:
          r.expires_at != null
            ? new Date(r.expires_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
            : '',
      })),
    };
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
