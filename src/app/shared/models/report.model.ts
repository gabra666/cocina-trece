import { Contribution, Meal } from './cocina.models';

export type ReportPeriodType = 'week' | 'month' | 'year' | 'range';

export interface ReportPeriod {
  type: ReportPeriodType;
  key?: string;
  startDate: string;
  endDate: string;
}

export interface BalanceSummary {
  openingBalance: number;
  contributions: number;
  expenses: number;
  restaurantRecharges: number;
  endingGeneralBalance: number;
  endingRestaurantBalance: number;
  endingBalance: number;
}

export interface ContributorReportItem {
  contributorId: string;
  contributorName: string;
  contributionCount: number;
  totalContributed: number;
  percentageOfTotalContributions: number;
}

export interface RestaurantReportItem {
  restaurantId: string;
  restaurantName: string;
  mealCount: number;
  totalSpent: number;
  averageCost: number;
  percentageOfTotalSpent: number;
}

export interface TrendPoint {
  label: string;
  startDate: string;
  endDate: string;
  openingBalance: number;
  contributions: number;
  expenses: number;
  restaurantRecharges: number;
  endingGeneralBalance: number;
  endingRestaurantBalance: number;
  endingBalance: number;
}

export interface PeriodReport {
  period: ReportPeriod;
  balance: BalanceSummary;
  restaurantReports: RestaurantReportItem[];
  contributorReports: ContributorReportItem[];
  trend: TrendPoint[];
  meals: Meal[];
  contributionsList: Contribution[];
}
