# Agent Instructions

This project is Cocina Trece, a small family budget app.

## Priorities

- Keep the code simple.
- Prefer Angular standalone components if the project uses modern Angular.
- Do not introduce a backend unless explicitly requested.
- Do not add Supabase, Auth0, Firebase, or server-side code.
- Use Google Sheets API as the data source.
- Use Google Identity Services for authentication.
- Keep credentials in Angular environment files.
- Never commit real OAuth Client IDs or Spreadsheet IDs if the repository is public.
- Use placeholder values in committed files and document how to replace them locally.

## MVP

Focus on:
- login
- reading Google Sheets
- appending rows to Google Sheets
- meals
- contributions
- simple monthly dashboard