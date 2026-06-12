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

export interface Meal {
  id: string;
  fecha: string;
  restaurante_id?: string;
  descripcion: string;
  monto: number;
  pagado_por?: string;
  nota?: string;
}

export interface ConfigEntry {
  clave: string;
  valor: string;
}
