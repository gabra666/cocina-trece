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
import { ConfigService, DEFAULT_APP_SETTINGS } from '../../core/services/config.service';
import { ContributionsService } from '../../core/services/contributions.service';
import { ContributorsService } from '../../core/services/contributors.service';
import { AppShell } from '../../shared/components/app-shell/app-shell';
import { Contribution, Contributor } from '../../shared/models/cocina.models';
import {
  DEFAULT_PAGINATION,
  PAGE_SIZE_OPTIONS,
  PaginationState,
  normalizePagination,
  paginateRows
} from '../../shared/utils/pagination';

interface DeleteContributionDialogData {
  contributorName: string;
  amount: number;
  date: string;
  currencyCode: string;
}

@Component({
  selector: 'app-delete-contribution-dialog',
  imports: [CommonModule, MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Eliminar aporte</h2>
    <mat-dialog-content>
      <p>
        Se eliminará permanentemente el aporte de {{ data.contributorName }} del {{ data.date }} por
        {{ data.amount | currency: data.currencyCode : 'symbol-narrow' : '1.0-0' }}.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">Cancelar</button>
      <button mat-flat-button color="warn" type="button" [mat-dialog-close]="true">Eliminar</button>
    </mat-dialog-actions>
  `
})
class DeleteContributionDialog {
  protected readonly data = inject<DeleteContributionDialogData>(MAT_DIALOG_DATA);
}

@Component({
  selector: 'app-contributions',
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
  templateUrl: './contributions.html',
  styleUrl: './contributions.css'
})
export class Contributions {
  protected readonly auth = inject(AuthService);
  protected readonly config = inject(ConfigService);
  private readonly contributionsService = inject(ContributionsService);
  private readonly contributorsService = inject(ContributorsService);
  private readonly dialog = inject(MatDialog);
  private lastLoadedToken: string | null = null;

  protected readonly contributors = signal<Contributor[]>([]);
  protected readonly activeContributors = signal<Contributor[]>([]);
  protected readonly contributions = signal<Contribution[]>([]);
  protected readonly editingContribution = signal<Contribution | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly displayedColumns = ['fecha', 'contribuidor', 'monto', 'nota', 'acciones'];
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly contributionsPagination = signal<PaginationState>(DEFAULT_PAGINATION);

  protected readonly form = new FormGroup({
    fecha: new FormControl<Date | null>(new Date(), {
      validators: [Validators.required]
    }),
    contribuidor_id: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    monto: new FormControl<number | null>(DEFAULT_APP_SETTINGS.montoAporteDefault, {
      validators: [Validators.required, Validators.min(1)]
    }),
    nota: new FormControl('', {
      nonNullable: true
    })
  });

  protected readonly isEditing = computed(() => Boolean(this.editingContribution()));
  protected readonly currencyCode = computed(() => this.config.currencyCode());

  protected readonly contributorNameById = computed(() => {
    return new Map(this.contributors().map((contributor) => [contributor.id, contributor.nombre]));
  });

  protected readonly selectableContributors = computed(() => {
    const currentContributorId = this.editingContribution()?.contribuidor_id;

    if (!currentContributorId || this.activeContributors().some((contributor) => contributor.id === currentContributorId)) {
      return this.activeContributors();
    }

    const currentContributor = this.contributors().find((contributor) => contributor.id === currentContributorId);
    return currentContributor ? [...this.activeContributors(), currentContributor] : this.activeContributors();
  });

  protected readonly contributionsPaginationView = computed(() => {
    return normalizePagination(this.contributionsPagination(), this.contributions().length);
  });

  protected readonly pagedContributions = computed(() => {
    return paginateRows(this.contributions(), this.contributionsPagination());
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
        this.activeContributors.set([]);
        this.contributions.set([]);
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
      const [, contributors, contributions] = await Promise.all([
        this.config.loadSettings(),
        this.contributorsService.getContributors(),
        this.contributionsService.getContributions()
      ]);
      const activeContributors = contributors.filter((contributor) => contributor.activo);

      this.contributors.set(contributors);
      this.activeContributors.set(activeContributors);
      this.contributions.set(contributions);
      this.syncDefaultContributionAmount();
      this.syncSelectedContributor(activeContributors);
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async saveContribution(): Promise<void> {
    this.form.markAllAsTouched();
    this.success.set(null);
    this.error.set(null);

    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    const currentContribution = this.editingContribution();
    this.saving.set(true);

    try {
      if (currentContribution) {
        await this.contributionsService.updateContribution({
          id: currentContribution.id,
          fecha: this.formatDate(value.fecha),
          contribuidor_id: value.contribuidor_id,
          monto: Number(value.monto),
          nota: value.nota
        });
        this.success.set('Aporte actualizado.');
      } else {
        await this.contributionsService.addContribution({
          fecha: this.formatDate(value.fecha),
          contribuidor_id: value.contribuidor_id,
          monto: Number(value.monto),
          nota: value.nota
        });
        this.success.set('Aporte guardado.');
      }

      this.resetForm();
      await this.loadData();
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected editContribution(contribution: Contribution): void {
    this.error.set(null);
    this.success.set(null);
    this.editingContribution.set(contribution);
    this.form.reset({
      fecha: this.parseDate(contribution.fecha),
      contribuidor_id: contribution.contribuidor_id,
      monto: contribution.monto,
      nota: contribution.nota ?? ''
    });
  }

  protected cancelEdit(): void {
    this.error.set(null);
    this.resetForm();
    this.syncSelectedContributor(this.activeContributors());
  }

  protected async deleteContribution(contribution: Contribution): Promise<void> {
    this.error.set(null);
    this.success.set(null);

    const confirmed = await firstValueFrom(
      this.dialog
        .open(DeleteContributionDialog, {
          data: {
            contributorName: this.getContributorName(contribution.contribuidor_id),
            amount: contribution.monto,
            date: contribution.fecha,
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
      await this.contributionsService.deleteContribution(contribution.id);
      this.success.set('Aporte eliminado.');

      if (this.editingContribution()?.id === contribution.id) {
        this.resetForm();
      }

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

  protected updateContributionsPage(event: PageEvent): void {
    this.contributionsPagination.set({
      pageIndex: event.pageIndex,
      pageSize: event.pageSize
    });
  }

  private syncSelectedContributor(activeContributors: Contributor[]): void {
    if (this.editingContribution()) {
      return;
    }

    const selectedContributorId = this.form.controls.contribuidor_id.value;

    if (activeContributors.length === 0) {
      this.form.controls.contribuidor_id.setValue('');
    } else if (
      !selectedContributorId ||
      !activeContributors.some((contributor) => contributor.id === selectedContributorId)
    ) {
      this.form.controls.contribuidor_id.setValue(activeContributors[0].id);
    }
  }

  private resetForm(): void {
    this.editingContribution.set(null);
    this.form.reset({
      fecha: new Date(),
      contribuidor_id: '',
      monto: this.config.settings().montoAporteDefault,
      nota: ''
    });
  }

  private syncDefaultContributionAmount(): void {
    if (this.editingContribution()) {
      return;
    }

    const amount = this.form.controls.monto.value;

    if (amount === null || amount === DEFAULT_APP_SETTINGS.montoAporteDefault) {
      this.form.controls.monto.setValue(this.config.settings().montoAporteDefault);
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

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  }
}
