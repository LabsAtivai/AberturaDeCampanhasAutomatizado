import { google } from 'googleapis';
import * as path from 'path';
import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';

@Injectable()
export class SheetsService {
  private readonly spreadsheetId = '1u4rMoTUQz0w_g92xmV8_pjtVc8JtKLLH7v090V5lq40';
  private readonly sheetName = 'aberturas';

  private async getAuthClient() {
    const credentialsPath = path.resolve(__dirname, '../../credentials.json');
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));

    if (!credentials.client_email) {
      throw new Error("O arquivo de credenciais não contém o campo 'client_email'.");
    }

    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    return auth;
  }

  // Leitura dos clientes
  async readClientsFromSheet() {
    const authClient = await this.getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const range = this.sheetName; // aba inteira
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });

    const rows = res.data.values || [];

    // Esperado:
    // 0: (header)
    // 1: email
    // 2: clientId
    // 3: clientSecret
    // 4: emailSnovio
    // 5: senha
    // 6: totalCampanhas (novo campo numérico)
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

  // Atualiza a coluna "totalCampanhas" (coluna G, índice 6)
  async updateClientCampaignCount(emailSnovio: string, total: number) {
    const authClient = await this.getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // Lê todas as linhas para achar o índice
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: this.sheetName,
    });

    const rows = res.data.values || [];
    let targetIndex = -1;

    for (let i = 1; i < rows.length; i++) {
      const rowEmail = rows[i][4]?.trim();
      if (rowEmail === emailSnovio) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex === -1) {
      console.warn(`[SheetsService] Email Snovio não encontrado na planilha: ${emailSnovio}`);
      return;
    }

    // Garante que a linha tenha pelo menos 7 colunas
    const row = rows[targetIndex];
    while (row.length < 7) row.push('');

    row[6] = String(total);

    const rowNumber = targetIndex + 1; // +1 por causa do header
    const range = `${this.sheetName}!A${rowNumber}:G${rowNumber}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [row],
      },
    });

    console.log(`[SheetsService] Campanhas atualizadas para ${emailSnovio}: ${total}`);
  }
}
