import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { BudgetService } from '../../core/services/budget.service';
import { ConfigService, DEFAULT_APP_SETTINGS } from '../../core/services/config.service';
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
import { scrollToElement } from '../../shared/utils/scroll-to-element';

interface DeleteMealDialogData {
  restaurantName: string;
  description: string;
  amount: number;
  date: string;
  currencyCode: string;
}

@Component({
  selector: 'app-delete-meal-dialog',
  imports: [CommonModule, MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Eliminar comida</h2>
    <mat-dialog-content>
      <p>
        Se eliminara permanentemente la comida {{ data.description }} de {{ data.restaurantName }} del
        {{ data.date }} por {{ data.amount | currency: data.currencyCode : 'symbol-narrow' : '1.0-0' }}.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">Cancelar</button>
      <button mat-flat-button color="warn" type="button" [mat-dialog-close]="true">Eliminar</button>
    </mat-dialog-actions>
  `
})
class DeleteMealDialog {
  protected readonly data = inject<DeleteMealDialogData>(MAT_DIALOG_DATA);
}

@Component({
  selector: 'app-meals',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
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
  private readonly defaultRestaurantName = 'La 44 Carnes Mixtos';
  protected readonly auth = inject(AuthService);
  private readonly budgetService = inject(BudgetService);
  protected readonly config = inject(ConfigService);
  private readonly dialog = inject(MatDialog);
  private readonly mealsService = inject(MealsService);
  private readonly restaurantsService = inject(RestaurantsService);
  private lastLoadedToken: string | null = null;
  private lastDefaultedPaymentRestaurantId = '';

  protected readonly meals = signal<Meal[]>([]);
  protected readonly budgetSnapshot = signal<BudgetSnapshot | null>(null);
  protected readonly restaurants = signal<Restaurant[]>([]);
  protected readonly activeRestaurants = signal<Restaurant[]>([]);
  protected readonly editingMeal = signal<Meal | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly displayedColumns = ['fecha', 'restaurante', 'descripcion', 'monto', 'tipo_pago', 'acciones'];
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
    descripcion: new FormControl(DEFAULT_APP_SETTINGS.descripcionComidaDefault, {
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

  protected readonly isEditing = computed(() => Boolean(this.editingMeal()));
  protected readonly currencyCode = computed(() => this.config.currencyCode());

  protected readonly restaurantNameById = computed(() => {
    return new Map(this.restaurants().map((restaurant) => [restaurant.id, restaurant.nombre]));
  });

  protected readonly selectableRestaurants = computed(() => {
    const currentRestaurantId = this.editingMeal()?.restaurante_id;

    if (!currentRestaurantId || this.activeRestaurants().some((restaurant) => restaurant.id === currentRestaurantId)) {
      return this.activeRestaurants();
    }

    const currentRestaurant = this.restaurants().find((restaurant) => restaurant.id === currentRestaurantId);
    return currentRestaurant ? [...this.activeRestaurants(), currentRestaurant] : this.activeRestaurants();
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
      ? `Saldo prepagado en ${this.selectedRestaurantBalance()?.restaurante_nombre ?? 'restaurante'}`
      : 'Saldo en banco';
  });

  protected readonly currentAffectedBalance = computed(() => {
    return this.selectedPaymentType() === 'presupuesto_restaurante'
      ? this.selectedRestaurantBalance()?.saldo ?? 0
      : this.budgetSnapshot()?.saldo_banco ?? 0;
  });

  protected readonly projectedAffectedBalance = computed(() => {
    const amount = Number(this.selectedAmount()) || 0;
    const currentBalance = this.currentAffectedBalance();
    const currentMeal = this.editingMeal();

    if (!currentMeal) {
      return currentBalance - amount;
    }

    const selectedPaymentType = this.selectedPaymentType();
    const originalPaymentType = this.getNormalizedPaymentType(currentMeal);

    if (selectedPaymentType === 'presupuesto_general') {
      const originalGeneralAmount = originalPaymentType === 'presupuesto_general' ? currentMeal.monto : 0;
      return currentBalance + originalGeneralAmount - amount;
    }

    const originalRestaurantAmount =
      originalPaymentType === 'presupuesto_restaurante' &&
      currentMeal.restaurante_id === this.selectedRestaurantId()
        ? currentMeal.monto
        : 0;

    return currentBalance + originalRestaurantAmount - amount;
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
        this.activeRestaurants.set([]);
        this.resetForm();
      }
    });

    effect(() => {
      if (this.editingMeal()) {
        return;
      }

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
      const [, meals, restaurants, budgetSnapshot] = await Promise.all([
        this.config.loadSettings(),
        this.mealsService.getMeals(),
        this.restaurantsService.getRestaurants(),
        this.budgetService.getSnapshot()
      ]);
      const activeRestaurants = restaurants.filter((restaurant) => restaurant.activo);

      this.meals.set(meals);
      this.restaurants.set(restaurants);
      this.activeRestaurants.set(activeRestaurants);
      this.budgetSnapshot.set(budgetSnapshot);
      this.syncDefaultDescription();
      this.syncSelectedRestaurant(activeRestaurants);
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
    const currentMeal = this.editingMeal();

    if (value.tipo_pago === 'presupuesto_general' && amount > this.getAvailableGeneralBalance(currentMeal)) {
      this.error.set('El saldo en banco no alcanza para guardar esta comida.');
      return;
    }

    this.saving.set(true);

    try {
      if (currentMeal) {
        await this.mealsService.updateMeal({
          id: currentMeal.id,
          fecha: this.formatDate(value.fecha),
          restaurante_id: value.restaurante_id,
          descripcion: value.descripcion,
          monto: amount,
          nota: value.nota,
          tipo_pago: value.tipo_pago
        });
        this.success.set('Comida actualizada.');
      } else {
        await this.mealsService.addMeal({
          fecha: this.formatDate(value.fecha),
          restaurante_id: value.restaurante_id,
          descripcion: value.descripcion,
          monto: amount,
          nota: value.nota,
          tipo_pago: value.tipo_pago
        });
        this.success.set('Comida guardada.');
      }

      this.resetForm();
      await this.loadData();
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected editMeal(meal: Meal): void {
    this.error.set(null);
    this.success.set(null);
    this.editingMeal.set(meal);
    this.lastDefaultedPaymentRestaurantId = meal.restaurante_id ?? '';
    this.form.reset({
      fecha: this.parseDate(meal.fecha),
      restaurante_id: meal.restaurante_id ?? '',
      descripcion: meal.descripcion,
      monto: meal.monto,
      tipo_pago: this.getNormalizedPaymentType(meal),
      nota: meal.nota ?? ''
    });
    scrollToElement('meal-editor');
  }

  protected cancelEdit(): void {
    this.error.set(null);
    this.resetForm();
    this.syncSelectedRestaurant(this.activeRestaurants());
  }

  protected async deleteMeal(meal: Meal): Promise<void> {
    this.error.set(null);
    this.success.set(null);

    const confirmed = await firstValueFrom(
      this.dialog
        .open(DeleteMealDialog, {
          data: {
            restaurantName: this.getRestaurantName(meal.restaurante_id ?? ''),
            description: meal.descripcion,
            amount: meal.monto,
            date: meal.fecha,
            currencyCode: this.currencyCode()
          },
          width: 'min(440px, calc(100vw - 32px))'
        })
        .afterClosed()
    );

    if (!confirmed) {
      return;
    }

    this.saving.set(true);

    try {
      await this.mealsService.deleteMeal(meal.id);
      this.success.set('Comida eliminada.');

      if (this.editingMeal()?.id === meal.id) {
        this.resetForm();
      }

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
    return meal.tipo_pago === 'presupuesto_restaurante' ? 'Saldo prepagado' : 'Saldo en banco';
  }

  protected updateMealsPage(event: PageEvent): void {
    this.mealsPagination.set({
      pageIndex: event.pageIndex,
      pageSize: event.pageSize
    });
  }

  private syncSelectedRestaurant(activeRestaurants: Restaurant[]): void {
    if (this.editingMeal()) {
      return;
    }

    const selectedRestaurantId = this.form.controls.restaurante_id.value;

    if (activeRestaurants.length === 0) {
      this.form.controls.restaurante_id.setValue('');
    } else if (
      !selectedRestaurantId ||
      !activeRestaurants.some((restaurant) => restaurant.id === selectedRestaurantId)
    ) {
      this.form.controls.restaurante_id.setValue(this.getDefaultRestaurantId(activeRestaurants));
    }
  }

  private resetForm(): void {
    this.editingMeal.set(null);
    this.lastDefaultedPaymentRestaurantId = '';
    this.form.reset({
      fecha: new Date(),
      restaurante_id: '',
      descripcion: this.config.settings().descripcionComidaDefault,
      monto: null,
      tipo_pago: 'presupuesto_general',
      nota: ''
    });
  }

  private syncDefaultDescription(): void {
    if (this.editingMeal()) {
      return;
    }

    const description = this.form.controls.descripcion.value;

    if (!description || description === DEFAULT_APP_SETTINGS.descripcionComidaDefault) {
      this.form.controls.descripcion.setValue(this.config.settings().descripcionComidaDefault);
    }
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

  private parseDate(value: string): Date | null {
    if (!value) {
      return null;
    }

    const [year, month, day] = value.split('-').map(Number);

    if (!year || !month || !day) {
      return null;
    }

    return new Date(year, month - 1, day);
  }

  private getAvailableGeneralBalance(currentMeal: Meal | null): number {
    const currentBalance = this.budgetSnapshot()?.saldo_banco ?? 0;
    const originalAmount = currentMeal && this.getNormalizedPaymentType(currentMeal) === 'presupuesto_general'
      ? currentMeal.monto
      : 0;

    return currentBalance + originalAmount;
  }

  private getNormalizedPaymentType(meal: Meal): MealPaymentType {
    return meal.tipo_pago === 'presupuesto_restaurante' ? 'presupuesto_restaurante' : 'presupuesto_general';
  }

  private getDefaultRestaurantId(restaurants: Restaurant[]): string {
    const configuredRestaurantId = this.config.settings().restauranteDefaultId;
    const configuredRestaurant = restaurants.find((restaurant) => restaurant.id === configuredRestaurantId);

    if (configuredRestaurant) {
      return configuredRestaurant.id;
    }

    const preferredRestaurant = restaurants.find((restaurant) => {
      return restaurant.nombre.trim().toLowerCase() === this.defaultRestaurantName.toLowerCase();
    });

    return preferredRestaurant?.id ?? restaurants[0].id;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  }
}
