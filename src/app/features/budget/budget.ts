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
import { BudgetService } from '../../core/services/budget.service';
import { RestaurantRechargesService } from '../../core/services/restaurant-recharges.service';
import { RestaurantsService } from '../../core/services/restaurants.service';
import { AppShell } from '../../shared/components/app-shell/app-shell';
import { BudgetSnapshot, Restaurant, RestaurantBalance, RestaurantRecharge } from '../../shared/models/cocina.models';
import {
  DEFAULT_PAGINATION,
  PAGE_SIZE_OPTIONS,
  PaginationState,
  normalizePagination,
  paginateRows
} from '../../shared/utils/pagination';

@Component({
  selector: 'app-budget',
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
  templateUrl: './budget.html',
  styleUrl: './budget.css'
})
export class Budget {
  protected readonly auth = inject(AuthService);
  private readonly budgetService = inject(BudgetService);
  private readonly rechargesService = inject(RestaurantRechargesService);
  private readonly restaurantsService = inject(RestaurantsService);
  private lastLoadedToken: string | null = null;

  protected readonly restaurants = signal<Restaurant[]>([]);
  protected readonly snapshot = signal<BudgetSnapshot | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly balanceColumns = ['restaurante', 'recargado', 'consumido', 'saldo'];
  protected readonly rechargeColumns = ['fecha', 'restaurante', 'monto', 'nota'];
  protected readonly balancesPagination = signal<PaginationState>(DEFAULT_PAGINATION);
  protected readonly rechargesPagination = signal<PaginationState>(DEFAULT_PAGINATION);

  protected readonly form = new FormGroup({
    fecha: new FormControl<Date | null>(new Date(), {
      validators: [Validators.required]
    }),
    restaurante_id: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    monto: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)]
    }),
    nota: new FormControl('', {
      nonNullable: true
    })
  });

  protected readonly restaurantNameById = computed(() => {
    return new Map((this.snapshot()?.saldos_restaurantes ?? []).map((balance) => [balance.restaurante_id, balance.restaurante_nombre]));
  });

  protected readonly balances = computed<RestaurantBalance[]>(() => {
    return this.snapshot()?.saldos_restaurantes ?? [];
  });

  protected readonly recharges = computed<RestaurantRecharge[]>(() => {
    return this.snapshot()?.recargas ?? [];
  });

  protected readonly balancesPaginationView = computed(() => {
    return normalizePagination(this.balancesPagination(), this.balances().length);
  });

  protected readonly rechargesPaginationView = computed(() => {
    return normalizePagination(this.rechargesPagination(), this.recharges().length);
  });

  protected readonly pagedBalances = computed(() => {
    return paginateRows(this.balances(), this.balancesPagination());
  });

  protected readonly pagedRecharges = computed(() => {
    return paginateRows(this.recharges(), this.rechargesPagination());
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
        this.restaurants.set([]);
        this.snapshot.set(null);
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
      const [restaurants, snapshot] = await Promise.all([
        this.restaurantsService.getActiveRestaurants(),
        this.budgetService.getSnapshot()
      ]);

      this.restaurants.set(restaurants);
      this.snapshot.set(snapshot);

      if (!this.form.controls.restaurante_id.value && restaurants.length > 0) {
        this.form.controls.restaurante_id.setValue(restaurants[0].id);
      }
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async saveRecharge(): Promise<void> {
    this.form.markAllAsTouched();
    this.success.set(null);
    this.error.set(null);

    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    const amount = Number(value.monto);
    const availableBalance = this.snapshot()?.saldo_general ?? 0;

    if (amount > availableBalance) {
      this.error.set('El saldo general no alcanza para esta recarga.');
      return;
    }

    this.saving.set(true);

    try {
      await this.rechargesService.addRecharge({
        fecha: this.formatDate(value.fecha),
        restaurante_id: value.restaurante_id,
        monto: amount,
        nota: value.nota
      });

      this.form.controls.fecha.setValue(new Date());
      this.form.controls.monto.reset(null);
      this.form.controls.nota.setValue('');
      this.success.set('Recarga guardada.');
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

  protected updateBalancesPage(event: PageEvent): void {
    this.balancesPagination.set({
      pageIndex: event.pageIndex,
      pageSize: event.pageSize
    });
  }

  protected updateRechargesPage(event: PageEvent): void {
    this.rechargesPagination.set({
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

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  }
}
