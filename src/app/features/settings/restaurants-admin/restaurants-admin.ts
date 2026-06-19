import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { BudgetService } from '../../../core/services/budget.service';
import { ConfigService } from '../../../core/services/config.service';
import { RestaurantsService } from '../../../core/services/restaurants.service';
import { AppShell } from '../../../shared/components/app-shell/app-shell';
import { BudgetSnapshot, Restaurant } from '../../../shared/models/cocina.models';
import {
  DEFAULT_PAGINATION,
  PAGE_SIZE_OPTIONS,
  PaginationState,
  normalizePagination,
  paginateRows
} from '../../../shared/utils/pagination';
import { scrollToElement } from '../../../shared/utils/scroll-to-element';

interface DeactivateRestaurantDialogData {
  restaurantName: string;
}

@Component({
  selector: 'app-deactivate-restaurant-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Eliminar restaurante</h2>
    <mat-dialog-content>
      <p>{{ data.restaurantName }} se marcará como inactivo. Sus comidas y recargas históricas seguirán visibles.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">Cancelar</button>
      <button mat-flat-button color="warn" type="button" [mat-dialog-close]="true">Eliminar</button>
    </mat-dialog-actions>
  `
})
class DeactivateRestaurantDialog {
  protected readonly data = inject<DeactivateRestaurantDialogData>(MAT_DIALOG_DATA);
}

@Component({
  selector: 'app-restaurants-admin',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTableModule,
    AppShell
  ],
  templateUrl: './restaurants-admin.html',
  styleUrl: './restaurants-admin.css'
})
export class RestaurantsAdmin {
  protected readonly auth = inject(AuthService);
  private readonly budgetService = inject(BudgetService);
  protected readonly config = inject(ConfigService);
  private readonly dialog = inject(MatDialog);
  private readonly restaurantsService = inject(RestaurantsService);
  private lastLoadedToken: string | null = null;

  protected readonly restaurants = signal<Restaurant[]>([]);
  protected readonly editingRestaurant = signal<Restaurant | null>(null);
  protected readonly budgetSnapshot = signal<BudgetSnapshot | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly displayedColumns = ['nombre', 'telefono', 'activo', 'saldo', 'acciones'];
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly restaurantsPagination = signal<PaginationState>(DEFAULT_PAGINATION);

  protected readonly form = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    telefono: new FormControl('', {
      nonNullable: true
    }),
    activo: new FormControl(true, {
      nonNullable: true
    })
  });

  protected readonly isEditing = computed(() => Boolean(this.editingRestaurant()));
  protected readonly currencyCode = computed(() => this.config.currencyCode());

  protected readonly restaurantsPaginationView = computed(() => {
    return normalizePagination(this.restaurantsPagination(), this.restaurants().length);
  });

  protected readonly pagedRestaurants = computed(() => {
    return paginateRows(this.restaurants(), this.restaurantsPagination());
  });

  protected readonly balanceByRestaurantId = computed(() => {
    return new Map((this.budgetSnapshot()?.saldos_restaurantes ?? []).map((balance) => [balance.restaurante_id, balance.saldo]));
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
        this.budgetSnapshot.set(null);
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

  protected signOut(): void {
    this.auth.signOut();
  }

  protected async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [, restaurants, budgetSnapshot] = await Promise.all([
        this.config.loadSettings(),
        this.restaurantsService.getRestaurants(),
        this.budgetService.getSnapshot()
      ]);

      this.restaurants.set(restaurants);
      this.budgetSnapshot.set(budgetSnapshot);
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async saveRestaurant(): Promise<void> {
    this.form.markAllAsTouched();
    this.success.set(null);
    this.error.set(null);

    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    const currentRestaurant = this.editingRestaurant();
    this.saving.set(true);

    try {
      if (currentRestaurant) {
        await this.restaurantsService.updateRestaurant({
          id: currentRestaurant.id,
          nombre: value.nombre,
          telefono: value.telefono,
          activo: value.activo
        });
        this.success.set('Restaurante actualizado.');
      } else {
        await this.restaurantsService.addRestaurant(value.nombre, value.telefono);
        this.success.set('Restaurante guardado.');
      }

      this.resetForm();
      await this.loadData();
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected editRestaurant(restaurant: Restaurant): void {
    this.error.set(null);
    this.success.set(null);
    this.editingRestaurant.set(restaurant);
    this.form.reset({
      nombre: restaurant.nombre,
      telefono: restaurant.telefono ?? '',
      activo: restaurant.activo
    });
    scrollToElement('restaurant-editor');
  }

  protected cancelEdit(): void {
    this.error.set(null);
    this.resetForm();
  }

  protected async deactivateRestaurant(restaurant: Restaurant): Promise<void> {
    this.error.set(null);
    this.success.set(null);

    const confirmed = await firstValueFrom(
      this.dialog
        .open(DeactivateRestaurantDialog, {
          data: { restaurantName: restaurant.nombre },
          width: 'min(420px, calc(100vw - 32px))'
        })
        .afterClosed()
    );

    if (!confirmed) {
      return;
    }

    this.saving.set(true);

    try {
      await this.restaurantsService.deactivateRestaurant(restaurant.id);
      this.success.set('Restaurante desactivado.');

      if (this.editingRestaurant()?.id === restaurant.id) {
        this.resetForm();
      }

      await this.loadData();
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected updateRestaurantsPage(event: PageEvent): void {
    this.restaurantsPagination.set({
      pageIndex: event.pageIndex,
      pageSize: event.pageSize
    });
  }

  protected getActiveLabel(restaurant: Restaurant): string {
    return restaurant.activo ? 'Sí' : 'No';
  }

  protected getRestaurantBalance(restaurantId: string): number {
    return this.balanceByRestaurantId().get(restaurantId) ?? 0;
  }

  private resetForm(): void {
    this.editingRestaurant.set(null);
    this.form.reset({ nombre: '', telefono: '', activo: true });
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  }
}
