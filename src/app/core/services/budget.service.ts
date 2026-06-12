import { Injectable, inject } from '@angular/core';
import { BudgetSnapshot, Meal, RestaurantBalance } from '../../shared/models/cocina.models';
import { ContributionsService } from './contributions.service';
import { MealsService } from './meals.service';
import { RestaurantRechargesService } from './restaurant-recharges.service';
import { RestaurantsService } from './restaurants.service';

@Injectable({ providedIn: 'root' })
export class BudgetService {
  private readonly contributionsService = inject(ContributionsService);
  private readonly mealsService = inject(MealsService);
  private readonly rechargesService = inject(RestaurantRechargesService);
  private readonly restaurantsService = inject(RestaurantsService);

  async getSnapshot(): Promise<BudgetSnapshot> {
    const [contributions, meals, recharges, restaurants] = await Promise.all([
      this.contributionsService.getContributions(),
      this.mealsService.getMeals(),
      this.rechargesService.getRecharges(),
      this.restaurantsService.getRestaurants()
    ]);

    const totalContributions = contributions.reduce((total, contribution) => total + contribution.monto, 0);
    const totalGeneralMeals = meals
      .filter((meal) => this.isGeneralBudgetMeal(meal))
      .reduce((total, meal) => total + meal.monto, 0);
    const totalRestaurantRecharges = recharges.reduce((total, recharge) => total + recharge.monto, 0);
    const restaurantNames = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant.nombre]));
    const rechargedByRestaurant = new Map<string, number>();
    const consumedByRestaurant = new Map<string, number>();

    for (const recharge of recharges) {
      rechargedByRestaurant.set(
        recharge.restaurante_id,
        (rechargedByRestaurant.get(recharge.restaurante_id) ?? 0) + recharge.monto
      );
    }

    for (const meal of meals.filter((entry) => entry.tipo_pago === 'presupuesto_restaurante')) {
      const restaurantId = meal.restaurante_id ?? '';

      if (restaurantId) {
        consumedByRestaurant.set(restaurantId, (consumedByRestaurant.get(restaurantId) ?? 0) + meal.monto);
      }
    }

    const restaurantIds = new Set([
      ...restaurants.map((restaurant) => restaurant.id),
      ...rechargedByRestaurant.keys(),
      ...consumedByRestaurant.keys()
    ]);

    const balances: RestaurantBalance[] = Array.from(restaurantIds)
      .map((restaurantId) => {
        const recargado = rechargedByRestaurant.get(restaurantId) ?? 0;
        const consumido = consumedByRestaurant.get(restaurantId) ?? 0;

        return {
          restaurante_id: restaurantId,
          restaurante_nombre: restaurantNames.get(restaurantId) ?? restaurantId,
          recargado,
          consumido,
          saldo: recargado - consumido,
          tiene_recargas: recargado > 0
        };
      })
      .sort((first, second) => first.restaurante_nombre.localeCompare(second.restaurante_nombre));

    return {
      total_aportes: totalContributions,
      total_comidas_generales: totalGeneralMeals,
      total_recargas_restaurantes: totalRestaurantRecharges,
      saldo_general: totalContributions - totalGeneralMeals - totalRestaurantRecharges,
      saldos_restaurantes: balances,
      recargas: recharges
    };
  }

  private isGeneralBudgetMeal(meal: Meal): boolean {
    return !meal.tipo_pago || meal.tipo_pago === 'presupuesto_general';
  }
}
