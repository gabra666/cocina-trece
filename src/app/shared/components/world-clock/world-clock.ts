import { Component, OnDestroy, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';

interface ClockZone {
  label: string;
  city: string;
  timeZone: string;
}

@Component({
  selector: 'app-world-clock',
  imports: [MatCardModule, MatDividerModule],
  templateUrl: './world-clock.html',
  styleUrl: './world-clock.css'
})
export class WorldClock implements OnDestroy {
  protected readonly now = signal(new Date());
  protected readonly zones: ClockZone[] = [
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

  private readonly intervalId = window.setInterval(() => {
    this.now.set(new Date());
  }, 1000);

  ngOnDestroy(): void {
    window.clearInterval(this.intervalId);
  }

  protected formatTime(timeZone: string): string {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(this.now());
  }

  protected formatDate(timeZone: string): string {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone,
      weekday: 'short',
      day: '2-digit',
      month: 'short'
    }).format(this.now());
  }
}
