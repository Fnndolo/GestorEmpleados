@AGENTS.md

# Plataforma de Gestión Humana, Jurídica y SST — KUPOCELL S.A.S. (Smart Gadgets)

Plataforma web tipo app (PWA) para administrar el ciclo completo del personal en RH (con nómina
colombiana), Jurídica y SST. Multi-sede / multi-ciudad, sin límite de empleados ni documentos.

## Stack
- **Next.js 16** (App Router, Turbopack, Server Actions, TypeScript estricto)
- **Prisma 7** + driver adapter `@prisma/adapter-pg` (esquema en español, PK uuidv7)
- **PostgreSQL**: dev = embebido (`pnpm db:start`, puerto 54322); prod = Supabase
- **Better Auth** (sin auto-registro; usuarios creados por admin; cambio de contraseña forzado)
- **Tailwind v4 + shadcn/ui** (preset Nova), **react-hook-form + zod**, **sonner**
- Correo: **Resend** (driver `console` en dev). PDF: `@react-pdf/renderer`. Excel: `exceljs`.

## Comandos
- `pnpm db:start` — PostgreSQL embebido (dejar corriendo en otra terminal)
- `pnpm dev` — servidor de desarrollo (http://localhost:3000)
- `pnpm db:migrate` — crea/aplica migración; `pnpm db:seed` — siembra roles/sede/admin
- `pnpm build` — build de producción; `pnpm test` — vitest; `pnpm db:studio` — Prisma Studio

## Convenciones (ver docs/diseno/ para el diseño completo)
- **Modelo de datos en español** (PascalCase → snake_case). Excepción: tablas de Better Auth
  (`user`, `session`, `account`, `verification`).
- **Auditoría**: usar `dbAuditado` (de `src/lib/auditoria.ts`) para TODA mutación de negocio;
  `prisma` (de `src/lib/db.ts`) solo para lecturas y operaciones de auth.
- **Permisos**: toda Server Action se envuelve con `accion()` (de `src/server/accion.ts`), que
  valida permiso (RBAC), corre validación zod y fija el contexto de auditoría. Las páginas usan
  `requerirPermiso(modulo, accion)` (de `src/server/sesion.ts`).
- **Alcance de datos**: `filtroAlcance(usuario, alcance)` construye el `where` de Prisma según el
  alcance del permiso (TODAS_SEDES / SEDES_ASIGNADAS / EQUIPO / PROPIO).
- **Fechas de negocio**: `@db.Date` puro; nunca `new Date(string)` para fechas sin hora.
- **Datos de salud** (Ley 1581): solo accesibles con el permiso `colaboradores_salud`.
- Componentes server NO deben pasar funciones/íconos como props a componentes cliente: pasar
  datos serializables (p. ej. `hrefsVisibles`) y dejar que el cliente importe la config con íconos.

## Estructura
- `src/app/(app)/` — app autenticada (shell responsive: sidebar desktop, bottom-nav móvil)
- `src/app/(auth)/`, `/cambiar-password` — autenticación
- `src/server/` — código server-only (sesión, acciones, contexto, sede)
- `src/lib/` — utilidades compartidas (db, auth, auditoría, permisos, navegación, validaciones)
- `prisma/` — esquema, migraciones, seed
- `docs/diseno/` — diseño detallado (d1 modelo, d2 nómina, d3 alertas, d4 arquitectura, d5 síntesis)

El plan de fases vive en `docs/diseno/d0_plan.md`. Cada fase deja la app desplegable y verificable.
