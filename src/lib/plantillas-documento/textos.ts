/**
 * Textos editables de los documentos que la app arma sola a partir de datos:
 * las actas de Mis entregas (activos, dotación, EPP), la orden de pago de
 * horas extra y las certificaciones (laboral y contractual).
 *
 * Cada documento tiene un texto de fábrica y la empresa puede cambiarlo en
 * Ajustes → Plantillas de documentos (se guarda en `PlantillaDocumento` con la
 * clave como categoría). Aquí viven las reglas puras —sin base ni React— que
 * comparten el PDF, la vista previa y las pruebas: los textos de fábrica, las
 * variables de cada documento y cómo se resuelve el texto.
 *
 * El formato es el mismo de la autorización de datos (una línea = un párrafo,
 * `**negrita**`, `__subrayado__`, listas con `- `, `✓ ` o `1. `, y `~ ` para la
 * nota pequeña bajo la firma) más dos cosas que estos documentos necesitan:
 *
 *   - `[tabla]` sola en una línea: ahí va la tabla que arma la app (los activos,
 *     los elementos, las horas). Si no está, la tabla va tras el primer párrafo.
 *   - `[[ … ]]` dentro de una línea: el trozo sale solo si sus variables tienen
 *     valor ("[[, en su cargo de {{cargo}}]]" desaparece cuando no hay cargo).
 *     Una línea que queda vacía no se imprime.
 */

import { TIPO_VINCULO } from '@/lib/etiquetas'
import { formatFechaLarga } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'
import { marcadorDe, sustituirVariables, tramosDe, type Parrafo, type Tramo } from './autorizacion-datos'

export type PlantillaTexto = { titulo: string; contenido: string }

/** El texto vigente de un documento más cómo va la hoja: sobre el papel membretado o con encabezado sencillo. */
export type TextoDocumento = PlantillaTexto & { usaMembrete: boolean }

export const CLAVES_TEXTO = [
  'CERTIFICACION_LABORAL',
  'CERTIFICACION_CONTRACTUAL',
  'ACTA_ACTIVO_ENTREGA',
  'ACTA_ACTIVO_DEVOLUCION',
  'ACTA_DOTACION',
  'ACTA_EPP',
  'ORDEN_PAGO_HORAS_EXTRA',
] as const
export type ClaveTexto = (typeof CLAVES_TEXTO)[number]

export function esClaveTexto(x: unknown): x is ClaveTexto {
  return typeof x === 'string' && (CLAVES_TEXTO as readonly string[]).includes(x)
}

export type VariableTexto = { clave: string; descripcion: string }

export type DefinicionTexto = {
  clave: ClaveTexto
  /** Nombre en la lista de Ajustes. */
  nombre: string
  /** Para qué sirve y quién lo firma, en una línea. */
  descripcion: string
  /** Lo que la app pone sola y no se edita aquí (cabecera, tabla, firmas). */
  fijo: string
  defecto: PlantillaTexto
  /**
   * De fábrica, ¿va sobre el papel membretado de Ajustes (logo, marca de agua y
   * pie)? Si no, la app pone un encabezado sencillo con la empresa y el NIT.
   */
  membrete: boolean
  variables: VariableTexto[]
  /** Qué trae la tabla que se inserta con `[tabla]`; sin esto el documento no tiene tabla. */
  tabla?: string
  /** Casos distintos que se pueden ver en la vista previa (tipo de certificación, un activo o varios…). */
  variantes: { valor: string; etiqueta: string }[]
}

// ─── Variables comunes ──────────────────────────────────────────────────────

const V_EMPRESA: VariableTexto[] = [
  { clave: 'empresa', descripcion: 'Nombre comercial de la empresa' },
  { clave: 'razon_social', descripcion: 'Razón social de la empresa' },
  { clave: 'nit', descripcion: 'NIT de la empresa' },
]

const V_ACTA: VariableTexto[] = [
  { clave: 'nombre', descripcion: 'Nombre completo del colaborador' },
  { clave: 'documento', descripcion: 'Número de documento del colaborador' },
  { clave: 'cargo', descripcion: 'Cargo del colaborador (vacío si no tiene)' },
  { clave: 'ciudad', descripcion: 'Ciudad de la sede del colaborador' },
  { clave: 'fecha', descripcion: 'Fecha del acta, en letras' },
  ...V_EMPRESA,
]

const ENCABEZADO_ACTA =
  'En {{ciudad}}, a los {{fecha}}, el(la) señor(a) **{{nombre}}**, identificado(a) con documento {{documento}}[[, en su cargo de {{cargo}}]],'

// ─── Definiciones ───────────────────────────────────────────────────────────

export const TEXTOS: Record<ClaveTexto, DefinicionTexto> = {
  CERTIFICACION_LABORAL: {
    clave: 'CERTIFICACION_LABORAL',
    nombre: 'Certificación laboral',
    descripcion: 'La pide el colaborador desde su autoservicio y la emite Talento Humano. Simple, con salario, con funciones o para entidad financiera.',
    fijo: 'La app pone el encabezado de la empresa, la firma de Talento Humano y el pie de página.',
    membrete: false,
    defecto: {
      titulo: 'La empresa {{razon_social}} certifica:',
      contenido: [
        'Que el(la) señor(a) **{{nombre}}**, identificado(a) con {{tipo_documento}} No. **{{documento}}**, labora en nuestra empresa mediante contrato de **{{tipo_contrato}}**[[ desempeñando el cargo de **{{cargo}}**]], desde el **{{fecha_ingreso}}**.',
        '[[Devenga una asignación salarial mensual de **{{salario}}** ({{salario_letras}}).]]',
        '[[**Funciones del cargo:** {{funciones}}]]',
        'La presente certificación se expide a solicitud del interesado[[, dirigida a **{{destinatario}}**,]] en {{ciudad}}, a los {{fecha}}.',
      ].join('\n'),
    },
    variables: [
      { clave: 'nombre', descripcion: 'Nombre completo del colaborador, en mayúsculas' },
      { clave: 'tipo_documento', descripcion: 'Tipo de documento (CC, CE…)' },
      { clave: 'documento', descripcion: 'Número de documento' },
      { clave: 'tipo_contrato', descripcion: 'Tipo de contrato (término indefinido, fijo, obra o labor…)' },
      { clave: 'cargo', descripcion: 'Cargo actual (vacío si no tiene)' },
      { clave: 'fecha_ingreso', descripcion: 'Fecha de ingreso, en letras' },
      { clave: 'salario', descripcion: 'Salario mensual en pesos; solo en las certificaciones con salario o para entidad financiera' },
      { clave: 'salario_letras', descripcion: 'El salario en letras' },
      { clave: 'funciones', descripcion: 'Funciones del cargo; solo en la certificación con funciones' },
      { clave: 'destinatario', descripcion: 'A quién va dirigida (vacío si no se indicó)' },
      { clave: 'ciudad', descripcion: 'Ciudad de la sede del colaborador' },
      { clave: 'fecha', descripcion: 'Fecha de expedición, en letras' },
      ...V_EMPRESA,
    ],
    variantes: [
      { valor: 'SIMPLE', etiqueta: 'Simple' },
      { valor: 'CON_SALARIO', etiqueta: 'Con salario' },
      { valor: 'CON_FUNCIONES', etiqueta: 'Con funciones' },
      { valor: 'ENTIDAD_FINANCIERA', etiqueta: 'Para entidad financiera' },
    ],
  },

  CERTIFICACION_CONTRACTUAL: {
    clave: 'CERTIFICACION_CONTRACTUAL',
    nombre: 'Certificación contractual · OPS',
    descripcion: 'Para contratistas por prestación de servicios: habla de contrato, objeto y honorarios, nunca de cargo ni salario.',
    fijo: 'La app pone el encabezado de la empresa, la firma de Talento Humano y el pie de página.',
    membrete: false,
    defecto: {
      titulo: 'La empresa {{razon_social}} certifica:',
      contenido: [
        'Que el(la) señor(a) **{{nombre}}**, identificado(a) con {{tipo_documento}} No. **{{documento}}**, presta sus servicios a esta empresa mediante **contrato de prestación de servicios**[[ No. **{{contrato_numero}}**]], suscrito desde el **{{contrato_inicio}}**[[ y con vigencia hasta el **{{contrato_fin}}**]].',
        '[[**Objeto del contrato:** {{objeto}}]]',
        '[[Los honorarios pactados ascienden a **{{honorarios}}** ({{honorarios_letras}})[[, pagaderos en cuotas mensuales de **{{honorarios_mensuales}}**]].]]',
        'Se deja constancia de que entre las partes no existe relación laboral: el contratista actúa con plena autonomía técnica y administrativa, y asume por su cuenta los aportes al Sistema de Seguridad Social Integral.',
        'La presente certificación se expide a solicitud del interesado[[, dirigida a **{{destinatario}}**,]] en {{ciudad}}, a los {{fecha}}.',
      ].join('\n'),
    },
    variables: [
      { clave: 'nombre', descripcion: 'Nombre completo del contratista, en mayúsculas' },
      { clave: 'tipo_documento', descripcion: 'Tipo de documento (CC, CE…)' },
      { clave: 'documento', descripcion: 'Número de documento' },
      { clave: 'contrato_numero', descripcion: 'Número del contrato OPS vigente (vacío si no hay)' },
      { clave: 'contrato_inicio', descripcion: 'Inicio del contrato, en letras (o la fecha de ingreso)' },
      { clave: 'contrato_fin', descripcion: 'Fin del contrato, en letras (vacío si no hay contrato)' },
      { clave: 'objeto', descripcion: 'Objeto del contrato' },
      { clave: 'honorarios', descripcion: 'Valor total en pesos; solo en las certificaciones con valor o para entidad financiera' },
      { clave: 'honorarios_letras', descripcion: 'El valor total en letras' },
      { clave: 'honorarios_mensuales', descripcion: 'Cuota mensual en pesos (vacío si el contrato no la tiene)' },
      { clave: 'destinatario', descripcion: 'A quién va dirigida (vacío si no se indicó)' },
      { clave: 'ciudad', descripcion: 'Ciudad de la sede del contratista' },
      { clave: 'fecha', descripcion: 'Fecha de expedición, en letras' },
      ...V_EMPRESA,
    ],
    variantes: [
      { valor: 'SIMPLE', etiqueta: 'Simple' },
      { valor: 'CON_SALARIO', etiqueta: 'Con honorarios' },
    ],
  },

  ACTA_ACTIVO_ENTREGA: {
    clave: 'ACTA_ACTIVO_ENTREGA',
    nombre: 'Acta de entrega de activos',
    descripcion: 'Se genera al asignar uno o varios activos (computador, celular, herramienta…) y la firma el colaborador desde Mis entregas.',
    fijo: 'La app pone el encabezado de la empresa, la tabla de activos (código, nombre, tipo, marca, serie y valor), las firmas del colaborador y de Talento Humano, y el pie.',
    membrete: false,
    defecto: {
      titulo: 'Acta de entrega de activos',
      contenido: [
        `${ENCABEZADO_ACTA} recibe {{activos}} de propiedad de {{empresa}}:`,
        '[tabla]',
        'El colaborador se compromete a custodiar, usar adecuadamente y devolver {{los_activos}} en buen estado al finalizar la relación laboral o cuando la empresa lo requiera.',
      ].join('\n'),
    },
    variables: [
      ...V_ACTA,
      { clave: 'activos', descripcion: '"el siguiente activo" o "los siguientes 3 activos", según cuántos sean' },
      { clave: 'los_activos', descripcion: '"el activo" o "los activos"' },
      { clave: 'cantidad', descripcion: 'Cuántos activos son' },
      { clave: 'lista', descripcion: 'Los activos en una línea: nombre y código, separados por coma' },
      { clave: 'total', descripcion: 'Suma de los valores en pesos (vacío si ninguno tiene valor)' },
    ],
    tabla: 'Código, activo, tipo, marca, serie y valor de cada activo; con el total si hay varios con valor.',
    variantes: [
      { valor: 'uno', etiqueta: 'Un activo' },
      { valor: 'varios', etiqueta: 'Varios activos' },
    ],
  },

  ACTA_ACTIVO_DEVOLUCION: {
    clave: 'ACTA_ACTIVO_DEVOLUCION',
    nombre: 'Acta de devolución de activos',
    descripcion: 'Se genera cuando el colaborador devuelve activos a la empresa (retiro, cambio de equipo).',
    fijo: 'La app pone el encabezado de la empresa, la tabla de activos, las firmas del colaborador y de Talento Humano, y el pie.',
    membrete: false,
    defecto: {
      titulo: 'Acta de devolución de activos',
      contenido: [
        `${ENCABEZADO_ACTA} devuelve {{activos}} de propiedad de {{empresa}}:`,
        '[tabla]',
        'Se deja constancia de la devolución en las condiciones verificadas por la empresa.',
      ].join('\n'),
    },
    variables: [
      ...V_ACTA,
      { clave: 'activos', descripcion: '"el siguiente activo" o "los siguientes 3 activos", según cuántos sean' },
      { clave: 'los_activos', descripcion: '"el activo" o "los activos"' },
      { clave: 'cantidad', descripcion: 'Cuántos activos son' },
      { clave: 'lista', descripcion: 'Los activos en una línea: nombre y código, separados por coma' },
      { clave: 'total', descripcion: 'Suma de los valores en pesos (vacío si ninguno tiene valor)' },
    ],
    tabla: 'Código, activo, tipo, marca, serie y valor de cada activo; con el total si hay varios con valor.',
    variantes: [
      { valor: 'uno', etiqueta: 'Un activo' },
      { valor: 'varios', etiqueta: 'Varios activos' },
    ],
  },

  ACTA_DOTACION: {
    clave: 'ACTA_DOTACION',
    nombre: 'Recibido de dotación',
    descripcion: 'Vestido y calzado de labor de cada corte (abril, agosto, diciembre; arts. 230-234 CST). Lo firma el colaborador desde Mis entregas.',
    fijo: 'La app pone el encabezado de la empresa, la tabla con los elementos entregados, las firmas del colaborador y de Talento Humano, y el pie.',
    membrete: false,
    defecto: {
      titulo: 'Recibido de dotación — {{corte}} {{anio}}',
      contenido: [
        `${ENCABEZADO_ACTA} declara haber recibido de {{empresa}} la dotación de vestido y calzado de labor correspondiente al corte de {{corte}} de {{anio}}, conforme a los artículos 230 a 234 del Código Sustantivo del Trabajo:`,
        '[tabla]',
        'El colaborador manifiesta que la dotación fue recibida a satisfacción y se compromete a usarla en el desempeño de sus funciones (art. 233 CST).',
      ].join('\n'),
    },
    variables: [
      ...V_ACTA,
      { clave: 'corte', descripcion: 'Corte de la dotación: Abril, Agosto o Diciembre' },
      { clave: 'anio', descripcion: 'Año de la dotación' },
      { clave: 'elementos', descripcion: 'Los elementos entregados, tal como se registraron' },
    ],
    tabla: 'Una fila con los elementos entregados.',
    variantes: [],
  },

  ACTA_EPP: {
    clave: 'ACTA_EPP',
    nombre: 'Constancia de entrega de EPP',
    descripcion: 'Elementos de protección personal (Decreto 1072 de 2015). La firma el colaborador desde Mis entregas.',
    fijo: 'La app pone el encabezado de la empresa, la tabla (elemento, cantidad y tipo de entrega), las firmas del colaborador y del responsable SST, y el pie.',
    membrete: false,
    defecto: {
      titulo: 'Constancia de entrega de elementos de protección personal',
      contenido: [
        `${ENCABEZADO_ACTA} recibe de {{empresa}} los siguientes elementos de protección personal (Decreto 1072 de 2015, art. 2.2.4.6.24):`,
        '[tabla]',
        'El colaborador declara haber recibido los elementos en buen estado y se compromete a usarlos durante la ejecución de sus labores, cuidarlos y solicitar su reposición cuando se deterioren (Ley 9 de 1979, art. 88; Resolución 2400 de 1979).',
      ].join('\n'),
    },
    variables: [
      ...V_ACTA,
      { clave: 'elemento', descripcion: 'Nombre del elemento de protección' },
      { clave: 'cantidad', descripcion: 'Cantidad entregada' },
      { clave: 'tipo_entrega', descripcion: '"Entrega inicial" o "Reposición"' },
    ],
    tabla: 'Elemento, cantidad y tipo de entrega.',
    variantes: [
      { valor: 'inicial', etiqueta: 'Entrega inicial' },
      { valor: 'reposicion', etiqueta: 'Reposición' },
    ],
  },

  ORDEN_PAGO_HORAS_EXTRA: {
    clave: 'ORDEN_PAGO_HORAS_EXTRA',
    nombre: 'Orden de pago de horas extra',
    descripcion: 'Se envía al colaborador para que acepte el monto con su firma antes de pagarle las horas extra aparte de la nómina.',
    fijo: 'La app pone el encabezado, el número y la fecha, el colaborador y el período, la tabla de horas con el total a pagar, y la firma del colaborador.',
    membrete: true,
    defecto: {
      titulo: 'Orden de pago · Horas extra',
      contenido: [
        '[tabla]',
        '[[Consignar a: {{cuenta}}.]]',
      ].join('\n'),
    },
    variables: [
      { clave: 'nombre', descripcion: 'Nombre completo del colaborador' },
      { clave: 'documento', descripcion: 'Número de documento' },
      { clave: 'numero', descripcion: 'Número de la orden de pago' },
      { clave: 'fecha', descripcion: 'Fecha de la orden, en letras' },
      { clave: 'periodo_desde', descripcion: 'Inicio del período, en letras' },
      { clave: 'periodo_hasta', descripcion: 'Fin del período, en letras' },
      { clave: 'horas', descripcion: 'Total de horas extra del período' },
      { clave: 'valor', descripcion: 'Total a pagar en pesos' },
      { clave: 'valor_letras', descripcion: 'El total en letras' },
      { clave: 'cuenta', descripcion: 'Banco, tipo y número de cuenta (vacío si no tiene)' },
      ...V_EMPRESA,
    ],
    tabla: 'Horas por tipo (diurnas, nocturnas, dominicales…), el total de horas y el recuadro con el total a pagar.',
    variantes: [],
  },
}

// ─── Resolución del texto ───────────────────────────────────────────────────

export type BloqueTexto = { tipo: 'parrafo'; parrafo: Parrafo } | { tipo: 'tabla' }

export type TextoResuelto = { titulo: string; bloques: BloqueTexto[]; notas: Tramo[][] }

const RE_VARIABLE = /\{\{\s*(\w+)\s*\}\}/g

/**
 * Resuelve los trozos opcionales `[[ … ]]`: cada uno sale solo si todas sus
 * variables conocidas tienen valor. Se resuelven de adentro hacia afuera, así
 * que se pueden anidar. Una variable desconocida no anula el trozo: queda el
 * `{{token}}` a la vista, que es la forma de notar el error.
 */
export function resolverOpcionales(texto: string, vars: Record<string, string>): string {
  const re = /\[\[([^[\]]*)\]\]/
  let t = texto
  for (let i = 0; i < 50; i++) {
    const m = re.exec(t)
    if (!m) break
    const dentro = m[1]
    const claves = [...dentro.matchAll(RE_VARIABLE)].map((x) => x[1])
    const vacio = claves.some((k) => k in vars && !vars[k].trim())
    t = t.slice(0, m.index) + (vacio ? '' : sustituirVariables(dentro, vars)) + t.slice(m.index + m[0].length)
  }
  return t
}

/** Opcionales + variables, en ese orden. */
export function resolverLinea(texto: string, vars: Record<string, string>): string {
  return sustituirVariables(resolverOpcionales(texto, vars), vars)
}

/** Prefijo de la nota pequeña que va debajo de la firma. */
const PREFIJO_NOTA = '~ '

/**
 * Título y bloques (párrafos, listas y el sitio de la tabla) con las variables
 * ya puestas. Las líneas que quedan vacías se descartan, igual que un `[tabla]`
 * repetido.
 */
export function resolverTexto(plantilla: PlantillaTexto, vars: Record<string, string>): TextoResuelto {
  const lineas = plantilla.contenido.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean)
  const bloques: BloqueTexto[] = []
  const notas: Tramo[][] = []
  let conTabla = false
  for (const linea of lineas) {
    if (/^\[tabla\]$/i.test(linea)) {
      if (!conTabla) bloques.push({ tipo: 'tabla' })
      conTabla = true
      continue
    }
    if (linea.startsWith(PREFIJO_NOTA)) {
      const texto = resolverLinea(linea.slice(PREFIJO_NOTA.length), vars).trim()
      if (texto) notas.push(tramosDe(texto))
      continue
    }
    const { vineta, texto } = marcadorDe(linea)
    const resuelto = resolverLinea(texto, vars).trim()
    if (!resuelto) continue
    bloques.push({ tipo: 'parrafo', parrafo: { tramos: tramosDe(resuelto), ...(vineta ? { vineta } : {}) } })
  }
  return { titulo: resolverLinea(plantilla.titulo, vars).trim(), bloques, notas }
}

/**
 * Dónde va la tabla cuando el texto no trae `[tabla]`: tras el primer párrafo,
 * que es donde la ponían los documentos antes de ser editables.
 */
export function conTablaImplicita(bloques: BloqueTexto[]): BloqueTexto[] {
  if (bloques.some((b) => b.tipo === 'tabla')) return bloques
  const i = bloques.findIndex((b) => b.tipo === 'parrafo')
  const corte = i < 0 ? 0 : i + 1
  return [...bloques.slice(0, corte), { tipo: 'tabla' }, ...bloques.slice(corte)]
}

// ─── Variables de cada documento ────────────────────────────────────────────

export type EmpresaTexto = { razonSocial: string; nombreComercial: string; nit: string }

function varsEmpresa(e: EmpresaTexto): Record<string, string> {
  return { empresa: e.nombreComercial || e.razonSocial, razon_social: e.razonSocial, nit: e.nit }
}

/** "1.500.000 pesos M/CTE": la cifra en letras, en la forma corta de siempre. */
export function pesosEnLetras(valor: number): string {
  return `${new Intl.NumberFormat('es-CO').format(Math.round(valor))} pesos M/CTE`
}

type ColaboradorActa = { nombre: string; documento: string; cargo: string | null }

function varsActa(d: { colaborador: ColaboradorActa; empresa: EmpresaTexto; ciudad: string; fecha: Date }): Record<string, string> {
  return {
    nombre: d.colaborador.nombre,
    documento: d.colaborador.documento,
    cargo: d.colaborador.cargo ?? '',
    ciudad: d.ciudad,
    fecha: formatFechaLarga(d.fecha),
    ...varsEmpresa(d.empresa),
  }
}

export type DatosVarsActaActivo = {
  colaborador: ColaboradorActa
  empresa: EmpresaTexto
  ciudad: string
  fecha: Date
  activos: { codigo: string; nombre: string; valor: number | null }[]
}

export function variablesActaActivo(d: DatosVarsActaActivo): Record<string, string> {
  const n = d.activos.length
  const varios = n > 1
  const conValor = d.activos.filter((a) => a.valor != null)
  const total = conValor.reduce((s, a) => s + (a.valor ?? 0), 0)
  return {
    ...varsActa(d),
    activos: varios ? `los siguientes ${n} activos` : 'el siguiente activo',
    los_activos: varios ? 'los activos' : 'el activo',
    cantidad: String(n),
    lista: d.activos.map((a) => `${a.nombre} (${a.codigo})`).join(', '),
    total: conValor.length ? fmtCOP(total) : '',
  }
}

export type DatosVarsActaDotacion = {
  colaborador: ColaboradorActa
  empresa: EmpresaTexto
  ciudad: string
  fecha: Date
  anio: number
  corte: string
  items: string
}

export function variablesActaDotacion(d: DatosVarsActaDotacion): Record<string, string> {
  return { ...varsActa(d), corte: d.corte, anio: String(d.anio), elementos: d.items }
}

export type DatosVarsActaEpp = {
  colaborador: ColaboradorActa
  empresa: EmpresaTexto
  ciudad: string
  fecha: Date
  elemento: string
  cantidad: number
  reposicion: boolean
}

export function variablesActaEpp(d: DatosVarsActaEpp): Record<string, string> {
  return {
    ...varsActa(d),
    elemento: d.elemento,
    cantidad: String(d.cantidad),
    tipo_entrega: d.reposicion ? 'Reposición' : 'Entrega inicial',
  }
}

export type DatosVarsOrdenPago = {
  empresa: EmpresaTexto
  numero: string
  fecha: Date
  colaborador: { nombre: string; documento: string; banco: string | null; tipoCuenta: string | null; numeroCuenta: string | null }
  /** Fechas ISO (yyyy-mm-dd). */
  periodo: { desde: string; hasta: string }
  horasExtra: number
  valor: number
}

function fechaLargaISO(iso: string): string {
  return formatFechaLarga(new Date(`${iso}T00:00:00.000Z`))
}

export function variablesOrdenPago(d: DatosVarsOrdenPago): Record<string, string> {
  const c = d.colaborador
  return {
    nombre: c.nombre,
    documento: c.documento,
    numero: d.numero,
    fecha: formatFechaLarga(d.fecha),
    periodo_desde: fechaLargaISO(d.periodo.desde),
    periodo_hasta: fechaLargaISO(d.periodo.hasta),
    horas: `${d.horasExtra.toLocaleString('es-CO', { maximumFractionDigits: 2 })} h`,
    valor: fmtCOP(d.valor),
    valor_letras: pesosEnLetras(d.valor),
    cuenta: [c.banco, c.tipoCuenta, c.numeroCuenta].filter(Boolean).join(' '),
    ...varsEmpresa(d.empresa),
  }
}

export type TipoCertificacion = 'SIMPLE' | 'CON_SALARIO' | 'CON_FUNCIONES' | 'ENTIDAD_FINANCIERA'

export type DatosVarsCertificacion = {
  tipo: TipoCertificacion
  clase: 'LABORAL' | 'CONTRACTUAL'
  dirigidaA: string | null
  empresa: EmpresaTexto
  colaborador: {
    nombres: string
    apellidos: string
    tipoDocumento: string
    numeroDocumento: string
    cargo: string | null
    funciones: string | null
    tipoVinculo: string
    fechaIngreso: Date
    salario: number | null
  }
  contratoOps?: {
    numero: string
    objeto: string
    valorTotal: number
    valorMensual: number | null
    fechaInicio: Date
    fechaFin: Date
  } | null
  ciudad: string
  fecha: Date
}

/** ¿Este tipo de certificación lleva el salario (o los honorarios)? */
export function certificacionConValor(tipo: TipoCertificacion): boolean {
  return tipo === 'CON_SALARIO' || tipo === 'ENTIDAD_FINANCIERA'
}

export function variablesCertificacion(d: DatosVarsCertificacion): Record<string, string> {
  const c = d.colaborador
  const conValor = certificacionConValor(d.tipo)
  const comunes = {
    nombre: `${c.nombres} ${c.apellidos}`.toUpperCase(),
    tipo_documento: c.tipoDocumento,
    documento: c.numeroDocumento,
    destinatario: d.dirigidaA ?? '',
    ciudad: d.ciudad,
    fecha: formatFechaLarga(d.fecha),
    ...varsEmpresa(d.empresa),
  }
  if (d.clase === 'CONTRACTUAL') {
    const o = d.contratoOps
    return {
      ...comunes,
      contrato_numero: o?.numero ?? '',
      contrato_inicio: formatFechaLarga(o?.fechaInicio ?? c.fechaIngreso),
      contrato_fin: o ? formatFechaLarga(o.fechaFin) : '',
      objeto: o?.objeto ?? '',
      honorarios: conValor && o ? fmtCOP(o.valorTotal) : '',
      honorarios_letras: conValor && o ? pesosEnLetras(o.valorTotal) : '',
      honorarios_mensuales: conValor && o?.valorMensual != null ? fmtCOP(o.valorMensual) : '',
    }
  }
  const salario = conValor && c.salario != null ? c.salario : null
  return {
    ...comunes,
    tipo_contrato: TIPO_VINCULO[c.tipoVinculo] ?? c.tipoVinculo,
    cargo: c.cargo ?? '',
    fecha_ingreso: formatFechaLarga(c.fechaIngreso),
    salario: salario != null ? fmtCOP(salario) : '',
    salario_letras: salario != null ? pesosEnLetras(salario) : '',
    funciones: d.tipo === 'CON_FUNCIONES' ? (c.funciones ?? '') : '',
  }
}
