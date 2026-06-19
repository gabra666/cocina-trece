import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

type SheetRow = Record<string, string>;

export interface SheetRowWithMetadata<T> {
  rowNumber: number;
  value: T;
}

@Injectable({ providedIn: 'root' })
export class GoogleSheetsService {
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${environment.spreadsheetId}`;
  private readonly sheetIdByName = new Map<string, number>();

  async getRows<T extends object = SheetRow>(sheetName: string): Promise<T[]> {
    return (await this.getRowsWithMetadata<T>(sheetName)).map((row) => row.value);
  }

  async getRowsWithMetadata<T extends object = SheetRow>(sheetName: string): Promise<SheetRowWithMetadata<T>[]> {
    const values = await this.getValues(`${sheetName}!A:Z`);
    const [headers = [], ...rows] = values;

    return rows
      .map((row, index) => {
        const value = headers.reduce<SheetRow>((record, header, cellIndex) => {
          if (header) {
            record[header] = row[cellIndex] ?? '';
          }

          return record;
        }, {}) as T;

        return {
          rowNumber: index + 2,
          value
        };
      })
      .filter((row) => {
        return Object.values(row.value as SheetRow).some((cell) => cell.trim() !== '');
      });
  }

  async appendRow(sheetName: string, row: string[]): Promise<void> {
    const token = this.requireAccessToken();
    const range = encodeURIComponent(`${sheetName}!A:Z`);
    const url = `${this.baseUrl}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [row] })
    });

    await this.ensureOk(response, 'No se pudo guardar la información.');
  }

  async updateRow(sheetName: string, rowNumber: number, row: string[]): Promise<void> {
    const token = this.requireAccessToken();
    const lastColumn = this.getColumnName(row.length);
    const range = encodeURIComponent(`${sheetName}!A${rowNumber}:${lastColumn}${rowNumber}`);
    const url = `${this.baseUrl}/values/${range}?valueInputOption=USER_ENTERED`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [row] })
    });

    await this.ensureOk(response, 'No se pudo actualizar la información.');
  }

  async deleteRow(sheetName: string, rowNumber: number): Promise<void> {
    const token = this.requireAccessToken();
    const sheetId = await this.getSheetId(sheetName);

    const response = await fetch(`${this.baseUrl}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowNumber - 1,
                endIndex: rowNumber
              }
            }
          }
        ]
      })
    });

    await this.ensureOk(response, 'No se pudo eliminar la información.');
  }

  private async getValues(rangeName: string): Promise<string[][]> {
    const token = this.requireAccessToken();
    const range = encodeURIComponent(rangeName);
    const response = await fetch(`${this.baseUrl}/values/${range}?majorDimension=ROWS`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    await this.ensureOk(response, 'No se pudo cargar la información.');
    const body = (await response.json()) as { values?: string[][] };
    return body.values ?? [];
  }

  private async getSheetId(sheetName: string): Promise<number> {
    const cachedSheetId = this.sheetIdByName.get(sheetName);

    if (cachedSheetId !== undefined) {
      return cachedSheetId;
    }

    const token = this.requireAccessToken();
    const response = await fetch(`${this.baseUrl}?fields=sheets.properties`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    await this.ensureOk(response, 'No se pudo preparar la información.');

    const body = (await response.json()) as {
      sheets?: Array<{
        properties?: {
          sheetId?: number;
          title?: string;
        };
      }>;
    };

    for (const sheet of body.sheets ?? []) {
      const title = sheet.properties?.title;
      const sheetId = sheet.properties?.sheetId;

      if (title !== undefined && sheetId !== undefined) {
        this.sheetIdByName.set(title, sheetId);
      }
    }

    const sheetId = this.sheetIdByName.get(sheetName);

    if (sheetId === undefined) {
      throw new Error('No se encontró la información solicitada.');
    }

    return sheetId;
  }

  private requireAccessToken(): string {
    const token = this.auth.getValidAccessToken();

    if (!token) {
      throw new Error('Inicia sesión para consultar la información.');
    }

    if (environment.spreadsheetId.startsWith('REPLACE_')) {
      throw new Error('Falta configurar spreadsheetId en el environment local.');
    }

    return token;
  }

  private getColumnName(columnNumber: number): string {
    let remaining = columnNumber;
    let columnName = '';

    while (remaining > 0) {
      const modulo = (remaining - 1) % 26;
      columnName = String.fromCharCode(65 + modulo) + columnName;
      remaining = Math.floor((remaining - modulo) / 26);
    }

    return columnName;
  }

  private async ensureOk(response: Response, fallbackMessage: string): Promise<void> {
    if (response.ok) {
      return;
    }

    if (response.status === 401) {
      this.auth.handleUnauthorized();
      throw new Error('Tu sesión de Google venció. Vuelve a entrar para continuar.');
    }

    throw new Error(fallbackMessage);
  }
}
