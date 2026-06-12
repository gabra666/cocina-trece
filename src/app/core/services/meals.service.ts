import { Injectable, inject } from '@angular/core';
import { Meal } from '../../shared/models/cocina.models';
import { GoogleSheetsService } from './google-sheets.service';

export interface NewMeal {
  fecha: string;
  restaurante_id: string;
  descripcion: string;
  monto: number;
  pagado_por: string;
  nota?: string;
}

@Injectable({ providedIn: 'root' })
export class MealsService {
  private readonly sheets = inject(GoogleSheetsService);

  async getMeals(): Promise<Meal[]> {
    const rows = await this.sheets.getRows<Meal>('Comidas');

    return rows
      .map((row) => ({
        ...row,
        monto: Number(row.monto) || 0
      }))
      .sort((first, second) => second.fecha.localeCompare(first.fecha));
  }

  async addMeal(meal: NewMeal): Promise<void> {
    await this.addMeals([meal]);
  }

  async addMeals(meals: NewMeal[]): Promise<void> {
    await this.sheets.appendRows(
      'Comidas',
      meals.map((meal) => [
        this.createId(),
        meal.fecha,
        meal.restaurante_id,
        meal.descripcion.trim(),
        String(meal.monto),
        meal.pagado_por,
        meal.nota?.trim() ?? ''
      ])
    );
  }

  private createId(): string {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    return `${Date.now()}`;
  }
}
