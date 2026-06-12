# DiseÃ±o tÃ©cnico â€” Motor de Alertas de Vencimiento, Calendario de Obligaciones Legales y Notificaciones
## Plataforma KUPOCELL S.A.S. â€” Next.js 15 + Supabase + Prisma + Vercel

Convenciones globales usadas en todo el diseÃ±o: IDs `uuid` (generados con `gen_random_uuid()`), zona horaria de negocio fija `America/Bogota` (UTC-5, sin DST), fechas de vencimiento como `DATE` (sin hora), enums Prisma en inglÃ©s con etiquetas en espaÃ±ol en la UI. Todas las tablas llevan `created_at`, `updated_at`, `created_by`, `updated_by` (la auditorÃ­a transversal del requisito general 4 las consume).

---

## 1. Registro polimÃ³rfico de VENCIMIENTOS

### 1.1 Principio de diseÃ±o

Una sola tabla `deadline` es la **fuente Ãºnica de verdad** de todo lo que vence en la app. NingÃºn mÃ³dulo implementa alertas propias: cada mÃ³dulo (RH, JurÃ­dica, SST, mÃ³dulos personalizados) **publica** sus vencimientos mediante un Ãºnico servicio `publishDeadline()`. La relaciÃ³n con la entidad origen es polimÃ³rfica por par `(source_type, source_id)` â€” sin FK fÃ­sica (Postgres no soporta FK polimÃ³rficas); la integridad la garantiza el servicio y un trigger opcional de limpieza por mÃ³dulo.

### 1.2 Esquema Prisma

```prisma
enum DeadlineStatus {
  PENDING    // pendiente
  NOTIFIED   // notificado (â‰¥1 alerta enviada)
  RESOLVED   // resuelto (la entidad origen lo cerrÃ³)
  EXPIRED    // vencido (cron lo marcÃ³: due_date < hoy sin resolver)
}

enum DeadlineDomain { RH JURIDICA SST ADMIN CUSTOM }

// CatÃ¡logo de tipos. is_system=true los siembra la migraciÃ³n; el Admin puede crear mÃ¡s
// (cubre el requisito de mÃ³dulos personalizados: cada mÃ³dulo nuevo registra su tipo).
model DeadlineType {
  id              String   @id @default(uuid())
  code            String   @unique          // 'medical_exam', 'fixed_term_contract', ...
  name            String                    // 'Examen mÃ©dico periÃ³dico'
  domain          DeadlineDomain
  defaultSeverity Severity @default(WARNING)
  color           String   @default("#f59e0b")
  isSystem        Boolean  @default(false)
  active          Boolean  @default(true)
  alertRule       AlertRule?
  deadlines       Deadline[]
  @@map("deadline_type")
}

model Deadline {
  id           String   @id @default(uuid())
  typeId       String
  type         DeadlineType @relation(fields: [typeId], references: [id])
  sourceType   String       // 'medical_exam','employment_contract','probation_period',
                            // 'ops_ss_payment','document','legal_obligation_occurrence',
                            // 'insurance_policy','lease','web_domain','software_license',
                            // 'finance_agreement','custom_record', ...
  sourceId     String       // uuid de la fila origen
  title        String       // "Examen periÃ³dico â€” Juan PÃ©rez" (desnormalizado para listados/correos)
  description  String?
  dueDate      DateTime @db.Date
  branchId     String?      // sede (FK real a branch)
  city         String?      // desnormalizado de la sede para filtrar por ciudad
  status       DeadlineStatus @default(PENDING)
  resolvedAt   DateTime?
  resolvedById String?
  resolutionNote String?
  linkPath     String?      // ruta in-app a la entidad origen: '/empleados/{id}/sst'
  responsibles DeadlineResponsible[]
  alerts       DeadlineAlert[]

  @@unique([sourceType, sourceId, typeId])   // clave de idempotencia del publish
  @@index([status, dueDate])
  @@index([branchId, status])
  @@map("deadline")
}

// Responsables: usuario concreto Y/O rol (p. ej. "todo Talento Humano").
model DeadlineResponsible {
  id         String  @id @default(uuid())
  deadlineId String
  deadline   Deadline @relation(fields: [deadlineId], references: [id], onDelete: Cascade)
  userId     String?  // FK a user
  roleCode   String?  // 'TALENTO_HUMANO', 'JURIDICA', 'SST', 'CONTABILIDAD', 'SUBGERENCIA'
  isPrimary  Boolean @default(true) // false = en copia (solo digest, no alerta crÃ­tica)
  @@unique([deadlineId, userId, roleCode])
  @@map("deadline_responsible")
}
```

### 1.3 Tipos sembrados (`deadline_type` seed)

| code | name | domain | publicado por |
|---|---|---|---|
| `medical_exam` | Examen mÃ©dico periÃ³dico/ingreso/egreso | SST | mÃ³dulo SST al programar examen |
| `fixed_term_contract` | Vencimiento contrato a tÃ©rmino fijo | RH | mÃ³dulo contrataciÃ³n (fecha fin) |
| `probation_period` | Fin de periodo de prueba | RH | mÃ³dulo contrataciÃ³n (fecha fin prueba) |
| `ops_contract` | Fin contrato OPS | RH | mÃ³dulo OPS |
| `ops_ss_payment` | Planilla SS de contratista OPS (mensual) | RH | mÃ³dulo cuentas de cobro OPS |
| `document_expiry` | Documento con fecha de vencimiento | ADMIN | gestor documental (campo `expires_at`) |
| `legal_obligation` | ObligaciÃ³n legal (calendario) | JURIDICA | generador del calendario (Â§5) |
| `insurance_policy` | Vencimiento de pÃ³liza | JURIDICA | mÃ³dulo pÃ³lizas |
| `lease` | Vencimiento contrato de arriendo | JURIDICA | mÃ³dulo arriendos por sede |
| `web_domain` | RenovaciÃ³n dominio web | ADMIN | mÃ³dulo activos digitales |
| `software_license` | Licencia software/SaaS/firma digital | ADMIN | mÃ³dulo licencias |
| `finance_agreement` | Vigencia convenio financiera | JURIDICA | mÃ³dulo convenios (Addi, PayJoyâ€¦) |
| `trademark` | RenovaciÃ³n marca SIC | JURIDICA | mÃ³dulo activos legales |
| `committee_term` | RenovaciÃ³n COPASST / ComitÃ© Convivencia | SST | mÃ³dulo comitÃ©s |
| `dotacion` | Entrega de dotaciÃ³n (3/aÃ±o) | RH | mÃ³dulo dotaciÃ³n |
| `custom_record` | Registro de mÃ³dulo personalizado | CUSTOM | constructor de mÃ³dulos (todo campo tipo "fecha con vencimiento" publica aquÃ­) |

### 1.4 API del servicio (contrato para los demÃ¡s dominios)

Archivo `src/lib/deadlines/service.ts`:

```ts
// Upsert idempotente por (sourceType, sourceId, typeCode).
// Si la fecha cambia (prÃ³rroga de contrato, reprogramaciÃ³n de examen):
// actualiza dueDate, regresa status a PENDING y REGENERA las filas deadline_alert (Â§4.2).
export async function publishDeadline(input: {
  typeCode: string; sourceType: string; sourceId: string;
  title: string; dueDate: Date; branchId?: string;
  responsibles: Array<{ userId?: string; roleCode?: string; isPrimary?: boolean }>;
  linkPath?: string; description?: string;
}): Promise<Deadline>

// La entidad origen lo cierra (examen realizado, contrato renovado/terminado,
// planilla SS verificada, obligaciÃ³n cumplida). Marca alerts futuras como SKIPPED.
export async function resolveDeadline(
  sourceType: string, sourceId: string, typeCode: string,
  resolvedBy: string, note?: string
): Promise<void>

// Si se elimina la entidad origen (soft delete), cancela el deadline.
export async function cancelDeadline(sourceType: string, sourceId: string, typeCode: string): Promise<void>
```

Ciclo de vida: `PENDING â†’ NOTIFIED` (lo hace el cron al enviar la primera alerta) `â†’ RESOLVED` (lo hace el mÃ³dulo origen) o `â†’ EXPIRED` (lo hace el cron cuando `due_date < hoy`). `EXPIRED â†’ RESOLVED` es vÃ¡lido (resoluciÃ³n tardÃ­a). `RESOLVED/EXPIRED` nunca regresan a `PENDING` salvo que `publishDeadline` reciba una nueva fecha futura.

---

## 2. DÃ­as hÃ¡biles Colombia (Ley 51 de 1983 / algoritmo Emiliani)

### 2.1 EvaluaciÃ³n de `colombian-holidays`

VerifiquÃ© el paquete en el registro npm y su repositorio:

- **Existe**: [`colombian-holidays`](https://github.com/MauricioRobayo/colombian-holidays), versiÃ³n actual **5.0.11**, licencia MIT, autor Mauricio Robayo.
- **Implementa la Ley 51 de 1983 / Emiliani**: cada festivo expone `date` (fecha original) y `celebrationDate` (fecha trasladada al lunes cuando aplica, flag `nextMonday`), y los festivos mÃ³viles se derivan de Pascua vÃ­a su Ãºnica dependencia (`pascua`).
- **API**: `getHolidaysByYear(year)`, `isHoliday(date)`, `getHoliday(date)`, `holidaysWithinInterval({start,end})`. Tipado TypeScript nativo, ESM y CommonJS. Rango 1583â€“4099.
- **Mantenimiento**: proyecto pequeÃ±o (~25 estrellas) pero estable y con releases continuos; el riesgo es bajo porque el dominio es **determinista por ley** (los festivos colombianos no cambian salvo reforma legal, la Ãºltima relevante es la Ley 51 de 1983).

**RecomendaciÃ³n: usar `colombian-holidays`**, pero **nunca llamarla directamente desde los mÃ³dulos**. Se encapsula en `src/lib/business-days.ts` con dos salvaguardas:

1. Tabla `holiday_override` para festivos/dÃ­as no laborables decretados extraordinariamente (dÃ­as cÃ­vicos) o correcciones, administrable desde la UI:

```prisma
model HolidayOverride {
  id      String   @id @default(uuid())
  date    DateTime @db.Date @unique
  name    String
  kind    HolidayOverrideKind  // ADD (dÃ­a no hÃ¡bil extra) | REMOVE (ignorar festivo de la librerÃ­a)
  @@map("holiday_override")
}
```

2. Si la librerÃ­a quedara abandonada, solo se reescribe este archivo (el algoritmo Emiliani son ~60 lÃ­neas: festivos fijos no trasladables â€”1 ene, 1 may, 20 jul, 7 ago, 8 dic, 25 dicâ€”, festivos religiosos relativos a Pascua â€”jueves/viernes santo fijos; AscensiÃ³n +43, Corpus +64, Sagrado CorazÃ³n +71 trasladablesâ€”, y festivos trasladables al lunes siguiente â€”6 ene, 19 mar, 29 jun, 15 ago, 12 oct, 1 nov, 11 novâ€”).

### 2.2 SÃ¡bados: hÃ¡biles (confirmado) y configurable

El documento dice explÃ­citamente que los dÃ­as hÃ¡biles **excluyen domingos y festivos** â€” por tanto **el sÃ¡bado SÃ cuenta como hÃ¡bil**. Ese es el default. Se hace configurable con una fila en `app_setting`:

```
key: 'business_days.exclude_saturday'   value: 'false'   (default)
```

### 2.3 ImplementaciÃ³n â€” `src/lib/business-days.ts`

```ts
import { isHoliday } from "colombian-holidays/utils/isHoliday"; // verificar export exacto en v5

// cfg se carga UNA vez por request/job: { excludeSaturday: boolean, overrides: Map<isoDate, 'ADD'|'REMOVE'> }
export function isBusinessDay(d: Date, cfg: BusinessDayConfig): boolean {
  const dow = d.getUTCDay();                       // trabajar siempre con fechas "puras" (00:00 UTC)
  if (dow === 0) return false;                     // domingo
  if (cfg.excludeSaturday && dow === 6) return false;
  const ov = cfg.overrides.get(iso(d));
  if (ov === "ADD") return false;                  // dÃ­a no hÃ¡bil decretado
  if (ov === "REMOVE") return true;                // anula festivo de la librerÃ­a
  return !isHoliday(d);                            // la librerÃ­a compara contra celebrationDate (Emiliani)
}

// "N dÃ­as hÃ¡biles ANTES de dueDate" â†’ retrocede contando solo hÃ¡biles
export function subtractBusinessDays(dueDate: Date, n: number, cfg: BusinessDayConfig): Date {
  let d = dueDate, remaining = n;
  while (remaining > 0) { d = addDays(d, -1); if (isBusinessDay(d, cfg)) remaining--; }
  return d;
}
export function addBusinessDays(from: Date, n: number, cfg: BusinessDayConfig): Date { /* simÃ©trico, +1 */ }
// usado tambiÃ©n por RNBD "10 dÃ­as hÃ¡biles del mes siguiente" y garantÃ­as del consumidor (15 dÃ­as hÃ¡biles)

// "hoy" de negocio: SIEMPRE en America/Bogota (el cron de Vercel corre en UTC)
export function todayBogota(): Date {
  return parseDateOnly(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date()));
}
```

Punto de implementaciÃ³n importante: confirmar en el cÃ³digo que `isHoliday` evalÃºa contra la **fecha de celebraciÃ³n trasladada** (`celebrationDate`), no contra la fecha original â€” es el comportamiento documentado de la librerÃ­a, pero debe cubrirse con un test unitario (p. ej. 6 de enero de 2026 cae martes â†’ la celebraciÃ³n es el lunes 12 de enero; el martes 6 debe ser hÃ¡bil y el lunes 12 no).

---

## 3. Reglas de alerta CONFIGURABLES por tipo

### 3.1 Modelo

Cada offset declara individualmente si es en dÃ­as hÃ¡biles o calendario, porque el documento mezcla ambos: el default global es "10 dÃ­as **hÃ¡biles** + 3 dÃ­as antes", y el calendario legal (secciÃ³n 4.1) es "**5 dÃ­as hÃ¡biles** y **1 dÃ­a** antes".

```prisma
model AlertRule {
  id             String  @id @default(uuid())
  deadlineTypeId String? @unique  // null â‡’ es la regla GLOBAL_DEFAULT (Ãºnica fila con scope GLOBAL)
  scope          AlertRuleScope @default(TYPE)  // GLOBAL | TYPE
  // Pasos de alerta, ordenados de mayor a menor anticipaciÃ³n:
  // [{ "key":"D-10H", "days":10, "business":true, "critical":false },
  //  { "key":"D-3H",  "days":3,  "business":true, "critical":true  }]
  offsets        Json
  notifyOnDueDate          Boolean @default(true)   // alerta el mismo dÃ­a del vencimiento
  overdueReminderEveryDays Int?                     // null = sin recordatorio post-vencimiento
  channels       Json @default("{\"inApp\":true,\"email\":true,\"whatsapp\":false}")
  excludeSaturdayOverride Boolean?  // null = hereda app_setting global
  @@map("alert_rule")
}
```

### 3.2 ResoluciÃ³n de la regla y seed

`resolveAlertRule(deadlineTypeId)`: regla del tipo si existe â†’ si no, la global. Seed obligatorio en la migraciÃ³n inicial:

| Regla | offsets | notifyOnDueDate | overdueReminder |
|---|---|---|---|
| **GLOBAL_DEFAULT** (todos los tipos sin regla propia) | `[{key:"D-10H",days:10,business:true},{key:"D-3H",days:3,business:true,critical:true}]` | true | cada 7 dÃ­as |
| **Tipo `legal_obligation`** (calendario legal, secciÃ³n 4.1 del documento) | `[{key:"D-5H",days:5,business:true},{key:"D-1",days:1,business:false,critical:true}]` | true | cada 3 dÃ­as |

El Administrador edita estas reglas desde `/configuracion/alertas` (pantalla CRUD sobre `alert_rule` + `deadline_type`): puede aÃ±adir/quitar pasos, cambiar dÃ­as, marcar hÃ¡bil/calendario y canales por tipo. Esto cubre "ambos esquemas mediante configuraciÃ³n por tipo" y cualquier ajuste futuro sin tocar cÃ³digo.

### 3.3 MaterializaciÃ³n de alertas (clave de la idempotencia)

Al hacer `publishDeadline()` (y en cada cambio de `dueDate`) se **precalculan y persisten** las fechas de disparo â€” el cron no calcula nada al vuelo, solo consume:

```prisma
model DeadlineAlert {
  id           String   @id @default(uuid())
  deadlineId   String
  deadline     Deadline @relation(fields: [deadlineId], references: [id], onDelete: Cascade)
  stepKey      String                  // 'D-10H' | 'D-3H' | 'DUE' | 'OVERDUE-2026-06-18'
  scheduledFor DateTime @db.Date       // dueDate - offset (con subtractBusinessDays si business)
  isCritical   Boolean  @default(false)
  status       AlertDispatchStatus @default(PENDING) // PENDING|PROCESSING|SENT|FAILED|SKIPPED
  attemptCount Int      @default(0)
  sentAt       DateTime?
  lastError    String?
  @@unique([deadlineId, stepKey])      // â† idempotencia estructural: imposible duplicar un paso
  @@index([status, scheduledFor])
  @@map("deadline_alert")
}
```

PseudocÃ³digo de regeneraciÃ³n (en `publishDeadline`):

```
rule = resolveAlertRule(typeId)
steps = rule.offsets.map(o => ({
  key: o.key,
  date: o.business ? subtractBusinessDays(dueDate, o.days, cfg) : addDays(dueDate, -o.days),
  critical: o.critical ?? false
}))
if rule.notifyOnDueDate: steps.push({ key:'DUE', date: dueDate, critical:true })
transacciÃ³n:
  DELETE deadline_alert WHERE deadlineId = X AND status = 'PENDING'   // los SENT se conservan (historial)
  INSERT steps con scheduledFor >= hoy  ... ON CONFLICT (deadlineId, stepKey) DO NOTHING
```

Si un paso quedÃ³ en el pasado al crear el deadline (p. ej. registran un contrato que vence en 4 dÃ­as â†’ el paso D-10H ya pasÃ³), **no se inserta**: solo se alertan los pasos cuyo `scheduledFor >= hoy`, evitando avalanchas de alertas atrasadas al importar datos histÃ³ricos (importador Excel/CSV).

---

## 4. CRON diario en Vercel

### 4.1 `vercel.json` y protecciÃ³n

```json
{
  "crons": [
    { "path": "/api/cron/deadline-alerts", "schedule": "0 11 * * *" },
    { "path": "/api/cron/legal-calendar-horizon", "schedule": "30 10 * * *" }
  ]
}
```

`0 11 * * *` UTC = **6:00 a.m. BogotÃ¡** todos los dÃ­as (Colombia no tiene DST, el offset -5 es fijo). El segundo cron (Â§5.3) genera ocurrencias del calendario legal 30 min antes, para que el de alertas las recoja el mismo dÃ­a.

Ruta `src/app/api/cron/deadline-alerts/route.ts`:

```ts
export const maxDuration = 300; // segundos â€” requiere plan Pro; en Hobby el lÃ­mite efectivo
                                // obliga a lotes pequeÃ±os (ver presupuesto de tiempo abajo)
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });   // Vercel Cron envÃ­a este header automÃ¡ticamente
  }
  const result = await runDeadlineAlertJob();
  return Response.json(result);
}
```

### 4.2 PseudocÃ³digo del job (`src/lib/deadlines/cron-job.ts`)

```
runDeadlineAlertJob():
  t0 = now(); BUDGET_MS = maxDuration*1000*0.8        // parar al 80% del lÃ­mite de Vercel
  today = todayBogota()
  cfg   = loadBusinessDayConfig()

  // PASO 1 â€” marcar vencidos (una sola sentencia, idempotente por naturaleza)
  UPDATE deadline SET status='EXPIRED', updated_at=now()
   WHERE due_date < today AND status IN ('PENDING','NOTIFIED');

  // PASO 2 â€” sembrar recordatorios post-vencimiento (regla overdueReminderEveryDays)
  //   stepKey = 'OVERDUE-' || today  â†’ el unique (deadlineId, stepKey) impide duplicar
  INSERT INTO deadline_alert (deadline_id, step_key, scheduled_for, is_critical)
  SELECT d.id, 'OVERDUE-'||today, today, true
    FROM deadline d JOIN regla r ...
   WHERE d.status='EXPIRED'
     AND (today - d.due_date) % r.overdue_reminder_every_days = 0
  ON CONFLICT DO NOTHING;

  // PASO 3 â€” RECLAMAR alertas debidas (patrÃ³n claim: a prueba de doble ejecuciÃ³n)
  // scheduled_for <= today (no "= today"): si el cron fallÃ³ ayer, hoy se ponen al dÃ­a solas.
  loop:
    if elapsed(t0) > BUDGET_MS: break â†’ selfReinvoke()
    claimed = sql`
      UPDATE deadline_alert SET status='PROCESSING', attempt_count=attempt_count+1
      WHERE id IN (
        SELECT da.id FROM deadline_alert da
        JOIN deadline d ON d.id = da.deadline_id
        WHERE da.scheduled_for <= ${today}
          AND da.status IN ('PENDING','FAILED') AND da.attempt_count < 5
          AND d.status IN ('PENDING','NOTIFIED','EXPIRED')   -- nunca alertar RESOLVED
        ORDER BY da.is_critical DESC, da.scheduled_for
        LIMIT 200 FOR UPDATE SKIP LOCKED                      -- segunda ejecuciÃ³n concurrente: no choca
      ) RETURNING *`
    if claimed.empty: break

    // PASO 4 â€” expandir responsables y encolar en el OUTBOX (idempotente por dedupe_key)
    for alert in claimed:
      recipients = resolveResponsibles(alert.deadline)   // userIds directos + usuarios de roleCodes
      for user in recipients:
        // notificaciÃ³n in-app (siempre)
        INSERT INTO notification (user_id, kind, severity, title, body, link_path, dedupe_key, metadata)
        VALUES (..., dedupe_key = alert.id || ':' || user.id) ON CONFLICT (dedupe_key) DO NOTHING;
        // canal correo: va al outbox, NO se envÃ­a aquÃ­ (se agrupa en PASO 5)
        if rule.channels.email:
          INSERT INTO outbound_message (channel='EMAIL', user_id, payload_kind =
                 alert.is_critical ? 'CRITICAL_ALERT' : 'DIGEST_ITEM',
                 ref_alert_id, dedupe_key = alert.id||':EMAIL:'||user.id, status='QUEUED')
          ON CONFLICT (dedupe_key) DO NOTHING;
      UPDATE deadline_alert SET status='SENT', sent_at=now() WHERE id = alert.id;
      UPDATE deadline SET status='NOTIFIED' WHERE id = alert.deadline_id AND status='PENDING';

  // PASO 5 â€” despacho de correos AGRUPADO por responsable
  porUsuario = SELECT * FROM outbound_message WHERE channel='EMAIL' AND status='QUEUED' GROUP BY user_id
  emails = []
  for (user, items) in porUsuario:
    criticos = items.filter(payload_kind='CRITICAL_ALERT')
    for c in criticos: emails.push(renderCriticalAlertEmail(user, c))        // 1 correo individual c/u
    digest = items.filter(payload_kind='DIGEST_ITEM')
    if digest.length: emails.push(renderDailyDigestEmail(user, digest))      // 1 solo correo resumen
  // Resend Batch API: hasta 100 correos por llamada â†’ chunk(emails, 100)
  for chunk in chunks(emails, 100):
    res = resend.batch.send(chunk)
    UPDATE outbound_message SET status='SENT', sent_at=now(), provider_id=res.id WHERE id IN (chunk.ids)
    // en error: status='FAILED' â†’ reintenta el prÃ³ximo run (attempt < 5), luego 'DEAD' + notificaciÃ³n al Admin

  return { expired, claimed, emailsSent, remaining }
```

**GarantÃ­as de idempotencia** (si el cron corre dos veces o se relanza):
1. `UNIQUE(deadline_id, step_key)` â€” un paso de alerta existe una sola vez.
2. Claim con `UPDATE â€¦ FOR UPDATE SKIP LOCKED` â€” dos ejecuciones simultÃ¡neas no procesan la misma fila.
3. `UNIQUE(dedupe_key)` en `notification` y `outbound_message` â€” ni la notificaciÃ³n in-app ni el correo se duplican aunque el paso 4 se re-ejecute tras un fallo a mitad.

**LÃ­mite de duraciÃ³n de Vercel**: presupuesto de tiempo al 80% de `maxDuration` (300 s en Pro con Fluid Compute; configurable hasta 800 s). Si queda trabajo, `selfReinvoke()` hace un `fetch` fire-and-forget a la misma ruta con el `CRON_SECRET` y termina â€” la siguiente invocaciÃ³n continÃºa exactamente donde quedÃ³ porque todo el estado vive en la BD (alertas `PENDING` restantes). Con los volÃºmenes de KUPOCELL (cientos de empleados) un solo run de <30 s serÃ¡ lo normal; el mecanismo es seguro de margen.

---

## 5. Calendario de obligaciones legales

### 5.1 Modelo de recurrencia

```prisma
enum RecurrenceKind {
  MONTHLY        // dÃ­a fijo del mes (o "segÃºn calendario tributario", ver flag)
  ANNUAL_FIXED   // mes y dÃ­a fijos (cesantÃ­as 14 feb)
  SEMIANNUAL     // dos meses al aÃ±o con dÃ­a fijo (primas jun/dic, reclamos RNBD feb/ago)
  EVERY_N_YEARS  // cada N aÃ±os desde fecha ancla (COPASST 2, marca SIC 10)
  EVENT_BASED    // se dispara manualmente o por otro mÃ³dulo (nueva BD â†’ +2 meses)
}

model LegalObligation {
  id          String  @id @default(uuid())
  name        String
  category    String   // TRIBUTARIA|CORPORATIVA|LABORAL|DATOS_PERSONALES|CONSUMIDOR|SST|COMERCIAL|ESTABLECIMIENTO
  legalBasis  String?  // norma: "Ley 1581/2012", "Res. 0312/2019"...
  recurrenceKind   RecurrenceKind
  recurrenceParams Json
  // MONTHLY:       { "day": 10, "usesTaxCalendar": true }   â† si true, la fecha exacta depende del
  //                  dÃ­gito del NIT (calendario DIAN anual): la UI exige confirmar/ajustar la fecha
  //                  de cada ocurrencia generada; el sistema propone el dÃ­a configurado.
  // ANNUAL_FIXED:  { "month": 2, "day": 14 }
  // SEMIANNUAL:    { "months": [6, 12], "day": 30, "dayPerMonth": {"6":30,"12":20} }  â† primas: 30 jun / 20 dic
  // EVERY_N_YEARS: { "intervalYears": 2, "anchorDate": "2025-08-01" }
  // EVENT_BASED:   { "offsetDays": 60, "businessDays": false, "triggerHint": "CreaciÃ³n de nueva base de datos" }
  perBranch        Boolean @default(false)  // se multiplica por sede (matrÃ­cula mercantil, bomberos)
  perMunicipality  Boolean @default(false)  // se multiplica por municipio (ICA)
  defaultRoleCode  String?                  // responsable por rol
  defaultUserId    String?                  // o usuario concreto
  active           Boolean @default(true)
  occurrences      LegalObligationOccurrence[]
  @@map("legal_obligation")
}

model LegalObligationOccurrence {
  id            String  @id @default(uuid())
  obligationId  String
  obligation    LegalObligation @relation(fields: [obligationId], references: [id])
  branchId      String?
  municipality  String?
  periodLabel   String           // '2026-03', '2026-S1', '2026'
  dueDate       DateTime @db.Date
  deadlineId    String?  @unique // â† su vencimiento en el motor (Â§1), tipo 'legal_obligation'
  completedAt   DateTime?
  completedById String?
  evidenceDocumentId String?     // soporte del cumplimiento (Storage)
  notes         String?
  @@unique([obligationId, branchId, municipality, periodLabel])  // idempotencia del generador
  @@map("legal_obligation_occurrence")
}
```

### 5.2 GeneraciÃ³n de ocurrencias â€” dos vÃ­as complementarias

**A. Generador por horizonte (cron `legal-calendar-horizon`, idempotente):** cada dÃ­a, para cada `legal_obligation` activa NO `EVENT_BASED`, calcula las prÃ³ximas fechas dentro de un **horizonte de 120 dÃ­as** y crea las ocurrencias que falten (el `@@unique` absorbe repeticiones). Si `perBranch`/`perMunicipality`, expande por cada sede activa / cada municipio con sede. Cada ocurrencia creada llama `publishDeadline({ typeCode:'legal_obligation', sourceType:'legal_obligation_occurrence', sourceId: occ.id, dueDate, branchId, responsibles:[{roleCode|userId}] })` â†’ hereda automÃ¡ticamente la regla **5 dÃ­as hÃ¡biles + 1 dÃ­a** del tipo.

**B. Al completar (server action `completeObligationOccurrence(occId, evidenceDocId?)`):** marca `completedAt`, llama `resolveDeadline(...)`, y **genera inmediatamente la siguiente ocurrencia** segÃºn la recurrencia (si el horizonte aÃºn no la creÃ³ â€” el unique evita el duplicado). AsÃ­ el responsable ve la prÃ³xima fecha al instante, requisito explÃ­cito ("generaciÃ³n automÃ¡tica de la siguiente ocurrencia al completar una").

Las `EVENT_BASED` solo se crean por disparador: botÃ³n "Registrar evento" en la UI del calendario, o programÃ¡ticamente desde otro mÃ³dulo (p. ej. al registrar una base de datos nueva en el mÃ³dulo de protecciÃ³n de datos â†’ crea ocurrencia "InscripciÃ³n RNBD" con `dueDate = fechaCreaciÃ³n + 2 meses`; "cambio sustancial" â†’ `dueDate = addBusinessDays(primerDÃ­aMesSiguiente, 10)`).

```
nextDueDate(obligation, lastDue):
  switch recurrenceKind:
    MONTHLY:       addMonths(lastDue, 1) ajustado al day (clamp fin de mes)
    ANNUAL_FIXED:  mismo (month, day) del aÃ±o siguiente
    SEMIANNUAL:    siguiente mes de months[] (con su dayPerMonth), saltando de aÃ±o si era el Ãºltimo
    EVERY_N_YEARS: anchorDate + intervalYears * k (primer k con fecha > lastDue)
    EVENT_BASED:   null (no autogenerable)
```

### 5.3 Datos SEMILLA â€” `prisma/seed/legal-obligations.ts`

Tabla completa (secciÃ³n 4.1 del plan), lista para el seed. Responsables por rol: `JUR`=JurÃ­dica, `CONT`=Contabilidad, `TH`=Talento Humano, `SST`=responsable SST, `SUB`=Subgerencia.

| # | name | category | recurrenceKind | recurrenceParams | perBranch | perMunicipality | rol | Nota |
|---|---|---|---|---|---|---|---|---|
| 1 | RenovaciÃ³n matrÃ­cula mercantil | CORPORATIVA | ANNUAL_FIXED | `{month:3,day:31}` | **sÃ­** | no | JUR | Por cada establecimiento de comercio |
| 2 | Asamblea ordinaria de accionistas | CORPORATIVA | ANNUAL_FIXED | `{month:3,day:31}` | no | no | SUB | |
| 3 | ActualizaciÃ³n datos CÃ¡mara de Comercio | CORPORATIVA | EVENT_BASED | `{offsetDays:30,triggerHint:"Cambio de representante/direcciÃ³n/objeto"}` | no | no | JUR | |
| 4 | DeclaraciÃ³n de renta anual | TRIBUTARIA | ANNUAL_FIXED | `{month:4,day:15,usesTaxCalendar:true}` | no | no | CONT | Fecha real segÃºn NIT/calendario DIAN del aÃ±o â€” ajustar al confirmar |
| 5 | DeclaraciÃ³n de IVA | TRIBUTARIA | MONTHLY | `{day:15,usesTaxCalendar:true,intervalMonths:2}` | no | no | CONT | Bimestral (o cuatrimestral segÃºn rÃ©gimen) â€” `intervalMonths` configurable |
| 6 | RetenciÃ³n en la fuente | TRIBUTARIA | MONTHLY | `{day:15,usesTaxCalendar:true}` | no | no | CONT | Mensual, fecha segÃºn Ãºltimo dÃ­gito NIT |
| 7 | ICA | TRIBUTARIA | MONTHLY | `{day:15,usesTaxCalendar:true,intervalMonths:2}` | no | **sÃ­** | CONT | **Se multiplica por municipio**; periodicidad varÃ­a (BogotÃ¡ bimestral, otros anual) â€” editable por municipio duplicando la obligaciÃ³n |
| 8 | InformaciÃ³n exÃ³gena (medios magnÃ©ticos) | TRIBUTARIA | ANNUAL_FIXED | `{month:5,day:15,usesTaxCalendar:true}` | no | no | CONT | |
| 9 | ActualizaciÃ³n RUT | TRIBUTARIA | EVENT_BASED | `{offsetDays:30,triggerHint:"Cambio de datos del RUT"}` | no | no | CONT | |
| 10 | ActualizaciÃ³n RUB (beneficiarios finales) | TRIBUTARIA | EVENT_BASED | `{offsetDays:30,triggerHint:"Cambio de beneficiario final"}` | no | no | JUR | + verificaciÃ³n anual sugerida (fila 10b ANNUAL_FIXED `{month:6,day:30}`) |
| 11 | PILA (aportes seguridad social) | LABORAL | MONTHLY | `{day:10,usesTaxCalendar:true}` | no | no | TH | Fecha segÃºn 2 Ãºltimos dÃ­gitos NIT |
| 12 | ConsignaciÃ³n de cesantÃ­as | LABORAL | ANNUAL_FIXED | `{month:2,day:14}` | no | no | TH | |
| 13 | Intereses a las cesantÃ­as | LABORAL | ANNUAL_FIXED | `{month:1,day:31}` | no | no | TH | |
| 14 | Prima de servicios | LABORAL | SEMIANNUAL | `{months:[6,12],dayPerMonth:{"6":30,"12":20}}` | no | no | TH | |
| 15 | AtenciÃ³n requerimientos UGPP | LABORAL | EVENT_BASED | `{offsetDays:0,triggerHint:"Requerimiento recibido â€” plazo del oficio"}` | no | no | CONT | dueDate manual segÃºn el requerimiento |
| 16 | ActualizaciÃ³n anual RNBD | DATOS_PERSONALES | ANNUAL_FIXED | `{month:3,day:31}` | no | no | JUR | Ventana 2 eneâ€“31 mar (Ley 1581) |
| 17 | Reporte semestral de reclamos RNBD | DATOS_PERSONALES | SEMIANNUAL | `{months:[2,8],day:20}` | no | no | JUR | 20 feb / 20 ago |
| 18 | InscripciÃ³n RNBD de BD nuevas | DATOS_PERSONALES | EVENT_BASED | `{offsetDays:60,triggerHint:"CreaciÃ³n de nueva base de datos"}` | no | no | JUR | 2 meses desde creaciÃ³n |
| 19 | Reporte de cambios sustanciales RNBD | DATOS_PERSONALES | EVENT_BASED | `{offsetDays:10,businessDays:true,triggerHint:"Cambio sustancial en BD"}` | no | no | JUR | 10 dÃ­as **hÃ¡biles** del mes siguiente |
| 20 | Respuesta a reclamaciones de garantÃ­a (Estatuto Consumidor) | CONSUMIDOR | EVENT_BASED | `{offsetDays:15,businessDays:true,triggerHint:"ReclamaciÃ³n de garantÃ­a recibida"}` | no | no | JUR | |
| 21 | AutoevaluaciÃ³n estÃ¡ndares mÃ­nimos SST + plan de mejora | SST | ANNUAL_FIXED | `{month:12,day:31}` | no | no | SST | Res. 0312/2019 |
| 22 | Plan de trabajo anual SST | SST | ANNUAL_FIXED | `{month:1,day:31}` | no | no | SST | |
| 23 | RenovaciÃ³n COPASST | SST | EVERY_N_YEARS | `{intervalYears:2,anchorDate:"<fecha conformaciÃ³n>"}` | no | no | SST | |
| 24 | RenovaciÃ³n ComitÃ© de Convivencia | SST | EVERY_N_YEARS | `{intervalYears:2,anchorDate:"<fecha conformaciÃ³n>"}` | no | no | SST | |
| 25 | ReuniÃ³n mensual COPASST | SST | MONTHLY | `{day:28}` | no | no | SST | Acta como evidencia |
| 26 | ReuniÃ³n trimestral ComitÃ© de Convivencia | SST | MONTHLY | `{day:28,intervalMonths:3}` | no | no | SST | |
| 27 | Concepto/inspecciÃ³n bomberos | ESTABLECIMIENTO | ANNUAL_FIXED | `{month:6,day:30}` | **sÃ­** | no | JUR | Fecha real segÃºn municipio â€” ajustar por sede |
| 28 | Pago Sayco & Acinpro | ESTABLECIMIENTO | ANNUAL_FIXED | `{month:1,day:31}` | **sÃ­** | no | CONT | |
| 29 | VerificaciÃ³n uso de suelo | ESTABLECIMIENTO | EVENT_BASED | `{offsetDays:0,triggerHint:"Apertura/traslado de establecimiento"}` | sÃ­ | no | JUR | |

**No van como `legal_obligation`** (las publican sus mÃ³dulos con fecha ancla propia, vÃ­a Â§1): pÃ³lizas (`insurance_policy`, anual por pÃ³liza), arriendos por sede (`lease`, fin de contrato + opciÃ³n de recordatorio mensual de pago), marca SIC (`trademark`, vencimiento = registro + 10 aÃ±os), dominios web (`web_domain`, anual por dominio), licencias software/SaaS y firma digital (`software_license`), convenios con financieras Addi/Banco de BogotÃ¡/Sumas Pay/PayJoy/Krediya y acuerdos de transmisiÃ³n de datos (`finance_agreement`, fecha fin de vigencia de cada convenio registrado), exÃ¡menes mÃ©dicos periÃ³dicos (`medical_exam`, por empleado segÃºn profesiograma). RazÃ³n: tienen entidad propia con datos (valor, contraparte, soporte) y fecha ancla individual â€” el calendario legal solo modela obligaciones "de la empresa", no instancias por contrato/empleado.

---

## 6. Centro de notificaciones in-app

### 6.1 Modelo

```prisma
model Notification {
  id        String   @id @default(uuid())
  userId    String
  kind      String              // 'DEADLINE_ALERT' | 'APPROVAL_REQUEST' | 'SYSTEM' (extensible: lo usan vacaciones, certificadosâ€¦)
  severity  Severity            // INFO | WARNING | CRITICAL
  title     String
  body      String?
  linkPath  String?             // deep-link: '/vencimientos?id=...' o entidad origen
  dedupeKey String?  @unique    // alertId:userId (idempotencia Â§4)
  metadata  Json?               // { deadlineId, deadlineTypeCode, branchId, dueDate }
  readAt    DateTime?
  createdAt DateTime @default(now())
  @@index([userId, readAt, createdAt(sort: Desc)])
  @@map("notification")
}
```

### 6.2 Campana con contador

- Componente `src/components/notifications/notification-bell.tsx` (client) en el header del layout autenticado. Badge = `COUNT(*) WHERE user_id = ? AND read_at IS NULL` (mostrar "99+" si >99).
- **Tiempo real**: suscripciÃ³n Supabase Realtime al canal `postgres_changes` sobre `notification` con filtro `user_id=eq.{uid}` (habilitar la tabla en la publicaciÃ³n de Realtime; RLS: `user_id = auth.uid()`). Fallback: revalidaciÃ³n al focus de la pestaÃ±a (PWA).
- Popover (shadcn `Popover` + `ScrollArea`): Ãºltimas 20, icono por `severity`, click â†’ `markRead` + navegar a `linkPath`. Acciones (Server Actions en `src/app/(app)/notificaciones/actions.ts`): `markNotificationRead(id)`, `markAllNotificationsRead()` (`UPDATE â€¦ SET read_at=now() WHERE user_id=? AND read_at IS NULL`). PÃ¡gina completa `/notificaciones` con paginaciÃ³n e filtro por tipo/leÃ­das.

### 6.3 Tablero de vencimientos con semÃ¡foro

Vista SQL (migraciÃ³n Prisma raw) `v_deadline_board`:

```sql
CREATE VIEW v_deadline_board AS
SELECT d.*, t.code AS type_code, t.name AS type_name, t.domain, b.name AS branch_name,
  CASE
    WHEN d.status = 'EXPIRED' THEN 'VENCIDO'                       -- rojo
    WHEN d.status IN ('PENDING','NOTIFIED')
         AND d.due_date <= (now() AT TIME ZONE 'America/Bogota')::date
                            + make_interval(days => t.warn_window_days) THEN 'POR_VENCER'  -- amarillo
    WHEN d.status = 'RESOLVED' THEN 'RESUELTO'                     -- gris (histÃ³rico)
    ELSE 'AL_DIA'                                                  -- verde
  END AS traffic_light
FROM deadline d JOIN deadline_type t ON t.id = d.type_id
LEFT JOIN branch b ON b.id = d.branch_id;
```

`warn_window_days` es una columna calculada/sincronizada en `deadline_type` = mayor offset de su regla convertido a dÃ­as calendario aproximados (10 hÃ¡biles â‰ˆ 12 calendario; se recalcula al guardar la regla). AsÃ­ el semÃ¡foro es coherente con las alertas: algo estÃ¡ "por vencer" exactamente desde que entra en ventana de primera alerta.

PÃ¡gina `/vencimientos` (`src/app/(app)/vencimientos/page.tsx`): tarjetas-contador rojo/amarillo/verde (click = filtro), DataTable (shadcn) sobre la vista con filtros combinables por **sede, ciudad**, dominio (RH/JurÃ­dica/SST/Admin), tipo, responsable, estado y rango de fechas; ordenada por `due_date ASC`. Fila â†’ drawer con detalle, historial de alertas enviadas (`deadline_alert`) y botÃ³n "Marcar resuelto" (con nota, permiso segÃºn rol y dominio). Este mismo tablero, filtrado por `domain='SST'` y `type_code IN (...)`, alimenta el semÃ¡foro documental del tablero SST y el reporte "semÃ¡foro documental" de la secciÃ³n de reportes â€” sin cÃ³digo adicional.

---

## 7. Correo (Resend) e interfaz de mensajerÃ­a desacoplada

### 7.1 Plantillas (react-email, en `src/emails/`)

**`daily-digest.tsx` â€” Resumen diario por responsable** (uno por usuario por dÃ­a). Props: `{ userName, date, groups }`. Estructura: saludo; bloque rojo "Vencidos" (si hay); bloque naranja "Vencen pronto"; tabla por grupo con columnas *Vencimiento | Tipo | Sede/Ciudad | Fecha | DÃ­as restantes (hÃ¡biles)* y cada fila con link absoluto `${APP_URL}${linkPath}`; pie con botÃ³n "Ver tablero de vencimientos". Asunto: `Vencimientos KUPOCELL â€” {n} pendientes ({fecha})`.

**`critical-alert.tsx` â€” Alerta individual crÃ­tica** (pasos con `critical:true`: D-3H, D-1, DUE, OVERDUE). Props: `{ userName, deadline: {title, typeName, branchName, dueDate, daysLeft}, linkPath }`. Asunto: `[URGENTE] {title} vence {el 18/06/2026 | HOY | hace 2 dÃ­as}`. Un correo por vencimiento crÃ­tico (no se diluye en el digest; el Ã­tem se excluye del digest de ese dÃ­a para no duplicar).

EnvÃ­o con **Resend Batch** (`resend.batch.send`, mÃ¡x. 100 por llamada) desde el PASO 5 del cron; remitente `alertas@kupocell.com.co` (dominio verificado en Resend con SPF/DKIM); `replyTo` al correo de Talento Humano.

### 7.2 Interfaz de proveedor desacoplada (WhatsApp despuÃ©s, sin tocar el motor)

El motor **nunca llama a Resend directamente**: escribe filas en `outbound_message` (patrÃ³n outbox, Â§4.2) y un *dispatcher* las entrega al proveedor del canal. Activar WhatsApp = implementar una clase y poner una variable de entorno.

```prisma
model OutboundMessage {
  id          String  @id @default(uuid())
  channel     String            // 'EMAIL' | 'WHATSAPP'
  userId      String
  payloadKind String            // 'CRITICAL_ALERT' | 'DIGEST_ITEM'
  refAlertId  String?
  payload     Json              // datos ya resueltos para la plantilla
  dedupeKey   String  @unique
  status      String  @default("QUEUED")  // QUEUED|SENT|FAILED|DEAD
  attemptCount Int    @default(0)
  providerId  String?           // id de Resend / id de mensaje de Meta
  sentAt      DateTime?
  lastError   String?
  @@index([channel, status])
  @@map("outbound_message")
}
```

```ts
// src/lib/messaging/provider.ts
export interface MessagingProvider {
  readonly channel: "EMAIL" | "WHATSAPP";
  /** Entrega un lote ya agrupado; retorna resultado por mensaje (id proveedor o error). */
  sendBatch(messages: RenderedMessage[]): Promise<SendResult[]>;
}
export type RenderedMessage = {
  outboundMessageId: string;
  to: { email?: string; phoneE164?: string; name: string };
  templateId: "daily_digest" | "critical_alert";
  data: Record<string, unknown>;
};

// src/lib/messaging/resend-provider.ts  â†’ implementaciÃ³n hoy (render react-email + resend.batch.send)
// src/lib/messaging/whatsapp-meta-provider.ts (futuro) â†’ Meta Cloud API con plantillas HSM
//   aprobadas equivalentes ('daily_digest','critical_alert'); o TwilioWhatsAppProvider.
// src/lib/messaging/registry.ts
export function getActiveProviders(): MessagingProvider[] {
  const p: MessagingProvider[] = [new ResendEmailProvider()];
  if (process.env.WHATSAPP_PROVIDER === "meta")   p.push(new MetaWhatsAppProvider());
  if (process.env.WHATSAPP_PROVIDER === "twilio") p.push(new TwilioWhatsAppProvider());
  return p;
}
```

El cron, en el PASO 4, consulta `rule.channels`: si `whatsapp:true` para ese tipo, inserta ademÃ¡s una fila `channel='WHATSAPP'` en el outbox (requiere `phone_e164` y consentimiento en el perfil del usuario â€” campo `whatsapp_opt_in`, alineado con Ley 1581). Mientras no exista proveedor activo para el canal, el dispatcher deja esas filas en `QUEUED` sin error. Activar WhatsApp no toca ni el motor, ni las reglas, ni el cron: solo el registry.

---

## Inventario de archivos del dominio

```
prisma/schema.prisma                       â†’ modelos Â§1, Â§3.3, Â§5.1, Â§6.1, Â§7.2 + HolidayOverride, AppSetting
prisma/seed/deadline-types.ts              â†’ tabla Â§1.3
prisma/seed/alert-rules.ts                 â†’ tabla Â§3.2
prisma/seed/legal-obligations.ts           â†’ tabla Â§5.3
prisma/migrations/.../v_deadline_board.sql â†’ vista Â§6.3
src/lib/business-days.ts                   â†’ Â§2 (wrapper colombian-holidays + overrides + todayBogota)
src/lib/deadlines/service.ts               â†’ publishDeadline / resolveDeadline / cancelDeadline
src/lib/deadlines/alert-scheduler.ts       â†’ materializaciÃ³n de deadline_alert (Â§3.3)
src/lib/deadlines/cron-job.ts              â†’ runDeadlineAlertJob (Â§4.2)
src/lib/legal-calendar/recurrence.ts       â†’ nextDueDate (Â§5.2)
src/lib/legal-calendar/horizon-job.ts      â†’ generador por horizonte 120 dÃ­as
src/lib/messaging/{provider,resend-provider,registry,dispatcher}.ts
src/emails/{daily-digest,critical-alert}.tsx
src/app/api/cron/deadline-alerts/route.ts
src/app/api/cron/legal-calendar-horizon/route.ts
src/app/(app)/vencimientos/page.tsx        â†’ tablero semÃ¡foro Â§6.3
src/app/(app)/calendario-legal/page.tsx    â†’ CRUD obligaciones + completar ocurrencias
src/app/(app)/notificaciones/{page.tsx,actions.ts}
src/app/(app)/configuracion/alertas/page.tsx â†’ editor de reglas por tipo
src/components/notifications/notification-bell.tsx
vercel.json                                â†’ crons Â§4.1
```

Dependencias npm del dominio: `colombian-holidays` (^5.x), `resend`, `@react-email/components`, `date-fns` (sin necesidad de `date-fns-tz`: el cÃ¡lculo de "hoy BogotÃ¡" usa `Intl` con offset fijo).

Sources:
- [colombian-holidays â€” GitHub (MauricioRobayo)](https://github.com/MauricioRobayo/colombian-holidays)
- [Ley 2466 de 2025 â€” FunciÃ³n PÃºblica](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=260676)
- [Recargo nocturno desde las 7:00 p.m. (vigente desde 25 dic 2025) â€” Nexia M&A](https://nexiamya.com.co/recargo-nocturno-desde-las-700-p-m-esto-cambia-con-la-ley-2466-de-2025-y-asi-se-calcula-el-pago-por-hora/)
- [Recargo dominical/festivo escalonado 80/90/100% â€” All Abogados](https://allabogados.com/en/noticias/regulaciones-horas-extras-recargos-trabajo/)
