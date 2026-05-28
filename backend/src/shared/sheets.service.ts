import { google } from 'googleapis';
import * as path from 'path';
import * as fs from 'fs';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SheetsService implements OnModuleInit {
  private readonly logger = new Logger(SheetsService.name);
  private credentials: any;
  private spreadsheetId: string;
  private readonly sheetName = 'aberturas';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    // spreadsheetId via env, fallback ao valor original
    this.spreadsheetId =
      this.config.get<string>('SPREADSHEET_ID') ||
      '1u4rMoTUQz0w_g92xmV8_pjtVc8JtKLLH7v090V5lq40';

    // Credenciais: prefer env var GOOGLE_CREDENTIALS (JSON string), fallback ao arquivo
    const credsEnv = this.config.get<string>('GOOGLE_CREDENTIALS');
    if (credsEnv) {
      this.credentials = JSON.parse(credsEnv);
    } else {
      const credentialsPath = path.resolve(__dirname, '../../credentials.json');
      this.credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    }

    if (!this.credentials.client_email) {
      throw new Error("Credenciais Google inválidas: campo 'client_email' ausente.");
    }

    this.logger.log('SheetsService inicializado.');
  }

  private getAuthClient() {
    return new GoogleAuth({
      credentials: this.credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  async readClientsFromSheet() {
    const sheets = google.sheets({ version: 'v4', auth: this.getAuthClient() });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: this.sheetName,
    });

    const rows = res.data.values || [];

    return rows
      .slice(1)
      .map((row) => ({
        email: row[1]?.trim(),
        clientId: row[2]?.trim(),
        clientSecret: row[3]?.trim(),
        emailSnovio: row[4]?.trim(),
        senha: row[5]?.trim(),
        totalCampaigns: row[6] ? Number(row[6]) || 0 : 0,
      }))
      .filter((c) => c.clientId && c.clientSecret && c.emailSnovio);
  }

  async updateClientCampaignCount(emailSnovio: string, total: number) {
    const sheets = google.sheets({ version: 'v4', auth: this.getAuthClient() });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: this.sheetName,
    });

    const rows = res.data.values || [];
    let targetIndex = -1;

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][4]?.trim() === emailSnovio) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex === -1) {
      this.logger.warn(`Email Snovio não encontrado na planilha: ${emailSnovio}`);
      return;
    }

    const row = rows[targetIndex];
    while (row.length < 7) row.push('');
    row[6] = String(total);

    const rowNumber = targetIndex + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!A${rowNumber}:G${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });

    this.logger.log(`Campanhas atualizadas para ${emailSnovio}: ${total}`);
  }
}
