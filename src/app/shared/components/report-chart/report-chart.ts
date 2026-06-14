import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { Chart, ChartConfiguration, ChartDataset, ChartType, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-report-chart',
  imports: [CommonModule],
  templateUrl: './report-chart.html',
  styleUrl: './report-chart.css'
})
export class ReportChart implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) type: 'bar' | 'line' | 'pie' = 'bar';
  @Input() labels: string[] = [];
  @Input() datasets: ChartDataset[] = [];
  @Input() emptyMessage = 'No hay datos para este periodo';
  @Input() currencyCode = 'COP';
  @Input() valueKind: 'currency' | 'number' | 'percent' = 'currency';

  @ViewChild('canvas') private readonly canvas?: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;
  private viewReady = false;

  get hasData(): boolean {
    return this.datasets.some((dataset) => {
      return (dataset.data ?? []).some((value) => Number(value) !== 0);
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.renderChart();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.renderChart();
  }

  ngOnDestroy(): void {
    this.destroyChart();
  }

  private renderChart(): void {
    if (!this.viewReady || !this.canvas) {
      return;
    }

    this.destroyChart();

    if (!this.hasData) {
      return;
    }

    this.chart = new Chart(this.canvas.nativeElement, this.getConfig());
  }

  private destroyChart(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  private getConfig(): ChartConfiguration {
    const isPie = this.type === 'pie';

    return {
      type: this.type as ChartType,
      data: {
        labels: this.labels,
        datasets: this.datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            display: isPie || this.datasets.length > 1,
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.dataset.label ? `${context.dataset.label}: ` : '';
                const parsed = context.parsed as number | { y?: number };
                const value = typeof parsed === 'number' ? parsed : Number(parsed.y ?? 0);
                return `${label}${this.formatValue(value)}`;
              }
            }
          }
        },
        scales: isPie
          ? undefined
          : {
              x: {
                ticks: {
                  maxRotation: 0,
                  autoSkip: true
                }
              },
              y: {
                beginAtZero: true,
                ticks: {
                  callback: (value) => this.formatValue(Number(value))
                }
              }
            }
      }
    };
  }

  private formatValue(value: number): string {
    if (this.valueKind === 'number') {
      return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(value);
    }

    if (this.valueKind === 'percent') {
      return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(value)}%`;
    }

    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: this.currencyCode,
      maximumFractionDigits: 0
    }).format(value);
  }
}
