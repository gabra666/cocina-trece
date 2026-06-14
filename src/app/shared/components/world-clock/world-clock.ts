import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { ConfigService } from '../../../core/services/config.service';

@Component({
  selector: 'app-world-clock',
  imports: [MatCardModule, MatDividerModule],
  templateUrl: './world-clock.html',
  styleUrl: './world-clock.css'
})
export class WorldClock implements OnDestroy {
  private readonly config = inject(ConfigService);

  protected readonly now = signal(new Date());
  protected readonly zones = computed(() => this.config.settings().zonasHorarias);

  private readonly intervalId = window.setInterval(() => {
    this.now.set(new Date());
  }, 1000);

  ngOnDestroy(): void {
    window.clearInterval(this.intervalId);
  }

  protected formatTime(timeZone: string): string {
    return new Intl.DateTimeFormat(this.config.settings().idioma, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(this.now());
  }

  protected formatDate(timeZone: string): string {
    return new Intl.DateTimeFormat(this.config.settings().idioma, {
      timeZone,
      weekday: 'short',
      day: '2-digit',
      month: 'short'
    }).format(this.now());
  }
}
