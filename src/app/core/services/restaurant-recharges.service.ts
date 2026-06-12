import { Injectable, inject } from '@angular/core';
import { RestaurantRecharge } from '../../shared/models/cocina.models';
import { GoogleSheetsService } from './google-sheets.service';

export interface NewRestaurantRecharge {
  fecha: string;
  restaurante_id: string;
  monto: number;
  nota?: string;
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

  private createId(): string {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    return `${Date.now()}`;
  }
}
