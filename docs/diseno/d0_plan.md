# Plan: Plataforma de Gestión de Talento Humano, Jurídica y SST — KUPOCELL S.A.S. (Smart Gadgets)

## Contexto

Proyecto greenfield (la carpeta solo contiene `Requerimientos Plataforma RH_KUPOCELL.docx`). KUPOCELL S.A.S. (nombre comercial Smart Gadgets) necesita una plataforma web tipo app para administrar el ciclo completo del personal en tres frentes: Recursos Humanos (incluida nómina colombiana), Jurídica y SST. Debe ser perfectamente usable en computador y celular (PWA instalable), sin límites de empleados ni documentos, con base de datos real y respaldo en la nube, auditoría total, motor de alertas de vencimiento transversal y separación por sede/ciudad.

**Decisiones del usuario (confirmadas):**
- Hosting: nube administrada — Supabase (PostgreSQL + Storage + backups) + Vercel.
- Alertas: centro de notificaciones en la app + envío automático por correo. WhatsApp queda preparado (interfaz de proveedor desacoplada) para activar después.
- Importador masivo de empleados desde Excel/CSV: incluido (con saldos iniciales).
- Idioma: español (Colombia). Empresa única, multi-sede/multi-ciudad.

**Diseño detallado:** se produjo mediante panel de 4 diseñadores + síntesis. Los documentos completos (esquema Prisma íntegro ~79k chars, motor de nómina, motor de alertas, arquitectura/UX) están en
`C:\Users\EQUIPO\AppData\Local\Temp\claude\c--Users-EQUIPO-Desktop-PROYECTOS-DAVID-LABORAL-GestorEmpleados\88e81397-f9c2-4516-a6e7-f4fee61a2da9\tasks\` (`d1_datamodel.md`, `d2_payroll.md`, `d3_alerts.md`, `d4_uxarch.md`, `d5_synthesis.md`).
**Primer paso de implementación: copiarlos a `docs/diseno/` dentro del repo** (son archivos temporales). `d5_synthesis.md` contiene los 30 veredictos de conflicto (C1–C30) que mandan sobre los diseños individuales.

---

## Requerimientos (extraídos del .docx — fuente de verdad; el plan los cubre TODOS)

### Generales (no negociables)
1. Sin límite de empleados, registros ni documentos; BD real + archivos en la nube.
2. Múltiples documentos escaneados por persona (PDF, imágenes).
3. Usuarios y permisos por rol. 4. Auditoría automática (quién/qué/cuándo). 5. Motor de alertas transversal. 6. Filtros por sede/ciudad en todo. 7. El Administrador puede crear pestañas/módulos nuevos.

### RH
- **Colaboradores**: ficha completa (personales, documento, contacto, contacto de emergencia, educación, salud: EPS/ARL/pensión/caja, bancarios, foto). Vínculos: indefinido, fijo, obra/labor, aprendiz SENA, OPS, practicante. Áreas, cargos, jefe inmediato, organigrama.
- **Contratación**: contratos (salario, jornada, modalidad, sede, cargo, fechas), prórrogas/otrosí, periodo de prueba con alerta. OPS separado de nómina (objeto, valor, supervisor, entregables, RUT); cuentas de cobro con verificación obligatoria de seguridad social.
- **Nómina**: devengados/deducciones/provisiones/aportes; conceptos configurables (constitutivo o no); comisiones venta y recaudo; horas extra/recargos Ley 2466/2025 (nocturno desde 7 p.m., dominical escalonado); auxilio de transporte automático (≤2 SMMLV); préstamos con cuotas/saldo; desprendible PDF; archivo PILA; liquidación definitiva.
- **Novedades**: incapacidades, licencias, permisos (con soporte); vacaciones (solicitud→aprobación→disfrute, causados vs pendientes); bonificaciones y variaciones salariales con histórico; ingresos/desvinculaciones; día de la familia.
- **Autoservicio**: solicitudes de vacaciones/permisos/certificados con aprobación de Talento Humano o Subgerencia (todo ítem requiere su autorización); descarga de desprendibles y certificación laboral.
- **Activos/dotación/desarrollo**: activos con acta de entrega/devolución; dotación legal 3×año con soporte; capacitaciones con asistencia; evaluación de desempeño.

### Jurídica
Plantillas de contrato por modalidad (fijo máx. 4 años); RIT con debido proceso; repositorio versionado de contratos/otrosí/políticas; proceso disciplinario (citación→descargos→decisión→recurso, con soportes); política anti-acoso (Ley 2466) y canal de denuncia; habeas data Ley 1581 (autorización por persona, datos de salud restringidos, consultas/reclamos); terminaciones (liquidación, paz y salvo, actas); **calendario de obligaciones legales** con periodicidad, responsable, sede y alertas (5 días hábiles + 1 día) — seed completo: matrícula mercantil por sede (31-mar), asamblea (31-mar), renta, IVA, retefuente, ICA por municipio, exógena, RUT, RUB, PILA mensual, cesantías (14-feb), intereses (31-ene), primas (jun/dic), UGPP, RNBD (2-ene–31-mar), reporte semestral reclamos SIC (20-feb/ago), inscripción BD nuevas, autoevaluación SST anual, COPASST/Convivencia (2 años), exámenes periódicos; y como documentos con vigencia: convenios financieras (Addi, Banco de Bogotá, Sumas Pay, PayJoy, Krediya…), acuerdos de transmisión de datos, arriendos, pólizas, marca SIC (10 años), dominios, licencias SaaS, firma digital, permisos por establecimiento.

### SST (Decreto 1072/2015, Resolución 0312/2019)
SG-SST (política firmada, responsable, plan anual, autoevaluación estándares mínimos + plan de mejora, matriz legal); Vigía/COPASST y Comité de Convivencia con actas; matriz IPEVR por sede, profesiograma, plan de emergencias, inspecciones; exámenes ingreso/periódicos/egreso con alerta, ARL, recomendaciones/restricciones; accidentes (FURAT, investigación, estadísticas); capacitación/inducción y EPP con soporte firmado; tablero con semáforo e indicadores (frecuencia, severidad, ausentismo).

### Prioritarios específicos
- **Alertas en TODA la app**: 1ª alerta 10 días HÁBILES antes (excluye domingos y festivos CO; sábado es hábil), última 3 días antes. Correo incluido, WhatsApp preparado.
- **Terminaciones**: todos los tipos (renuncia, con/sin justa causa, anticipada, mutuo acuerdo, vencimiento plazo, periodo de prueba, fin OPS), actas/soportes, preaviso e indemnización.
- **Contratos por pestañas** OPS/Fijo/Indefinido; modalidad de trabajo: Presencial/Remoto/Híbrido/Teletrabajo.
- **Bonos** con estado de pago, fecha, soporte y marca constitutivo. **Paz y salvo** con checklist por área. **Certificaciones laborales** 4 tipos (simple/con salario/con funciones/entidad financiera), dirigida a, estado, PDF guardado, solicitable en autoservicio.

### Roles (seed, 9): Administrador, Subgerencia, Recursos Humanos, Nómina, Contador, Jefe de área, Empleado, Jurídica, Responsable SST — matriz de permisos editable.

### Reportes
Personas por sede/ciudad/cargo, laborales vs OPS, remotos, masa salarial; semáforo documental; fijos por vencer y fin de prueba; cuentas OPS sin soporte SS; rotación, ausentismo, accidentalidad.

---

## Stack y arquitectura (veredictos finales)

| Área | Decisión |
|---|---|
| Framework | **Next.js 15** (App Router, TypeScript estricto, Server Actions), deploy en **Vercel Pro** |
| BD / archivos | **Supabase**: PostgreSQL (pooler PgBouncer `DATABASE_URL` + `DIRECT_URL` para migraciones) + Storage (un bucket privado `documentos`, prefijos por entidad, **signed upload URLs directas** — evita límite 4.5 MB de Vercel) |
| ORM | **Prisma ≥5.19** — esquema en **ESPAÑOL** (`Colaborador`, `Vencimiento`, PascalCase→snake_case), PK **UUIDv7**, dinero `Decimal(14,2)`, fechas de negocio `@db.Date` puras |
| Auth | **Better Auth** (adaptador Prisma, plugin admin, `disableSignUp`, invitación por correo, cambio de contraseña forzado). Supabase Auth NO se usa; sin RLS — autorización 100% en capa de aplicación |
| RBAC | Matriz en BD: `Rol` + `RolPermiso` con **alcance por permiso** (`TODAS_SEDES / SEDES_ASIGNADAS / EQUIPO / PROPIO`) + `UsuarioSede`. `modulo` como string validado (soporta `custom:{slug}`). Patrón servidor: `withActionContext → requirePermission → scopeWhere`. Datos clínicos solo con permiso `personas.salud` |
| Auditoría | Prisma Client Extension + AsyncLocalStorage: create/update/delete con diff JSON **en la misma transacción**; campos sensibles redactados; exclusión de tablas ruido |
| UI | Tailwind CSS + **shadcn/ui**, TanStack Table (paginación servidor + export), react-hook-form + **zod** (schemas únicos compartidos entre forms/actions/importador), Recharts, d3-org-chart, dnd-kit |
| PWA | **Serwist**: shell cacheado, **datos y documentos jamás cacheados** (`NetworkOnly`). Sidebar desktop / bottom-nav + drawer móvil. Selector global de sede/ciudad (cookie). Búsqueda global Ctrl+K (pg_trgm) |
| PDF | **@react-pdf/renderer** (runtime nodejs, fuentes locales del bundle); todo PDF generado se persiste como `Documento` |
| Correo | **Resend** (plan pago) + react-email; outbox `MensajeSaliente` con dedupe/reintentos; interfaz de proveedor desacoplada (WhatsApp después por env var) |
| Excel | **exceljs** (no SheetJS: CVEs/CDN). Flujo: plantilla → parseo en cliente → validación zod con vista previa de errores por fila → lotes de 100 en transacción → registro `ImportacionDatos` con archivo original |
| Festivos | **`colombian-holidays`** encapsulada en `lib/dias-habiles.ts` único + tabla `FestivoExcepcion` (ADD/REMOVE) + config sábado (default: hábil). La consumen alertas, nómina y plazos jurídicos. Plan B documentado: algoritmo Emiliani propio |
| Fechas | Todo `DATE` puro; helper único `todayBogota()`; prohibido `new Date(string)` para fechas puras; crons a las 10:30/11:00 UTC (05:30/06:00 Bogotá) |
| Decimales | decimal.js en todo el motor de nómina; jamás `Number`; `ROUND_HALF_UP` por concepto; round-100-up solo aportes/PILA; Decimal→string en frontera server→client |

### Patrones transversales del modelo de datos
- **`Documento` polimórfico**: cualquier entidad tiene N archivos (`entidadTipo` + `entidadId`), con `TipoDocumento` (nivel de acceso, requiere vencimiento, override de alertas) y `DocumentoRequerido` por tipo de vínculo → semáforo documental.
- **Motor de vencimientos** (arquitectura D3 renombrada): `TipoVencimiento` (seed: examen_medico, contrato_fijo, periodo_prueba, planilla_ss_ops, obligacion_legal, poliza, arriendo, convenio_financiera, marca, dominio_web, licencia_software, documento_generico, modulo_personalizado…) + `Vencimiento` polimórfico + `ResponsableVencimiento` (usuario y/o rol, principal/copia) + `ReglaAlerta` configurable por tipo (default global D-10 hábiles y D-3 hábiles; calendario legal D-5 hábiles y D-1 calendario) + **`AlertaVencimiento` materializada** (`@@unique(vencimientoId, stepKey)`) → idempotencia estructural. API: `publicarVencimiento / reprogramar / resolver / cancelar`.
- **Dos crons** (`vercel.json`, protegidos con `CRON_SECRET`, presupuesto 80% maxDuration + self-reinvoke): `/api/cron/calendario-legal` 10:30 UTC (genera ocurrencias, horizonte 120 días) y `/api/cron/alertas` 11:00 UTC (claim `FOR UPDATE SKIP LOCKED`, lotes 200, marca vencidos, notifica in-app + correo: crítico individual + digest diario por responsable, Resend Batch ≤100, catch-up con `scheduled_for <= hoy`).
- **Notificaciones**: `Notificacion` in-app con `dedupeKey` único + campana con **polling** (60 s + focus; NO Supabase Realtime — incompatible con Better Auth) + `MensajeSaliente` (outbox QUEUED/SENT/FAILED/DEAD).
- **Calendario legal**: `ObligacionLegal` (recurrencias `MONTHLY/ANNUAL/SEMIANNUAL/EVERY_N_YEARS/EVENT_BASED`, `perBranch` para ICA/matrícula por sede, flag `usesTaxCalendar`) + `OcurrenciaObligacion` (generación al completar + por horizonte). Pólizas/arriendos/convenios/marca/dominios/licencias NO van al calendario: son `DocumentoLegal` con `vigenciaFin` → publican su propio `Vencimiento` (una sola fuente de alerta por cosa).
- **Módulos personalizados**: `ModuloPersonalizado` (nombre, icono, sección de menú, vínculo `GLOBAL|POR_COLABORADOR|POR_SEDE`) + `CampoPersonalizado` tipado (TEXTO, TEXTO_LARGO, NUMERO, DECIMAL, MONEDA, FECHA con flag `generaAlerta` + offsets, OPCION, MULTI_OPCION, SI_NO, ARCHIVO→Documento, COLABORADOR) + registros JSONB validados con zod dinámico + permisos `custom:{slug}` por rol + wizard con dnd-kit.
- **Nómina temporal**: `ParametroLegal` clave/valor con `vigenciaDesde/Hasta` y `fuenteLegal` obligatoria (los cambios legales no se alinean al año: divisor 220→210 el 15-jul-2026, franja nocturna 7 p.m. desde 25-dic-2025, dominical 80→90% el 1-jul-2026; SMMLV 2026 $1.750.905 suspendido cautelarmente — debe ser editable). + `TarifaArl` (clase por **cargo** con override por colaborador), `RangoFsp`, `TramoRetefuente`, `TipoHora` (HED/HEN/RN/RD/RND/HEDD/HEND con factores y vigencias). Horas extra: se registran **rangos horarios** y el clasificador deriva tipos automáticamente (editable con auditoría). `ConceptoNomina`: flags `constitutivoSalario, afectaIbcSs, basePrestaciones, baseVacaciones, afectaRetefuente, prorrateaPorDias`; tipos `VALOR_FIJO|PORCENTAJE_BASE|CANTIDAD_POR_VALOR|EXPRESION (mathjs restringido)|SISTEMA (TS versionado)`; regla Ley 1393 (tope 40% no constitutivo). Periodos `BORRADOR→CALCULADA→APROBADA→CERRADA→PAGADA` con `parametrosSnapshot` congelado; cerrados inmutables; correcciones = **periodo de ajuste**; advisory lock por periodo.
- **OPS**: `CuentaCobroOps` + hija `SoporteSsOps` (operador, periodo, IBC ≥40% mensualizado con tolerancia 1%, verificador); estados `RADICADA|EN_VERIFICACION_SS|BLOQUEADA_SS|APROBADA|PAGADA|RECHAZADA`; **CHECK en BD**: imposible aprobar/pagar sin soporte válido.
- CHECKs, índices parciales y vistas SQL (`v_saldo_vacaciones`, `v_ausentismo`, `v_rotacion`, `v_masa_salarial`, `v_semaforo_documental`) en migraciones SQL custom versionadas, con test de integridad.

### Vacíos detectados e incorporados al alcance (de la síntesis, V1–V18)
`SuspensionContrato` (efectos en nómina/PILA-SLN); `OrdenDescuento` (libranzas/embargos con topes de inembargabilidad y prelación); preaviso de no renovación de fijo (alerta D-45 + acción renovar/no renovar, CST 46); Día de la Familia como obligación semestral + registro masivo; `AcuseDocumento` (RIT/políticas por colaborador, bloqueo blando del disciplinario); regla Vigía(<10)/COPASST(≥10) + checklists 0312 por nivel (7/21/60); `ConsignacionCesantias` por colaborador; elegibilidad de dotación (≤2 SMMLV, ≥3 meses); importador con saldos iniciales (contrato vigente + vacaciones pendientes); `telefonoE164`+`whatsappOptIn` desde fase 1; simulacro anual por sede (seed); plan de mejora SST como `AccionCorrectiva` rastreables; export contable de nómina por concepto/cuenta/sede; dashboards por rol definidos; reglas para practicantes ≠ aprendices; headcount/horas-hombre SST precalculados; dispersión bancaria (export por banco con cuenta+neto).

### Alcance pactado explícitamente (comunicado al cliente)
- **PILA v1** = "Resumen PILA" Excel/CSV mapeado a los campos del operador (Aportes en Línea/SOI) con totales de control; el plano nativo Res. 2388 queda como v2 detrás de interfaz `PilaExporter`. `PlanillaPila` registra el pago mensual y su vencimiento.
- **Nómina electrónica DIAN**: fuera de alcance v1 (no está en el documento); el modelo con snapshot deja los datos listos para integrarla vía proveedor autorizado.
- **Costos de producción**: Vercel Pro (~US$20/mes), Supabase Pro (~US$25/mes — backups diarios y 100 GB Storage; free tier solo para desarrollo), Resend pago. WhatsApp requerirá cuenta Meta/Twilio cuando se active.

---

## Fases de implementación (cada una desplegable y verificable)

> Orden con dependencias: alertas (F3) antes que contratos/jurídica/SST (todos publican en él); nómina (F6) después de contratos+novedades; terminaciones (F7) después de nómina.

**F1 — Esqueleto desplegable.** Next.js + Prisma + Supabase; Better Auth (login, invitación, recuperación); shell responsive + PWA base + página offline; selector de sede; extensión de auditoría; `requirePermission/scopeWhere`; seed 9 roles + matriz editable; CRUD sedes/ciudades; `ConfiguracionEmpresa`; gestión de usuarios. *Copiar docs de diseño a `docs/diseno/`.*
✓ Deploy en Vercel; login admin seed; invitación llega por correo y fuerza cambio de contraseña; el menú cambia al editar la matriz; AuditLog registra diffs; PWA instalable en celular.

**F2 — Colaboradores + documental + importador.** Ficha completa con tabs; catálogos (EPS/ARL/AFP/cajas, bancos, áreas, cargos); `Documento` polimórfico + tipos + requeridos (semáforo); subida directa a Storage (cámara en móvil, compresión ~1600px); visor PDF/imagen; organigrama; búsqueda global; importador Excel con saldos iniciales.
✓ Crear colaborador con foto y 5 documentos desde el celular; importar 100 filas con 7 erróneas → 93 insertadas + reporte; organigrama navegable; búsqueda respeta alcance.

**F3 — Motor de vencimientos + notificaciones.** `lib/dias-habiles.ts` con tests (traslado Emiliani); servicios publicar/reprogramar/resolver; materialización de alertas; `ReglaAlerta` + editor; cron de alertas (outbox, Resend, digest+crítico); campana; tablero `/vencimientos` con semáforo y filtros sede/ciudad. Primera fuente: `Documento.fechaVencimiento`.
✓ Documento que vence en 12 días hábiles materializa D-10H/D-3H/DUE; cron dos veces seguidas → cero duplicados; resolver → alertas SKIPPED; correos llegan.

**F4 — Contratación laboral + OPS.** Pestañas Fijo/Indefinido/Obra/Aprendizaje; prórrogas (CST: 3 prórrogas <1 año, máx 4 años); otrosí con histórico que actualiza snapshots; periodo de prueba → vencimiento; preaviso no renovación; `PlantillaDocumento` con variables; `VariacionSalarial`; `SuspensionContrato`; OPS completo con cuentas de cobro + bloqueo SS (UI + CHECK).
✓ Contrato fijo publica vencimiento; prórroga reprograma alertas; aprobar cuenta sin soporte SS imposible; reporte "cuentas sin soporte SS".

**F5 — Novedades + autoservicio + certificaciones.** Incapacidades (prórrogas/recobro), licencias, permisos, vacaciones con `v_saldo_vacaciones`; bonificaciones; flujo de aprobación configurable N pasos (seed: jefe inmediato opcional → RRHH o Subgerencia) + bandeja; certificaciones 4 tipos con primer PDF membretado; descargas en autoservicio.
✓ Solicitud de vacaciones desde el celular → jefe → RRHH → saldo descontado con notificación por paso; saldo = cálculo manual; certificado PDF guardado y descargable.

**F6 — Nómina (la más compleja).** Seeds de parámetros 2025/2026 con vigencias y fuente legal; conceptos sistema + configurables; `NovedadHoras` + clasificador; comisiones (`ReglaComision` + import CSV); préstamos + `OrdenDescuento`; motor de liquidación (IBC + Ley 1393, FSP, exoneración 114-1, incapacidades por tramo 66.67%, auxilio transporte automático proporcional, retefuente proc. 1); aprobación/cierre con snapshot; desprendibles PDF en lote; Resumen PILA; export contable; dispersión bancaria.
✓ **Gate: suite de golden tests validada con el contador** — mínimo con auxilio; HE nocturna pre/post 25-dic-2025; dominical 80% vs 90% (1-jul-2026); divisor 220→210 (15-jul-2026); incapacidad 5 días; FSP 4 SMMLV; exonerado vs no; ingreso a mitad de mes; reliquidación → periodo de ajuste. Σ devengados−deducciones=neto; liquidar dos veces → idéntico.

**F7 — Terminaciones + liquidación definitiva + paz y salvo.** Todos los tipos; liquidación definitiva (cesantías/intereses/prima/vacaciones con promedios de variable, indemnización CST 64 por rangos); paz y salvo con checklist por área (ítems automáticos: activos asignados, préstamos con saldo); actas PDF; enlace a examen de egreso.
✓ Liquidación coincide con cálculo manual del contador; paz y salvo no cierra con pendientes.

**F8 — Activos, dotación, capacitaciones, evaluaciones.** Inventario + asignación con actas PDF; dotación 3×año con elegibilidad y vencimientos (30-abr/31-ago/20-dic); capacitaciones con asistencia; evaluación de desempeño con plantillas.
✓ Activo asignado → ítem automático en paz y salvo; corte de dotación lista solo elegibles.

**F9 — Jurídica + calendario legal.** Repositorio versionado (`VersionDocumentoLegal`, única vigente) + acuses; disciplinarios por etapas con actas y bloqueo sin descargos; canal anti-acoso (denuncia anónima por código, acceso restringido a Convivencia/Jurídica); habeas data (autorizaciones, consultas/reclamos con plazos); calendario legal completo (seed 29+ obligaciones) + cron horizonte + UI calendario/lista + completar con evidencia.
✓ Completar "PILA marzo" genera "PILA abril"; `perBranch` genera una ocurrencia por sede; alertas 5H/1; reporte semestral SIC sale con datos.

**F10 — SST.** Comités (sugerencia Vigía/COPASST por headcount) con reuniones/compromisos; IPEVR por sede (GTC-45); profesiograma por cargo; exámenes médicos con próximos según profesiograma; novedades ARL; accidentes (FURAT 2 días hábiles, investigación 15 días, acciones correctivas); inspecciones; EPP con reposición; autoevaluación 0312 por nivel + plan de mejora rastreable; indicadores con headcount automático; tablero SST.
✓ Examen periódico → próximo vencimiento según profesiograma; accidente → alerta FURAT; IF/IS coinciden con cálculo manual; datos clínicos invisibles para rol Nómina.

**F11 — Módulos personalizados + reportes + cierre.** Constructor de módulos (wizard, dnd-kit, permisos custom); `DynamicForm/DynamicTable`; campos FECHA con alerta; vistas SQL de reportes; catálogo `/reportes` con filtros sede/ciudad + export xlsx; dashboards por rol; hardening PWA y pulido móvil final.
✓ Admin crea módulo "Pólizas de vehículos" con fecha-con-alerta sin deploy → registro genera vencimiento; cada reporte del documento validado contra datos sembrados; export respeta filtros y alcance.

---

## Riesgos clave y mitigación (resumen — detalle completo en d5_synthesis.md §4)

- **Vercel/Supabase free tier insuficientes** → Pro en ambos para producción; compresión de imágenes; límite 25 MB/archivo; signed upload URLs.
- **Precisión decimal** → decimal.js en todo el motor; golden tests del contador como gate.
- **Zona horaria** → `DATE` puro + `todayBogota()`; cron 11:00 UTC; tests de borde 04:59 UTC.
- **SMMLV 2026 suspendido judicialmente** → parámetros con vigencias editables + periodos de ajuste (flujo probado en tests).
- **PgBouncer** → `pgbouncer=true` + `DIRECT_URL`; transacciones cortas por lotes.
- **Auditoría** → en la misma transacción de la mutación (no fire-and-forget).
- **mathjs** → instancia restringida solo aritmética; conceptos legales siempre en código.
- **PDFs masivos** → lotes de 50 con re-invocación encadenada, estado en BD.
- **Ley 1581** → `nivelAcceso` en documentos, permiso `personas.salud`, redacción en auditoría, URLs firmadas 10 min, nada sensible en cache del service worker.

## Verificación global
1. Cada fase tiene criterios ✓ propios (arriba) — se verifican en el deploy de Vercel y en un celular real (PWA instalada).
2. Tests automatizados: unitarios de días hábiles/festivos (Emiliani), golden tests de nómina (gate F6), test de integridad de CHECKs/constraints, idempotencia del cron.
3. Recorrido final contra el .docx requerimiento por requerimiento (sección "Requerimientos" de este plan como checklist).
4. Datos semilla de demostración (sedes Bogotá/Medellín, ~10 colaboradores de todos los vínculos) para validar reportes, filtros por sede/ciudad y alcances de rol.
