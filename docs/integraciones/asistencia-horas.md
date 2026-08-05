# Integración: sistema de asistencia → Plataforma RH (horas extra y recargos)

**Para:** equipo del sistema de control de asistencia (marcaciones de entrada/salida).
**De:** Plataforma de Gestión Humana — KUPOCELL S.A.S. (Smart Gadgets).

Este documento es **el contrato de integración**: qué enviar, cómo y con qué reglas.

> **Estado:** el endpoint descrito aquí **está pendiente de crear** en la plataforma RH.
> Este documento define el contrato para que ambos lados desarrollen en paralelo.

---

## 1. Principio: cada sistema hace lo suyo

| Lo hace **el sistema de asistencia** | Lo hace **la plataforma RH** |
|---|---|
| Registrar marcaciones (entrada/salida) | Partir el tramo en **diurno / nocturno** |
| Decidir qué horas son **extra** (pasan la jornada) | Aplicar el **factor legal** vigente |
| Saber si el día fue **dominical o festivo** | Liquidar y pagar en la nómina |

### ⚠️ NO envíes valores en dinero ni factores

Envía **solo horas**. Los factores viven en la plataforma RH, versionados por ley, y cambian
con el tiempo (el recargo dominical sube 0.80 → 0.90 → 1.00 en años sucesivos).

Si ambos sistemas calculan dinero, habrá **dos verdades distintas** y descuadres en nómina.

---

## 2. Qué enviar

Un registro **por cada tramo de horas con recargo**. Un mismo día puede tener varios.

| Campo | Tipo | Obligatorio | Ejemplo | Notas |
|---|---|---|---|---|
| `documento` | string | ✅ | `"1085123456"` | Cédula. Vincula al colaborador |
| `tipoDocumento` | string | — | `"CC"` | Por defecto `CC`. Otros: `CE`, `TI`, `PASAPORTE`, `PPT`, `NIT` |
| `fecha` | string | ✅ | `"2026-08-01"` | `AAAA-MM-DD`, **hora Bogotá** |
| `horaInicio` | string | ✅ | `"19:00"` | `HH:MM` 24h, **hora Bogotá** |
| `horaFin` | string | ✅ | `"22:00"` | `HH:MM` 24h, **hora Bogotá** |
| `tipoHora` | string | ✅ | `"HED"` | Ver tabla de códigos |
| `horas` | number | ✅ | `3` | Decimal. Entre `0.5` y `12` |
| `referenciaExterna` | string | ✅ | `"arrive-98765"` | **Id único tuyo.** Evita duplicados |
| `observaciones` | string | — | `"Cierre de inventario"` | Texto libre |

### Códigos de `tipoHora`

**Los que usa esta empresa** (ver §2.1 para la regla de domingos):

| Código | Significado | Cuándo usarlo |
|---|---|---|
| `HED` | Hora extra diurna | Pasa de 7 h/día, antes de las 7:00 p.m. **También los domingos** |
| `HEN` | Hora extra nocturna | Pasa de 7 h/día, después de las 7:00 p.m. **También los domingos** |
| `RN` | Recargo nocturno | Jornada **ordinaria** (≤7 h) en franja nocturna — **no es extra** |

Existen además, por si más adelante se aplican festivos o cambia el criterio:
`RD` (recargo dominical), `RND` (nocturno dominical), `HEDD` / `HEND` (extra dominical
diurna/nocturna).

**Si no distingues nocturno, no te preocupes:** manda el tipo *diurno* (`HED`, `HEDD`, `RD`)
con el rango horario real. La plataforma parte sola en las **7:00 p.m.** y convierte la parte
nocturna al código que corresponde (Ley 2466).

> Ejemplo: envías `HED` de `17:00` a `22:00` (5 horas) → la plataforma registra
> **2 h `HED`** (17:00–19:00) + **3 h `HEN`** (19:00–22:00).

**Lo que sí debes decidir tú:** si son **extra** u **ordinarias**. Eso la plataforma no lo
puede deducir (no conoce la jornada diaria ni el calendario).

---

## 2.1 Cómo calcular las horas

### Jornada de referencia

**7 horas por día × 6 días = 42 h/semana** (Ley 2101, vigente desde el 15-jul-2026;
la plataforma liquida con divisor **210 h/mes**).

### Paso 1 — Tiempo trabajado del día

Por cada par de marcaciones: **`salida − entrada`**. Se suman todos los pares del día.

| Cuidado | Regla |
|---|---|
| **Cruce de medianoche** | Si la salida es menor que la entrada (22:00 → 02:00), sumar 24 h. Son 4 h, no −20 |
| **A qué día pertenece** | Al día en que **entró**. Un turno 22:00–02:00 del lunes es del **lunes** |
| **Descansos** | Si se marca salida/entrada de almuerzo, quedan excluidos automáticamente |

### Paso 2 — Separar ordinarias de extras

- Las **primeras 7 h** del día → ordinarias
- Lo que sobre → **extras**

> Las extras son **las últimas horas del día en orden cronológico**. Por eso importa la
> hora en que se trabajaron, no solo cuántas fueron.

### Paso 3 — Clasificar por franja

Franja nocturna: **19:00 – 06:00**.

| Situación | Código |
|---|---|
| Extra, antes de las 7:00 p.m. | `HED` |
| Extra, después de las 7:00 p.m. | `HEN` |
| **Ordinaria** (≤7 h) en franja nocturna | `RN` |
| Ordinaria diurna en día hábil | ❌ **no se envía** |

### Paso 4 — Domingos

> **Decisión de negocio (2026-08-03, definida por el RIT de la empresa):**
> las horas de **domingo se tratan como extra corriente** → `HED` / `HEN`,
> **sin** recargo dominical.
>
> Esto es una decisión de la empresa; si el contador o una revisión legal lo cambia,
> basta con enviar `HEDD` / `HEND` en su lugar (la plataforma ya los soporta).
> Los **festivos** entre semana quedan **pendientes de definir**.

### ⚠️ Solo se envía lo que genera recargo

Las horas **ordinarias diurnas de día hábil ya están pagadas en el salario base**: no se
envían. La plataforma las rechaza con *"la hora ordinaria diurna no tiene recargo"*.

Se envía únicamente:
- Horas **extra** (`HED` / `HEN`)
- Horas **ordinarias en franja nocturna** (`RN`) — se confunden mucho: no son extra, pero sí llevan recargo del 35 %

---

## 2.2 La semana, tabulada

Ejemplo con jornada 08:00–16:00 (7 h efectivas + 1 h de almuerzo):

| Día | Marcaciones | Trabajado | Ordinarias | Extras | **Se envía** |
|---|---|---|---|---|---|
| Lun | 08–12, 13–16 | 7 h | 7 h diurnas | — | ❌ nada |
| Mar | 08–12, 13–18 | 9 h | 7 h | 2 h (16–18) | `HED` 2 h |
| Mié | 08–12, 13–21 | 12 h | 7 h | 5 h (16–21) | `HED` 5 h *(la plataforma la parte en 3 h HED + 2 h HEN)* |
| Jue | 14–21 | 7 h | 7 h *(2 h nocturnas)* | — | `RN` 2 h |
| Vie | 22–02 | 4 h | 4 h nocturnas | — | `RN` 4 h |
| Sáb | 08–15 | 7 h | 7 h diurnas | — | ❌ nada |
| Dom | 08–14 | 6 h | — | 6 h (todo extra) | `HED` 6 h |

**Nota sobre el miércoles:** se envía **un solo tramo** `HED` de 16:00 a 21:00. La
plataforma corta sola en las 7:00 p.m. y genera 3 h `HED` + 2 h `HEN`. No hay que
separarlo en el origen.

**Nota sobre jueves y viernes:** trabajó 7 h o menos (no hay extra), pero parte de la
jornada cayó en franja nocturna → genera `RN`, que **sí** hay que enviar.

---

## 3. Cómo enviarlo

### Endpoint

```
POST https://<dominio-plataforma-rh>/api/integraciones/horas
Content-Type: application/json
X-API-Key: <clave entregada por el administrador>
```

### Cuerpo (lote de hasta 500 registros y 500 anulaciones)

```json
{
  "registros": [
    {
      "documento": "1085123456",
      "tipoDocumento": "CC",
      "fecha": "2026-08-01",
      "horaInicio": "19:00",
      "horaFin": "22:00",
      "tipoHora": "HED",
      "horas": 3,
      "referenciaExterna": "arrive-98765"
    }
  ],
  "anulaciones": ["arrive-98764"]
}
```

`anulaciones` (opcional): referencias externas de turnos **eliminados** en el origen; sus
novedades se borran de la nómina (si el periodo sigue abierto). Anular una referencia que
ya no existe no es error. Se puede enviar un lote solo de anulaciones.

### Respuesta

```json
{
  "ok": true,
  "recibidos": 1,
  "aplicados": 1,
  "duplicados": 0,
  "reemplazados": 0,
  "anulados": 1,
  "periodosRecalculando": ["Agosto 2026"],
  "periodosSinRecalcular": [],
  "rechazados": [
    {
      "referenciaExterna": "arrive-98766",
      "motivo": "PERIODO_CERRADO",
      "detalle": "El periodo de nómina de julio 2026 ya está cerrado."
    }
  ]
}
```

### Motivos de rechazo

| Motivo | Qué significa | Qué hacer |
|---|---|---|
| `COLABORADOR_NO_ENCONTRADO` | Esa cédula no existe o está retirada | Verificar el documento |
| `PERIODO_NO_ENCONTRADO` | No hay periodo de nómina para esa fecha | Avisar a RR.HH. |
| `PERIODO_CERRADO` | El periodo ya se liquidó y cerró | No se puede modificar; va como ajuste manual |
| `DATOS_INVALIDOS` | Formato de fecha/hora/tipo incorrecto | Corregir y reenviar |

---

## 4. Reglas obligatorias

### 4.1 Idempotencia — lo más importante ⚠️

**`referenciaExterna` debe ser único y estable** por tramo.

Si reenvías un registro con la misma `referenciaExterna`, la plataforma lo **ignora**
(cuenta como `duplicado`, no como error). Así puedes reintentar sin miedo.

> **Sin esto, un reintento paga las horas dos veces.** Es el riesgo más grave de esta
> integración. Usa el id de tu registro, no un consecutivo que se reinicie.

### 4.1b Ediciones y eliminaciones de turnos

- **Editar un turno**: basta con reenviar el registro con el rango corregido (y su nueva
  `referenciaExterna`). La plataforma **reemplaza** automáticamente cualquier novedad de
  integración del mismo colaborador y fecha cuyo rango horario se **solape** con el
  entrante (cuenta como `reemplazados`). Las novedades digitadas a mano en la plataforma
  no se tocan.
- **Eliminar un turno**: envía su `referenciaExterna` en `anulaciones` (cuenta como
  `anulados`). El reemplazo por solape NO cubre eliminaciones: si no avisas, las horas
  quedan pagadas.
- **Recalculo de nómina**: si el periodo afectado ya estaba liquidado (estado CALCULADA),
  la plataforma lo **reliquida automáticamente en segundo plano** (la respuesta llega de
  inmediato; el recálculo tarda unos segundos más) y lo reporta en `periodosRecalculando`.
  Un periodo APROBADO no se recalcula solo: aparece en `periodosSinRecalcular` y RR.HH.
  debe reabrirlo y liquidarlo. Un periodo CERRADO o PAGADO rechaza el cambio
  (`PERIODO_CERRADO`).

### 4.2 La hora la pone tu servidor, no el celular

Las marcaciones deben sellarse con la hora del **servidor/base de datos**
(`DEFAULT now()` en Postgres/Supabase), **nunca** con la del dispositivo: el reloj del
celular se puede cambiar y falsear una marcación.

Si tu app funciona **offline**, guarda las dos:

| Campo | Quién la pone | Uso |
|---|---|---|
| `marcado_en` | Servidor (`now()`) | La oficial |
| `marcado_en_dispositivo` | El celular | Referencia |
| desfase | Calculado | Auditoría: desfases de horas → revisar |

### 4.3 Zona horaria

Todo se envía en **hora local de Colombia (America/Bogota, UTC-5, sin horario de verano)**.

`now()` en Postgres devuelve **UTC**. Convierte antes de enviar:

```sql
select marcado_en at time zone 'America/Bogota' from marcacion;
```

> Si no conviertes, una marcación de las 7:00 p.m. viaja como medianoche y **se rompe la
> clasificación nocturna**, que depende de la franja 7:00 p.m.–6:00 a.m.

### 4.4 Cuándo enviar

Recomendado: **una vez al día** (por ejemplo 1:00 a.m.) con los tramos del día anterior,
y **antes del cierre de nómina**. Reenviar el mismo lote es seguro gracias a la idempotencia.

---

## 5. Checklist para el equipo de asistencia

- [ ] Las marcaciones se sellan con la hora del **servidor**, no del celular
- [ ] Las horas se convierten a **America/Bogota** antes de enviar
- [ ] Cada tramo lleva una `referenciaExterna` **única y estable**
- [ ] La jornada de referencia es **7 h/día** y el excedente se marca como extra
- [ ] Los turnos que **cruzan medianoche** se atribuyen al día de entrada
- [ ] Las horas ordinarias en franja **19:00–06:00** se envían como `RN`
- [ ] Las ordinarias **diurnas de día hábil NO se envían**
- [ ] Los **domingos** se envían como `HED`/`HEN` (decisión de la empresa, §2.1)
- [ ] **No** se envía dinero, factores ni totales calculados
- [ ] Se manejan los rechazos y se reintenta con el mismo `referenciaExterna`

---

## 6. Pendiente de acordar

1. **¿La app funciona offline?** → define si se envían las dos horas (servidor + dispositivo).
2. **Festivos entre semana** → aún sin definir cómo se tratan (los domingos ya están definidos en §2.1).
3. **Clave de API** → la genera el administrador de la plataforma RH.
4. **Ambiente de pruebas** → recomendado probar contra la base local antes de producción.
