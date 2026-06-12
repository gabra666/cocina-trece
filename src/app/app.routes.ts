import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'comidas/nueva',
    loadComponent: () =>
      import('./features/meals/meals').then((m) => m.Meals)
  },
  {
    path: 'aportes/nuevo',
    loadComponent: () =>
      import('./features/contributions/contributions').then((m) => m.Contributions)
  },
  {
    path: 'presupuesto',
    loadComponent: () =>
      import('./features/budget/budget').then((m) => m.Budget)
  },
  {
    path: 'configuracion',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then((m) => m.Dashboard)
  },
  {
    path: 'configuracion/contribuidores',
    loadComponent: () =>
      import('./features/settings/contributors-admin/contributors-admin').then((m) => m.ContributorsAdmin)
  },
  {
    path: 'configuracion/restaurantes',
    loadComponent: () =>
      import('./features/settings/restaurants-admin/restaurants-admin').then((m) => m.RestaurantsAdmin)
  },
  {
    path: 'historial/aportes',
    redirectTo: 'aportes/nuevo'
  },
  {
    path: 'historial/comidas',
    redirectTo: 'comidas/nueva'
  },
  {
    path: 'dashboard',
    redirectTo: 'configuracion'
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'comidas/nueva'
  },
  {
    path: '**',
    redirectTo: 'comidas/nueva'
  }
];
