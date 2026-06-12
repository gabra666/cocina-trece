# Cocina Trece — Project Brief

## App

Cocina Trece is a family budget app for tracking meals, contributions, restaurants, and monthly balance.

## Repository / URL

- Repository name: `cocina-trece`
- GitHub Pages path: `https://gabra666.github.io/cocina-trece`

## Stack

- Frontend: Angular
- Hosting: GitHub Pages
- Storage: Google Sheets
- Authentication: Google OAuth / Google Identity Services
- Backend: none for MVP

## Goal

Build a simple Angular app that lets family members:

- log in with Google
- register meal expenses
- register family contributions
- view monthly balance
- view spending history
- view simple reports

The app uses a shared Google Sheet as the database.

## Google Sheet

The Google Sheet is named:

`Cocina Trece Data`

The spreadsheet ID will be configured in Angular environment files.

## Google Sheet Tabs and Columns

### Contribuidores

```text
id | nombre | activo
```

### Aportes

```text
id | fecha | contribuidor_id | monto | nota
```

### Restaurantes

```text
id | nombre | telefono | activo
```

### Comidas

```text
id | fecha | restaurante_id | descripcion | monto | pagado_por | nota
```

### Config

```text
clave | valor
```

## Google Cloud Setup Already Completed

The following has already been done:

- Google Cloud project created: `cocina-trece`
- Organization: `No organization`
- Google Sheets API enabled
- OAuth consent screen configured
- OAuth Client ID created for a web application
- Google Sheet created
- Spreadsheet ID available

## Credentials Model

The Angular app should use:

```ts
export const environment = {
  googleClientId: 'REPLACE_WITH_GOOGLE_CLIENT_ID',
  spreadsheetId: 'REPLACE_WITH_SPREADSHEET_ID',
  sheetsScope: 'https://www.googleapis.com/auth/spreadsheets'
};
```

Do not use a client secret in Angular.

Do not use an API key for the MVP unless there is a strong reason.

## MVP Scope

Include:

- Google login
- read from Google Sheets
- write to Google Sheets
- dashboard for current month
- register contribution
- register meal
- list contributions
- list meals
- basic reports

Do not include yet:

- backend
- Supabase
- Auth0
- roles
- multiple families/groups
- receipts/images
- complex charts
- PDF export
- notifications

## App Routes

Suggested routes:

```text
/dashboard
/comidas/nueva
/aportes/nuevo
/historial/comidas
/historial/aportes
/reportes
/configuracion
```

## Angular Structure

Suggested structure:

```text
src/app/
  core/
    services/
      auth.service.ts
      google-sheets.service.ts
  features/
    dashboard/
    meals/
    contributions/
    reports/
    settings/
  shared/
    models/
    components/
```

## TypeScript Models

```ts
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
```

## First Implementation Target

Implement the first vertical slice:

1. Angular project setup
2. Environment configuration
3. Google Identity Services login
4. Google Sheets service
5. Read the `Config` tab
6. Display the result on a simple dashboard

After that works, implement:

1. Register contribution
2. Register meal
3. Monthly dashboard calculations
4. Basic history pages
5. Basic reports

## Important Constraints

- Keep the UI simple for non-technical family members.
- Keep the architecture frontend-only for the MVP.
- The Google Sheet remains the source of truth.
- Users should only access the data if they have permission to the shared Google Sheet.
- The app should be suitable for GitHub Pages deployment.
- Do not introduce a backend unless explicitly requested.