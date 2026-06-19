import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
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
import { ConfigService } from '../../core/services/config.service';
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
import { scrollToElement } from '../../shared/utils/scroll-to-element';

interface DeleteRechargeDialogData {
  restaurantName: string;
  amount: number;
  date: string;
  currencyCode: string;
}

@Component({
  selector: 'app-delete-recharge-dialog',
  imports: [CommonModule, MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Eliminar recarga</h2>
    <mat-dialog-content>
      <p>
        Se eliminara permanentemente la recarga de {{ data.restaurantName }} del {{ data.date }} por
        {{ data.amount | currency: data.currencyCode : 'symbol-narrow' : '1.0-0' }}.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">Cancelar</button>
      <button mat-flat-button color="warn" type="button" [mat-dialog-close]="true">Eliminar</button>
    </mat-dialog-actions>
  `
})
class DeleteRechargeDialog {
  protected readonly data = inject<DeleteRechargeDialogData>(MAT_DIALOG_DATA);
}

@Component({
  selector: 'app-budget',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
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
  templateUrl: './budget.html',
  styleUrl: './budget.css'
})
export class Budget {
  protected readonly auth = inject(AuthService);
  private readonly budgetService = inject(BudgetService);
  protected readonly config = inject(ConfigService);
  private readonly dialog = inject(MatDialog);
  private readonly rechargesService = inject(RestaurantRechargesService);
  private readonly restaurantsService = inject(RestaurantsService);
  private lastLoadedToken: string | null = null;

  protected readonly restaurants = signal<Restaurant[]>([]);
  protected readonly activeRestaurants = signal<Restaurant[]>([]);
  protected readonly editingRecharge = signal<RestaurantRecharge | null>(null);
  protected readonly snapshot = signal<BudgetSnapshot | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly balanceColumns = ['restaurante', 'saldo', 'recargado', 'consumido'];
  protected readonly rechargeColumns = ['fecha', 'restaurante', 'monto', 'nota', 'acciones'];
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

  protected readonly currencyCode = computed(() => this.config.currencyCode());

  protected readonly isEditing = computed(() => Boolean(this.editingRecharge()));

  protected readonly selectableRestaurants = computed(() => {
    const currentRestaurantId = this.editingRecharge()?.restaurante_id;

    if (!currentRestaurantId || this.activeRestaurants().some((restaurant) => restaurant.id === currentRestaurantId)) {
      return this.activeRestaurants();
    }

    const currentRestaurant = this.restaurants().find((restaurant) => restaurant.id === currentRestaurantId);
    return currentRestaurant ? [...this.activeRestaurants(), currentRestaurant] : this.activeRestaurants();
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
        this.activeRestaurants.set([]);
        this.snapshot.set(null);
        this.resetForm();
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
      const [, restaurants, snapshot] = await Promise.all([
        this.config.loadSettings(),
        this.restaurantsService.getRestaurants(),
        this.budgetService.getSnapshot()
      ]);
      const activeRestaurants = restaurants.filter((restaurant) => restaurant.activo);

      this.restaurants.set(restaurants);
      this.activeRestaurants.set(activeRestaurants);
      this.snapshot.set(snapshot);
      this.syncSelectedRestaurant(activeRestaurants);
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
    const currentRecharge = this.editingRecharge();
    const availableBalance = this.getAvailableGeneralBalance(currentRecharge);

    if (amount > availableBalance) {
      this.error.set('El saldo en banco no alcanza para esta recarga.');
      return;
    }

    this.saving.set(true);

    try {
      if (currentRecharge) {
        await this.rechargesService.updateRecharge({
          id: currentRecharge.id,
          fecha: this.formatDate(value.fecha),
          restaurante_id: value.restaurante_id,
          monto: amount,
          nota: value.nota
        });
        this.success.set('Recarga actualizada.');
      } else {
        await this.rechargesService.addRecharge({
          fecha: this.formatDate(value.fecha),
          restaurante_id: value.restaurante_id,
          monto: amount,
          nota: value.nota
        });
        this.success.set('Recarga guardada.');
      }

      this.resetForm();
      await this.loadData();
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected editRecharge(recharge: RestaurantRecharge): void {
    this.error.set(null);
    this.success.set(null);
    this.editingRecharge.set(recharge);
    this.form.reset({
      fecha: this.parseDate(recharge.fecha),
      restaurante_id: recharge.restaurante_id,
      monto: recharge.monto,
      nota: recharge.nota ?? ''
    });
    scrollToElement('recharge-editor');
  }

  protected cancelEdit(): void {
    this.error.set(null);
    this.resetForm();
    this.syncSelectedRestaurant(this.activeRestaurants());
  }

  protected async deleteRecharge(recharge: RestaurantRecharge): Promise<void> {
    this.error.set(null);
    this.success.set(null);

    const confirmed = await firstValueFrom(
      this.dialog
        .open(DeleteRechargeDialog, {
          data: {
            restaurantName: this.getRestaurantName(recharge.restaurante_id),
            amount: recharge.monto,
            date: recharge.fecha,
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
      await this.rechargesService.deleteRecharge(recharge.id);
      this.success.set('Recarga eliminada.');

      if (this.editingRecharge()?.id === recharge.id) {
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

  private syncSelectedRestaurant(activeRestaurants: Restaurant[]): void {
    if (this.editingRecharge()) {
      return;
    }

    const selectedRestaurantId = this.form.controls.restaurante_id.value;

    if (activeRestaurants.length === 0) {
      this.form.controls.restaurante_id.setValue('');
    } else if (
      !selectedRestaurantId ||
      !activeRestaurants.some((restaurant) => restaurant.id === selectedRestaurantId)
    ) {
      this.form.controls.restaurante_id.setValue(activeRestaurants[0].id);
    }
  }

  private resetForm(): void {
    this.editingRecharge.set(null);
    this.form.reset({
      fecha: new Date(),
      restaurante_id: '',
      monto: null,
      nota: ''
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

  private getAvailableGeneralBalance(currentRecharge: RestaurantRecharge | null): number {
    return (this.snapshot()?.saldo_banco ?? 0) + (currentRecharge?.monto ?? 0);
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  }
}
