import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { AuthService } from '../../core/services/auth.service';
import { BudgetService } from '../../core/services/budget.service';
import { MealsService } from '../../core/services/meals.service';
import { RestaurantsService } from '../../core/services/restaurants.service';
import { AppShell } from '../../shared/components/app-shell/app-shell';
import { BudgetSnapshot, Meal, MealPaymentType, Restaurant } from '../../shared/models/cocina.models';
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
    MatButtonToggleModule,
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
  private readonly defaultRestaurantName = 'La 44 Carnes Mixtos';
  protected readonly auth = inject(AuthService);
  private readonly budgetService = inject(BudgetService);
  private readonly mealsService = inject(MealsService);
  private readonly restaurantsService = inject(RestaurantsService);
  private lastLoadedToken: string | null = null;
  private lastDefaultedPaymentRestaurantId = '';

  protected readonly meals = signal<Meal[]>([]);
  protected readonly budgetSnapshot = signal<BudgetSnapshot | null>(null);
  protected readonly restaurants = signal<Restaurant[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly displayedColumns = ['fecha', 'restaurante', 'descripcion', 'monto', 'tipo_pago'];
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
    tipo_pago: new FormControl<MealPaymentType>('presupuesto_general', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    nota: new FormControl('', {
      nonNullable: true
    })
  });

  private readonly selectedRestaurantId = toSignal(this.form.controls.restaurante_id.valueChanges, {
    initialValue: this.form.controls.restaurante_id.value
  });

  private readonly selectedAmount = toSignal(this.form.controls.monto.valueChanges, {
    initialValue: this.form.controls.monto.value
  });

  protected readonly selectedPaymentType = toSignal(this.form.controls.tipo_pago.valueChanges, {
    initialValue: this.form.controls.tipo_pago.value
  });

  protected readonly restaurantNameById = computed(() => {
    return new Map(this.restaurants().map((restaurant) => [restaurant.id, restaurant.nombre]));
  });

  protected readonly restaurantBalanceById = computed(() => {
    return new Map((this.budgetSnapshot()?.saldos_restaurantes ?? []).map((balance) => [balance.restaurante_id, balance]));
  });

  protected readonly selectedRestaurantBalance = computed(() => {
    const restaurantId = this.selectedRestaurantId();
    return restaurantId ? this.restaurantBalanceById().get(restaurantId) ?? null : null;
  });

  protected readonly affectedBalanceLabel = computed(() => {
    return this.selectedPaymentType() === 'presupuesto_restaurante'
      ? `Saldo ${this.selectedRestaurantBalance()?.restaurante_nombre ?? 'restaurante'}`
      : 'Saldo general';
  });

  protected readonly currentAffectedBalance = computed(() => {
    return this.selectedPaymentType() === 'presupuesto_restaurante'
      ? this.selectedRestaurantBalance()?.saldo ?? 0
      : this.budgetSnapshot()?.saldo_general ?? 0;
  });

  protected readonly projectedAffectedBalance = computed(() => {
    return this.currentAffectedBalance() - (Number(this.selectedAmount()) || 0);
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
        this.lastDefaultedPaymentRestaurantId = '';
        this.meals.set([]);
        this.budgetSnapshot.set(null);
        this.restaurants.set([]);
      }
    });

    effect(() => {
      const restaurantId = this.selectedRestaurantId();
      const snapshot = this.budgetSnapshot();

      if (!restaurantId || !snapshot || restaurantId === this.lastDefaultedPaymentRestaurantId) {
        return;
      }

      const balance = restaurantId ? this.restaurantBalanceById().get(restaurantId) : null;
      const defaultPaymentType = balance?.tiene_recargas ? 'presupuesto_restaurante' : 'presupuesto_general';

      this.lastDefaultedPaymentRestaurantId = restaurantId;
      this.form.controls.tipo_pago.setValue(defaultPaymentType);
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
      const [meals, restaurants, budgetSnapshot] = await Promise.all([
        this.mealsService.getMeals(),
        this.restaurantsService.getActiveRestaurants(),
        this.budgetService.getSnapshot()
      ]);

      this.meals.set(meals);
      this.restaurants.set(restaurants);
      this.budgetSnapshot.set(budgetSnapshot);

      if (!this.form.controls.restaurante_id.value && restaurants.length > 0) {
        this.form.controls.restaurante_id.setValue(this.getDefaultRestaurantId(restaurants));
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
    const amount = Number(value.monto);

    if (value.tipo_pago === 'presupuesto_general' && amount > (this.budgetSnapshot()?.saldo_general ?? 0)) {
      this.error.set('El saldo general no alcanza para guardar esta comida.');
      return;
    }

    this.saving.set(true);

    try {
      await this.mealsService.addMeal({
        fecha: this.formatDate(value.fecha),
        restaurante_id: value.restaurante_id,
        descripcion: value.descripcion,
        monto: amount,
        nota: value.nota,
        tipo_pago: value.tipo_pago
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

  protected getRestaurantName(restaurantId: string): string {
    return this.restaurantNameById().get(restaurantId) ?? restaurantId;
  }

  protected getPaymentTypeLabel(meal: Meal): string {
    return meal.tipo_pago === 'presupuesto_restaurante' ? 'Presupuesto restaurante' : 'Presupuesto general';
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

  private getDefaultRestaurantId(restaurants: Restaurant[]): string {
    const preferredRestaurant = restaurants.find((restaurant) => {
      return restaurant.nombre.trim().toLowerCase() === this.defaultRestaurantName.toLowerCase();
    });

    return preferredRestaurant?.id ?? restaurants[0].id;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  }
}
