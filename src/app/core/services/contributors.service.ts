import { Injectable, inject } from '@angular/core';
import { Contributor } from '../../shared/models/cocina.models';
import { GoogleSheetsService } from './google-sheets.service';

@Injectable({ providedIn: 'root' })
export class ContributorsService {
  private readonly sheets = inject(GoogleSheetsService);

  async getContributors(): Promise<Contributor[]> {
    const rows = await this.sheets.getRows<Contributor>('Contribuidores');

    return rows.map((contributor) => this.normalizeContributor(contributor)).sort((first, second) => {
      return first.nombre.localeCompare(second.nombre);
    });
  }

  async getActiveContributors(): Promise<Contributor[]> {
    const rows = await this.getContributors();

    return rows.filter((contributor) => this.isActive(contributor.activo));
  }

  async addContributor(nombre: string): Promise<void> {
    await this.sheets.appendRow('Contribuidores', [this.createId(), nombre.trim(), 'TRUE']);
  }

  async updateContributor(contributor: Contributor): Promise<void> {
    const row = await this.findContributorRow(contributor.id);

    await this.sheets.updateRow('Contribuidores', row.rowNumber, [
      contributor.id,
      contributor.nombre.trim(),
      this.formatBoolean(contributor.activo)
    ]);
  }

  async deactivateContributor(id: string): Promise<void> {
    const row = await this.findContributorRow(id);
    const contributor = this.normalizeContributor(row.value);

    await this.sheets.updateRow('Contribuidores', row.rowNumber, [
      contributor.id,
      contributor.nombre,
      this.formatBoolean(false)
    ]);
  }

  private async findContributorRow(id: string) {
    const rows = await this.sheets.getRowsWithMetadata<Contributor>('Contribuidores');
    const row = rows.find((entry) => entry.value.id === id);

    if (!row) {
      throw new Error('No se encontró el contribuidor solicitado.');
    }

    return row;
  }

  private normalizeContributor(contributor: Contributor): Contributor {
    return {
      ...contributor,
      activo: this.isActive(contributor.activo)
    };
  }

  private formatBoolean(value: boolean): string {
    return value ? 'TRUE' : 'FALSE';
  }

  private isActive(value: boolean | string): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    return value.trim().toLowerCase() === 'true';
  }

  private createId(): string {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    return `${Date.now()}`;
  }
}
