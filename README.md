# Smart Gadgets · Gestión Humana, Jurídica y SST

Plataforma web (tipo app, instalable como PWA) para administrar el ciclo completo del personal de
**KUPOCELL S.A.S.** (nombre comercial *Smart Gadgets*) en tres frentes: **Recursos Humanos** (con
nómina colombiana), **Jurídica** y **Seguridad y Salud en el Trabajo**. Multi-sede / multi-ciudad,
sin límite de empleados ni de documentos, con base de datos real, auditoría total y un motor de
alertas de vencimiento transversal.

> Funciona igual de bien en computador y en celular. Se puede instalar en el teléfono como una app.

## Puesta en marcha (desarrollo)

Requisitos: Node 20+ y pnpm 9+.

```bash
pnpm install                 # instala dependencias
cp .env.example .env         # configura variables (los valores por defecto sirven para desarrollo)
pnpm db:start                # arranca PostgreSQL embebido (dejar esta terminal abierta)
pnpm db:migrate              # crea las tablas
pnpm db:seed                 # siembra roles, sede principal, empresa y usuario administrador
pnpm dev                     # arranca la app en http://localhost:3000
```

**Usuario administrador inicial** (creado por el seed):
- Correo: `michaelmartinez0996@gmail.com`
- Contraseña temporal: `Kupocell.2026*` (el sistema obliga a cambiarla en el primer ingreso)

En desarrollo, los correos (invitaciones, restablecimientos) se **imprimen en la consola** del
servidor en lugar de enviarse (`EMAIL_DRIVER=console`).

## Despliegue (producción)

- **Base de datos y archivos**: Supabase (PostgreSQL + Storage + backups diarios). Plan Pro
  recomendado. Usar el *pooler* en `DATABASE_URL` (con `?pgbouncer=true`) y la conexión directa en
  `DIRECT_URL`.
- **App**: Vercel (plan Pro por los cron jobs y los tiempos de ejecución).
- **Correo**: Resend (`EMAIL_DRIVER=resend`, `RESEND_API_KEY`, dominio verificado).
- Aplicar migraciones con `pnpm db:deploy` y sembrar con `pnpm db:seed`.

Consulta `docs/diseno/d0_plan.md` para el plan completo de fases y `CLAUDE.md` para las convenciones.

## Estado del desarrollo

El proyecto se construye en fases incrementales; cada fase deja la aplicación desplegable y
verificable. La **Fase 1** (fundaciones: autenticación, roles y permisos, auditoría, shell
responsive + PWA, gestión de usuarios/roles/sedes y configuración de empresa) está completa.
