import { google } from 'googleapis';
import * as path from 'path';
import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';

@Injectable()
export class SheetsService {
  private async getAuthClient() {
    const credentialsPath = path.resolve(__dirname, '../../credentials.json');

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));

    // Verifica se o campo client_email está presentes
    if (!credentials.client_email) {
      throw new Error("O arquivo de credenciais não contém o campo 'client_email'.");
    }

    const auth = new GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // Retorna o client autenticado
    return auth;  // Retorna o GoogleAuth, e não o auth.getClient()
  }

  // Função para ler os dados dos clientes na planilha
  async readClientsFromSheet() {
    const authClient = await this.getAuthClient();  // Agora, authClient é do tipo GoogleAuth
    const sheets = google.sheets({ version: 'v4', auth: authClient });  // Passando o GoogleAuth diretamente
    const spreadsheetId = "1u4rMoTUQz0w_g92xmV8_pjtVc8JtKLLH7v090V5lq40"  // ID da sua planilha
    const range = 'aberturas';  // Faixa/aba da planilha com os dados dos clientes

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = res.data.values || [];
    return rows.slice(1).map(row => ({
      email: row[1]?.trim(),
      clientId: row[2]?.trim(),
      clientSecret: row[3]?.trim(),
      emailSnovio: row[4]?.trim(),
      senha: row[5]?.trim(),
    })).filter(c => c.clientId && c.clientSecret);  // Filtra clientes com dados completos
  }
}
