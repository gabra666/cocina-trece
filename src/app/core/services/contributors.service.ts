import { Injectable, inject } from '@angular/core';
import { Contributor } from '../../shared/models/cocina.models';
import { GoogleSheetsService } from './google-sheets.service';

@Injectable({ providedIn: 'root' })
export class ContributorsService {
  private readonly sheets = inject(GoogleSheetsService);

  async getContributors(): Promise<Contributor[]> {
    const rows = await this.sheets.getRows<Contributor>('Contribuidores');

    return rows.sort((first, second) => first.nombre.localeCompare(second.nombre));
  }

  async getActiveContributors(): Promise<Contributor[]> {
    const rows = await this.getContributors();

    return rows.filter((contributor) => this.isActive(contributor.activo));
  }

  async addContributor(nombre: string): Promise<void> {
    await this.sheets.appendRow('Contribuidores', [this.createId(), nombre.trim(), 'TRUE']);
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
