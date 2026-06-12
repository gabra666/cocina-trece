import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { AuthService } from '../../core/services/auth.service';
import { ContributorsService } from '../../core/services/contributors.service';
import { MealsService } from '../../core/services/meals.service';
import { RestaurantsService } from '../../core/services/restaurants.service';
import { AppShell } from '../../shared/components/app-shell/app-shell';
import { Contributor, Meal, Restaurant } from '../../shared/models/cocina.models';
import {
  DEFAULT_PAGINATION,
  PAGE_SIZE_OPTIONS,
  PaginationState,
  normalizePagination,
  paginateRows
} from '../../shared/utils/pagination';

@Component({
  selector: 'app-meals',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    AppShell
  ],
  templateUrl: './meals.html',
  styleUrl: './meals.css'
})
export class Meals {
  private readonly defaultDescription = 'Almuerzo';
  private readonly preferredPayerName = 'Aleyda';
  protected readonly auth = inject(AuthService);
  private readonly contributorsService = inject(ContributorsService);
  private readonly mealsService = inject(MealsService);
  private readonly restaurantsService = inject(RestaurantsService);
  private lastLoadedToken: string | null = null;

  protected readonly contributors = signal<Contributor[]>([]);
  protected readonly meals = signal<Meal[]>([]);
  protected readonly restaurants = signal<Restaurant[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly displayedColumns = ['fecha', 'restaurante', 'descripcion', 'monto', 'pagado_por'];
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly mealsPagination = signal<PaginationState>(DEFAULT_PAGINATION);

  protected readonly form = new FormGroup({
    fecha: new FormControl<Date | null>(new Date(), {
      validators: [Validators.required]
    }),
    restaurante_id: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    descripcion: new FormControl(this.defaultDescription, {
      nonNullable: true,
      validators: [Validators.required]
    }),
    monto: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)]
    }),
    pagado_por: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    nota: new FormControl('', {
      nonNullable: true
    })
  });

  protected readonly contributorNameById = computed(() => {
    return new Map(this.contributors().map((contributor) => [contributor.id, contributor.nombre]));
  });

  protected readonly restaurantNameById = computed(() => {
    return new Map(this.restaurants().map((restaurant) => [restaurant.id, restaurant.nombre]));
  });

  protected readonly mealsPaginationView = computed(() => {
    return normalizePagination(this.mealsPagination(), this.meals().length);
  });

  protected readonly pagedMeals = computed(() => {
    return paginateRows(this.meals(), this.mealsPagination());
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
        this.meals.set([]);
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

  protected signOut(): void {
    this.auth.signOut();
  }

  protected async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [contributors, meals, restaurants] = await Promise.all([
        this.contributorsService.getActiveContributors(),
        this.mealsService.getMeals(),
        this.restaurantsService.getActiveRestaurants()
      ]);

      this.contributors.set(contributors);
      this.meals.set(meals);
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

  protected async saveMeal(): Promise<void> {
    this.form.markAllAsTouched();
    this.success.set(null);
    this.error.set(null);

    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();

    this.saving.set(true);

    try {
      await this.mealsService.addMeal({
        fecha: this.formatDate(value.fecha),
        restaurante_id: value.restaurante_id,
        descripcion: value.descripcion,
        monto: Number(value.monto),
        pagado_por: value.pagado_por,
        nota: value.nota
      });

      this.form.controls.descripcion.setValue(this.defaultDescription);
      this.form.controls.monto.reset(null);
      this.form.controls.nota.setValue('');
      this.success.set('Comida guardada.');
      await this.loadData();
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected getContributorName(contributorId: string): string {
    return this.contributorNameById().get(contributorId) ?? contributorId;
  }

  protected getRestaurantName(restaurantId: string): string {
    return this.restaurantNameById().get(restaurantId) ?? restaurantId;
  }

  protected updateMealsPage(event: PageEvent): void {
    this.mealsPagination.set({
      pageIndex: event.pageIndex,
      pageSize: event.pageSize
    });
  }

  private formatDate(date: Date | null): string {
    if (!date) {
      return '';
    }

    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private getDefaultPayerId(contributors: Contributor[]): string {
    const preferredPayer = contributors.find((contributor) => {
      return contributor.nombre.trim().toLowerCase() === this.preferredPayerName.toLowerCase();
    });

    return preferredPayer?.id ?? contributors[0].id;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  }
}
