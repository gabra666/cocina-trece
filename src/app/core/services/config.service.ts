import { Injectable, computed, inject, signal } from '@angular/core';
import { AppSettings, ClockZone, ConfigEntry } from '../../shared/models/cocina.models';
import { GoogleSheetsService } from './google-sheets.service';

const DEFAULT_ZONES: ClockZone[] = [
  {
    label: 'Canarias',
    city: 'Islas Canarias',
    timeZone: 'Atlantic/Canary'
  },
  {
    label: 'Cali',
    city: 'Colombia',
    timeZone: 'America/Bogota'
  },
  {
    label: 'Estocolmo',
    city: 'Suecia',
    timeZone: 'Europe/Stockholm'
  }
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  nombreApp: 'Cocina Trece',
  moneda: 'COP',
  pais: 'CO',
  idioma: 'es-CO',
  descripcionComidaDefault: 'Almuerzo',
  montoAporteDefault: 250000,
  restauranteDefaultId: '',
  zonasHorarias: DEFAULT_ZONES
};

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly sheets = inject(GoogleSheetsService);
  private loadingPromise: Promise<AppSettings> | null = null;
  private loaded = false;

  readonly entries = signal<ConfigEntry[]>([]);
  readonly error = signal<string | null>(null);
  readonly settings = signal<AppSettings>(DEFAULT_APP_SETTINGS);
  readonly currencyCode = computed(() => this.settings().moneda);

  async loadSettings(force = false): Promise<AppSettings> {
    if (this.loaded && !force) {
      return this.settings();
    }

    if (this.loadingPromise && !force) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.readSettings();

    try {
      return await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  reset(): void {
    this.loaded = false;
    this.entries.set([]);
    this.error.set(null);
    this.settings.set(DEFAULT_APP_SETTINGS);
  }

  private async readSettings(): Promise<AppSettings> {
    try {
      const entries = await this.sheets.getRows<ConfigEntry>('Config');
      const settings = this.parseSettings(entries);

      this.entries.set(entries);
      this.settings.set(settings);
      this.error.set(null);
      this.loaded = true;

      return settings;
    } catch (error) {
      this.entries.set([]);
      this.settings.set(DEFAULT_APP_SETTINGS);
      this.error.set(this.getErrorMessage(error));
      this.loaded = true;

      return DEFAULT_APP_SETTINGS;
    }
  }

  private parseSettings(entries: ConfigEntry[]): AppSettings {
    const values = new Map(entries.map((entry) => [entry.clave.trim(), entry.valor.trim()]));
    const contributionAmount = Number(values.get('monto_aporte_default'));

    return {
      nombreApp: values.get('nombre_app') || DEFAULT_APP_SETTINGS.nombreApp,
      moneda: values.get('moneda') || DEFAULT_APP_SETTINGS.moneda,
      pais: values.get('pais') || DEFAULT_APP_SETTINGS.pais,
      idioma: this.getValidLocale(values.get('idioma')),
      descripcionComidaDefault:
        values.get('descripcion_comida_default') || DEFAULT_APP_SETTINGS.descripcionComidaDefault,
      montoAporteDefault:
        Number.isFinite(contributionAmount) && contributionAmount > 0
          ? contributionAmount
          : DEFAULT_APP_SETTINGS.montoAporteDefault,
      restauranteDefaultId: values.get('restaurante_default_id') || DEFAULT_APP_SETTINGS.restauranteDefaultId,
      zonasHorarias: this.parseZones(values.get('zonas_horarias'))
    };
  }

  private parseZones(value: string | undefined): ClockZone[] {
    if (!value) {
      return DEFAULT_ZONES;
    }

    const zones = value
      .split(';')
      .map((entry) => {
        const [label, timeZone] = entry.split('=').map((part) => part.trim());

        if (!label || !timeZone || !this.isValidTimeZone(timeZone)) {
          return null;
        }

        return {
          label,
          city: timeZone.replace(/_/g, ' '),
          timeZone
        };
      })
      .filter((zone): zone is ClockZone => Boolean(zone));

    return zones.length > 0 ? zones : DEFAULT_ZONES;
  }

  private isValidTimeZone(timeZone: string): boolean {
    try {
      new Intl.DateTimeFormat(DEFAULT_APP_SETTINGS.idioma, { timeZone }).format(new Date());
      return true;
    } catch {
      return false;
    }
  }

  private getValidLocale(locale: string | undefined): string {
    if (!locale) {
      return DEFAULT_APP_SETTINGS.idioma;
    }

    try {
      new Intl.DateTimeFormat(locale).format(new Date());
      return locale;
    } catch {
      return DEFAULT_APP_SETTINGS.idioma;
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'No se pudo leer la configuracion.';
  }
}
