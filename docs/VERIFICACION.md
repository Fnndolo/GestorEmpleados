# Verificación contra los requerimientos — KUPOCELL S.A.S. (Smart Gadgets)

Recorrido punto por punto del documento `Requerimientos Plataforma RH_KUPOCELL.docx`. Cada
requerimiento se marca con su estado y dónde está implementado.

Leyenda: ✅ implementado · ⚙️ implementado con alcance v1 documentado.

## 1–2. Generales (no negociables)

| Requerimiento | Estado | Dónde |
|---|---|---|
| Sin límite de empleados, registros ni documentos | ✅ | PostgreSQL (Supabase) + Storage; sin topes en código |
| Base de datos real (no Excel) + archivos en la nube | ✅ | Prisma/PostgreSQL + Supabase Storage (`src/server/storage.ts`) |
| Carga de muchos documentos escaneados por persona | ✅ | `Documento` polimórfico + subida con compresión (`gestor-documentos.tsx`) |
| Base de datos como respaldo (no perder información) | ✅ | Supabase Pro con backups diarios (ver despliegue) |
| Usuarios y permisos por rol (Subgerencia, TH, Contabilidad…) | ✅ | RBAC con 9 roles seed + matriz editable (`/configuracion/roles`) |
| Trazabilidad/auditoría (quién creó/modificó/eliminó y cuándo) | ✅ | Extensión Prisma `dbAuditado` → `AuditLog` con diff |
| Motor de alertas de vencimiento transversal | ✅ | F3 — `Vencimiento`/`AlertaVencimiento` + cron |
| Separación por sede/ciudad (filtros y reportes) | ✅ | Selector global de sede + filtros en listados y reportes |
| El Administrador puede crear pestañas/módulos | ✅ | Módulos personalizados (`/configuracion/modulos`) |

## 3. Recursos Humanos

| Requerimiento | Estado | Dónde |
|---|---|---|
| 3.1 Ficha completa (datos, contacto, emergencia, educación, salud, bancarios, foto) | ✅ | `/colaboradores/[id]` con tabs |
| Todo tipo de vínculo (indefinido, fijo, obra, aprendiz, OPS, practicante) | ✅ | enum `TipoVinculo` + pestañas |
| Áreas, cargos, jefe inmediato, organigrama | ✅ | Catálogos + `/colaboradores/organigrama` |
| 3.2 Contratos laborales (salario, jornada, modalidad, sede, cargo, fechas) | ✅ | F4 `/contratos` |
| Prórrogas y otrosí; periodo de prueba con alerta | ✅ | Acciones con reglas CST + vencimientos |
| Flujo OPS separado de nómina (objeto, valor, supervisor, entregables, RUT) | ✅ | `ContratoOps` |
| Cuentas de cobro OPS con verificación obligatoria de seguridad social | ✅ | `SoporteSsOps` + trigger en BD (no aprueba sin SS válida) |
| 3.3 Nómina: devengados, deducciones, provisiones, aportes | ✅ | Motor `liquidar()` con golden tests |
| Conceptos configurables (constitutivo o no) | ✅ | `ConceptoNomina` |
| Comisiones de venta y recaudo | ✅ | `Comision` (VENTA/RECAUDO) |
| Horas extra y recargos (Ley 2466/2025, nocturno 7 p.m., dominical escalonado) | ✅ | `TipoHora` con factores y vigencias |
| Auxilio de transporte automático (≤2 SMMLV) | ✅ | En el motor (test golden) |
| Préstamos y descuentos con cuotas y saldo | ✅ | `Prestamo`/`CuotaPrestamo` |
| Desprendible de pago PDF | ✅ | `renderDesprendible` |
| Archivo PILA | ⚙️ | v1: "Resumen PILA" Excel con totales de control (`/api/nomina/[id]/pila`) |
| Liquidación definitiva al retiro | ✅ | F7 `liquidacionDefinitiva()` |
| 3.4 Incapacidades, licencias, permisos (con soporte) | ✅ | F5 `/novedades` |
| Vacaciones (solicitud→aprobación→disfrute, causados vs pendientes) | ✅ | `saldoVacaciones()` + autoservicio |
| Bonificaciones y variaciones salariales con histórico | ✅ | `Bonificacion`, `VariacionSalarial` |
| Ingresos y desvinculaciones; Día de la familia | ✅ | Novedades + obligación semestral en calendario |
| 3.5 Autoservicio (vacaciones, permisos, certificados con aprobación TH/Subgerencia) | ✅ | `/autoservicio` con flujo de aprobación |
| Descarga de desprendibles y certificación laboral | ✅ | Autoservicio + ficha |
| 3.6 Activos con acta de entrega/devolución | ✅ | F8 — actas PDF automáticas |
| Dotación legal (3 entregas/año) con soporte | ✅ | `EntregaDotacion` |
| Capacitaciones con asistencia y evaluación de desempeño | ✅ | F8 `/capacitaciones`, `/evaluaciones` |

## 4. Jurídica

| Requerimiento | Estado | Dónde |
|---|---|---|
| Plantillas de contrato por modalidad (fijo ≤ 4 años) | ✅ | `PlantillaDocumento` + validación CST en acciones |
| RIT con debido proceso; repositorio versionado | ✅ | `DocumentoLegal`/`VersionDocumentoLegal` |
| Proceso disciplinario (citación→descargos→decisión→recurso, con soportes) | ✅ | F9 con bloqueo de decisión sin descargos |
| Política anti-acoso (Ley 2466) y canal de denuncia | ✅ | `DenunciaAcoso` con código anónimo |
| Habeas data (autorización por persona, datos de salud restringidos, consultas/reclamos) | ✅ | `AutorizacionDatos`, `ConsultaReclamoDatos` + permiso `colaboradores_salud` |
| Terminaciones (liquidación, paz y salvo, justa causa, actas) | ✅ | F7 |
| Calendario de obligaciones legales con alertas (5 hábiles + 1 día) | ✅ | F9 — 21 obligaciones seed + cron + regla de alerta |
| Auditoría y control de versiones de políticas | ✅ | `VersionDocumentoLegal` + AuditLog |
| 4.1 Detalle del calendario (matrícula, asamblea, renta, IVA, retefuente, ICA por municipio, exógena, RUT, RUB, PILA, cesantías, intereses, primas, UGPP, RNBD, reporte SIC, autoevaluación SST, COPASST/Convivencia, marca SIC, dominios, licencias…) | ✅ | `prisma/seed-obligaciones.ts` (recurrentes) + `DocumentoLegal` con vigencia (pólizas/arriendos/convenios/marca/dominios/licencias) |

## 5. SST (Decreto 1072/2015, Resolución 0312/2019)

| Requerimiento | Estado | Dónde |
|---|---|---|
| SG-SST: política, responsable, plan anual, autoevaluación + plan de mejora, matriz legal | ✅ | F10 + obligaciones en calendario |
| Vigía/COPASST y Comité de Convivencia (con actas), según número de trabajadores | ✅ | `Comite` + recomendación por headcount |
| Matriz de peligros (IPEVR) por sede, profesiograma, plan de emergencias, inspecciones | ✅ | `PeligroIpevr` + simulacro en calendario |
| Exámenes médicos ingreso/periódicos/egreso (con alerta), ARL, recomendaciones/restricciones | ✅ | `ExamenMedico` con datos clínicos restringidos + vencimiento |
| Accidentes (FURAT, investigación, estadísticas) | ✅ | `AccidenteTrabajo` con alerta FURAT |
| Capacitación/inducción y EPP con soporte firmado | ✅ | F8 capacitaciones + `EntregaEpp` |
| Tablero SST: semáforo e indicadores (frecuencia, severidad, ausentismo) | ✅ | Tablero `/sst` + `IndicadorSst` |

## 6. Prioritarios específicos

| Requerimiento | Estado | Dónde |
|---|---|---|
| 6.1 Alertas en TODA la app: 10 días hábiles antes + 3 días antes | ✅ | `ReglaAlerta` GLOBAL (10/3 hábiles) |
| Días hábiles excluyen domingos y festivos CO (sábado hábil) | ✅ | `lib/dias-habiles.ts` (Emiliani) + 10 tests |
| Correo automático (deseable) + WhatsApp (preparado) | ✅ | Resend + outbox con interfaz para WhatsApp |
| 6.2 Terminaciones: todos los tipos, actas/soportes, preaviso e indemnización | ✅ | F7 |
| 6.3 Contratos por pestañas OPS/Fijo/Indefinido; modalidad de trabajo | ✅ | `/contratos` con pestañas + `ModalidadTrabajo` |
| 6.4 Bonos con estado de pago, fecha, soporte y constitutivo | ✅ | `Bonificacion` |
| 6.5 Separación por sedes/ciudades en listados, tableros y alertas | ✅ | Transversal |
| 6.6 Paz y salvo con chequeo por área | ✅ | `PazYSalvo`/`PazYSalvoItem` |
| 6.7 Certificaciones 4 tipos, dirigida a, estado, PDF, desde autoservicio | ✅ | `generarCertificacion` |

## 7–8. Roles y reportes

| Requerimiento | Estado | Dónde |
|---|---|---|
| 6 roles sugeridos (+ Subgerencia, Jurídica, SST = 9) | ✅ | Seed de roles |
| Reportes: personas por sede/ciudad/cargo, laborales vs OPS, remotos, masa salarial | ✅ | `/reportes` |
| Semáforo documental (vencido/por vencer/al día) | ✅ | Ficha del colaborador + `/vencimientos` |
| Fijos por vencer y fin de prueba | ✅ | `/reportes` |
| Cuentas OPS sin soporte SS | ✅ | `/contratos/cuentas-riesgo` |
| Rotación, ausentismo, accidentalidad | ✅ | `/reportes` |

## Pruebas automatizadas

- `pnpm test` → 23 pruebas: días hábiles/festivos CO (10) y motor de nómina (13, gate del cliente:
  cuadre contable, exoneración Ley 114-1, FSP, salario integral, proporcionalidad, idempotencia…).

## Alcance v1 comunicado (decisiones explícitas)

- **PILA**: v1 entrega "Resumen PILA" en Excel con totales de control; el plano nativo Res. 2388
  queda detrás de la interfaz para una v2.
- **Nómina electrónica DIAN**: fuera de alcance v1; el modelo guarda los datos necesarios.
- **WhatsApp**: interfaz de proveedor desacoplada lista; requiere cuenta Meta/Twilio al activar.
