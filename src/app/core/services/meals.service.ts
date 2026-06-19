import { Injectable, inject } from '@angular/core';
import { Meal, MealPaymentType } from '../../shared/models/cocina.models';
import { GoogleSheetsService } from './google-sheets.service';

export interface NewMeal {
  fecha: string;
  restaurante_id: string;
  descripcion: string;
  monto: number;
  nota?: string;
  tipo_pago?: MealPaymentType;
}

export interface UpdateMeal extends NewMeal {
  id: string;
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
    await this.sheets.appendRow(
      'Comidas',
      [
        this.createId(),
        meal.fecha,
        meal.restaurante_id,
        meal.descripcion.trim(),
        String(meal.monto),
        meal.nota?.trim() ?? '',
        meal.tipo_pago ?? 'presupuesto_general'
      ]
    );
  }

  async updateMeal(meal: UpdateMeal): Promise<void> {
    const row = await this.findMealRow(meal.id);

    await this.sheets.updateRow('Comidas', row.rowNumber, [
      meal.id,
      meal.fecha,
      meal.restaurante_id,
      meal.descripcion.trim(),
      String(meal.monto),
      meal.nota?.trim() ?? '',
      meal.tipo_pago ?? 'presupuesto_general'
    ]);
  }

  async deleteMeal(id: string): Promise<void> {
    const row = await this.findMealRow(id);
    await this.sheets.deleteRow('Comidas', row.rowNumber);
  }

  private async findMealRow(id: string) {
    const rows = await this.sheets.getRowsWithMetadata<Meal>('Comidas');
    const row = rows.find((candidate) => candidate.value.id === id);

    if (!row) {
      throw new Error('No se encontró la comida solicitada.');
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
