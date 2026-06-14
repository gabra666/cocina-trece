import { Injectable, inject } from '@angular/core';
import { Restaurant } from '../../shared/models/cocina.models';
import { GoogleSheetsService } from './google-sheets.service';

@Injectable({ providedIn: 'root' })
export class RestaurantsService {
  private readonly sheets = inject(GoogleSheetsService);

  async getRestaurants(): Promise<Restaurant[]> {
    const rows = await this.sheets.getRows<Restaurant>('Restaurantes');

    return rows.map((restaurant) => this.normalizeRestaurant(restaurant)).sort((first, second) => {
      return first.nombre.localeCompare(second.nombre);
    });
  }

  async getActiveRestaurants(): Promise<Restaurant[]> {
    const rows = await this.getRestaurants();

    return rows.filter((restaurant) => this.isActive(restaurant.activo));
  }

  async addRestaurant(nombre: string, telefono = ''): Promise<void> {
    await this.sheets.appendRow('Restaurantes', [this.createId(), nombre.trim(), telefono.trim(), 'TRUE']);
  }

  async updateRestaurant(restaurant: Restaurant): Promise<void> {
    const row = await this.findRestaurantRow(restaurant.id);

    await this.sheets.updateRow('Restaurantes', row.rowNumber, [
      restaurant.id,
      restaurant.nombre.trim(),
      restaurant.telefono?.trim() ?? '',
      this.formatBoolean(restaurant.activo)
    ]);
  }

  async deactivateRestaurant(id: string): Promise<void> {
    const row = await this.findRestaurantRow(id);
    const restaurant = this.normalizeRestaurant(row.value);

    await this.sheets.updateRow('Restaurantes', row.rowNumber, [
      restaurant.id,
      restaurant.nombre,
      restaurant.telefono ?? '',
      this.formatBoolean(false)
    ]);
  }

  private async findRestaurantRow(id: string) {
    const rows = await this.sheets.getRowsWithMetadata<Restaurant>('Restaurantes');
    const row = rows.find((entry) => entry.value.id === id);

    if (!row) {
      throw new Error('No se encontró el restaurante en la hoja.');
    }

    return row;
  }

  private normalizeRestaurant(restaurant: Restaurant): Restaurant {
    return {
      ...restaurant,
      activo: this.isActive(restaurant.activo)
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
