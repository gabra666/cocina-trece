import { Injectable, inject } from '@angular/core';
import { RestaurantRecharge } from '../../shared/models/cocina.models';
import { GoogleSheetsService } from './google-sheets.service';

export interface NewRestaurantRecharge {
  fecha: string;
  restaurante_id: string;
  monto: number;
  nota?: string;
}

export interface UpdateRestaurantRecharge extends NewRestaurantRecharge {
  id: string;
}

@Injectable({ providedIn: 'root' })
export class RestaurantRechargesService {
  private readonly sheets = inject(GoogleSheetsService);

  async getRecharges(): Promise<RestaurantRecharge[]> {
    const rows = await this.sheets.getRows<RestaurantRecharge>('RecargasRestaurantes');

    return rows
      .map((row) => ({
        ...row,
        monto: Number(row.monto) || 0
      }))
      .sort((first, second) => second.fecha.localeCompare(first.fecha));
  }

  async addRecharge(recharge: NewRestaurantRecharge): Promise<void> {
    await this.sheets.appendRow('RecargasRestaurantes', [
      this.createId(),
      recharge.fecha,
      recharge.restaurante_id,
      String(recharge.monto),
      recharge.nota?.trim() ?? ''
    ]);
  }

  async updateRecharge(recharge: UpdateRestaurantRecharge): Promise<void> {
    const row = await this.findRechargeRow(recharge.id);

    await this.sheets.updateRow('RecargasRestaurantes', row.rowNumber, [
      recharge.id,
      recharge.fecha,
      recharge.restaurante_id,
      String(recharge.monto),
      recharge.nota?.trim() ?? ''
    ]);
  }

  async deleteRecharge(id: string): Promise<void> {
    const row = await this.findRechargeRow(id);
    await this.sheets.deleteRow('RecargasRestaurantes', row.rowNumber);
  }

  private async findRechargeRow(id: string) {
    const rows = await this.sheets.getRowsWithMetadata<RestaurantRecharge>('RecargasRestaurantes');
    const row = rows.find((entry) => entry.value.id === id);

    if (!row) {
      throw new Error('No se encontrÃ³ la recarga en la hoja.');
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
