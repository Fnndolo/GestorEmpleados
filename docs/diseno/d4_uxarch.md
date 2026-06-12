# Arquitectura de AplicaciÃ³n, Seguridad y Funcionalidades Transversales â€” Plataforma KUPOCELL S.A.S.

**Dominio cubierto:** estructura Next.js, autenticaciÃ³n/RBAC, auditorÃ­a, shell responsive + PWA, gestiÃ³n documental, generaciÃ³n PDF, importador Excel, mÃ³dulos personalizados, organigrama/tablas/formularios, flujos de aprobaciÃ³n.

---

## 1. Estructura de carpetas (Next.js 15 App Router)

```
src/
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ (auth)/                          # Layout mÃ­nimo, sin shell
â”‚   â”‚   â”œâ”€â”€ layout.tsx
â”‚   â”‚   â”œâ”€â”€ login/page.tsx
â”‚   â”‚   â”œâ”€â”€ activar-cuenta/page.tsx      # InvitaciÃ³n: establecer contraseÃ±a definitiva
â”‚   â”‚   â””â”€â”€ recuperar/page.tsx
â”‚   â”‚
â”‚   â”œâ”€â”€ (app)/                           # Layout con shell (sidebar/bottom-nav). Requiere sesiÃ³n.
â”‚   â”‚   â”œâ”€â”€ layout.tsx                   # <AppShell> + providers (SedeProvider, PermisosProvider)
â”‚   â”‚   â”œâ”€â”€ page.tsx                     # Inicio: dashboard por rol
â”‚   â”‚   â”‚
â”‚   â”‚   â”œâ”€â”€ personas/
â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx                 # Listado empleados (TanStack Table, filtro sede)
â”‚   â”‚   â”‚   â”œâ”€â”€ nuevo/page.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ importar/page.tsx        # Importador Excel (mÃ³dulo 7)
â”‚   â”‚   â”‚   â”œâ”€â”€ [id]/
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx             # Ficha: tabs (datos, salud*, educaciÃ³n, bancarios, docs, histÃ³rico)
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ documentos/page.tsx
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ editar/page.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ organigrama/page.tsx
â”‚   â”‚   â”‚   â””â”€â”€ areas-cargos/page.tsx
â”‚   â”‚   â”‚
â”‚   â”‚   â”œâ”€â”€ contratos/
â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx                 # PestaÃ±as: OPS / TÃ©rmino Fijo / Indefinido (searchParam ?tab=)
â”‚   â”‚   â”‚   â”œâ”€â”€ [id]/page.tsx            # Detalle + prÃ³rrogas/otrosÃ­ + docs firmados
â”‚   â”‚   â”‚   â”œâ”€â”€ ops/
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ [id]/page.tsx        # Objeto, valor, supervisor, entregables, RUT
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ cuentas-cobro/page.tsx  # Con verificaciÃ³n soporte SS
â”‚   â”‚   â”‚   â””â”€â”€ plantillas/page.tsx      # JurÃ­dica: plantillas por modalidad
â”‚   â”‚   â”‚
â”‚   â”‚   â”œâ”€â”€ nomina/
â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx                 # Periodos
â”‚   â”‚   â”‚   â”œâ”€â”€ [periodoId]/page.tsx     # LiquidaciÃ³n, desprendibles, PILA
â”‚   â”‚   â”‚   â”œâ”€â”€ conceptos/page.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ prestamos/page.tsx
â”‚   â”‚   â”‚   â””â”€â”€ liquidaciones/page.tsx   # LiquidaciÃ³n definitiva al retiro
â”‚   â”‚   â”‚
â”‚   â”‚   â”œâ”€â”€ novedades/
â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx                 # Bandeja unificada
â”‚   â”‚   â”‚   â”œâ”€â”€ incapacidades/page.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ permisos-licencias/page.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ vacaciones/page.tsx      # Causados vs pendientes, aprobaciones
â”‚   â”‚   â”‚   â”œâ”€â”€ bonificaciones/page.tsx  # Estado pago, constitutivo, soporte
â”‚   â”‚   â”‚   â””â”€â”€ variaciones-salariales/page.tsx
â”‚   â”‚   â”‚
â”‚   â”‚   â”œâ”€â”€ autoservicio/                # Visible para TODOS los roles
â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx                 # Mi resumen
â”‚   â”‚   â”‚   â”œâ”€â”€ solicitudes/page.tsx     # Vacaciones, permisos, certificados (mÃ³dulo 10)
â”‚   â”‚   â”‚   â”œâ”€â”€ solicitudes/nueva/page.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ desprendibles/page.tsx
â”‚   â”‚   â”‚   â””â”€â”€ mis-documentos/page.tsx
â”‚   â”‚   â”‚
â”‚   â”‚   â”œâ”€â”€ activos/
â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx                 # Inventario + asignaciones
â”‚   â”‚   â”‚   â”œâ”€â”€ [id]/page.tsx            # Actas entrega/devoluciÃ³n (PDF)
â”‚   â”‚   â”‚   â”œâ”€â”€ dotacion/page.tsx        # 3 entregas/aÃ±o con soporte
â”‚   â”‚   â”‚   â”œâ”€â”€ capacitaciones/page.tsx
â”‚   â”‚   â”‚   â””â”€â”€ evaluaciones/page.tsx
â”‚   â”‚   â”‚
â”‚   â”‚   â”œâ”€â”€ juridica/
â”‚   â”‚   â”‚   â”œâ”€â”€ repositorio/page.tsx     # Contratos firmados, polÃ­ticas con versiones
â”‚   â”‚   â”‚   â”œâ”€â”€ disciplinarios/
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ [id]/page.tsx        # CitaciÃ³nâ†’descargosâ†’decisiÃ³nâ†’recurso
â”‚   â”‚   â”‚   â”œâ”€â”€ obligaciones/            # Calendario legal
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx             # Vista calendario + lista
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ [id]/page.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ habeas-data/page.tsx     # Autorizaciones Ley 1581, consultas/reclamos
â”‚   â”‚   â”‚   â””â”€â”€ terminaciones/
â”‚   â”‚   â”‚       â”œâ”€â”€ page.tsx
â”‚   â”‚   â”‚       â””â”€â”€ [id]/page.tsx        # Checklist paz y salvo + actas + liquidaciÃ³n
â”‚   â”‚   â”‚
â”‚   â”‚   â”œâ”€â”€ sst/
â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx                 # Tablero: semÃ¡foro + indicadores
â”‚   â”‚   â”‚   â”œâ”€â”€ sg-sst/page.tsx          # PolÃ­tica, plan anual, autoevaluaciÃ³n, matriz legal
â”‚   â”‚   â”‚   â”œâ”€â”€ comites/page.tsx         # COPASST/VigÃ­a, Convivencia, actas
â”‚   â”‚   â”‚   â”œâ”€â”€ matriz-peligros/page.tsx # IPEVR por sede
â”‚   â”‚   â”‚   â”œâ”€â”€ examenes-medicos/page.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ accidentes/
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ [id]/page.tsx        # FURAT, investigaciÃ³n, seguimiento
â”‚   â”‚   â”‚   â””â”€â”€ epp/page.tsx
â”‚   â”‚   â”‚
â”‚   â”‚   â”œâ”€â”€ reportes/
â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx                 # CatÃ¡logo
â”‚   â”‚   â”‚   â””â”€â”€ [slug]/page.tsx          # Cada reporte: filtros + tabla + export
â”‚   â”‚   â”‚
â”‚   â”‚   â”œâ”€â”€ notificaciones/page.tsx      # Centro de notificaciones
â”‚   â”‚   â”œâ”€â”€ busqueda/page.tsx            # Resultados bÃºsqueda global (fallback sin JS)
â”‚   â”‚   â”‚
â”‚   â”‚   â”œâ”€â”€ m/[slug]/                    # MÃ“DULOS PERSONALIZADOS (mÃ³dulo 8)
â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx                 # Tabla dinÃ¡mica
â”‚   â”‚   â”‚   â”œâ”€â”€ nuevo/page.tsx           # Form dinÃ¡mico
â”‚   â”‚   â”‚   â””â”€â”€ [registroId]/page.tsx
â”‚   â”‚   â”‚
â”‚   â”‚   â””â”€â”€ configuracion/
â”‚   â”‚       â”œâ”€â”€ empresa/page.tsx         # Logo, NIT, datos para plantillas PDF
â”‚   â”‚       â”œâ”€â”€ sedes/page.tsx
â”‚   â”‚       â”œâ”€â”€ usuarios/page.tsx        # Crear usuario + invitaciÃ³n
â”‚   â”‚       â”œâ”€â”€ roles/page.tsx           # Matriz de permisos editable
â”‚   â”‚       â”œâ”€â”€ tipos-documento/page.tsx
â”‚   â”‚       â”œâ”€â”€ modulos/                 # Constructor de mÃ³dulos personalizados
â”‚   â”‚       â”‚   â”œâ”€â”€ page.tsx
â”‚   â”‚       â”‚   â””â”€â”€ [id]/page.tsx        # Editor de campos
â”‚   â”‚       â””â”€â”€ flujos/page.tsx          # Config niveles de aprobaciÃ³n por tipo
â”‚   â”‚
â”‚   â”œâ”€â”€ api/
â”‚   â”‚   â”œâ”€â”€ auth/[...all]/route.ts       # Handler Better Auth
â”‚   â”‚   â”œâ”€â”€ cron/
â”‚   â”‚   â”‚   â””â”€â”€ alertas/route.ts         # Vercel Cron diario (GET, valida CRON_SECRET)
â”‚   â”‚   â”œâ”€â”€ webhooks/resend/route.ts     # Bounces/entregas (opcional)
â”‚   â”‚   â””â”€â”€ documentos/[id]/route.ts     # Redirect 302 a URL firmada (con check de permiso)
â”‚   â”‚
â”‚   â”œâ”€â”€ manifest.ts                      # PWA manifest (Metadata API)
â”‚   â”œâ”€â”€ sw.ts                            # Service worker fuente (Serwist)
â”‚   â”œâ”€â”€ layout.tsx                       # Root: fuentes, <meta theme-color>, registro SW
â”‚   â””â”€â”€ globals.css
â”‚
â”œâ”€â”€ server/                              # TODO el cÃ³digo de servidor (no importable en cliente)
â”‚   â”œâ”€â”€ actions/                         # Server Actions por dominio ("use server")
â”‚   â”‚   â”œâ”€â”€ personas.ts, contratos.ts, nomina.ts, novedades.ts,
â”‚   â”‚   â”œâ”€â”€ solicitudes.ts, documentos.ts, activos.ts, juridica.ts,
â”‚   â”‚   â”œâ”€â”€ sst.ts, modulos-personalizados.ts, usuarios.ts, importador.ts
â”‚   â”œâ”€â”€ services/                        # LÃ³gica de negocio pura (testeable)
â”‚   â”‚   â”œâ”€â”€ alertas.service.ts           # Motor de vencimientos + dÃ­as hÃ¡biles CO
â”‚   â”‚   â”œâ”€â”€ pdf/                         # Plantillas @react-pdf (mÃ³dulo 6)
â”‚   â”‚   â”‚   â”œâ”€â”€ base/Membrete.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ desprendible.tsx, certificacion-laboral.tsx,
â”‚   â”‚   â”‚   â”œâ”€â”€ acta-entrega-activo.tsx, paz-y-salvo.tsx, acta-disciplinario.tsx
â”‚   â”‚   â”œâ”€â”€ storage.service.ts           # Supabase Storage (URLs firmadas)
â”‚   â”‚   â”œâ”€â”€ excel.service.ts             # Plantillas + parseo + validaciÃ³n
â”‚   â”‚   â””â”€â”€ notificaciones/              
â”‚   â”‚       â”œâ”€â”€ index.ts                 # dispatcher (in-app + email + whatsapp?)
â”‚   â”‚       â”œâ”€â”€ email.provider.ts        # Resend
â”‚   â”‚       â””â”€â”€ whatsapp.provider.ts     # Interfaz NotificationChannel (stub, preparado)
â”‚   â”œâ”€â”€ auth.ts                          # Instancia Better Auth
â”‚   â”œâ”€â”€ db.ts                            # PrismaClient + extensiÃ³n de auditorÃ­a
â”‚   â”œâ”€â”€ audit.ts                         # ExtensiÃ³n Prisma + AsyncLocalStorage (mÃ³dulo 3)
â”‚   â”œâ”€â”€ permissions.ts                   # requirePermission, getScope, getNavForUser
â”‚   â””â”€â”€ context.ts                       # withActionContext (usuario actual, sede, IP)
â”‚
â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ ui/                              # shadcn/ui generados
â”‚   â”œâ”€â”€ shell/                           # AppShell, Sidebar, BottomNav, DrawerMenu,
â”‚   â”‚   â”‚                                # SedeSelector, GlobalSearch, NotificationBell, UserMenu
â”‚   â”œâ”€â”€ documentos/                      # DocumentUploader, DocumentList, DocumentViewer
â”‚   â”œâ”€â”€ tablas/DataTable.tsx             # Wrapper TanStack Table (paginaciÃ³n servidor + export)
â”‚   â”œâ”€â”€ formularios/                     # FormField wrappers RHF+zod, DatePicker es-CO, MoneyInput
â”‚   â”œâ”€â”€ dynamic/                         # DynamicForm, DynamicTable (mÃ³dulos personalizados)
â”‚   â”œâ”€â”€ charts/                          # Wrappers Recharts (client components)
â”‚   â””â”€â”€ organigrama/OrgChart.tsx         # d3-org-chart (client)
â”‚
â”œâ”€â”€ lib/                                 # Compartido cliente+servidor
â”‚   â”œâ”€â”€ validators/                      # Schemas zod por entidad (reutilizados en form + import + action)
â”‚   â”œâ”€â”€ permissions-def.ts               # Constantes de mÃ³dulos/acciones (tipado)
â”‚   â”œâ”€â”€ dias-habiles.ts                  # Festivos Colombia (Ley 51/1983) + addBusinessDays
â”‚   â”œâ”€â”€ nav-config.ts                    # DefiniciÃ³n del menÃº (mÃ³duloâ†’secciÃ³nâ†’permiso requerido)
â”‚   â””â”€â”€ utils.ts
â”‚
â”œâ”€â”€ middleware.ts                        # Solo verificaciÃ³n de cookie de sesiÃ³n + redirect a /login
â”œâ”€â”€ prisma/
â”‚   â”œâ”€â”€ schema.prisma
â”‚   â””â”€â”€ seed.ts                          # 7 roles, matriz de permisos, tipos de documento, obligaciones legales precargadas
â”œâ”€â”€ public/icons/                        # PWA icons 192/512 + maskable
â””â”€â”€ vercel.json                          # crons: [{ path: "/api/cron/alertas", schedule: "0 11 * * *" }]  # 06:00 BogotÃ¡
```

**Convenciones clave:**
- Las pÃ¡ginas son Server Components que llaman `services/` directamente; las mutaciones SIEMPRE pasan por `server/actions/*` envueltas en `withActionContext` (ver Â§3).
- `middleware.ts` solo valida existencia de sesiÃ³n (rÃ¡pido, edge). La autorizaciÃ³n real ocurre en cada page/action (defensa en profundidad).
- Vercel Cron: un solo job diario `0 11 * * *` UTC (= 06:00 America/Bogota) que ejecuta todo el escaneo de vencimientos.

---

## 2. AutenticaciÃ³n y autorizaciÃ³n

### 2.1 RecomendaciÃ³n: **Better Auth** (no Supabase Auth)

| Criterio | Supabase Auth | Better Auth |
|---|---|---|
| Usuarios en el schema Prisma | No â€” viven en `auth.users` (schema aparte, no gestionado por Prisma; requiere sincronizaciÃ³n por trigger o tabla espejo) | SÃ­ â€” modelos `User/Session/Account` en `schema.prisma`, FKs directas a `Empleado`, auditables con la misma extensiÃ³n |
| CreaciÃ³n por admin sin auto-registro | Posible (`admin.createUser` con service key) pero el flujo de invitaciÃ³n estÃ¡ pensado para magic-link de Supabase | **Plugin `admin`**: `auth.api.createUser()`, ban/unban, revocar sesiones; `disableSignUp: true` desactiva el registro pÃºblico |
| Server-first / Server Actions | SDK orientado a cliente; en server requiere `@supabase/ssr` y gestiÃ³n de cookies propia | Cookies de sesiÃ³n nativas, `auth.api.getSession({ headers })` en RSC/actions; diseÃ±ado para Next.js |
| RLS de Postgres | Su gran ventaja â€” pero **no la usamos**: todo acceso pasa por Prisma con conexiÃ³n privilegiada | N/A (autorizamos en capa de aplicaciÃ³n) |
| Lock-in | Usuarios atados al proyecto Supabase | Portable: solo tablas en tu Postgres |

**DecisiÃ³n: Better Auth** con adaptador Prisma, plugin `admin`, `emailAndPassword` habilitado y `signUp` deshabilitado. Supabase queda como Postgres + Storage Ãºnicamente (mÃ¡s simple: una sola fuente de verdad de usuarios, auditorÃ­a uniforme, sin sincronizar `auth.users`).

```ts
// server/auth.ts
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,                  // nadie se auto-registra
    sendResetPassword: async ({ user, url }) => resend.emails.send({...}),
  },
  plugins: [admin(), nextCookies()],
  session: { expiresIn: 60*60*24*7, updateAge: 60*60*24 },
});
```

**Flujo de invitaciÃ³n (admin crea usuario):**
1. Admin/RRHH en `/configuracion/usuarios` crea usuario: correo, rol, vÃ­nculo a `Empleado` (FK `empleadoId` en `User`).
2. Server action: `auth.api.createUser({ email, password: passwordTemporal })` con contraseÃ±a aleatoria (`crypto.randomBytes`) + flag `debeCambiarPassword: true` (campo adicional vÃ­a `user.additionalFields`).
3. Resend envÃ­a correo con la contraseÃ±a inicial + link a `/login`.
4. Al iniciar sesiÃ³n, si `debeCambiarPassword`, redirect forzado a `/activar-cuenta` (cambio obligatorio antes de navegar). Se valida en el layout `(app)`.

### 2.2 RBAC con matriz en BD

**Modelos Prisma:**

```prisma
model Rol {
  id        String  @id @default(cuid())
  clave     String  @unique   // "admin" | "subgerencia" | "rrhh" | "nomina" | "contador" | "jefe_area" | "empleado"
  nombre    String
  esSistema Boolean @default(false)  // los 7 del seed no se borran
  permisos  RolPermiso[]
  usuarios  User[]
}

model RolPermiso {
  id      String @id @default(cuid())
  rolId   String
  modulo  String   // "personas" | "contratos" | "nomina" | ... | "custom:{slug}"
  accion  String   // "ver" | "crear" | "editar" | "eliminar" | "aprobar" | "exportar"
  alcance Alcance @default(TODOS)  // TODOS | SEDE | EQUIPO | PROPIO
  rol     Rol @relation(fields: [rolId], references: [id])
  @@unique([rolId, modulo, accion])
}
enum Alcance { TODOS SEDE EQUIPO PROPIO }
```

**Seed de los 7 roles (resumen de la matriz):**

| MÃ³dulo | Admin | Subgerencia | RRHH | NÃ³mina | Contador | Jefe de Ã¡rea | Empleado |
|---|---|---|---|---|---|---|---|
| personas | CRUD | ver | CRUD | ver | ver | ver (EQUIPO) | ver (PROPIO) |
| personas.salud | CRUD | â€” | CRUD | â€” | â€” | â€” | ver (PROPIO) |
| contratos | CRUD | ver | CRUD | ver | ver | â€” | ver (PROPIO) |
| nomina | CRUD | ver | ver | CRUD | ver | â€” | desprendibles (PROPIO) |
| novedades | CRUD | ver+aprobar | CRUD+aprobar | ver | ver | ver (EQUIPO) | ver (PROPIO) |
| solicitudes (autoservicio) | CRUD | aprobar | aprobar | â€” | â€” | aprobar (EQUIPO) | crear (PROPIO) |
| activos | CRUD | ver | CRUD | â€” | ver | ver (EQUIPO) | ver (PROPIO) |
| juridica | CRUD | ver | CRUD | â€” | ver | â€” | â€” |
| sst | CRUD | ver | CRUD | â€” | â€” | ver (EQUIPO) | ver (PROPIO: exÃ¡menes/EPP) |
| reportes | todos | todos | todos | nÃ³mina | financieros | su equipo | â€” |
| configuracion | CRUD | â€” | usuarios/tipos-doc | â€” | â€” | â€” | â€” |

**VerificaciÃ³n en server actions** (obligatoria, primera lÃ­nea de cada action):

```ts
// server/permissions.ts
export async function requirePermission(modulo: string, accion: Accion) {
  const ctx = getActionContext();              // AsyncLocalStorage, ver Â§3
  const permiso = ctx.permisos.find(p => p.modulo === modulo && p.accion === accion);
  if (!permiso) throw new ForbiddenError(`${modulo}.${accion}`);
  return permiso; // incluye .alcance para filtrar queries
}

export function scopeWhere(permiso: RolPermiso, ctx: ActionContext): Prisma.EmpleadoWhereInput {
  switch (permiso.alcance) {
    case "TODOS":  return ctx.sedeId ? { sedeId: ctx.sedeId } : {};
    case "SEDE":   return { sedeId: ctx.sedeId ?? ctx.user.sedeId };
    case "EQUIPO": return { jefeInmediatoId: ctx.user.empleadoId };  // Jefe de Ã¡rea: solo su equipo
    case "PROPIO": return { id: ctx.user.empleadoId };
  }
}
```

Los permisos del usuario se cargan una vez por request (cacheados con `React.cache()` por render) y se pasan al cliente solo como lista de claves `modulo.accion` para el filtrado de navegaciÃ³n â€” **nunca se confÃ­a en el cliente**: cada page RSC y cada action re-verifica en servidor.

**Datos sensibles de salud (Ley 1581) â€” separaciÃ³n estructural:** la informaciÃ³n mÃ©dica vive en un modelo aparte `EmpleadoSalud` (EPS, ARL, fondo pensiÃ³n, caja, restricciones, exÃ¡menes) 1:1 con `Empleado`. AsÃ­ la restricciÃ³n no depende de omitir campos en cada `select`: simplemente no se hace `include: { salud: true }` sin `requirePermission("personas.salud", "ver")`. Los documentos marcados `sensible: true` (tipo "examen mÃ©dico", "incapacidad") aplican el mismo permiso al generar URL firmada (Â§5). El tab "Salud" de la ficha solo se renderiza para Admin/RRHH (y el propio empleado en su autoservicio).

---

## 3. AuditorÃ­a automÃ¡tica (Prisma Client Extension)

**Tabla:**

```prisma
model AuditLog {
  id        BigInt   @id @default(autoincrement())
  tabla     String
  registroId String
  accion    String   // CREATE | UPDATE | DELETE
  userId    String?
  diff      Json?    // { campo: { antes, despues } } â€” solo campos que cambiaron
  snapshot  Json?    // registro completo en DELETE
  ip        String?
  creadoEn  DateTime @default(now())
  @@index([tabla, registroId])
  @@index([userId, creadoEn])
}
```

**PatrÃ³n: AsyncLocalStorage + `$extends` sobre `$allModels`** â€” sin tocar ninguna mutaciÃ³n a mano:

```ts
// server/context.ts
const als = new AsyncLocalStorage<ActionContext>();
export const getActionContext = () => als.getStore() ?? throwUnauthenticated();

export function withActionContext<T extends (...a: any[]) => any>(fn: T): T {
  return (async (...args) => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) redirect("/login");
    const ctx = await buildContext(session); // user + permisos + sedeId (cookie) + ip
    return als.run(ctx, () => fn(...args));
  }) as T;
}
// Uso: export const crearEmpleado = withActionContext(async (input) => { ... });

// server/audit.ts
const EXCLUIR = new Set(["AuditLog", "Session", "Verification", "Notificacion"]);

export const auditExtension = Prisma.defineExtension({
  query: {
    $allModels: {
      async create({ model, args, query }) {
        const res = await query(args);
        if (!EXCLUIR.has(model)) log(model, res.id, "CREATE", { despues: res });
        return res;
      },
      async update({ model, args, query }) {
        let antes: any = null;
        if (!EXCLUIR.has(model))
          antes = await basePrisma[lc(model)].findUnique({ where: args.where });
        const res = await query(args);
        if (antes) log(model, res.id, "UPDATE", diff(antes, res)); // solo campos cambiados
        return res;
      },
      async delete({ model, args, query }) {
        const antes = EXCLUIR.has(model) ? null
          : await basePrisma[lc(model)].findUnique({ where: args.where });
        const res = await query(args);
        if (antes) log(model, antes.id, "DELETE", null, antes); // snapshot completo
        return res;
      },
      // updateMany/deleteMany: registrar args.where + count (sin diff por fila)
    },
  },
});

function log(tabla, registroId, accion, diff, snapshot?) {
  const ctx = als.getStore();  // puede ser null en seed/cron â†’ userId "system"
  // fire-and-forget con basePrisma (cliente SIN extensiÃ³n, evita recursiÃ³n)
  void basePrisma.auditLog.create({ data: { tabla, registroId: String(registroId),
    accion, userId: ctx?.user.id ?? null, diff, snapshot, ip: ctx?.ip }});
}

function diff(a, b) {
  const out: Record<string, {antes: unknown, despues: unknown}> = {};
  for (const k of Object.keys(b)) {
    if (k === "actualizadoEn") continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = { antes: a[k], despues: b[k] };
  }
  return out;
}

// server/db.ts
export const basePrisma = new PrismaClient();
export const prisma = basePrisma.$extends(auditExtension);
```

**Notas de implementaciÃ³n:**
- El cron y el seed ejecutan `als.run({ user: SYSTEM_USER }, ...)` para que la auditorÃ­a registre "Sistema".
- Campos sensibles (`password`, datos de `EmpleadoSalud`) se redactan en el diff: `{ antes: "[REDACTADO]", despues: "[REDACTADO]" }` con una lista `CAMPOS_REDACTADOS` por modelo â€” queda constancia de QUE cambiÃ³, no del valor.
- UI: tab "Historial" en cada detalle (`AuditLog where tabla+registroId`) visible para Admin/RRHH, y vista global en `/configuracion` (requisito de JurÃ­dica: control de versiones/auditorÃ­a).

---

## 4. Shell responsive tipo app + PWA

### 4.1 Componentes del shell (`components/shell/`)

- **Desktop (â‰¥1024px):** `Sidebar` de shadcn/ui (componente `sidebar-07`, colapsable a iconos con tooltip, estado persistido en cookie `sidebar:state`). Header fijo: `SedeSelector` + `GlobalSearch` + `NotificationBell` (badge no leÃ­das, popover) + `UserMenu`.
- **MÃ³vil (<1024px):** 
  - `BottomNav` fija con 5 Ã­tems: **Inicio Â· Personas Â· Solicitudes Â· Alertas Â· MÃ¡s** (los 4 primeros varÃ­an por rol â€” para rol Empleado: Inicio Â· Mis solicitudes Â· Mis documentos Â· Alertas Â· MÃ¡s).
  - "MÃ¡s" abre un **drawer** (Vaul, ya integrado en shadcn `Drawer`) con el menÃº completo agrupado por secciones.
  - Header mÃ³vil compacto: logo + sede activa + lupa (abre bÃºsqueda fullscreen) + campana.
  - `viewport-fit=cover` + `env(safe-area-inset-bottom)` en la bottom nav (iOS instalada).

### 4.2 Selector global de sede/ciudad

- Estado en **cookie `sede-activa`** (`sedeId` o `"todas"`), leÃ­da en servidor: todos los services aplican `where: { sedeId }` vÃ­a `scopeWhere` (Â§2.2). Cambiarla ejecuta una server action que setea la cookie + `revalidatePath("/")` â†’ todo el Ã¡rbol RSC se re-renderiza filtrado.
- Opciones del selector limitadas a las sedes que el rol puede ver (Jefe de Ã¡rea/Empleado: solo la suya, selector deshabilitado).
- Persistencia entre dispositivos: ademÃ¡s se guarda como `User.preferencias.sedeDefecto`.

### 4.3 BÃºsqueda global de empleados

- `GlobalSearch` con **cmdk** (shadcn `Command` + `CommandDialog`), atajo `Ctrl/Cmd+K` y botÃ³n visible.
- Server action `buscarGlobal(q)` con debounce 250ms: busca en `Empleado` (nombre, documento, cargo) usando Ã­ndice `pg_trgm` (`unaccent(nombre_completo) ILIKE`), respetando alcance del rol (Jefe solo su equipo). Devuelve mÃ¡x. 10 resultados con foto, cargo, sede â†’ navega a la ficha. Secundario: resultados de contratos por nÃºmero y mÃ³dulos personalizados.

### 4.4 PWA con Serwist

`@serwist/next` (sucesor mantenido de next-pwa, soporta App Router):

```ts
// next.config.ts
export default withSerwistInit({ swSrc: "src/app/sw.ts", swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development" })(nextConfig);
```

- **`app/manifest.ts`:** `name: "KUPOCELL GestiÃ³n Humana"`, `short_name: "KUPOCELL"`, `display: "standalone"`, `start_url: "/"`, `theme_color`/`background_color` corporativos, iconos 192/512 + `purpose: "maskable"`, `lang: "es-CO"`.
- **Estrategias de cachÃ© (`app/sw.ts`):**

| Recurso | Estrategia | RazÃ³n |
|---|---|---|
| `/_next/static/*`, fuentes, CSS/JS | Precache + CacheFirst | Shell instantÃ¡neo |
| Iconos, logo, imÃ¡genes pÃºblicas | StaleWhileRevalidate | |
| Navegaciones HTML (RSC) | **NetworkOnly** + fallback a `/offline` precacheada | Las pÃ¡ginas contienen datos personales â†’ **no se cachean** |
| `POST` (Server Actions), `/api/*` | **NetworkOnly** (sin handler = passthrough) | Mutaciones nunca offline |
| URLs firmadas de Storage (`*.supabase.co/storage/*`) | **NetworkOnly** | Documentos sensibles jamÃ¡s en Cache Storage |
| Fotos de perfil | NetworkOnly (o CacheFirst con maxAge 1h **solo si** se acepta el riesgo; por Ley 1581, default NetworkOnly) | |

- PÃ¡gina `/offline` estÃ¡tica precacheada ("Sin conexiÃ³n â€” la app requiere internet para mostrar datos").
- Prompt de instalaciÃ³n: componente `InstallPrompt` que captura `beforeinstallprompt` (Android/desktop) y muestra instrucciones "Compartir â†’ AÃ±adir a inicio" en iOS.

### 4.5 NavegaciÃ³n completa (secciones Ã— rol)

Definida en `lib/nav-config.ts`: cada Ã­tem declara `{ titulo, href, icono, permiso: "modulo.ver" }`; `getNavForUser()` filtra por los permisos cargados, y los mÃ³dulos personalizados se inyectan dinÃ¡micamente en su secciÃ³n con permiso `custom:{slug}.ver`.

| SecciÃ³n | MÃ³dulos | Visible para |
|---|---|---|
| **Inicio** | Dashboard por rol, Notificaciones | Todos |
| **Personas** | Empleados, Organigrama, Ãreas y cargos, Importar | Admin, Subg., RRHH, NÃ³mina(ver), Contador(ver), Jefe(equipo) |
| **Contratos** | Laborales (Fijo/Indefinido), OPS + cuentas de cobro, Plantillas | Admin, Subg., RRHH, NÃ³mina(ver), Contador(ver) |
| **NÃ³mina** | Periodos, Conceptos, PrÃ©stamos, Liquidaciones, PILA | Admin, NÃ³mina, Contador(ver), Subg.(ver) |
| **Novedades** | Incapacidades, Permisos/licencias, Vacaciones, Bonificaciones, Variaciones | Admin, RRHH, Subg., NÃ³mina(ver), Jefe(equipo) |
| **Autoservicio** | Mis solicitudes, Mis desprendibles, Mis documentos | **Todos** (es el mÃ³dulo del rol Empleado) |
| **Activos y desarrollo** | Activos, DotaciÃ³n, Capacitaciones, Evaluaciones | Admin, RRHH, Subg., Jefe(equipo) |
| **JurÃ­dica** | Repositorio, Disciplinarios, Obligaciones legales, Habeas data, Terminaciones | Admin, RRHH, Subg.(ver), Contador(obligaciones tributarias) |
| **SST** | Tablero, SG-SST, ComitÃ©s, Matriz peligros, ExÃ¡menes, Accidentes, EPP | Admin, RRHH, Subg.(ver), Jefe(equipo parcial) |
| **Reportes** | CatÃ¡logo segÃºn rol | Admin, Subg., RRHH, NÃ³mina, Contador, Jefe |
| **ConfiguraciÃ³n** | Empresa, Sedes, Usuarios, Roles, Tipos doc., MÃ³dulos, Flujos | Admin (RRHH: usuarios y tipos doc.) |

---

## 5. GestiÃ³n documental (Supabase Storage)

**Modelos:**

```prisma
model TipoDocumento {
  id                 String  @id @default(cuid())
  nombre             String           // "CÃ©dula", "Examen mÃ©dico ingreso", "RUT", ...
  modulo             String           // a quÃ© entidad aplica
  requiereVencimiento Boolean @default(false)
  diasAlertaPrimera  Int?             // override del default 10 hÃ¡biles
  sensible           Boolean @default(false)  // salud â†’ permiso personas.salud
  activo             Boolean @default(true)
}

model Documento {
  id           String   @id @default(cuid())
  entidadTipo  String   // "empleado" | "contrato" | "activo" | "disciplinario" | "obligacion" | "custom:{slug}" ...
  entidadId    String
  tipoId       String
  nombre       String
  rutaStorage  String   // bucket privado "documentos": {entidadTipo}/{entidadId}/{id}-{slug(nombre)}.{ext}
  mimeType     String
  tamanoBytes  Int
  fechaVencimiento DateTime?   // alimenta el motor de alertas transversal
  version      Int      @default(1)   // control de versiones (polÃ­ticas jurÃ­dicas)
  subidoPorId  String
  creadoEn     DateTime @default(now())
  @@index([entidadTipo, entidadId])
  @@index([fechaVencimiento])
}
```

**Subida (evita el lÃ­mite de 4.5 MB del body en Vercel):**
1. Cliente pide a la server action `iniciarSubida({ entidadTipo, entidadId, tipoId, nombreArchivo })` â†’ verifica permiso â†’ `supabase.storage.from("documentos").createSignedUploadUrl(ruta)` (service key, solo en servidor).
2. Cliente sube **directo a Storage** con `uploadToSignedUrl` (con barra de progreso).
3. Cliente confirma con `confirmarSubida(documentoId, { fechaVencimiento? })` â†’ se crea el registro `Documento` (auditado automÃ¡ticamente). Si el tipo `requiereVencimiento`, la fecha es obligatoria en el form.

**UX de captura:**
- Desktop: `react-dropzone` (drag-drop multiarchivo, acepta `application/pdf,image/*`, sin lÃ­mite de cantidad; lÃ­mite por archivo 25 MB configurable).
- MÃ³vil: el mismo componente renderiza dos botones â€” "Tomar foto" (`<input type="file" accept="image/*" capture="environment">`) y "Elegir archivo" (galerÃ­a/archivos). CompresiÃ³n de imÃ¡genes en cliente con `browser-image-compression` (a ~1600px / 80%) antes de subir.

**VisualizaciÃ³n:**
- Bucket **privado**. Lectura siempre vÃ­a `obtenerUrlFirmada(documentoId)` (server action): verifica permiso sobre la entidad (+ `sensible` â†’ `personas.salud.ver`) â†’ `createSignedUrl(ruta, 600)` (10 min).
- `DocumentViewer` (Dialog/Sheet fullscreen en mÃ³vil): imÃ¡genes con `<img>`; PDF embebido con `<iframe src={signedUrl}>` en desktop y **`react-pdf` (pdf.js)** en mÃ³vil (iOS no renderiza PDFs multipÃ¡gina en iframe). Botones descargar / abrir en pestaÃ±a.
- Ruta `app/api/documentos/[id]/route.ts` hace check de sesiÃ³n+permiso y `302` a la URL firmada â€” permite enlaces estables en correos de alerta.

---

## 6. GeneraciÃ³n de PDF

**RecomendaciÃ³n: `@react-pdf/renderer`** (en route handlers / actions con `export const runtime = "nodejs"`).

- vs **Puppeteer/Chromium en Vercel**: requiere `@sparticuz/chromium`, ~50 MB, cold starts de varios segundos y lÃ­mites de tamaÃ±o de funciÃ³n â€” excesivo para documentos de 1-3 pÃ¡ginas.
- vs **pdf-lib**: posicionamiento manual de cada texto (sin layout/flujo); inviable para mantener 6+ plantillas. Se usa **pdf-lib como complemento** puntual: unir PDFs (expediente completo del empleado) o estampar numeraciÃ³n.
- `@react-pdf/renderer` corre en Node serverless sin binarios, las plantillas son componentes React con estilos flexbox â€” el mismo equipo que hace la UI mantiene las plantillas.

**Arquitectura de plantillas (`server/services/pdf/`):**

```tsx
// base/Membrete.tsx â€” usado por todas las plantillas
<Page size="LETTER" style={s.page}>
  <View style={s.header} fixed>
    <Image src={empresa.logoBuffer} style={s.logo} />   {/* logo desde Storage, cacheado */}
    <Text>{empresa.razonSocial} â€” NIT {empresa.nit}</Text>
  </View>
  {children}
  <View style={s.footer} fixed>
    <Text>{empresa.direccion} Â· {empresa.ciudad} Â· Generado el {fecha} por la plataforma</Text>
    <Text render={({pageNumber, totalPages}) => `${pageNumber}/${totalPages}`} />
  </View>
</Page>
```

Plantillas: `desprendible.tsx` (tabla devengados/deducciones/neto), `certificacion-laboral.tsx` (variante por tipo: simple/con salario/con funciones/entidad financiera, campo "dirigida a"), `acta-entrega-activo.tsx` y `acta-devolucion`, `paz-y-salvo.tsx` (checklist por Ã¡rea con firmas), `acta-disciplinario.tsx` (citaciÃ³n/descargos/decisiÃ³n). Fuente registrada (`Font.register`, p. ej. Inter) para tildes/Ã± correctas.

**Flujo:** server action `generarPdf(tipo, datos)` â†’ `renderToBuffer(<Plantilla {...}/>)` â†’ sube a Storage (`documentos/{entidad}/{id}/...`) â†’ crea registro `Documento` â†’ devuelve URL firmada. **Todo PDF generado queda guardado** (requisito: certificaciones con "PDF guardado", actas como soporte).

---

## 7. Importador masivo Excel/CSV

**LibrerÃ­a:** **SheetJS (`xlsx`)** instalada desde el registro oficial `https://cdn.sheetjs.com` (la versiÃ³n publicada en npm estÃ¡ congelada en 0.18.5 con CVEs conocidos; en `package.json`: `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.x/xlsx-0.20.x.tgz"`). Si se prefiere dependencia 100% npm: `exceljs` (lectura xlsx + escritura con estilos). SheetJS ademÃ¡s lee CSV con el mismo API.

**Flujo (`/personas/importar`, wizard de 4 pasos):**

1. **Descargar plantilla**: server action genera el `.xlsx` con: hoja "Empleados" (encabezados exactos + 1 fila de ejemplo), hoja "Valores vÃ¡lidos" (sedes, Ã¡reas, cargos, EPS/ARL/fondos, tipos de vÃ­nculo â€” con validaciÃ³n de datos por lista cuando la librerÃ­a lo permite) y hoja "Instrucciones" (formatos de fecha `DD/MM/AAAA`, obligatorios marcados con *).
2. **Subir**: dropzone acepta `.xlsx/.csv`; se parsea **en el cliente** (`XLSX.read` en un worker, sin pasar por el servidor todavÃ­a) â†’ array de filas.
3. **Validar con vista previa**: las filas se envÃ­an a la action `validarImportacion(filas)` que aplica **el mismo schema zod del formulario de empleado** (`lib/validators/empleado.ts`, garantiza consistencia) + validaciones de BD (documento duplicado, sede/cargo existente, jefe inmediato referenciado existe en BD o en el propio archivo). Respuesta: `{ filasValidas, errores: [{ fila, columna, mensaje }] }`. UI: DataTable con celdas errÃ³neas en rojo + tooltip, contador "120 vÃ¡lidas / 7 con error", botÃ³n "descargar reporte de errores (.xlsx)". Opciones: "corregir y volver a subir" o "importar solo las vÃ¡lidas".
4. **Confirmar**: action `ejecutarImportacion` inserta en lotes de 100 dentro de transacciones (`prisma.$transaction`), bajo `withActionContext` (â†’ auditorÃ­a registra al importador). Crea registro `ImportJob { archivo, totalFilas, insertadas, conError, userId }` y muestra resumen final.

El mismo patrÃ³n se reutiliza para otros importadores futuros (activos, obligaciones) parametrizando schema + mapeo.

---

## 8. MÃ³dulos personalizados por el administrador

**Modelos:**

```prisma
model ModuloPersonalizado {
  id        String @id @default(cuid())
  nombre    String
  slug      String @unique          // genera la ruta /m/{slug} y el permiso "custom:{slug}"
  icono     String                  // nombre de icono lucide ("FileBadge", "Truck"...)
  seccion   String                  // secciÃ³n del menÃº donde se cuelga ("juridica", "sst", "personas", ...)
  vinculo   VinculoModulo @default(GLOBAL)  // GLOBAL | POR_EMPLEADO | POR_SEDE
  activo    Boolean @default(true)
  campos    CampoModulo[]
}

model CampoModulo {
  id        String @id @default(cuid())
  moduloId  String
  etiqueta  String
  clave     String                  // snake_case, clave en el JSON
  tipo      TipoCampo               // TEXTO | NUMERO | FECHA | FECHA_VENCIMIENTO | SELECCION | ARCHIVO | BOOLEANO
  opciones  Json?                   // ["OpciÃ³n A","OpciÃ³n B"] para SELECCION
  requerido Boolean @default(false)
  orden     Int
  mostrarEnTabla Boolean @default(true)
  @@unique([moduloId, clave])
}

model RegistroModulo {
  id         String @id @default(cuid())
  moduloId   String
  empleadoId String?                // si vinculo = POR_EMPLEADO
  sedeId     String?
  datos      Json                   // { clave: valor } â€” ARCHIVO guarda documentoId
  creadoEn   DateTime @default(now())
  actualizadoEn DateTime @updatedAt
  @@index([moduloId, sedeId])
}
```

**UX del constructor (`/configuracion/modulos`):**
1. Paso 1 â€” Generales: nombre, icono (grid buscable de iconos lucide), secciÃ³n del menÃº (select de las 11 secciones), vÃ­nculo (global / por empleado / por sede).
2. Paso 2 â€” Campos: lista reordenable con **dnd-kit**; "Agregar campo" abre popover: etiqueta, tipo (los 7), requerido, opciones (editor de lista para selecciÃ³n), "mostrar en tabla". El tipo **fecha con vencimiento** muestra aviso: "este campo generarÃ¡ alertas automÃ¡ticas 10 dÃ­as hÃ¡biles y 3 dÃ­as antes".
3. Paso 3 â€” Permisos: mini-matriz rol Ã— acciÃ³n (ver/crear/editar/eliminar) con checkboxes â†’ inserta filas `RolPermiso` con `modulo = "custom:{slug}"`. Por defecto solo Admin.
4. Publicar â†’ aparece en el menÃº de los roles autorizados sin deploy (nav se construye en runtime, Â§4.5).

**Renderizado dinÃ¡mico:**
- `DynamicForm`: construye el schema zod en runtime (`buildZodSchema(campos)`: TEXTOâ†’`z.string()`, NUMEROâ†’`z.coerce.number()`, FECHA/FECHA_VENCIMIENTOâ†’`z.coerce.date()`, SELECCIONâ†’`z.enum(opciones)`, BOOLEANOâ†’`z.boolean()`, ARCHIVOâ†’`z.string().cuid()` con el `DocumentUploader` de Â§5 apuntando a `entidadTipo: "custom:{slug}"`) y mapea cada tipo a su componente (Input, NumberInput, DatePicker, Select, Switch, Uploader). Mismo `react-hook-form` + `zodResolver` que el resto de la app.
- `DynamicTable`: columnas generadas desde `campos.filter(mostrarEnTabla)` sobre el `DataTable` genÃ©rico (filtro por sede, paginaciÃ³n servidor con filtros sobre `datos` vÃ­a operadores JSONB de Prisma, export).
- **Alertas**: al guardar un registro con campos `FECHA_VENCIMIENTO`, la action sincroniza filas en la tabla transversal `Vencimiento { origenTipo: "custom:{slug}", origenId, campoClave, fecha }` que el cron de alertas escanea junto con contratos, exÃ¡menes, documentos y obligaciones â€” un solo motor para toda la app.

---

## 9. Organigrama, tableros, tablas y formularios

- **Organigrama:** **`d3-org-chart`** (mantenida, interactiva: pan/zoom, colapsar ramas, fit-to-screen, export a imagen) envuelta en client component `OrgChart.tsx` con `"use client"` + `useRef`; datos `{ id, parentId: jefeInmediatoId, nombre, cargo, foto, sede }` desde RSC. Nodos custom con HTML (foto + cargo + contador de equipo); clic â†’ ficha del empleado. Alternativa descartada: `react-organizational-chart` (solo CSS estÃ¡tico, sin pan/zoom â€” insuficiente para decenas de empleados en mÃ³vil).
- **Tableros:** Recharts en client components con datos agregados calculados en servidor (services con `groupBy` de Prisma). Dashboards: Inicio por rol, tablero SST (semÃ¡foro documental = PieChart + lista, frecuencia/severidad/ausentismo = LineChart mensual), reportes (masa salarial, rotaciÃ³n). Wrapper `ChartCard` con estados loading/empty.
- **Tablas:** `DataTable.tsx` genÃ©rico sobre **TanStack Table v8** con `manualPagination`/`manualSorting`/`manualFiltering`: el estado (pÃ¡gina, orden, filtros, bÃºsqueda) vive en `searchParams` (URL compartible, back-button correcto); la pÃ¡gina RSC consulta Prisma con `skip/take` y pasa `{ rows, pageCount, total }`. Export: botÃ³n "Exportar" llama una server action que repite la query **sin paginaciÃ³n pero con los mismos filtros y alcance del rol** y genera xlsx (SheetJS). En mÃ³vil, las tablas densas colapsan a cards (render alternativo por breakpoint definido en la columna meta).
- **Formularios:** `react-hook-form` + `zodResolver`; un schema zod por entidad en `lib/validators/` **reutilizado en**: formulario (cliente), server action (revalida SIEMPRE en servidor) e importador Excel. Componentes es-CO: `DatePicker` (date-fns locale `es`), `MoneyInput` (formato `$ 1.423.500`), `DocumentField`. Errores de action devueltos con `useActionState` y mapeados a los campos.

---

## 10. Flujos de aprobaciÃ³n (autoservicio)

**Regla del documento:** todo Ã­tem de autoservicio lo autorizan **Talento Humano o Subgerencia** (nivel final obligatorio). El nivel "Jefe de Ã¡rea" es un pre-filtro configurable por tipo.

**Modelos:**

```prisma
model Solicitud {
  id          String @id @default(cuid())
  tipo        TipoSolicitud   // VACACIONES | PERMISO | CERTIFICADO
  solicitanteId String        // empleadoId
  estado      EstadoSolicitud
  datos       Json            // VACACIONES: {desde,hasta,dias}; PERMISO: {fecha,horas,motivo,remunerado}; CERTIFICADO: {tipoCert,dirigidaA}
  documentoSoporteId String?  // soporte escaneado del permiso
  resultadoDocumentoId String? // PDF generado (certificado) al aprobar
  aprobaciones Aprobacion[]
  creadoEn    DateTime @default(now())
}
enum EstadoSolicitud { PENDIENTE_JEFE PENDIENTE_RRHH APROBADA RECHAZADA CANCELADA }

model Aprobacion {
  id          String @id @default(cuid())
  solicitudId String
  nivel       Int              // 1 = jefe, 2 = RRHH/Subgerencia
  decision    String           // APROBADA | RECHAZADA
  aprobadorId String
  comentario  String?
  decididoEn  DateTime @default(now())
}

model FlujoConfig {        // editable en /configuracion/flujos
  tipo            TipoSolicitud @id
  requiereNivelJefe Boolean     // seed: VACACIONES=true, PERMISO=true, CERTIFICADO=false
}
```

**MÃ¡quina de estados:**

```
crear â”€â”€â–º tiene jefe Y FlujoConfig.requiereNivelJefe?
            â”œâ”€ sÃ­ â”€â”€â–º PENDIENTE_JEFE â”€â”€apruebaâ”€â”€â–º PENDIENTE_RRHH â”€â”€apruebaâ”€â”€â–º APROBADA
            â”‚                        â””â”€rechazaâ”€â”€â–º RECHAZADA                â””â”€rechazaâ”€â”€â–º RECHAZADA
            â””â”€ no â”€â”€â–º PENDIENTE_RRHH â”€ ...
  (solicitante puede CANCELAR mientras estÃ© pendiente)
```

**Reglas de autorizaciÃ³n en `aprobarSolicitud(id, decision, comentario)`:**
- `PENDIENTE_JEFE`: solo el usuario cuyo `empleadoId == solicitante.jefeInmediatoId` (permiso `solicitudes.aprobar` alcance EQUIPO). RRHH/Subgerencia/Admin pueden "saltar" el nivel 1 (aprobaciÃ³n directa registra ambos niveles con nota).
- `PENDIENTE_RRHH`: roles con `solicitudes.aprobar` alcance TODOS (RRHH, Subgerencia, Admin) â€” cualquiera de los dos autoriza, cumpliendo "Talento Humano **o** Subgerencia".
- TransiciÃ³n + `Aprobacion` + efectos en **una transacciÃ³n**: VACACIONES aprobada â†’ crea registro en mÃ³dulo vacaciones (descuenta dÃ­as pendientes, valida saldo causado al crear la solicitud); CERTIFICADO aprobado â†’ genera el PDF (Â§6) y lo adjunta como `resultadoDocumentoId`; PERMISO aprobado â†’ crea la novedad.

**Notificaciones (servicio Ãºnico `notificar(plantilla, destinatarios, payload)`):**
- Al crear: in-app + correo al aprobador del nivel activo (jefe o grupo RRHH/Subgerencia).
- En cada transiciÃ³n: in-app + correo al solicitante ("Tu solicitud de vacaciones fue aprobada porâ€¦", con link profundo `/autoservicio/solicitudes`).
- Canal implementa la interfaz `NotificationChannel { send(msg): Promise<void> }` â€” `EmailChannel` (Resend) activo, `WhatsAppChannel` stub preparado (se activa por variable de entorno con el proveedor que se contrate).
- Bandeja "Por aprobar" en Inicio para Jefe/RRHH/Subgerencia con badge en la navegaciÃ³n.

---

### Decisiones transversales finales (resumen para el implementador)

1. **Better Auth** (plugin admin, sin auto-registro, invitaciÃ³n por Resend) â€” usuarios en Prisma, una sola BD.
2. AutorizaciÃ³n **siempre en servidor**: `withActionContext` â†’ `requirePermission` â†’ `scopeWhere`; el cliente solo recibe claves de permiso para pintar el menÃº.
3. **Una extensiÃ³n Prisma** audita todo create/update/delete con diff y usuario (AsyncLocalStorage); campos sensibles redactados.
4. **Un motor de vencimientos** (tabla `Vencimiento` + cron diario 06:00 BogotÃ¡ + dÃ­as hÃ¡biles con festivos CO) alimentado por documentos, contratos, exÃ¡menes, obligaciones legales y mÃ³dulos personalizados.
5. PWA con Serwist: shell cacheado, **datos y documentos jamÃ¡s cacheados**.
6. PDFs con `@react-pdf/renderer`, siempre persistidos en Storage como `Documento`.
7. Schemas zod Ãºnicos por entidad compartidos entre formularios, actions e importador Excel.

Fuentes consultadas: [Serwist â€” @serwist/next Getting started](https://serwist.pages.dev/docs/next/getting-started), [Serwist â€” register](https://serwist.pages.dev/docs/next/configuring/register), [Prisma â€” Better Auth + Next.js guide](https://www.prisma.io/docs/guides/betterauth-nextjs), [Better Auth â€” Prisma adapter](https://better-auth.com/docs/adapters/prisma).
