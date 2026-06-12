import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { AuthService } from '../../core/services/auth.service';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { AppShell } from '../../shared/components/app-shell/app-shell';
import { ConfigEntry } from '../../shared/models/cocina.models';
import {
  DEFAULT_PAGINATION,
  PAGE_SIZE_OPTIONS,
  PaginationState,
  normalizePagination,
  paginateRows
} from '../../shared/utils/pagination';

@Component({
  selector: 'app-dashboard',
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTableModule,
    AppShell
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard {
  protected readonly auth = inject(AuthService);
  private readonly sheets = inject(GoogleSheetsService);
  private lastLoadedToken: string | null = null;

  protected readonly configEntries = signal<ConfigEntry[]>([]);
  protected readonly loadingConfig = signal(false);
  protected readonly configError = signal<string | null>(null);
  protected readonly lastLoadedAt = signal<Date | null>(null);
  protected readonly displayedColumns = ['clave', 'valor'];
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly configPagination = signal<PaginationState>(DEFAULT_PAGINATION);

  protected readonly configPaginationView = computed(() => {
    return normalizePagination(this.configPagination(), this.configEntries().length);
  });

  protected readonly pagedConfigEntries = computed(() => {
    return paginateRows(this.configEntries(), this.configPagination());
  });

  constructor() {
    effect(() => {
      const token = this.auth.accessToken();

      if (token && token !== this.lastLoadedToken) {
        this.lastLoadedToken = token;
        void this.loadConfig();
      }

      if (!token) {
        this.lastLoadedToken = null;
        this.configEntries.set([]);
        this.lastLoadedAt.set(null);
      }
    });
  }

  protected async signIn(): Promise<void> {
    this.configError.set(null);

    try {
      await this.auth.signIn();
    } catch (error) {
      this.configError.set(this.getErrorMessage(error));
    }
  }

  protected signOut(): void {
    this.auth.signOut();
  }

  protected async loadConfig(): Promise<void> {
    this.loadingConfig.set(true);
    this.configError.set(null);

    try {
      const rows = await this.sheets.getRows<ConfigEntry>('Config');
      this.configEntries.set(rows);
      this.lastLoadedAt.set(new Date());
    } catch (error) {
      this.configError.set(this.getErrorMessage(error));
    } finally {
      this.loadingConfig.set(false);
    }
  }

  protected updateConfigPage(event: PageEvent): void {
    this.configPagination.set({
      pageIndex: event.pageIndex,
      pageSize: event.pageSize
    });
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  }
}
