import { Injectable } from '@angular/core';
import { Contribution, Contributor, Meal, Restaurant, RestaurantRecharge } from '../../shared/models/cocina.models';
import {
  BalanceSummary,
  ContributorReportItem,
  PeriodReport,
  ReportPeriod,
  RestaurantReportItem,
  TrendPoint
} from '../../shared/models/report.model';
import { createTrendBuckets, formatDate, isDateInRange, parseDate } from '../../shared/utils/date-period.utils';

interface ReportParams {
  meals: Meal[];
  contributions: Contribution[];
  recharges: RestaurantRecharge[];
  restaurants: Restaurant[];
  contributors: Contributor[];
  period: ReportPeriod;
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  getPeriodReport(params: ReportParams): PeriodReport {
    const mealsInPeriod = this.getMealsInPeriod(params.meals, params.period);
    const contributionsInPeriod = this.getContributionsInPeriod(params.contributions, params.period);

    return {
      period: params.period,
      balance: this.getBalanceSummary(params.meals, params.contributions, params.recharges, params.period),
      restaurantReports: this.getRestaurantReports(mealsInPeriod, params.restaurants),
      contributorReports: this.getContributorReports(contributionsInPeriod, params.contributors),
      trend: this.getTrend(params.meals, params.contributions, params.recharges, params.period),
      meals: mealsInPeriod,
      contributionsList: contributionsInPeriod
    };
  }

  getBalanceSummary(
    meals: Meal[],
    contributions: Contribution[],
    recharges: RestaurantRecharge[],
    period: ReportPeriod
  ): BalanceSummary {
    const openingContributions = contributions
      .filter((contribution) => contribution.fecha < period.startDate)
      .reduce((total, contribution) => total + contribution.monto, 0);
    const openingExpenses = meals
      .filter((meal) => meal.fecha < period.startDate)
      .reduce((total, meal) => total + meal.monto, 0);
    const periodContributions = this.getContributionsInPeriod(contributions, period).reduce(
      (total, contribution) => total + contribution.monto,
      0
    );
    const periodExpenses = this.getMealsInPeriod(meals, period).reduce((total, meal) => total + meal.monto, 0);
    const periodRestaurantRecharges = this.getRechargesInPeriod(recharges, period).reduce(
      (total, recharge) => total + recharge.monto,
      0
    );
    const endingGeneralBalance = this.getGeneralBalanceUntil(meals, contributions, recharges, period.endDate);
    const endingRestaurantBalance = this.getRestaurantBalanceUntil(meals, recharges, period.endDate);

    return {
      openingBalance: openingContributions - openingExpenses,
      contributions: periodContributions,
      expenses: periodExpenses,
      restaurantRecharges: periodRestaurantRecharges,
      endingGeneralBalance,
      endingRestaurantBalance,
      endingBalance: endingGeneralBalance + endingRestaurantBalance
    };
  }

  getRestaurantReports(meals: Meal[], restaurants: Restaurant[]): RestaurantReportItem[] {
    const names = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant.nombre]));
    const grouped = new Map<string, { mealCount: number; totalSpent: number }>();
    const totalExpenses = meals.reduce((total, meal) => total + meal.monto, 0);

    for (const meal of meals) {
      const restaurantId = meal.restaurante_id || 'unknown';
      const current = grouped.get(restaurantId) ?? { mealCount: 0, totalSpent: 0 };
      grouped.set(restaurantId, {
        mealCount: current.mealCount + 1,
        totalSpent: current.totalSpent + meal.monto
      });
    }

    return Array.from(grouped.entries())
      .map(([restaurantId, totals]) => ({
        restaurantId,
        restaurantName: restaurantId === 'unknown' ? 'Sin restaurante' : names.get(restaurantId) ?? restaurantId,
        mealCount: totals.mealCount,
        totalSpent: totals.totalSpent,
        averageCost: totals.mealCount > 0 ? totals.totalSpent / totals.mealCount : 0,
        percentageOfTotalSpent: totalExpenses > 0 ? (totals.totalSpent / totalExpenses) * 100 : 0
      }))
      .sort((first, second) => second.totalSpent - first.totalSpent);
  }

  getContributorReports(contributions: Contribution[], contributors: Contributor[]): ContributorReportItem[] {
    const names = new Map(contributors.map((contributor) => [contributor.id, contributor.nombre]));
    const grouped = new Map<string, { contributionCount: number; totalContributed: number }>();
    const totalContributions = contributions.reduce((total, contribution) => total + contribution.monto, 0);

    for (const contribution of contributions) {
      const contributorId = contribution.contribuidor_id || 'unknown';
      const current = grouped.get(contributorId) ?? { contributionCount: 0, totalContributed: 0 };
      grouped.set(contributorId, {
        contributionCount: current.contributionCount + 1,
        totalContributed: current.totalContributed + contribution.monto
      });
    }

    return Array.from(grouped.entries())
      .map(([contributorId, totals]) => ({
        contributorId,
        contributorName: contributorId === 'unknown' ? 'Sin contribuidor' : names.get(contributorId) ?? contributorId,
        contributionCount: totals.contributionCount,
        totalContributed: totals.totalContributed,
        percentageOfTotalContributions:
          totalContributions > 0 ? (totals.totalContributed / totalContributions) * 100 : 0
      }))
      .sort((first, second) => second.totalContributed - first.totalContributed);
  }

  getTrend(meals: Meal[], contributions: Contribution[], recharges: RestaurantRecharge[], period: ReportPeriod): TrendPoint[] {
    return createTrendBuckets(period).map((bucket) => {
      const balance = this.getBalanceSummary(meals, contributions, recharges, bucket);

      return {
        label: this.getTrendLabel(bucket),
        startDate: bucket.startDate,
        endDate: bucket.endDate,
        openingBalance: balance.openingBalance,
        contributions: balance.contributions,
        expenses: balance.expenses,
        restaurantRecharges: balance.restaurantRecharges,
        endingGeneralBalance: balance.endingGeneralBalance,
        endingRestaurantBalance: balance.endingRestaurantBalance,
        endingBalance: balance.endingBalance
      };
    });
  }

  private getGeneralBalanceUntil(
    meals: Meal[],
    contributions: Contribution[],
    recharges: RestaurantRecharge[],
    endDate: string
  ): number {
    const totalContributions = contributions
      .filter((contribution) => contribution.fecha <= endDate)
      .reduce((total, contribution) => total + contribution.monto, 0);
    const totalGeneralMeals = meals
      .filter((meal) => meal.fecha <= endDate && this.isGeneralBudgetMeal(meal))
      .reduce((total, meal) => total + meal.monto, 0);
    const totalRecharges = recharges
      .filter((recharge) => recharge.fecha <= endDate)
      .reduce((total, recharge) => total + recharge.monto, 0);

    return totalContributions - totalGeneralMeals - totalRecharges;
  }

  private getRestaurantBalanceUntil(meals: Meal[], recharges: RestaurantRecharge[], endDate: string): number {
    const totalRecharges = recharges
      .filter((recharge) => recharge.fecha <= endDate)
      .reduce((total, recharge) => total + recharge.monto, 0);
    const totalRestaurantMeals = meals
      .filter((meal) => meal.fecha <= endDate && meal.tipo_pago === 'presupuesto_restaurante')
      .reduce((total, meal) => total + meal.monto, 0);

    return totalRecharges - totalRestaurantMeals;
  }

  private getRechargesInPeriod(recharges: RestaurantRecharge[], period: ReportPeriod): RestaurantRecharge[] {
    return recharges.filter((recharge) => isDateInRange(recharge.fecha, period.startDate, period.endDate));
  }

  private isGeneralBudgetMeal(meal: Meal): boolean {
    return !meal.tipo_pago || meal.tipo_pago === 'presupuesto_general';
  }

  private getMealsInPeriod(meals: Meal[], period: ReportPeriod): Meal[] {
    return meals
      .filter((meal) => isDateInRange(meal.fecha, period.startDate, period.endDate))
      .sort((first, second) => second.fecha.localeCompare(first.fecha));
  }

  private getContributionsInPeriod(contributions: Contribution[], period: ReportPeriod): Contribution[] {
    return contributions
      .filter((contribution) => isDateInRange(contribution.fecha, period.startDate, period.endDate))
      .sort((first, second) => second.fecha.localeCompare(first.fecha));
  }

  private getTrendLabel(period: ReportPeriod): string {
    if (period.startDate === period.endDate) {
      const date = parseDate(period.startDate);
      return `${date.getDate()}/${date.getMonth() + 1}`;
    }

    const start = parseDate(period.startDate);
    const end = parseDate(period.endDate);

    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${start.getDate()}-${end.getDate()}/${start.getMonth() + 1}`;
    }

    if (start.getDate() === 1 && end.getDate() >= 28) {
      return formatDate(start).slice(0, 7);
    }

    return `${formatDate(start).slice(5)} - ${formatDate(end).slice(5)}`;
  }
}
