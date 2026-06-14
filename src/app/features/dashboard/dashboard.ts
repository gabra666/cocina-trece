import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService, DEFAULT_APP_SETTINGS } from '../../core/services/config.service';
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
  protected readonly config = inject(ConfigService);
  private lastLoadedToken: string | null = null;
  private readonly knownConfigLabels = new Map([
    ['nombre_app', 'Nombre de la app'],
    ['moneda', 'Moneda'],
    ['pais', 'País'],
    ['idioma', 'Idioma'],
    ['descripcion_comida_default', 'Descripción de comida'],
    ['monto_aporte_default', 'Monto de aporte'],
    ['restaurante_default_id', 'Restaurante por defecto'],
    ['zonas_horarias', 'Zonas horarias']
  ]);

  protected readonly loadingConfig = signal(false);
  protected readonly configError = signal<string | null>(null);
  protected readonly displayedColumns = ['clave', 'valor'];
  protected readonly settingsColumns = ['ajuste', 'clave', 'valor'];
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly configPagination = signal<PaginationState>(DEFAULT_PAGINATION);

  protected readonly knownSettingsRows = computed(() => {
    const entries = new Map(this.config.entries().map((entry) => [entry.clave, entry.valor]));
    const settings = this.config.settings();

    return Array.from(this.knownConfigLabels.entries()).map(([clave, label]) => ({
      clave,
      label,
      valor: entries.get(clave) || this.getDefaultDisplayValue(clave, settings.zonasHorarias.map((zone) => `${zone.label}=${zone.timeZone}`).join(';'))
    }));
  });

  protected readonly extraConfigEntries = computed<ConfigEntry[]>(() => {
    return this.config.entries().filter((entry) => !this.knownConfigLabels.has(entry.clave));
  });

  protected readonly configPaginationView = computed(() => {
    return normalizePagination(this.configPagination(), this.extraConfigEntries().length);
  });

  protected readonly pagedConfigEntries = computed(() => {
    return paginateRows(this.extraConfigEntries(), this.configPagination());
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
        this.config.reset();
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
      await this.config.loadSettings(true);
      this.configError.set(this.config.error());
    } catch (error) {
      this.configError.set(this.getErrorMessage(error));
    } finally {
      this.loadingConfig.set(false);
    }
  }

  private getDefaultDisplayValue(clave: string, zonesValue: string): string {
    switch (clave) {
      case 'nombre_app':
        return DEFAULT_APP_SETTINGS.nombreApp;
      case 'moneda':
        return DEFAULT_APP_SETTINGS.moneda;
      case 'pais':
        return DEFAULT_APP_SETTINGS.pais;
      case 'idioma':
        return DEFAULT_APP_SETTINGS.idioma;
      case 'descripcion_comida_default':
        return DEFAULT_APP_SETTINGS.descripcionComidaDefault;
      case 'monto_aporte_default':
        return String(DEFAULT_APP_SETTINGS.montoAporteDefault);
      case 'restaurante_default_id':
        return DEFAULT_APP_SETTINGS.restauranteDefaultId || '-';
      case 'zonas_horarias':
        return zonesValue;
      default:
        return '-';
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
