import { Injectable, inject } from '@angular/core';
import { Contribution } from '../../shared/models/cocina.models';
import { GoogleSheetsService } from './google-sheets.service';

export interface NewContribution {
  fecha: string;
  contribuidor_id: string;
  monto: number;
  nota?: string;
}

export interface UpdateContribution extends NewContribution {
  id: string;
}

@Injectable({ providedIn: 'root' })
export class ContributionsService {
  private readonly sheets = inject(GoogleSheetsService);

  async getContributions(): Promise<Contribution[]> {
    const rows = await this.sheets.getRows<Contribution>('Aportes');

    return rows
      .map((row) => ({
        ...row,
        monto: Number(row.monto) || 0
      }))
      .sort((first, second) => second.fecha.localeCompare(first.fecha));
  }

  async addContribution(contribution: NewContribution): Promise<void> {
    await this.sheets.appendRow('Aportes', [
      this.createId(),
      contribution.fecha,
      contribution.contribuidor_id,
      String(contribution.monto),
      contribution.nota?.trim() ?? ''
    ]);
  }

  async updateContribution(contribution: UpdateContribution): Promise<void> {
    const row = await this.findContributionRow(contribution.id);

    await this.sheets.updateRow('Aportes', row.rowNumber, [
      contribution.id,
      contribution.fecha,
      contribution.contribuidor_id,
      String(contribution.monto),
      contribution.nota?.trim() ?? ''
    ]);
  }

  async deleteContribution(id: string): Promise<void> {
    const row = await this.findContributionRow(id);

    await this.sheets.deleteRow('Aportes', row.rowNumber);
  }

  private async findContributionRow(id: string) {
    const rows = await this.sheets.getRowsWithMetadata<Contribution>('Aportes');
    const row = rows.find((entry) => entry.value.id === id);

    if (!row) {
      throw new Error('No se encontró el aporte solicitado.');
    }

    return row;
  }

  private createId(): string {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    return `${Date.now()}`;
  }
}
