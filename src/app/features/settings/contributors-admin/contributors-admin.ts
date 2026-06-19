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
import { ContributorsService } from '../../../core/services/contributors.service';
import { AppShell } from '../../../shared/components/app-shell/app-shell';
import { Contributor } from '../../../shared/models/cocina.models';
import {
  DEFAULT_PAGINATION,
  PAGE_SIZE_OPTIONS,
  PaginationState,
  normalizePagination,
  paginateRows
} from '../../../shared/utils/pagination';
import { scrollToElement } from '../../../shared/utils/scroll-to-element';

interface DeactivateContributorDialogData {
  contributorName: string;
}

@Component({
  selector: 'app-deactivate-contributor-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Eliminar contribuidor</h2>
    <mat-dialog-content>
      <p>{{ data.contributorName }} se marcará como inactivo. Sus aportes históricos seguirán visibles.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">Cancelar</button>
      <button mat-flat-button color="warn" type="button" [mat-dialog-close]="true">Eliminar</button>
    </mat-dialog-actions>
  `
})
class DeactivateContributorDialog {
  protected readonly data = inject<DeactivateContributorDialogData>(MAT_DIALOG_DATA);
}

@Component({
  selector: 'app-contributors-admin',
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
  templateUrl: './contributors-admin.html',
  styleUrl: './contributors-admin.css'
})
export class ContributorsAdmin {
  protected readonly auth = inject(AuthService);
  private readonly contributorsService = inject(ContributorsService);
  private readonly dialog = inject(MatDialog);
  private lastLoadedToken: string | null = null;

  protected readonly contributors = signal<Contributor[]>([]);
  protected readonly editingContributor = signal<Contributor | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly displayedColumns = ['nombre', 'activo', 'acciones'];
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly contributorsPagination = signal<PaginationState>(DEFAULT_PAGINATION);

  protected readonly form = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    activo: new FormControl(true, {
      nonNullable: true
    })
  });

  protected readonly isEditing = computed(() => Boolean(this.editingContributor()));

  protected readonly contributorsPaginationView = computed(() => {
    return normalizePagination(this.contributorsPagination(), this.contributors().length);
  });

  protected readonly pagedContributors = computed(() => {
    return paginateRows(this.contributors(), this.contributorsPagination());
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
      this.contributors.set(await this.contributorsService.getContributors());
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async saveContributor(): Promise<void> {
    this.form.markAllAsTouched();
    this.success.set(null);
    this.error.set(null);

    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    const currentContributor = this.editingContributor();

    this.saving.set(true);

    try {
      if (currentContributor) {
        await this.contributorsService.updateContributor({
          id: currentContributor.id,
          nombre: value.nombre,
          activo: value.activo
        });
        this.success.set('Contribuidor actualizado.');
      } else {
        await this.contributorsService.addContributor(value.nombre);
        this.success.set('Contribuidor guardado.');
      }

      this.resetForm();
      await this.loadData();
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected editContributor(contributor: Contributor): void {
    this.error.set(null);
    this.success.set(null);
    this.editingContributor.set(contributor);
    this.form.reset({
      nombre: contributor.nombre,
      activo: contributor.activo
    });
    scrollToElement('contributor-editor');
  }

  protected cancelEdit(): void {
    this.error.set(null);
    this.resetForm();
  }

  protected async deactivateContributor(contributor: Contributor): Promise<void> {
    this.error.set(null);
    this.success.set(null);

    const confirmed = await firstValueFrom(
      this.dialog
        .open(DeactivateContributorDialog, {
          data: { contributorName: contributor.nombre },
          width: 'min(420px, calc(100vw - 32px))'
        })
        .afterClosed()
    );

    if (!confirmed) {
      return;
    }

    this.saving.set(true);

    try {
      await this.contributorsService.deactivateContributor(contributor.id);
      this.success.set('Contribuidor desactivado.');

      if (this.editingContributor()?.id === contributor.id) {
        this.resetForm();
      }

      await this.loadData();
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected getActiveLabel(contributor: Contributor): string {
    return contributor.activo ? 'Sí' : 'No';
  }

  protected updateContributorsPage(event: PageEvent): void {
    this.contributorsPagination.set({
      pageIndex: event.pageIndex,
      pageSize: event.pageSize
    });
  }

  private resetForm(): void {
    this.editingContributor.set(null);
    this.form.reset({ nombre: '', activo: true });
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  }
}
