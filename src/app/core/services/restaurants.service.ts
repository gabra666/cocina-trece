import { Injectable, inject } from '@angular/core';
import { Restaurant } from '../../shared/models/cocina.models';
import { GoogleSheetsService } from './google-sheets.service';

@Injectable({ providedIn: 'root' })
export class RestaurantsService {
  private readonly sheets = inject(GoogleSheetsService);

  async getRestaurants(): Promise<Restaurant[]> {
    const rows = await this.sheets.getRows<Restaurant>('Restaurantes');

    return rows.sort((first, second) => first.nombre.localeCompare(second.nombre));
  }

  async getActiveRestaurants(): Promise<Restaurant[]> {
    const rows = await this.getRestaurants();

    return rows.filter((restaurant) => this.isActive(restaurant.activo));
  }

  async addRestaurant(nombre: string, telefono = ''): Promise<void> {
    await this.sheets.appendRow('Restaurantes', [this.createId(), nombre.trim(), telefono.trim(), 'TRUE']);
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
