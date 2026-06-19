export interface Contributor {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface Contribution {
  id: string;
  fecha: string;
  contribuidor_id: string;
  monto: number;
  nota?: string;
}

export interface Restaurant {
  id: string;
  nombre: string;
  telefono?: string;
  activo: boolean;
}

export type MealPaymentType = 'presupuesto_general' | 'presupuesto_restaurante';

export interface Meal {
  id: string;
  fecha: string;
  restaurante_id?: string;
  descripcion: string;
  monto: number;
  nota?: string;
  tipo_pago?: MealPaymentType;
}

export interface RestaurantRecharge {
  id: string;
  fecha: string;
  restaurante_id: string;
  monto: number;
  nota?: string;
}

export interface RestaurantBalance {
  restaurante_id: string;
  restaurante_nombre: string;
  recargado: number;
  consumido: number;
  saldo: number;
  tiene_recargas: boolean;
}

export interface BudgetSnapshot {
  total_recargas_restaurantes: number;
  saldo_banco: number;
  saldo_restaurantes: number;
  saldo_final: number;
  saldos_restaurantes: RestaurantBalance[];
  recargas: RestaurantRecharge[];
}

export interface ConfigEntry {
  clave: string;
  valor: string;
}

export interface ClockZone {
  label: string;
  city: string;
  timeZone: string;
}

export interface AppSettings {
  nombreApp: string;
  moneda: string;
  pais: string;
  idioma: string;
  descripcionComidaDefault: string;
  montoAporteDefault: number;
  restauranteDefaultId: string;
  zonasHorarias: ClockZone[];
}
