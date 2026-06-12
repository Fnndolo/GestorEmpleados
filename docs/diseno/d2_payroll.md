# Motor de NÃ³mina Colombiana â€” DiseÃ±o funcional y de cÃ¡lculo (KUPOCELL S.A.S.)

DiseÃ±o listo para implementar sobre el stack decidido: Next.js 15 + Server Actions, Prisma sobre Supabase PostgreSQL, Supabase Storage, Vercel Cron, Resend. Convenciones globales de este dominio:

- **Dinero**: `Decimal @db.Decimal(14,2)` en Prisma; redondeo al peso en cada concepto (`ROUND_HALF_UP`); cotizaciones de seguridad social se aproximan al **mÃºltiplo de 100 inmediatamente superior** (regla PILA) solo en la capa de aportes/PILA, no en el desprendible.
- **Base de dÃ­as**: comercial 30/360. Todo mes vale 30 dÃ­as (incluido febrero); la quincena vale 15.
- **Versionamiento temporal**: todo parÃ¡metro legal lleva `vigencia_desde` / `vigencia_hasta` (nullable = vigente). El motor resuelve el valor con la **fecha de cada dÃ­a liquidado**, no con la fecha de cÃ¡lculo â€” imprescindible porque la Ley 2466/2025 y la Ley 2101/2021 cambian tarifas a mitad de aÃ±o.
- **Snapshot**: al cerrar un periodo se congela en `nomina_periodo.parametros_snapshot JSONB` la resoluciÃ³n de todos los parÃ¡metros usados, para reproducibilidad y auditorÃ­a.

> **Alerta de diseÃ±o (verificada por web, jun-2026):** el Decreto 1469/2025 que fijÃ³ el SMMLV 2026 fue **suspendido provisionalmente por el Consejo de Estado** (auto del 12-feb-2026); el Decreto 0159 del 19-feb-2026 mantiene **transitoriamente** $1.750.905 mientras se decide el fondo. Si un fallo posterior cambia el valor, habrÃ¡ que recalcular retroactivamente. Por eso los parÃ¡metros son **editables por el admin con vigencias** y el motor soporta **reliquidaciÃ³n de periodos cerrados** generando un periodo de ajuste (nunca mutando el cerrado).

---

## 1. ParÃ¡metros legales por aÃ±o (editables por admin)

### 1.1 Modelo de datos

```prisma
model ParametroLegal {            // @@map("parametro_legal")
  id            String   @id @default(uuid())
  clave         String   // p.ej. "SMMLV", "AUX_TRANSPORTE", "UVT"
  valor         Decimal? @db.Decimal(14,4)   // escalares y porcentajes (0.04 = 4%)
  valorJson     Json?    // tablas (FSP, retefuente) si se prefiere embebido
  vigenciaDesde DateTime @db.Date
  vigenciaHasta DateTime? @db.Date
  fuenteLegal   String   // "Decreto 1470 de 2025", etc. â€” se imprime en reportes
  notas         String?
  @@unique([clave, vigenciaDesde])
}

model TarifaArl   { id, claseRiesgo Int /*1..5*/, tarifa Decimal, vigenciaDesde, vigenciaHasta }
model RangoFsp    { id, desdeSmmlv Decimal, hastaSmmlv Decimal?, tarifa Decimal, vigenciaDesde, vigenciaHasta }
model TramoRetefuente { id, desdeUvt Decimal, hastaUvt Decimal?, tarifaMarginal Decimal, uvtFijo Decimal, vigenciaDesde }
model TipoHora    { ... ver Â§3 }
```

FunciÃ³n Ãºnica de resoluciÃ³n (usada por TODO el motor):

```ts
resolverParametro(clave: string, fecha: Date): Decimal
// SELECT valor FROM parametro_legal WHERE clave=? AND vigencia_desde<=fecha
//   AND (vigencia_hasta IS NULL OR vigencia_hasta>=fecha) ORDER BY vigencia_desde DESC LIMIT 1
// Si no hay fila â†’ error bloqueante de liquidaciÃ³n (nunca defaults silenciosos).
```

UI admin: pantalla "ParÃ¡metros legales" con histÃ³rico por clave, botÃ³n "Crear vigencia 20XX" que clona el aÃ±o anterior, y validaciÃ³n de no-solapamiento. Toda ediciÃ³n queda en la auditorÃ­a transversal.

### 1.2 Datos semilla (verificados 2025 / 2026)

| Clave | 2025 | 2026 | Fuente legal |
|---|---|---|---|
| `SMMLV` | $1.423.500 | **$1.750.905** | Decreto 1572/2024; Decreto 1469/2025 (suspendido) + Decreto 0159/2026 transitorio |
| `AUX_TRANSPORTE` | $200.000 | **$249.095** | Decreto 1573/2024; Decreto 1470/2025 (no suspendido) |
| `UVT` | $49.799 | **$52.374** | Res. DIAN 000193/2024; Res. DIAN 000238 del 15-dic-2025 |
| `SALUD_EMPLEADO` | 4% | 4% | Ley 100/1993 art. 204 |
| `SALUD_EMPLEADOR` | 8,5% | 8,5% | Ley 100/1993 (exonerable, ver abajo) |
| `PENSION_EMPLEADO` | 4% | 4% | Ley 100/1993 art. 20 |
| `PENSION_EMPLEADOR` | 12% | 12% | Ley 100/1993 art. 20 |
| `CCF` (caja) | 4% | 4% | Ley 21/1982 â€” **nunca exonerable** |
| `SENA` | 2% | 2% | Ley 21/1982 (exonerable) |
| `ICBF` | 3% | 3% | Ley 89/1988 (exonerable) |
| `TOPE_IBC_SMMLV` | 25 | 25 | Ley 797/2003 |
| `PISO_IBC_SMMLV` | 1 | 1 | Ley 100/1993 |
| `INTERES_CESANTIAS_ANUAL` | 12% | 12% | Ley 52/1975 |
| `HORAS_SEMANA` / `DIVISOR_HORA` | 46 h â†’ 230 (hasta 14-jul-2025); 44 h â†’ **220** (desde 15-jul-2025) | 44 h â†’ 220 (hasta 14-jul-2026); 42 h â†’ **210** (desde 15-jul-2026) | Ley 2101/2021 (divisor = horas_semana/6 Ã— 30) |
| `SALARIO_INTEGRAL_MIN_SMMLV` | 13 | 13 | CST art. 132 (10 + 30% factor); IBC = 70% |

**ARL â€” `tarifa_arl` (Decreto 1772/1994, estable):** clase I 0,522% Â· II 1,044% Â· III 2,436% Â· IV 4,350% Â· V 6,960%. KUPOCELL (comercio retail de tecnologÃ­a): administrativos/ventas clase I; tÃ©cnicos de reparaciÃ³n posiblemente IIâ€“III â€” la clase de riesgo se guarda **por cargo/centro de trabajo**, no global.

**FSP â€” `rango_fsp` (Ley 100 art. 27, Decreto 1833/2016 â€” vigente; la tabla 1%â€“3% de la Ley 2381/2024 art. 20 estÃ¡ suspendida por la Corte Constitucional, Auto 841/2025; cuando entre en vigor el admin solo crea la nueva vigencia):**

| IBC en SMMLV | Tarifa total (empleado) |
|---|---|
| â‰¥ 4 y < 16 | 1,0% |
| â‰¥ 16 y â‰¤ 17 | 1,2% |
| > 17 y â‰¤ 18 | 1,4% |
| > 18 y â‰¤ 19 | 1,6% |
| > 19 y â‰¤ 20 | 1,8% |
| > 20 | 2,0% |

**ExoneraciÃ³n Ley 1607/2012, art. 114-1 E.T. ("CREE"):** flag en `empresa.exonerada_aportes` (KUPOCELL es persona jurÃ­dica contribuyente de renta â†’ `true`). Regla por empleado-mes: si `exonerada=true` **y** IBC del empleado **< 10 SMMLV** â†’ no se causan `SALUD_EMPLEADOR` (8,5%), `SENA` ni `ICBF`. Siempre se causan: salud 4% empleado, pensiÃ³n 16% completa, ARL y CCF 4%. Empleados con IBC â‰¥ 10 SMMLV pagan todo. La exoneraciÃ³n **no aplica a salarios integrales â‰¥ 10 SMMLV** ni cambia nada del lado del trabajador.

---

## 2. Motor de conceptos configurables e IBC

### 2.1 Modelo

```prisma
enum ClaseConcepto { DEVENGADO DEDUCCION PROVISION APORTE_PATRONAL }
enum TipoFormula   { VALOR_FIJO PORCENTAJE_BASE CANTIDAD_POR_VALOR EXPRESION SISTEMA }

model ConceptoNomina {            // @@map("concepto_nomina")
  id                  String  @id @default(uuid())
  codigo              String  @unique          // "HED", "COMISION_VENTA"...
  nombre              String
  clase               ClaseConcepto
  constitutivoSalario Boolean                  // marca CST art. 127/128
  afectaIbcSs         Boolean                  // default = constitutivoSalario (editable: aux transporte = false)
  basePrestaciones    Boolean                  // entra a base de cesantÃ­as/prima
  baseVacaciones      Boolean                  // entra a base de vacaciones (excluye HE y aux)
  afectaRetefuente    Boolean
  prorrateaPorDias    Boolean                  // sueldo sÃ­, bono no
  tipoFormula         TipoFormula
  formula             String?                  // expresiÃ³n, p.ej. "SALARIO_DIA * DIAS * 0.6667"
  porcentaje          Decimal? @db.Decimal(8,4)
  conceptoBase        String?                  // cÃ³digo del concepto base para PORCENTAJE_BASE
  cuentaContable      String?                  // para el contador
  esSistema           Boolean @default(false)  // los SISTEMA no se editan ni borran
  activo              Boolean @default(true)
}
```

**Evaluador de fÃ³rmulas (`EXPRESION`):** usar `mathjs` (mantenido, ~14k estrellas) creando una instancia restringida (`math.create()` con solo aritmÃ©tica, sin `import/createUnit/evaluate` de funciones peligrosas) sobre un scope de variables inyectadas: `SALARIO_BASE, SALARIO_DIA (=SALARIO_BASE/30), VALOR_HORA (=SALARIO_BASE/DIVISOR), DIAS, SMMLV, AUX_TRANSPORTE, UVT, IBC, CANTIDAD`. Prohibido strings y funciones no whitelisted. Los conceptos de motor (sueldo, HE, incapacidades, SS, provisiones) son `SISTEMA`: su lÃ³gica vive en cÃ³digo TypeScript versionado, no en fÃ³rmulas editables â€” solo los conceptos creados por el admin usan `EXPRESION`.

**Conceptos semilla (parcial):**

| CÃ³digo | Clase | Constitutivo | IBC | Prestaciones | Tipo |
|---|---|---|---|---|---|
| SUELDO | DEVENGADO | sÃ­ | sÃ­ | sÃ­ | SISTEMA |
| AUX_TRANSPORTE | DEVENGADO | no | **no** | **sÃ­** (cesantÃ­as/prima, Ley 1Âª/1963) | SISTEMA |
| HED/HEN/HEDD/HEND/RN/RD/RND | DEVENGADO | sÃ­ | sÃ­ | sÃ­ (no base vacaciones) | SISTEMA |
| COMISION_VENTA, COMISION_RECAUDO | DEVENGADO | **sÃ­ siempre** (CST 127) | sÃ­ | sÃ­ | SISTEMA |
| BONO_SALARIAL / BONO_NO_SALARIAL | DEVENGADO | sÃ­ / no | sÃ­ / no | sÃ­ / no | VALOR_FIJO |
| INCAP_EG_EMPLEADOR, INCAP_EG_EPS, INCAP_ARL, LIC_MATERNIDAD, LIC_PATERNIDAD, LIC_LUTO, VACACIONES_DISFRUTE | DEVENGADO | â€” | sÃ­ (sobre el valor pagado) | â€” | SISTEMA |
| SALUD_EMP, PENSION_EMP, FSP, RETEFUENTE, PRESTAMO, LIBRANZA, EMBARGO | DEDUCCION | â€” | â€” | â€” | SISTEMA |
| PROV_CESANTIAS, PROV_INT_CESANTIAS, PROV_PRIMA, PROV_VACACIONES | PROVISION | â€” | â€” | â€” | SISTEMA |
| SALUD_PAT, PENSION_PAT, ARL_PAT, CCF_PAT, SENA_PAT, ICBF_PAT | APORTE_PATRONAL | â€” | â€” | â€” | SISTEMA |

### 2.2 CÃ¡lculo del IBC (seguridad social)

```
ibc_bruto      = Î£ devengados con afectaIbcSs = true            // excluye aux transporte y pagos no salariales
// Regla Ley 1393/2010 art. 30: los pagos NO constitutivos no pueden superar el 40% del total remunerado
total_remun    = ibc_bruto + Î£ devengados no constitutivos (sin aux transporte)
exceso_40      = max(0, no_constitutivos âˆ’ 0.40 Ã— total_remun)
ibc            = ibc_bruto + exceso_40
// Pisos y topes (proporcionales a dÃ­as cotizados):
ibc            = clamp(ibc, SMMLV Ã— dias/30, 25 Ã— SMMLV)
// Salario integral: ibc = 0.70 Ã— salario_integral (clamp igual)
// Durante incapacidad/licencia: el IBC de esos dÃ­as es el valor de la prestaciÃ³n pagada,
//   sin bajar del SMMLV proporcional (se cotiza salud+pensiÃ³n; no ARL en incapacidad comÃºn).
```

El exceso Ley 1393 se materializa como concepto interno `AJUSTE_IBC_L1393` (no se paga, solo suma al IBC y a PILA).

---

## 3. Horas extra y recargos â€” Ley 2466 de 2025 (verificado)

Fechas verificadas: la Ley 2466 rige desde el **25-jun-2025**; la jornada nocturna desde las **7:00 p.m. aplica a partir del 25-dic-2025** (6 meses despuÃ©s); el recargo dominical/festivo es escalonado: **80% desde el 1-jul-2025, 90% desde el 1-jul-2026, 100% desde el 1-jul-2027**. Los porcentajes de horas extra (25% diurna, 75% nocturna) y el recargo nocturno (35%) no cambiaron â€” cambiÃ³ la **franja** nocturna (antes 21:00â€“06:00, ahora 19:00â€“06:00).

### 3.1 Tabla `tipo_hora` (semilla, con componentes y vigencias)

El factor total se **compone** en tiempo de liquidaciÃ³n: `factor = 1(si es hora trabajada extra) + recargo_extra + recargo_nocturno + recargo_dominical(fecha)`. Los recargos puros (RN, RD, RND) se liquidan solo por el recargo porque la hora ordinaria ya estÃ¡ en el sueldo.

| CÃ³digo | DescripciÃ³n | FÃ³rmula del factor | Hasta 30-jun-2025 | 1-jul-25â†’30-jun-26 | 1-jul-26â†’30-jun-27 | Desde 1-jul-2027 |
|---|---|---|---|---|---|---|
| HED | Extra diurna | 1 + 0,25 | 1,25 | 1,25 | 1,25 | 1,25 |
| HEN | Extra nocturna | 1 + 0,75 | 1,75 | 1,75 | 1,75 | 1,75 |
| RN | Recargo nocturno (solo recargo) | 0,35 | 0,35 | 0,35 | 0,35 | 0,35 |
| RD | Recargo dominical/festivo (solo recargo) | RD(fecha) | 0,75 | **0,80** | **0,90** | **1,00** |
| RND | Recargo nocturno dominical | 0,35 + RD | 1,10 | 1,15 | 1,25 | 1,35 |
| HEDD | Extra diurna dominical/festiva | 1 + 0,25 + RD | 2,00 | 2,05 | 2,15 | 2,25 |
| HEND | Extra nocturna dominical/festiva | 1 + 0,75 + RD | 2,50 | 2,55 | 2,65 | 2,75 |

**Franja nocturna versionada** (tabla `parametro_legal` clave `HORA_INICIO_NOCTURNA`): `21:00` hasta 24-dic-2025; `19:00` desde **25-dic-2025**. Fin: `06:00`.

**Valor hora ordinaria** = `salario_mensual / DIVISOR_HORA(fecha)` â†’ 230 hasta 14-jul-2025, **220** desde 15-jul-2025, **210** desde 15-jul-2026 (Ley 2101/2021). Con salario variable (comisiones), opciÃ³n configurable de promediar el variable del mes anterior en la base horaria.

### 3.2 Registro y clasificaciÃ³n automÃ¡tica

```prisma
model NovedadHoras { id, empleadoId, fecha @db.Date, horaInicio, horaFin, aprobadaPor, estado, origen /*manual|importacion*/ }
```

El usuario registra **rangos horarios**, no tipos: el clasificador parte el rango en tramos y asigna `tipo_hora`:

```
clasificar(rango, fecha):
  esDominicalFestivo = esDomingo(fecha) || esFestivoColombia(fecha)
  cortes = [inicio_nocturna(fecha), 06:00, fin_jornada_ordinaria_del_dia]
  para cada tramo resultante:
    extra     = horas que exceden la jornada diaria pactada (tras completar la ordinaria)
    nocturno  = tramo âˆ© franja nocturna vigente en esa fecha
    tipo      = matriz(extra?, nocturno?, esDominicalFestivo?)  â†’  HED|HEN|RN|RD|RND|HEDD|HEND
```

**Festivos**: implementar internamente el algoritmo Ley 51/1983 (Pascua por Butcher + traslado al lunes de los festivos "emilianos") en `lib/festivos-colombia.ts` â€” determinista, sin dependencia externa; alternativa mantenida: npm `date-holidays` (soporta `CO`). Este mismo calendario lo consume el motor de alertas (dÃ­as hÃ¡biles).

Cumplimiento Ley 2466: la ley endurece la carga de la prueba del registro de jornada â€” la tabla `novedad_horas` con auditorÃ­a (quiÃ©n registrÃ³/aprobÃ³ y cuÃ¡ndo) es a la vez el soporte probatorio. Tope legal: mÃ¡x. 2 HE/dÃ­a y 12 HE/semana â†’ validaciÃ³n con advertencia (no bloqueo, lo decide RH).

---

## 4. Auxilio de transporte, comisiones, prÃ©stamos, retefuente

### 4.1 Auxilio de transporte automÃ¡tico

```
elegible = salario_base â‰¤ 2 Ã— SMMLV(fecha)
        && modalidadTrabajo âˆˆ {PRESENCIAL, HIBRIDO}      // remoto/teletrabajo no genera desplazamiento
        && !empleado.excluirAuxTransporte                 // override manual auditado
dias_con_derecho = dias_trabajados âˆ’ dias_incapacidad âˆ’ dias_vacaciones âˆ’ dias_licencia_no_rem
valor = AUX_TRANSPORTE(fecha) / 30 Ã— dias_con_derecho
```

No suma al IBC de seguridad social, **sÃ­** a la base de cesantÃ­as y prima. Para HIBRIDO se paga completo (criterio conservador, configurable). Si el salario es variable, la elegibilidad se evalÃºa contra `salario_base` fijo del contrato (regla simple v1; flag para evaluar contra promedio).

### 4.2 Comisiones de venta y recaudo

```prisma
model ReglaComision   { id, tipo /*VENTA|RECAUDO*/, nombre, modo /*PORCENTAJE|TRAMOS*/, porcentaje?, tramosJson?, sedeId? }
model NovedadComision { id, empleadoId, periodoId, tipo, baseCalculo Decimal, valor Decimal, soporteUrl?, origen /*manual|csv*/ }
```

v1: las bases (ventas/recaudo del empleado) entran por **importaciÃ³n CSV** o digitaciÃ³n, el sistema aplica la regla y genera el concepto. Siempre constitutivas de salario (CST 127): entran a IBC, prestaciones y promedio de liquidaciÃ³n definitiva. La comisiÃ³n de **recaudo** se liquida en el periodo en que se confirma el recaudo (campo `periodo_causacion`).

### 4.3 PrÃ©stamos y descuentos

```prisma
model Prestamo      { id, empleadoId, fecha, monto, numCuotas, valorCuota, saldo, autorizacionUrl /*OBLIGATORIO: autorizaciÃ³n escrita CST 149*/, estado /*ACTIVO|PAGADO|SUSPENDIDO*/ }
model PrestamoCuota { id, prestamoId, numero, valorProgramado, valorAplicado, periodoId?, estado }
```

En cada liquidaciÃ³n el motor toma las cuotas `PENDIENTE` de prÃ©stamos `ACTIVO` y genera `PRESTAMO`. **Regla de protecciÃ³n del neto**: si `Î£ deducciones > 50% del neto devengado` (o el neto queda < 0), la cuota se aplica parcial y el resto se reprograma al final del plan (se crea cuota nueva); se notifica a NÃ³mina. Al retiro, el saldo se ofrece como descuento en la liquidaciÃ³n definitiva (requiere autorizaciÃ³n firmada; se enlaza al paz y salvo de cartera).

### 4.4 RetenciÃ³n en la fuente â€” Procedimiento 1 (opcional, flag por empresa)

CÃ¡lculo mensual; en nÃ³mina quincenal se liquida **en la 2Âª quincena** sobre el acumulado del mes:

```
pagos_mes        = Î£ devengados con afectaRetefuente (incluye salariales y no salariales gravados; excluye aux transporte... NO: el aux es exento solo para ICA â€” sÃ­ entra; v1: entra todo pago laboral)
ingr_no_const    = aporte_salud_emp + aporte_pension_emp + fsp
subtotal1        = pagos_mes âˆ’ ingr_no_const
deducciones      = dependientes (10% de pagos_mes, mÃ¡x 32 UVT) + medicina_prepagada (mÃ¡x 16 UVT) + intereses_vivienda (mÃ¡x 100 UVT)   // capturadas en ficha del empleado con soporte
renta_exenta_25  = 0.25 Ã— (subtotal1 âˆ’ deducciones), tope mensual 790/12 â‰ˆ 65,83 UVT (Ley 2277/2022)
limite_global    = min(0.40 Ã— subtotal1, 1340/12 UVT)            // deducciones + exentas no superan esto
base_gravable    = subtotal1 âˆ’ min(deducciones + renta_exenta_25, limite_global)
base_uvt         = base_gravable / UVT(aÃ±o)
retencion        = tabla art. 383 E.T. (tramo marginal):
   0â€“95: 0 | 95â€“150: (bâˆ’95)Ã—19% | 150â€“360: (bâˆ’150)Ã—28%+10,45 | 360â€“640: (bâˆ’360)Ã—33%+69,25
   | 640â€“945: (bâˆ’640)Ã—35%+161,65 | 945â€“2300: (bâˆ’945)Ã—37%+268,40 | >2300: (bâˆ’2300)Ã—39%+769,75   (en UVT)
retencion_pesos  = redondear_a_1000(retencion Ã— UVT)             // aproximaciÃ³n al mÃºltiplo de 1.000
```

Los tramos viven en `tramo_retefuente` (editables). v1 explÃ­citamente **no** implementa procedimiento 2 ni retenciÃ³n sobre indemnizaciones > 204 UVT (se deja advertencia en la liquidaciÃ³n definitiva para revisiÃ³n del contador).

---

## 5. PseudocÃ³digo de liquidaciÃ³n de un periodo

```prisma
model NominaPeriodo  { id, anio, mes, numero /*1|2 si quincenal*/, fechaInicio, fechaFin, frecuencia /*QUINCENAL|MENSUAL â€” config empresa*/, estado /*BORRADOR|CALCULADA|APROBADA|CERRADA|PAGADA*/, parametrosSnapshot Json?, sedeId? }
model NominaDetalle  { id, periodoId, empleadoId, diasTrabajados, ibc, totalDevengado, totalDeducido, neto, costoEmpleador }
model NominaConceptoValor { id, detalleId, conceptoCodigo, cantidad?, base?, factor?, valor, novedadRefId? /*trazabilidad a la novedad origen*/ }
```

```
function liquidarPeriodo(periodo):                      // Server Action; idempotente
  assert periodo.estado in (BORRADOR, CALCULADA)
  deleteDetalles(periodo)                               // recÃ¡lculo limpio en transacciÃ³n
  empleados = empleadosConContratoLaboralActivoEn(periodo.rango)   // excluye OPS y aprendices etapa lectiva sin nÃ³mina*
  for e in empleados:
    d = nuevoDetalle(e)
    // 1) DÃAS
    diasPeriodo   = periodo.frecuencia == QUINCENAL ? 15 : 30
    diasContrato  = recortarPorIngresoYRetiro(e, periodo)          // ingreso/retiro a mitad de periodo
    novedades     = novedadesAprobadasEn(e, periodo.rango)         // incapacidades, licencias, vacaciones, suspensiones
    diasIncap, diasVac, diasLicNoRem, diasLicRem = contarDias(novedades, base30)
    diasTrabajados = diasContrato âˆ’ diasIncap âˆ’ diasVac âˆ’ diasLicNoRem
    // 2) DEVENGADOS
    add(SUELDO, salarioDia(e) Ã— diasTrabajados)                    // salarioDia = salario_base/30
    add(VACACIONES_DISFRUTE, salarioDiaSinAux(e) Ã— diasVac)        // pagadas como salario ordinario
    for inc in incapacidades:                                      // pago dÃ­a a dÃ­a con parÃ¡metros por fecha
      if inc.origen == LABORAL: add(INCAP_ARL, 100% Ã— salarioDia Ã— dias)         // ARL reembolsa desde dÃ­a 2
      else:
        d1_2  = max(0.6667 Ã— salarioDia, SMMLV/30) Ã— min(dias,2)   // a cargo empleador (D. 2943/2013)
        d3_90 = max(0.6667 Ã— salarioDia, SMMLV/30) Ã— diasEntre(3,90)   // paga empresa, recobra a EPS
        d91_180 = max(0.50 Ã— salarioDia, SMMLV/30) Ã— diasEntre(91,180)
        add(INCAP_EG_EMPLEADOR, d1_2); add(INCAP_EG_EPS, d3_90 + d91_180)
        registrarCuentaPorCobrarEPS(e, d3_90 + d91_180)
    add(LIC_MATERNIDAD|PATERNIDAD|LUTO, 100% Ã— salarioDia Ã— dias)  // recobro EPS; semanas de paternidad = parÃ¡metro (Ley 2466 las amplÃ­a gradualmente)
    for h in horasAprobadas(e, periodo):                            // Â§3
      add(h.tipo, valorHora(e, h.fecha) Ã— factor(h.tipo, h.fecha) Ã— h.cantidad)
    add(COMISION_*, novedadesComision)                              // Â§4.2
    add(BONO_*, bonosAprobadosDelPeriodo)                           // marca constitutivo segÃºn el bono
    add(AUX_TRANSPORTE, Â§4.1)
    for c in conceptosFijosAsignados(e): add(c, evaluarFormula(c, scope(e)))   // conceptos recurrentes admin
    // 3) IBC (Â§2.2)  â€” en quincenal, el IBC y el FSP se calculan por quincena y PILA consolida el mes
    ibc = calcularIBC(devengados, dias=diasContrato)
    // 4) DEDUCCIONES
    add(SALUD_EMP,   round100up(ibc Ã— 4%))
    add(PENSION_EMP, round100up(ibc Ã— 4%))
    if ibcMensualizado â‰¥ 4Ã—SMMLV: add(FSP, round100up(ibc Ã— tarifaFsp(ibc/SMMLV)))
    add(RETEFUENTE, Â§4.4 si 2Âª quincena o mensual)
    add(PRESTAMO/LIBRANZA/EMBARGO, cuotasDelPeriodo con regla 50% neto)        // Â§4.3
    // 5) PROVISIONES (no afectan neto; reporte contable)
    basePrest = Î£ devengados basePrestaciones (incluye aux transporte, HE, comisiones)
    baseVacac = Î£ devengados baseVacaciones  (sueldo + comisiones + recargos; sin HE ni aux)
    add(PROV_CESANTIAS,     basePrest Ã— 8.33%)
    add(PROV_INT_CESANTIAS, basePrest Ã— 8.33% Ã— 1%/mes acumulado)   // v1: basePrest Ã— 1%
    add(PROV_PRIMA,         basePrest Ã— 8.33%)
    add(PROV_VACACIONES,    baseVacac Ã— 4.17%)
    // 6) APORTES PATRONALES
    exonerado = empresa.exonerada && ibcMensualizado < 10Ã—SMMLV && !integral10mas
    add(SALUD_PAT,   exonerado ? 0 : round100up(ibc Ã— 8.5%))
    add(PENSION_PAT, round100up(ibc Ã— 12%))
    add(ARL_PAT,     round100up(ibcSinDiasIncapComun Ã— tarifaArl(claseRiesgo(e.cargo, fecha))))
    add(CCF_PAT,     round100up(ibc Ã— 4%))                          // siempre
    add(SENA_PAT,    exonerado ? 0 : round100up(ibc Ã— 2%))
    add(ICBF_PAT,    exonerado ? 0 : round100up(ibc Ã— 3%))
    // 7) NETO
    d.neto = Î£DEVENGADO âˆ’ Î£DEDUCCION;  assert d.neto â‰¥ 0 else marcarRevision(d)
    d.costoEmpleador = Î£DEVENGADO + Î£PROVISION + Î£APORTE_PATRONAL
  periodo.estado = CALCULADA
// Flujo: CALCULADA â†’ (revisiÃ³n RH con diff vs periodo anterior) â†’ APROBADA (rol Subgerencia/NÃ³mina)
//        â†’ CERRADA (snapshot de parÃ¡metros, inmutable) â†’ PAGADA (genera desprendibles + resumen PILA)
```

\* Aprendices SENA: la Ley 2466 los convierte en contrato laboral especial â€” se liquidan con sueldo = % SMMLV por etapa (parÃ¡metros `APRENDIZ_LECTIVA_PCT`, `APRENDIZ_PRODUCTIVA_PCT`) y SS segÃºn etapa; sin prima/cesantÃ­as en etapa lectiva. Modelarlos como `tipo_vinculo=APRENDIZ` con conceptos restringidos.

---

## 6. LiquidaciÃ³n definitiva al retiro

`liquidacion_definitiva(id, empleadoId, terminacionId, fechaRetiro, tipoTerminacion, salarioBaseLiquidacion, detalleJson, estado, pdfUrl)` â€” se dispara desde el mÃ³dulo de Terminaciones y queda enlazada al paz y salvo.

```
salarioBasePrest = ultimoSalarioFijo
                 + promedio(variable Ãºltimos 12 meses o tiempo laborado si < 12m)   // comisiones, HE, recargos
                 + AUX_TRANSPORTE si elegible
salarioBaseVacac = idem SIN aux transporte y SIN horas extra

diasCesantias = dias360(max(fechaIngreso, 1-ene-aÃ±oRetiro), fechaRetiro)   // desde Ãºltima consignaciÃ³n
CESANTIAS     = salarioBasePrest Ã— diasCesantias / 360
INTERESES     = CESANTIAS Ã— diasCesantias Ã— 0.12 / 360
diasPrima     = dias360(inicioSemestre(fechaRetiro), fechaRetiro)
PRIMA         = salarioBasePrest Ã— diasPrima / 360
diasVacPend   = diasTotales360(fechaIngresoâ†’fechaRetiro) Ã— 15/360 âˆ’ diasVacDisfrutados âˆ’ diasVacCompensados
VACACIONES    = salarioBaseVacac Ã— diasVacPend / 30               // se paga el 100%, incluida la fracciÃ³n

// INDEMNIZACIÃ“N (solo si tipoTerminacion = DESPIDO_SIN_JUSTA_CAUSA; CST art. 64)
si contrato TERMINO_FIJO u OBRA_LABOR:
    INDEM = salarioDia Ã— max(dias360(fechaRetiro â†’ fechaFinPactada), 15)
si contrato INDEFINIDO:
    aÃ±osServicio = dias360(ingresoâ†’retiro)/360
    si salarioBase < 10Ã—SMMLV: INDEM = salarioDia Ã— (30 + 20 Ã— max(0, aÃ±osServicioâˆ’1))   // fracciÃ³n proporcional
    si salarioBase â‰¥ 10Ã—SMMLV: INDEM = salarioDia Ã— (20 + 15 Ã— max(0, aÃ±osServicioâˆ’1))
// Salario base de indemnizaciÃ³n: Ãºltimo salario; si variable, promedio Ãºltimo aÃ±o.

NETO_LIQUIDACION = Î£ anteriores + salarios pendientes del Ãºltimo periodo
                 âˆ’ saldoPrestamos (con autorizaciÃ³n) âˆ’ retefuente sobre indemnizaciÃ³n si > 204 UVT (alerta al contador, no auto)
```

Validaciones: bloquear cierre si existen periodos de nÃ³mina sin cerrar que cubran fechas â‰¤ `fechaRetiro`; advertir indemnizaciÃ³n moratoria CST art. 65 (1 dÃ­a de salario por dÃ­a de retraso) como alerta informativa, nunca cÃ¡lculo automÃ¡tico. La liquidaciÃ³n genera PDF (mismo motor del desprendible) y alimenta el flujo de terminaciÃ³n (acta, paz y salvo, examen de egreso).

---

## 7. Desprendible PDF y archivo PILA

### 7.1 Desprendible de pago

GeneraciÃ³n server-side con **`@react-pdf/renderer`** (mantenida; render en route handler / Server Action, nunca en cliente) â†’ `Supabase Storage` bucket privado `nomina/desprendibles/{empleadoId}/{anio}-{mes}-{num}.pdf`, descarga vÃ­a signed URL desde autoservicio. Estructura:

1. **Encabezado**: razÃ³n social KUPOCELL S.A.S., NIT, logo, sede; "Comprobante de pago de nÃ³mina", periodo (fechas), frecuencia.
2. **Empleado**: nombre, documento, cargo, Ã¡rea, sede, fecha ingreso, tipo contrato, salario base, banco/cuenta (enmascarada), dÃ­as liquidados.
3. **Tabla devengados**: concepto | cantidad (horas/dÃ­as) | factor | valor. Subtotal.
4. **Tabla deducciones**: concepto | base | % | valor (prÃ©stamos muestran cuota n/N y saldo). Subtotal.
5. **Neto a pagar** (resaltado) + IBC del periodo.
6. **Pie**: acumulados del aÃ±o (devengado, retefuente, cesantÃ­as provisionadas), hash corto del documento + fecha de generaciÃ³n (integridad/auditorÃ­a), leyenda legal.

### 7.2 PILA â€” formato y alcance v1

**QuÃ© es el formato (ResoluciÃ³n 2388/2016, MinSalud):** archivo plano de texto, posiciones fijas, que consolida el mes. Registro **Tipo 1** (encabezado: aportante, NIT, periodo cotizaciÃ³n salud vs. pensiÃ³n, tipo de planilla â€” E empleados, N correcciones, M mora...) y registros **Tipo 2** por cotizante con ~98 campos: tipo de documento, tipo de cotizante (01 dependiente, 12 aprendiz lectiva, 19 aprendiz productiva...), subtipo, dÃ­as cotizados por subsistema (salud/pensiÃ³n/ARL/CCF), **novedades** con marcas y fechas (ING ingreso, RET retiro, VSP variaciÃ³n salario, SLN suspensiÃ³n/lic. no rem., IGE incapacidad general, LMA licencia maternidad, VAC, IRL incapacidad laboral, VCT), IBC por subsistema, tarifas aplicadas (incluida la exoneraciÃ³n 114-1 como tarifa 0), y valores aproximados al mÃºltiplo de 100 superior. La resoluciÃ³n se modifica varias veces al aÃ±o (nuevos tipos de cotizante, reglas de la reforma pensional), y los operadores la validan campo a campo.

**Alcance realista v1 (recomendado):** **no** generar el plano certificado. Generar un **Excel/CSV "Resumen PILA"** por mes con una fila por cotizante y columnas mapeadas 1:1 a los campos que piden los operadores (Aportes en LÃ­nea / SOI / Mi Planilla admiten cargue por plantilla o digitaciÃ³n asistida): documento, nombre, tipo cotizante, dÃ­as por subsistema, IBC por subsistema, tarifas (marcando exonerados), novedades del periodo con fechas (derivadas automÃ¡ticamente de las tablas de novedades y contratos), y totales de control (Î£ IBC, Î£ cotizaciones esperadas por subsistema) para conciliar contra la planilla del operador. Tabla `pila_resumen(periodoMes, generadoPor, archivoUrl, totalControlJson)`. **v2**: plano 2388 nativo detrÃ¡s de una interfaz `PilaExporter` (la estructura de datos de v1 ya contiene todos los campos; solo cambia el serializador a posiciones fijas).

---

## 8. Flujo OPS fuera de nÃ³mina

Los contratistas OPS **nunca** entran al motor de los Â§Â§2â€“6. Modelo:

```prisma
model ContratoOps   { id, contratistaId, objeto, valorTotal, valorMensual, fechaInicio, fechaFin, supervisorId, entregables, rutUrl, sedeId, estado }
model CuentaCobro   { id, contratoOpsId, periodo /*YYYY-MM*/, valor Decimal, documentoUrl,
                      estado /*RADICADA|EN_VERIFICACION|BLOQUEADA_SS|APROBADA|PAGADA|RECHAZADA*/,
                      aprobadaPor?, pagadaEn?, soporteSsId? }
model SoporteSsOps  { id, cuentaCobroId, planillaUrl /*PDF obligatorio*/, operadorPila, numeroPlanilla,
                      periodoCotizado, ibcDeclarado Decimal, valorPagado Decimal, fechaPagoPlanilla,
                      verificadoPor?, estadoVerificacion /*PENDIENTE|VALIDA|INVALIDA*/ }
```

**Regla de verificaciÃ³n (Ley 1955/2019 art. 244 â€” IBC del independiente = 40% del ingreso mensualizado):**

```
ibc_minimo_esperado = max(SMMLV(periodo), 0.40 Ã— cuenta.valor_mensualizado)
valida = soporte.periodoCotizado == cuenta.periodo
      && soporte.ibcDeclarado â‰¥ ibc_minimo_esperado Ã— 0.99       // tolerancia de redondeo
      && planillaUrl presente
```

**Bloqueo duro**: la transiciÃ³n a `APROBADA` y `PAGADA` estÃ¡ prohibida a nivel de Server Action **y** de constraint de aplicaciÃ³n si no existe `SoporteSsOps` con `estadoVerificacion = VALIDA` (la cuenta queda `BLOQUEADA_SS` con motivo visible). El supervisor aprueba el cumplimiento de entregables; Contabilidad solo ve el botÃ³n de pago cuando el semÃ¡foro SS estÃ¡ en verde. Cron diario (motor de alertas transversal): cuentas radicadas sin soporte â†’ alerta a supervisor y contratista (correo Resend) a 10 dÃ­as hÃ¡biles y 3 dÃ­as del cierre contable; reporte "cuentas de cobro OPS sin soporte SS" ya exigido en los reportes del plan. La verificaciÃ³n del IBC es automÃ¡tica + check manual ("verificadoPor"), porque el PDF de planilla no es parseable de forma confiable en v1.

---

**Fuentes:**
- [Holland & Knight â€” Colombia decreta salario mÃ­nimo y auxilio de transporte 2026](https://www.hklaw.com/en/insights/publications/2025/12/colombia-decreta-aumento-del-salario-minimo-y-auxilio-de-transporte)
- [Decreto 1470 de 2025 (auxilio de transporte)](https://sidn.ramajudicial.gov.co/SIDN//NORMATIVA/TEXTOS_COMPLETOS/5_DECRETOS/DECRETOS%202025/Decreto%201470%20de%202025.pdf)
- [Holland & Knight â€” SuspensiÃ³n provisional del decreto de salario mÃ­nimo 2026](https://www.hklaw.com/en/insights/publications/2026/02/suspension-provisional-del-decreto-que-fijo-el-salario-minimo)
- [Decreto 0159 del 19 de febrero de 2026 (Presidencia)](https://dapre.presidencia.gov.co/normativa/normativa/DECRETO%20No.%200159%20DEL%2019%20DE%20FEBRERO%20DE%202026.pdf) / [Ficha AlcaldÃ­a de BogotÃ¡](https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=192181&dt=S)
- [DIAN â€” ResoluciÃ³n 000238 de 15-dic-2025 (UVT 2026: $52.374)](https://www.dian.gov.co/normatividad/Normatividad/Resoluci%C3%B3n%20000238%20de%2015-12-2025.Pdf)
- [ActualÃ­cese â€” Recargo nocturno desde las 7:00 p.m. a partir del 25-dic-2025](https://actualicese.com/recargo-nocturno-en-colombia-conoce-el-horario-aplicable-a-partir-del-25-de-diciembre-de-2025/)
- [FunciÃ³n PÃºblica â€” Ley 2466 de 2025 (texto)](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=260676)
- [Nexia M&A â€” Recargos dominicales escalonados 80/90/100 (1-jul-2025/2026/2027)](https://nexiamya.com.co/recargo-nocturno-desde-las-700-p-m-esto-cambia-con-la-ley-2466-de-2025-y-asi-se-calcula-el-pago-por-hora/)
- [PwC Colombia â€” ReducciÃ³n de jornada Ley 2101 de 2021 (44 h jul-2025, 42 h jul-2026)](https://www.pwc.com/co/es/pwc-insights/reduccion-jornada-laboral.html)
- [ActualÃ­cese â€” FSP tras la reforma pensional / suspensiÃ³n Ley 2381 (Auto 841/2025)](https://actualicese.com/cambios-en-el-fondo-de-solidaridad-pensional-de-acuerdo-con-la-nueva-reforma-pensional/)
- [Aportes en LÃ­nea â€” SuspensiÃ³n del decreto de salario mÃ­nimo 2026](https://www.aportesenlinea.com/en/b/consejo-de-estado-suspende-provisionalmente-el-decreto-que-fijaba-el-salario-minimo)
