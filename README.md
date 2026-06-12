# Cocina Trece

Cocina Trece es una app familiar para controlar comidas, aportes y presupuesto usando una interfaz sencilla sobre Google Sheets.

La aplicación será una capa amigable encima de una hoja compartida. Para el MVP no tendrá backend propio: Google Sheets será la fuente de datos y Google Identity Services manejará el login.

## Desarrollo local

Instala dependencias y levanta el servidor local:

```bash
npm install
npm start
```

La app queda disponible en:

```text
http://localhost:4200
```

Para PowerShell en Windows, si la ejecución de scripts bloquea `npm`, usa:

```powershell
npm.cmd install
npm.cmd start
```

## Configuración

El repositorio incluye `src/environments/environment.ts` con placeholders seguros para Git.

Para desarrollo local se usa `src/environments/environment.local.ts`, que está ignorado por Git. Ese archivo debe tener esta forma:

```ts
export const environment = {
  googleClientId: 'REPLACE_WITH_GOOGLE_CLIENT_ID',
  spreadsheetId: 'REPLACE_WITH_SPREADSHEET_ID',
  sheetsScope: 'https://www.googleapis.com/auth/spreadsheets'
};
```

No se debe usar client secret en Angular. La seguridad depende de Google OAuth, los orígenes autorizados y los permisos de la Google Sheet.

## Publicación en GitHub Pages

La app se publica con GitHub Actions en:

```text
https://gabra666.github.io/cocina-trece/
```

Antes de desplegar, configura estos repository secrets en GitHub:

```text
GOOGLE_CLIENT_ID
GOOGLE_SPREADSHEET_ID
```

También agrega este origen autorizado en el OAuth Client de Google:

```text
https://gabra666.github.io
```

El workflow usa `npm run build:github-pages`, compila con `--base-href /cocina-trece/` y copia `index.html` como `404.html` para soportar rutas directas de Angular.

## MVP

La primera versión se mantendrá simple:

- Angular para la aplicación web.
- Angular Material para la interfaz.
- GitHub Pages para publicar el frontend.
- Google Login para autenticar a las personas de la familia.
- Google Sheets como base de datos compartida.
- Lectura y escritura de aportes y comidas.
- Registro de comidas con restaurante, descripción, monto y origen de pago.
- Registro de aportes con formulario Material.
- Presupuesto general alimentado por aportes familiares.
- Recargas a restaurantes desde el presupuesto general.
- Administración simple de contribuidores y restaurantes.
- Dashboard mensual básico.
- Reloj familiar para Canarias, Cali y Estocolmo.
- Historial simple de aportes y comidas.

La ruta inicial de la aplicación abre directamente `Comidas`, porque registrar comidas es el flujo principal.

## Documentación

- [Project brief](docs/PROJECT_BRIEF.md)
- [Instrucciones para agentes](Agents.md)

## Estado

El primer corte de la app ya incluye un dashboard local en Angular, login con Google Identity Services y lectura de la pestaña `Config` en Google Sheets.
