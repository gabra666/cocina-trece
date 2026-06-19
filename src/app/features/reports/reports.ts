import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { ChartDataset } from 'chart.js';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { ContributionsService } from '../../core/services/contributions.service';
import { ContributorsService } from '../../core/services/contributors.service';
import { MealsService } from '../../core/services/meals.service';
import { RestaurantRechargesService } from '../../core/services/restaurant-recharges.service';
import { ReportsService } from '../../core/services/reports.service';
import { RestaurantsService } from '../../core/services/restaurants.service';
import { AppShell } from '../../shared/components/app-shell/app-shell';
import { ReportChart } from '../../shared/components/report-chart/report-chart';
import { Contribution, Contributor, Meal, Restaurant, RestaurantRecharge } from '../../shared/models/cocina.models';
import { PeriodReport, ReportPeriod, ReportPeriodType } from '../../shared/models/report.model';
import {
  DEFAULT_PAGINATION,
  PAGE_SIZE_OPTIONS,
  PaginationState,
  normalizePagination,
  paginateRows
} from '../../shared/utils/pagination';
import {
  formatDate,
  getIsoWeekKey,
  getMonthKey,
  getYearKey,
  resolveRangePeriod,
  resolveWeekPeriod,
  resolveMonthPeriod,
  resolveYearPeriod
} from '../../shared/utils/date-period.utils';

interface PieData {
  labels: string[];
  data: number[];
}

@Component({
  selector: 'app-reports',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    AppShell,
    ReportChart
  ],
  templateUrl: './reports.html',
  styleUrl: './reports.css'
})
export class Reports {
  protected readonly auth = inject(AuthService);
  protected readonly config = inject(ConfigService);
  private readonly contributionsService = inject(ContributionsService);
  private readonly contributorsService = inject(ContributorsService);
  private readonly mealsService = inject(MealsService);
  private readonly rechargesService = inject(RestaurantRechargesService);
  private readonly reportsService = inject(ReportsService);
  private readonly restaurantsService = inject(RestaurantsService);
  private lastLoadedToken: string | null = null;

  protected readonly meals = signal<Meal[]>([]);
  protected readonly contributions = signal<Contribution[]>([]);
  protected readonly recharges = signal<RestaurantRecharge[]>([]);
  protected readonly restaurants = signal<Restaurant[]>([]);
  protected readonly contributors = signal<Contributor[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly restaurantColumns = ['restaurante', 'comidas', 'gastado', 'promedio', 'porcentaje'];
  protected readonly contributorColumns = ['contribuidor', 'aportes', 'total', 'porcentaje'];
  protected readonly mealColumns = ['fecha', 'restaurante', 'descripcion', 'monto'];
  protected readonly contributionColumns = ['fecha', 'contribuidor', 'monto', 'nota'];
  protected readonly restaurantPagination = signal<PaginationState>(DEFAULT_PAGINATION);
  protected readonly contributorPagination = signal<PaginationState>(DEFAULT_PAGINATION);
  protected readonly mealsPagination = signal<PaginationState>(DEFAULT_PAGINATION);
  protected readonly contributionsPagination = signal<PaginationState>(DEFAULT_PAGINATION);

  protected readonly form = new FormGroup({
    type: new FormControl<ReportPeriodType>('month', {
      nonNullable: true
    }),
    weekKey: new FormControl(getIsoWeekKey(new Date()), {
      nonNullable: true
    }),
    monthKey: new FormControl(getMonthKey(formatDate(new Date())), {
      nonNullable: true
    }),
    yearKey: new FormControl(getYearKey(formatDate(new Date())), {
      nonNullable: true
    }),
    startDate: new FormControl<Date | null>(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    endDate: new FormControl<Date | null>(new Date())
  });

  private readonly periodType = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.form.controls.type.value
  });
  private readonly weekKey = toSignal(this.form.controls.weekKey.valueChanges, {
    initialValue: this.form.controls.weekKey.value
  });
  private readonly monthKey = toSignal(this.form.controls.monthKey.valueChanges, {
    initialValue: this.form.controls.monthKey.value
  });
  private readonly yearKey = toSignal(this.form.controls.yearKey.valueChanges, {
    initialValue: this.form.controls.yearKey.value
  });
  private readonly startDate = toSignal(this.form.controls.startDate.valueChanges, {
    initialValue: this.form.controls.startDate.value
  });
  private readonly endDate = toSignal(this.form.controls.endDate.valueChanges, {
    initialValue: this.form.controls.endDate.value
  });

  protected readonly currencyCode = computed(() => this.config.currencyCode());

  protected readonly yearOptions = computed(() => {
    const years = new Set<string>([getYearKey(formatDate(new Date()))]);

    for (const meal of this.meals()) {
      years.add(getYearKey(meal.fecha));
    }

    for (const contribution of this.contributions()) {
      years.add(getYearKey(contribution.fecha));
    }

    return Array.from(years).sort((first, second) => second.localeCompare(first));
  });

  protected readonly selectedPeriod = computed<ReportPeriod>(() => {
    const type = this.periodType();

    if (type === 'week') {
      return resolveWeekPeriod(this.weekKey());
    }

    if (type === 'month') {
      return resolveMonthPeriod(this.monthKey());
    }

    if (type === 'year') {
      return resolveYearPeriod(this.yearKey());
    }

    return resolveRangePeriod(this.formatControlDate(this.startDate()), this.formatControlDate(this.endDate()));
  });

  protected readonly report = computed<PeriodReport>(() => {
    return this.reportsService.getPeriodReport({
      meals: this.meals(),
      contributions: this.contributions(),
      recharges: this.recharges(),
      restaurants: this.restaurants(),
      contributors: this.contributors(),
      period: this.selectedPeriod()
    });
  });

  protected readonly restaurantPaginationView = computed(() => {
    return normalizePagination(this.restaurantPagination(), this.report().restaurantReports.length);
  });
  protected readonly contributorPaginationView = computed(() => {
    return normalizePagination(this.contributorPagination(), this.report().contributorReports.length);
  });
  protected readonly mealsPaginationView = computed(() => {
    return normalizePagination(this.mealsPagination(), this.report().meals.length);
  });
  protected readonly contributionsPaginationView = computed(() => {
    return normalizePagination(this.contributionsPagination(), this.report().contributionsList.length);
  });

  protected readonly pagedRestaurantReports = computed(() => {
    return paginateRows(this.report().restaurantReports, this.restaurantPagination());
  });
  protected readonly pagedContributorReports = computed(() => {
    return paginateRows(this.report().contributorReports, this.contributorPagination());
  });
  protected readonly pagedMeals = computed(() => {
    return paginateRows(this.report().meals, this.mealsPagination());
  });
  protected readonly pagedContributions = computed(() => {
    return paginateRows(this.report().contributionsList, this.contributionsPagination());
  });

  protected readonly trendLabels = computed(() => this.report().trend.map((point) => point.label));
  protected readonly balanceTrendDatasets = computed<ChartDataset[]>(() => [
    {
      label: 'Saldo total',
      data: this.report().trend.map((point) => point.endingBalance),
      borderColor: '#205493',
      backgroundColor: 'rgba(32, 84, 147, 0.14)',
      tension: 0.32,
      fill: true
    },
    {
      label: 'Banco / general',
      data: this.report().trend.map((point) => point.endingGeneralBalance),
      borderColor: '#2f7d4c',
      backgroundColor: 'rgba(47, 125, 76, 0.08)',
      tension: 0.32
    },
    {
      label: 'Saldo prepagado en restaurantes',
      data: this.report().trend.map((point) => point.endingRestaurantBalance),
      borderColor: '#b54708',
      backgroundColor: 'rgba(181, 71, 8, 0.08)',
      tension: 0.32
    }
  ]);
  protected readonly contributionExpenseDatasets = computed<ChartDataset[]>(() => [
    {
      label: 'Aportes',
      data: this.report().trend.map((point) => point.contributions),
      backgroundColor: '#2f7d4c'
    },
    {
      label: 'Gastos',
      data: this.report().trend.map((point) => point.expenses),
      backgroundColor: '#b54708'
    }
  ]);
  protected readonly spendingByRestaurantDatasets = computed<ChartDataset[]>(() => [
    {
      label: 'Gasto',
      data: this.report().restaurantReports.map((item) => item.totalSpent),
      backgroundColor: '#315f9f'
    }
  ]);
  protected readonly restaurantReportLabels = computed(() => {
    return this.report().restaurantReports.map((item) => item.restaurantName);
  });
  protected readonly mealCountReports = computed(() => {
    return [...this.report().restaurantReports].sort((first, second) => second.mealCount - first.mealCount);
  });
  protected readonly mealCountLabels = computed(() => {
    return this.mealCountReports().map((item) => item.restaurantName);
  });
  protected readonly mealCountDatasets = computed<ChartDataset[]>(() => [
    {
      label: 'Comidas',
      data: this.mealCountReports().map((item) => item.mealCount),
      backgroundColor: '#607d3b'
    }
  ]);
  protected readonly averageCostReports = computed(() => {
    return [...this.report().restaurantReports].sort((first, second) => second.averageCost - first.averageCost);
  });
  protected readonly averageCostLabels = computed(() => {
    return this.averageCostReports().map((item) => item.restaurantName);
  });
  protected readonly averageCostDatasets = computed<ChartDataset[]>(() => [
    {
      label: 'Promedio',
      data: this.averageCostReports().map((item) => item.averageCost),
      backgroundColor: '#6f5aa8'
    }
  ]);
  protected readonly contributionsByContributorDatasets = computed<ChartDataset[]>(() => [
    {
      label: 'Aportes',
      data: this.report().contributorReports.map((item) => item.totalContributed),
      backgroundColor: '#2f7d4c'
    }
  ]);
  protected readonly contributorReportLabels = computed(() => {
    return this.report().contributorReports.map((item) => item.contributorName);
  });
  protected readonly spendingShare = computed(() => {
    return this.groupPieData(
      this.report().restaurantReports.map((item) => ({ label: item.restaurantName, value: item.totalSpent }))
    );
  });
  protected readonly contributionShare = computed(() => {
    return this.groupPieData(
      this.report().contributorReports.map((item) => ({ label: item.contributorName, value: item.totalContributed }))
    );
  });
  protected readonly spendingShareDatasets = computed<ChartDataset[]>(() => [
    {
      label: 'Gasto',
      data: this.spendingShare().data,
      backgroundColor: this.getPieColors(this.spendingShare().data.length)
    }
  ]);
  protected readonly contributionShareDatasets = computed<ChartDataset[]>(() => [
    {
      label: 'Aportes',
      data: this.contributionShare().data,
      backgroundColor: this.getPieColors(this.contributionShare().data.length)
    }
  ]);

  constructor() {
    effect(() => {
      const token = this.auth.accessToken();

      if (token && token !== this.lastLoadedToken) {
        this.lastLoadedToken = token;
        void this.loadData();
      }

      if (!token) {
        this.lastLoadedToken = null;
        this.meals.set([]);
        this.contributions.set([]);
        this.recharges.set([]);
        this.restaurants.set([]);
        this.contributors.set([]);
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

  protected async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [, meals, contributions, recharges, restaurants, contributors] = await Promise.all([
        this.config.loadSettings(),
        this.mealsService.getMeals(),
        this.contributionsService.getContributions(),
        this.rechargesService.getRecharges(),
        this.restaurantsService.getRestaurants(),
        this.contributorsService.getContributors()
      ]);

      this.meals.set(meals);
      this.contributions.set(contributions);
      this.recharges.set(recharges);
      this.restaurants.set(restaurants);
      this.contributors.set(contributors);
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected getRestaurantName(restaurantId: string | undefined): string {
    return this.restaurants().find((restaurant) => restaurant.id === restaurantId)?.nombre ?? restaurantId ?? 'Sin restaurante';
  }

  protected getContributorName(contributorId: string): string {
    return this.contributors().find((contributor) => contributor.id === contributorId)?.nombre ?? contributorId;
  }

  protected formatPercent(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    }).format(value);
  }

  protected updateRestaurantPage(event: PageEvent): void {
    this.restaurantPagination.set({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  protected updateContributorPage(event: PageEvent): void {
    this.contributorPagination.set({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  protected updateMealsPage(event: PageEvent): void {
    this.mealsPagination.set({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  protected updateContributionsPage(event: PageEvent): void {
    this.contributionsPagination.set({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  private formatControlDate(date: Date | null): string {
    return date ? formatDate(date) : formatDate(new Date());
  }

  private groupPieData(items: Array<{ label: string; value: number }>): PieData {
    const nonZeroItems = items.filter((item) => item.value > 0);

    if (nonZeroItems.length <= 5) {
      return {
        labels: nonZeroItems.map((item) => item.label),
        data: nonZeroItems.map((item) => item.value)
      };
    }

    const topItems = nonZeroItems.slice(0, 5);
    const otherTotal = nonZeroItems.slice(5).reduce((total, item) => total + item.value, 0);

    return {
      labels: [...topItems.map((item) => item.label), 'Otros'],
      data: [...topItems.map((item) => item.value), otherTotal]
    };
  }

  private getPieColors(length: number): string[] {
    const colors = ['#315f9f', '#2f7d4c', '#b54708', '#6f5aa8', '#9f2d20', '#607d3b'];
    return Array.from({ length }, (_, index) => colors[index % colors.length]);
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  }
}
