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

@Component({
  selector: 'app-contributions',
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
  templateUrl: './contributions.html',
  styleUrl: './contributions.css'
})
export class Contributions {
  private readonly defaultContributionAmount = 250000;
  protected readonly auth = inject(AuthService);
  private readonly contributionsService = inject(ContributionsService);
  private readonly contributorsService = inject(ContributorsService);
  private lastLoadedToken: string | null = null;

  protected readonly contributors = signal<Contributor[]>([]);
  protected readonly contributions = signal<Contribution[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly displayedColumns = ['fecha', 'contribuidor', 'monto', 'nota'];
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
    monto: new FormControl<number | null>(this.defaultContributionAmount, {
      validators: [Validators.required, Validators.min(1)]
    }),
    nota: new FormControl('', {
      nonNullable: true
    })
  });

  protected readonly contributorNameById = computed(() => {
    return new Map(this.contributors().map((contributor) => [contributor.id, contributor.nombre]));
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
        this.contributions.set([]);
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
      const [contributors, contributions] = await Promise.all([
        this.contributorsService.getActiveContributors(),
        this.contributionsService.getContributions()
      ]);

      this.contributors.set(contributors);
      this.contributions.set(contributions);

      if (!this.form.controls.contribuidor_id.value && contributors.length > 0) {
        this.form.controls.contribuidor_id.setValue(contributors[0].id);
      }
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

    this.saving.set(true);

    try {
      await this.contributionsService.addContribution({
        fecha: this.formatDate(value.fecha),
        contribuidor_id: value.contribuidor_id,
        monto: Number(value.monto),
        nota: value.nota
      });

      this.form.controls.monto.setValue(this.defaultContributionAmount);
      this.form.controls.nota.setValue('');
      this.success.set('Aporte guardado.');
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
