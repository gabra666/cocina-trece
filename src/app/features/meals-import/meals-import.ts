import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { AuthService } from '../../core/services/auth.service';
import { ContributorsService } from '../../core/services/contributors.service';
import { MealsService, NewMeal } from '../../core/services/meals.service';
import { RestaurantsService } from '../../core/services/restaurants.service';
import { AppShell } from '../../shared/components/app-shell/app-shell';
import { Contributor, Restaurant } from '../../shared/models/cocina.models';
import {
  DEFAULT_PAGINATION,
  PAGE_SIZE_OPTIONS,
  PaginationState,
  normalizePagination,
  paginateRows
} from '../../shared/utils/pagination';

interface ImportedMealPreview {
  fecha: string;
  precio: number;
  monto: number;
  nota: string;
}

@Component({
  selector: 'app-meals-import',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    AppShell
  ],
  templateUrl: './meals-import.html',
  styleUrl: './meals-import.css'
})
export class MealsImport {
  protected readonly auth = inject(AuthService);
  private readonly contributorsService = inject(ContributorsService);
  private readonly mealsService = inject(MealsService);
  private readonly restaurantsService = inject(RestaurantsService);
  private lastLoadedToken: string | null = null;

  protected readonly contributors = signal<Contributor[]>([]);
  protected readonly restaurants = signal<Restaurant[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly displayedColumns = ['fecha', 'precio', 'monto', 'nota'];
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly previewPagination = signal<PaginationState>(DEFAULT_PAGINATION);

  protected readonly form = new FormGroup({
    rawData: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    restaurante_id: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    pagado_por: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    descripcion: new FormControl('Almuerzo', {
      nonNullable: true,
      validators: [Validators.required]
    })
  });

  private readonly rawData = toSignal(this.form.controls.rawData.valueChanges, {
    initialValue: this.form.controls.rawData.value
  });

  protected readonly previewRows = computed(() => this.parseRows(this.rawData()));
  protected readonly previewPaginationView = computed(() => {
    return normalizePagination(this.previewPagination(), this.previewRows().length);
  });

  protected readonly pagedPreviewRows = computed(() => {
    return paginateRows(this.previewRows(), this.previewPagination());
  });

  protected readonly omittedCount = computed(() => this.countOmittedRows(this.rawData()));
  protected readonly totalAmount = computed(() => {
    return this.previewRows().reduce((total, row) => total + row.monto, 0);
  });

  constructor() {
    effect(() => {
      const token = this.auth.accessToken();

      if (token && token !== this.lastLoadedToken) {
        this.lastLoadedToken = token;
        void this.loadData();
      }

      if (!token) {
        this.lastLoadedToken = null;
        this.contributors.set([]);
        this.restaurants.set([]);
      }
    });
  }

  protected async signIn(): Promise<void> {
    this.error.set(null);

    try {
      await this.auth.signIn();
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    }
  }

  protected async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [contributors, restaurants] = await Promise.all([
        this.contributorsService.getActiveContributors(),
        this.restaurantsService.getActiveRestaurants()
      ]);

      this.contributors.set(contributors);
      this.restaurants.set(restaurants);

      if (!this.form.controls.pagado_por.value && contributors.length > 0) {
        this.form.controls.pagado_por.setValue(this.getDefaultPayerId(contributors));
      }

      if (!this.form.controls.restaurante_id.value && restaurants.length > 0) {
        this.form.controls.restaurante_id.setValue(restaurants[0].id);
      }
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async importMeals(): Promise<void> {
    this.form.markAllAsTouched();
    this.error.set(null);
    this.success.set(null);

    if (this.form.invalid || this.previewRows().length === 0) {
      return;
    }

    const value = this.form.getRawValue();
    const meals: NewMeal[] = this.previewRows().map((row) => ({
      fecha: row.fecha,
      restaurante_id: value.restaurante_id,
      descripcion: value.descripcion,
      monto: row.monto,
      pagado_por: value.pagado_por,
      nota: row.nota
    }));

    this.saving.set(true);

    try {
      await this.mealsService.addMeals(meals);
      this.success.set(`${meals.length} comidas importadas.`);
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected updatePreviewPage(event: PageEvent): void {
    this.previewPagination.set({
      pageIndex: event.pageIndex,
      pageSize: event.pageSize
    });
  }

  private parseRows(rawData: string): ImportedMealPreview[] {
    return rawData
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.toLowerCase().startsWith('fecha'))
      .map((line) => line.split(/\t|;/).map((cell) => cell.trim()))
      .map(([dateText, priceText, amountText]) => {
        const fecha = this.parseDate(dateText);
        const precio = this.parseNumber(priceText);
        const monto = this.parseNumber(amountText);

        if (!fecha || monto <= 0) {
          return null;
        }

        return {
          fecha,
          precio,
          monto,
          nota: `Precio esperado: ${precio}`
        };
      })
      .filter((row): row is ImportedMealPreview => row !== null);
  }

  private countOmittedRows(rawData: string): number {
    const dataLines = rawData
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.toLowerCase().startsWith('fecha'));

    return dataLines.length - this.parseRows(rawData).length;
  }

  private parseDate(value = ''): string {
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

    if (!match) {
      return '';
    }

    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  private parseNumber(value = ''): number {
    const normalized = value.replace(/[^\d-]/g, '');
    return Number(normalized) || 0;
  }

  private getDefaultPayerId(contributors: Contributor[]): string {
    const preferredPayer = contributors.find((contributor) => {
      return contributor.nombre.trim().toLowerCase() === 'aleyda';
    });

    return preferredPayer?.id ?? contributors[0].id;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  }
}
