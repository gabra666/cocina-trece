import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, effect, signal, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ConfigService } from '../../../core/services/config.service';
import { WorldClock } from '../world-clock/world-clock';

interface NavItem {
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-shell',
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
    WorldClock
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css'
})
export class AppShell implements OnDestroy {
  @Input() title = 'Cocina Trece';

  protected readonly auth = inject(AuthService);
  protected readonly config = inject(ConfigService);
  protected readonly isHandset = signal(false);
  protected readonly navItems: NavItem[] = [
    { label: 'Comidas', route: '/comidas/nueva', icon: 'restaurant' },
    { label: 'Aportes', route: '/aportes/nuevo', icon: 'payments' },
    { label: 'Presupuesto', route: '/presupuesto', icon: 'account_balance_wallet' },
    { label: 'Contribuidores', route: '/configuracion/contribuidores', icon: 'group' },
    { label: 'Restaurantes', route: '/configuracion/restaurantes', icon: 'storefront' },
    { label: 'Configuración', route: '/configuracion', icon: 'settings' }
  ];

  private readonly mediaQueryList =
    typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia('(max-width: 860px)') : null;

  constructor() {
    this.isHandset.set(this.mediaQueryList?.matches ?? false);
    this.mediaQueryList?.addEventListener('change', this.handleMediaChange);

    effect(() => {
      if (this.auth.accessToken()) {
        void this.config.loadSettings();
      } else {
        this.config.reset();
      }
    });
  }

  ngOnDestroy(): void {
    this.mediaQueryList?.removeEventListener('change', this.handleMediaChange);
  }

  protected async signIn(): Promise<void> {
    await this.auth.signIn();
  }

  protected signOut(): void {
    this.auth.signOut();
  }

  protected closeIfHandset(drawer: MatSidenav): void {
    if (this.isHandset()) {
      void drawer.close();
    }
  }

  private readonly handleMediaChange = (event: MediaQueryListEvent): void => {
    this.isHandset.set(event.matches);
  };
}
