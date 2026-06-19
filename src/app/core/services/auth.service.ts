import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface StoredGoogleSession {
  accessToken: string;
  expiresAt: number;
}

interface GoogleTokenClient {
  requestAccessToken(options?: { prompt?: '' | 'consent' | 'select_account' }): void;
}

interface GoogleAccounts {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: GoogleTokenResponse) => void;
      }): GoogleTokenClient;
      revoke(token: string, done: () => void): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'cocina-trece.google-session';
  private readonly expirationBufferMs = 60_000;
  private readonly token = signal<string | null>(null);
  private readonly expiresAt = signal<number | null>(null);
  private tokenClient?: GoogleTokenClient;
  private initPromise?: Promise<void>;
  private expirationTimer?: ReturnType<typeof setTimeout>;

  readonly accessToken = computed(() => this.token());
  readonly isSignedIn = computed(() => Boolean(this.token()));
  readonly sessionExpired = signal(false);
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly error = signal<string | null>(null);

  constructor() {
    this.restoreSession();
  }

  async signIn(): Promise<void> {
    this.error.set(null);
    this.sessionExpired.set(false);
    await this.initGoogleIdentity();
    this.tokenClient?.requestAccessToken({ prompt: '' });
  }

  signOut(): void {
    const currentToken = this.token();
    this.clearLocalSession();
    this.error.set(null);
    this.status.set('idle');

    if (currentToken && window.google) {
      window.google.accounts.oauth2.revoke(currentToken, () => undefined);
    }
  }

  getValidAccessToken(): string | null {
    const expiresAt = this.expiresAt();

    if (expiresAt !== null && this.isExpired(expiresAt)) {
      this.expireSession();
      return null;
    }

    return this.token();
  }

  handleUnauthorized(): void {
    this.expireSession('Tu sesión de Google venció. Vuelve a entrar para continuar.');
  }

  private initGoogleIdentity(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.status.set('loading');
    this.error.set(null);

    this.initPromise = this.loadGoogleScript()
      .then(() => {
        if (environment.googleClientId.startsWith('REPLACE_')) {
          throw new Error('Falta configurar googleClientId en el environment local.');
        }

        if (!window.google) {
          throw new Error('Google Identity Services no está disponible.');
        }

        this.tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: environment.googleClientId,
          scope: environment.sheetsScope,
          callback: (response) => {
            if (response.error) {
              this.error.set(response.error_description ?? response.error);
              this.status.set('error');
              return;
            }

            const accessToken = response.access_token;
            const expiresIn = response.expires_in;

            if (!accessToken || !expiresIn) {
              this.clearLocalSession();
              this.error.set('Google no devolvió una sesión válida.');
              this.status.set('error');
              return;
            }

            this.setSession(accessToken, Date.now() + expiresIn * 1000);
            this.sessionExpired.set(false);
            this.error.set(null);
            this.status.set('ready');
          }
        });

        this.status.set('ready');
      })
      .catch((error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'No se pudo inicializar Google Login.');
        this.status.set('error');
        this.initPromise = undefined;
        throw error;
      });

    return this.initPromise;
  }

  private loadGoogleScript(): Promise<void> {
    if (window.google) {
      return Promise.resolve();
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );

    if (existingScript) {
      return new Promise((resolve, reject) => {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar Google Login.')), {
          once: true
        });
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar Google Login.'));
      document.head.appendChild(script);
    });
  }

  private setSession(accessToken: string, expiresAt: number): void {
    this.token.set(accessToken);
    this.expiresAt.set(expiresAt);
    this.persistSession({ accessToken, expiresAt });
    this.scheduleExpiration(expiresAt);
  }

  private restoreSession(): void {
    const storedSession = this.readStoredSession();

    if (!storedSession) {
      return;
    }

    if (this.isExpired(storedSession.expiresAt)) {
      this.expireSession();
      return;
    }

    this.token.set(storedSession.accessToken);
    this.expiresAt.set(storedSession.expiresAt);
    this.sessionExpired.set(false);
    this.error.set(null);
    this.status.set('ready');
    this.scheduleExpiration(storedSession.expiresAt);
  }

  private expireSession(message = 'Tu sesión de Google venció. Vuelve a entrar para continuar.'): void {
    this.clearLocalSession();
    this.sessionExpired.set(true);
    this.error.set(message);
    this.status.set('idle');
  }

  private clearLocalSession(): void {
    this.clearExpirationTimer();
    this.token.set(null);
    this.expiresAt.set(null);
    this.sessionExpired.set(false);
    sessionStorage.removeItem(this.storageKey);
  }

  private scheduleExpiration(expiresAt: number): void {
    this.clearExpirationTimer();
    const delay = Math.max(0, expiresAt - Date.now() - this.expirationBufferMs);
    this.expirationTimer = setTimeout(() => this.expireSession(), delay);
  }

  private clearExpirationTimer(): void {
    if (this.expirationTimer !== undefined) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = undefined;
    }
  }

  private isExpired(expiresAt: number): boolean {
    return Date.now() >= expiresAt - this.expirationBufferMs;
  }

  private persistSession(session: StoredGoogleSession): void {
    sessionStorage.setItem(this.storageKey, JSON.stringify(session));
  }

  private readStoredSession(): StoredGoogleSession | null {
    const value = sessionStorage.getItem(this.storageKey);

    if (!value) {
      return null;
    }

    try {
      const session = JSON.parse(value) as Partial<StoredGoogleSession>;

      if (typeof session.accessToken === 'string' && typeof session.expiresAt === 'number') {
        return {
          accessToken: session.accessToken,
          expiresAt: session.expiresAt
        };
      }
    } catch {
      // Invalid persisted data is removed below.
    }

    sessionStorage.removeItem(this.storageKey);
    return null;
  }
}
