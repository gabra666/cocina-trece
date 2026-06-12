import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
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
  private readonly token = signal<string | null>(null);
  private tokenClient?: GoogleTokenClient;
  private initPromise?: Promise<void>;

  readonly accessToken = computed(() => this.token());
  readonly isSignedIn = computed(() => Boolean(this.token()));
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly error = signal<string | null>(null);

  async signIn(): Promise<void> {
    await this.initGoogleIdentity();
    this.tokenClient?.requestAccessToken({
      prompt: this.token() ? '' : 'consent'
    });
  }

  signOut(): void {
    const currentToken = this.token();
    this.token.set(null);

    if (currentToken && window.google) {
      window.google.accounts.oauth2.revoke(currentToken, () => undefined);
    }
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

            this.token.set(response.access_token ?? null);
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
}
