import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

type SheetRow = Record<string, string>;

@Injectable({ providedIn: 'root' })
export class GoogleSheetsService {
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${environment.spreadsheetId}`;

  async getRows<T extends object = SheetRow>(sheetName: string): Promise<T[]> {
    const values = await this.getValues(`${sheetName}!A:Z`);
    const [headers = [], ...rows] = values;

    return rows
      .filter((row) => row.some((cell) => cell.trim() !== ''))
      .map((row) => {
        return headers.reduce<SheetRow>((record, header, index) => {
          if (header) {
            record[header] = row[index] ?? '';
          }

          return record;
        }, {}) as T;
      });
  }

  async appendRow(sheetName: string, row: string[]): Promise<void> {
    await this.appendRows(sheetName, [row]);
  }

  async appendRows(sheetName: string, rows: string[][]): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    const token = this.requireAccessToken();
    const range = encodeURIComponent(`${sheetName}!A:Z`);
    const url = `${this.baseUrl}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: rows })
    });

    await this.ensureOk(response, `No se pudo guardar en ${sheetName}.`);
  }

  private async getValues(rangeName: string): Promise<string[][]> {
    const token = this.requireAccessToken();
    const range = encodeURIComponent(rangeName);
    const response = await fetch(`${this.baseUrl}/values/${range}?majorDimension=ROWS`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    await this.ensureOk(response, `No se pudo leer ${rangeName}.`);
    const body = (await response.json()) as { values?: string[][] };
    return body.values ?? [];
  }

  private requireAccessToken(): string {
    const token = this.auth.accessToken();

    if (!token) {
      throw new Error('Inicia sesión con Google antes de leer la hoja.');
    }

    if (environment.spreadsheetId.startsWith('REPLACE_')) {
      throw new Error('Falta configurar spreadsheetId en el environment local.');
    }

    return token;
  }

  private async ensureOk(response: Response, fallbackMessage: string): Promise<void> {
    if (response.ok) {
      return;
    }

    let message = fallbackMessage;

    try {
      const body = (await response.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      message = `${message} Código HTTP ${response.status}.`;
    }

    throw new Error(message);
  }
}
