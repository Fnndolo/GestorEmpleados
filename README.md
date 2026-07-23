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
pnpm db:seed                 # siembra roles, sede, empresa, catálogos, parámetros de nómina,
                             # obligaciones legales y el usuario administrador
pnpm db:seed:demo            # (opcional) datos de demostración: 10 colaboradores en 2 sedes
pnpm dev                     # arranca la app en http://localhost:3000
```

> En otra terminal puedes correr `pnpm test` (23 pruebas: días hábiles de Colombia y motor de
> nómina) y `pnpm db:studio` para inspeccionar la base de datos.

**Usuario administrador inicial** (creado por el seed):
- Correo y contraseña se definen con las variables `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`.
- Si no defines `SEED_ADMIN_PASSWORD`, el seed **genera una contraseña aleatoria y la imprime en
  consola** al crear el admin (solo en desarrollo). El sistema obliga a cambiarla en el primer ingreso.
- **En producción**: define siempre `SEED_ADMIN_PASSWORD` con una contraseña fuerte y única (ver `docs/DESPLIEGUE.md`).

En desarrollo, los correos (invitaciones, restablecimientos) se **imprimen en la consola** del
servidor en lugar de enviarse (`EMAIL_DRIVER=console`).

## Despliegue (producción)

1. **Base de datos y archivos — Supabase** (plan Pro: backups diarios + 100 GB Storage):
   - Crea el proyecto y un bucket privado llamado `documentos`.
   - En `.env`: `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
   - `DATABASE_URL` = pooler de Supabase con `?pgbouncer=true`; `DIRECT_URL` = conexión directa.
2. **App — Vercel** (plan Pro por los cron y tiempos de ejecución):
   - Importa el repo; define las variables de entorno (incluida `CRON_SECRET`).
   - Los dos cron (`vercel.json`) ya quedan configurados: calendario legal (10:30 UTC) y alertas
     de vencimiento (11:00 UTC ≈ 6:00 a.m. Bogotá).
3. **Correo — Resend**: `EMAIL_DRIVER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` con dominio verificado.
4. **Migrar y sembrar**: `pnpm db:deploy` y luego `pnpm db:seed`.
5. **WhatsApp** (opcional): la interfaz de mensajería está desacoplada; al activar, conecta una
   cuenta de WhatsApp Business API (Meta/Twilio).

Consulta `docs/diseno/d0_plan.md` para el plan completo, `docs/VERIFICACION.md` para el recorrido
requerimiento por requerimiento, y `CLAUDE.md` para las convenciones del código.

## Estado del desarrollo

Las **11 fases** están completas, cada una desplegable y verificada con build de producción:

1. Fundaciones (auth, RBAC, auditoría, shell responsive + PWA, administración)
2. Colaboradores, gestión documental, organigrama e importador Excel
3. Motor de vencimientos, notificaciones y cron de alertas (días hábiles de Colombia)
4. Contratación laboral, OPS y cuentas de cobro con verificación de seguridad social
5. Novedades, autoservicio, aprobaciones y certificaciones laborales PDF
6. Nómina colombiana (Ley 2466), desprendibles PDF y Resumen PILA — con golden tests
7. Terminaciones, liquidación definitiva y paz y salvo
8. Activos (actas PDF), dotación, capacitaciones y evaluación de desempeño
9. Jurídica y calendario de obligaciones legales
10. Seguridad y Salud en el Trabajo (SG-SST)
11. Módulos personalizados, reportes y dashboards

El recorrido requerimiento por requerimiento está en [docs/VERIFICACION.md](docs/VERIFICACION.md).
