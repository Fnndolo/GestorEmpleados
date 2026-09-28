/**
 * Textos editables de los documentos que la app arma sola a partir de datos:
 * las actas de Mis entregas (activos, dotación, EPP), la orden de pago de
 * horas extra, las certificaciones (laboral y contractual) y el acta de paz y
 * salvo de la terminación.
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

import { TIPO_DOCUMENTO_IDENTIDAD, TIPO_VINCULO } from '@/lib/etiquetas'
import { formatFechaLarga } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'
import { pesosALetras } from '@/lib/numero-letras'
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
  'PAZ_Y_SALVO',
  'LIQUIDACION_DEFINITIVA',
  'CARTA_RENUNCIA',
  'CARTA_ACEPTACION_RENUNCIA',
  'CARTA_TERMINACION',
  'CARTA_NO_PRORROGA',
  'ACTA_MUTUO_ACUERDO',
  'ORDEN_EXAMEN_EGRESO',
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

/** Variables de las cartas de la terminación y de la orden de examen. */
const V_CARTA: VariableTexto[] = [
  ...V_ACTA,
  { clave: 'fecha_ingreso', descripcion: 'Fecha de ingreso, en letras' },
  { clave: 'fecha_retiro', descripcion: 'Fecha de retiro (último día), en letras' },
  { clave: 'motivo', descripcion: 'Tipo de terminación (renuncia voluntaria, terminación sin justa causa…)' },
  { clave: 'observaciones', descripcion: 'Motivo o causa escrita en la terminación (vacío si no hay)' },
  { clave: 'preaviso_dias', descripcion: 'Días de preaviso (vacío si no aplica)' },
  { clave: 'lugar_expedicion', descripcion: 'Lugar de expedición del documento del colaborador (vacío si no está en la ficha)' },
  { clave: 'correo', descripcion: 'Correo del colaborador (vacío si no tiene)' },
  { clave: 'departamento', descripcion: 'Departamento de la sede del colaborador' },
  { clave: 'ciudad_empresa', descripcion: 'Ciudad desde donde escribe la empresa (la de la sede principal)' },
]

// ─── Definiciones ───────────────────────────────────────────────────────────

export const TEXTOS: Record<ClaveTexto, DefinicionTexto> = {
  CERTIFICACION_LABORAL: {
    clave: 'CERTIFICACION_LABORAL',
    nombre: 'Certificación laboral',
    descripcion: 'La pide el colaborador desde su autoservicio y la emite Talento Humano. Simple, con salario, con funciones o para entidad financiera.',
    fijo: 'La app pone el encabezado de la empresa, la firma de Talento Humano y el pie de página.',
    membrete: false,
    defecto: {
      titulo: 'Certifica que:',
      contenido: [
        'El(la) señor(a) **{{nombre}}**, identificado(a) con {{tipo_documento_nombre}} No. **{{documento}}**[[ de {{lugar_expedicion}}]], labora en nuestra compañía[[ desempeñando el cargo de **{{cargo}}**]] bajo contrato de **{{tipo_contrato}}** desde el día {{fecha_ingreso}}[[, devengando un salario mensual equivalente a la suma de **{{salario_en_letras}}**[[, más {{comisiones}}]]]].',
        'Certificamos que su desempeño ha sido satisfactorio y que sus funciones se han desarrollado de manera óptima durante todo el tiempo que labora con nosotros.',
        '[[**Funciones del cargo:** {{funciones}}]]',
        'Esta certificación se expide a solicitud del interesado[[, dirigida a **{{destinatario}}**]], sin otro en particular. Quedamos atentos a cualquier aclaración que requiera.',
        'Para constancia de lo anterior, se firma en la ciudad de {{ciudad}}, a los {{fecha_dias}}.',
        'Atentamente,',
        '~ El tratamiento de los datos personales se realiza conforme a la Ley 1581 de 2012 y demás normas concordantes, garantizando la protección, confidencialidad y uso adecuado de la información.',
      ].join('\n'),
    },
    variables: [
      { clave: 'nombre', descripcion: 'Nombre completo del colaborador, en mayúsculas' },
      { clave: 'tipo_documento', descripcion: 'Tipo de documento abreviado (CC, CE…)' },
      { clave: 'tipo_documento_nombre', descripcion: 'Tipo de documento completo (cédula de ciudadanía…)' },
      { clave: 'documento', descripcion: 'Número de documento' },
      { clave: 'lugar_expedicion', descripcion: 'Lugar de expedición del documento (vacío si no está en la ficha)' },
      { clave: 'tipo_contrato', descripcion: 'Tipo de contrato (término indefinido, fijo, obra o labor…)' },
      { clave: 'cargo', descripcion: 'Cargo actual (vacío si no tiene)' },
      { clave: 'fecha_ingreso', descripcion: 'Fecha de ingreso, en letras' },
      { clave: 'salario', descripcion: 'Salario mensual en pesos; solo en las certificaciones con salario o para entidad financiera' },
      { clave: 'salario_letras', descripcion: 'El salario en cifra con "pesos M/CTE"' },
      { clave: 'salario_en_letras', descripcion: 'El salario en letras con la cifra: TRES MILLONES QUINIENTOS MIL PESOS M/CTE ($3.500.000)' },
      { clave: 'comisiones', descripcion: '"comisiones mensuales por concepto de ventas realizadas" si tuvo comisiones en los últimos 3 meses (solo con salario)' },
      { clave: 'funciones', descripcion: 'Funciones del cargo; solo en la certificación con funciones' },
      { clave: 'destinatario', descripcion: 'A quién va dirigida (vacío si no se indicó)' },
      { clave: 'ciudad', descripcion: 'Ciudad de la sede del colaborador' },
      { clave: 'fecha', descripcion: 'Fecha de expedición, en letras' },
      { clave: 'fecha_dias', descripcion: 'Fecha de expedición como "28 días del mes de septiembre de 2026"' },
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
      titulo: 'Certifica que:',
      contenido: [
        'El(la) señor(a) **{{nombre}}**, identificado(a) con {{tipo_documento_nombre}} No. **{{documento}}**[[ de {{lugar_expedicion}}]], presta sus servicios a nuestra compañía mediante **contrato de prestación de servicios**[[ No. **{{contrato_numero}}**]] desde el día {{contrato_inicio}}[[ y con vigencia hasta el {{contrato_fin}}]][[, con {{honorarios_texto}}[[, más {{comisiones}}]]]].',
        '[[**Objeto del contrato:** {{objeto}}]]',
        'Certificamos que ha cumplido a satisfacción las obligaciones pactadas durante todo el tiempo de ejecución del contrato.',
        'Se deja constancia de que entre las partes no existe relación laboral: el contratista actúa con plena autonomía técnica y administrativa, y asume por su cuenta los aportes al Sistema de Seguridad Social Integral.',
        'Esta certificación se expide a solicitud del interesado[[, dirigida a **{{destinatario}}**]], sin otro en particular. Quedamos atentos a cualquier aclaración que requiera.',
        'Para constancia de lo anterior, se firma en la ciudad de {{ciudad}}, a los {{fecha_dias}}.',
        'Atentamente,',
        '~ El tratamiento de los datos personales se realiza conforme a la Ley 1581 de 2012 y demás normas concordantes, garantizando la protección, confidencialidad y uso adecuado de la información.',
      ].join('\n'),
    },
    variables: [
      { clave: 'nombre', descripcion: 'Nombre completo del contratista, en mayúsculas' },
      { clave: 'tipo_documento', descripcion: 'Tipo de documento abreviado (CC, CE…)' },
      { clave: 'tipo_documento_nombre', descripcion: 'Tipo de documento completo (cédula de ciudadanía…)' },
      { clave: 'documento', descripcion: 'Número de documento' },
      { clave: 'lugar_expedicion', descripcion: 'Lugar de expedición del documento (vacío si no está en la ficha)' },
      { clave: 'contrato_numero', descripcion: 'Número del contrato OPS vigente (vacío si no hay)' },
      { clave: 'contrato_inicio', descripcion: 'Inicio del contrato, en letras (o la fecha de ingreso)' },
      { clave: 'contrato_fin', descripcion: 'Fin del contrato, en letras (vacío si no hay contrato)' },
      { clave: 'objeto', descripcion: 'Objeto del contrato' },
      { clave: 'honorarios', descripcion: 'Valor total en pesos; solo en las certificaciones con valor o para entidad financiera' },
      { clave: 'honorarios_letras', descripcion: 'El valor total en letras' },
      { clave: 'honorarios_mensuales', descripcion: 'Cuota mensual en pesos (vacío si el contrato no la tiene)' },
      { clave: 'honorarios_texto', descripcion: '"honorarios mensuales equivalentes a la suma de …" (o el valor total si no hay cuota mensual), en letras con la cifra; solo con honorarios' },
      { clave: 'comisiones', descripcion: '"comisiones mensuales por concepto de ventas realizadas" si tuvo comisiones en los últimos 3 meses (solo con honorarios)' },
      { clave: 'destinatario', descripcion: 'A quién va dirigida (vacío si no se indicó)' },
      { clave: 'ciudad', descripcion: 'Ciudad de la sede del contratista' },
      { clave: 'fecha', descripcion: 'Fecha de expedición, en letras' },
      { clave: 'fecha_dias', descripcion: 'Fecha de expedición como "28 días del mes de septiembre de 2026"' },
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
    descripcion: 'El colaborador la recibe, la firma aceptando el monto y después se le pagan las horas extra, aparte de la nómina.',
    fijo: 'La app pone el encabezado, el número y la fecha, el colaborador y el período, la tabla de horas con el total a pagar, y la firma del colaborador.',
    membrete: true,
    defecto: {
      titulo: 'Orden de pago · Horas extra',
      contenido: [
        'Yo, **{{nombre}}**, identificado(a) con documento No. {{documento}}, acepto el pago que me hará {{razon_social}}, NIT {{nit}}, correspondiente a mis horas extras del {{periodo_desde}} al {{periodo_hasta}}. Después de revisar el formato de registro, confirmo que el valor liquidado se ajusta a lo establecido por la ley y al total de mis horas extras trabajadas. Estoy de acuerdo con el monto y con el detalle presentado:',
        '[tabla]',
        '[[Consignar a: {{cuenta}}.]]',
        'En constancia, firmo en {{ciudad}}, a los {{fecha_dias}}.',
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
      { clave: 'ciudad', descripcion: 'Ciudad de la sede del colaborador' },
      { clave: 'fecha_dias', descripcion: 'Fecha de la orden como "27 días del mes de agosto de 2026"' },
      ...V_EMPRESA,
    ],
    tabla: 'Horas por tipo (diurnas, nocturnas, dominicales…), el total de horas y el recuadro con el total a pagar.',
    variantes: [],
  },

  PAZ_Y_SALVO: {
    clave: 'PAZ_Y_SALVO',
    nombre: 'Acta de paz y salvo',
    descripcion: 'Al terminar el contrato, cuando todas las áreas verificaron la entrega, se envía al trabajador para que la firme desde su autoservicio.',
    fijo: 'La app pone el encabezado de la empresa, la tabla de áreas verificadas (quién y cuándo), las firmas del trabajador y de Talento Humano, y el pie.',
    membrete: false,
    defecto: {
      titulo: 'Acta de paz y salvo',
      contenido: [
        `${ENCABEZADO_ACTA} quien laboró en {{empresa}} desde el {{fecha_ingreso}} hasta el {{fecha_retiro}}, hace entrega de su puesto de trabajo. Las áreas de la empresa verificaron lo siguiente:`,
        '[tabla]',
        'En consecuencia, se deja constancia de que el(la) trabajador(a) se encuentra **a paz y salvo** con la empresa por concepto de entrega de equipos y activos, dotación, documentos, accesos y obligaciones de cartera.',
        '~ Este paz y salvo se refiere únicamente a la entrega del puesto de trabajo. No implica renuncia a salarios, prestaciones sociales ni a ningún otro derecho laboral, que se liquidan y pagan por separado.',
      ].join('\n'),
    },
    variables: [
      ...V_ACTA,
      { clave: 'fecha_ingreso', descripcion: 'Fecha de ingreso, en letras' },
      { clave: 'fecha_retiro', descripcion: 'Fecha de retiro, en letras' },
      { clave: 'motivo', descripcion: 'Tipo de terminación (renuncia voluntaria, mutuo acuerdo…)' },
    ],
    tabla: 'Cada área (activos, cartera, documentos, sistemas, dotación) con lo verificado, quién lo verificó y cuándo.',
    variantes: [],
  },

  LIQUIDACION_DEFINITIVA: {
    clave: 'LIQUIDACION_DEFINITIVA',
    nombre: 'Liquidación definitiva',
    descripcion: 'Al terminar el contrato, Talento Humano la firma y la envía al trabajador, que firma el recibido desde su autoservicio antes del pago.',
    fijo: 'La app pone el encabezado de la empresa, los datos del contrato, la tabla de ingresos y deducciones con el total a pagar, y las firmas de Talento Humano y del trabajador.',
    membrete: false,
    defecto: {
      titulo: 'Liquidación definitiva de prestaciones sociales',
      contenido: [
        'En {{ciudad}}, a los {{fecha}}, {{razon_social}} liquida el contrato de trabajo de **{{nombre}}**, identificado(a) con documento {{documento}}[[, en su cargo de {{cargo}}]], vigente desde el {{fecha_ingreso}} hasta el {{fecha_retiro}} ({{motivo}}), así:',
        '[tabla]',
        'El(la) trabajador(a) declara que recibirá la suma de **{{total}}** ({{total_letras}}) por los conceptos aquí detallados.',
        '~ La firma de este documento acredita el recibido de la liquidación. No implica renuncia a derechos ciertos e indiscutibles del trabajador (art. 14 CST).',
      ].join('\n'),
    },
    variables: [
      ...V_ACTA,
      { clave: 'fecha_ingreso', descripcion: 'Fecha de ingreso, en letras' },
      { clave: 'fecha_retiro', descripcion: 'Fecha de retiro, en letras' },
      { clave: 'motivo', descripcion: 'Tipo de terminación (renuncia voluntaria, mutuo acuerdo…)' },
      { clave: 'dias', descripcion: 'Días liquidados' },
      { clave: 'salario', descripcion: 'Salario base en pesos' },
      { clave: 'total', descripcion: 'Total a pagar en pesos' },
      { clave: 'total_letras', descripcion: 'El total en letras' },
    ],
    tabla: 'Ingresos (salario, auxilio, cesantías, intereses, prima, vacaciones, indemnización) y deducciones (salud, pensión, préstamo), con sus totales y el total a pagar.',
    variantes: [],
  },

  CARTA_RENUNCIA: {
    clave: 'CARTA_RENUNCIA',
    nombre: 'Carta de renuncia',
    descripcion: 'La escribe y firma el trabajador desde su autoservicio al presentar su renuncia.',
    fijo: 'La app pone el encabezado de la empresa, la firma del trabajador y el pie.',
    membrete: false,
    defecto: {
      titulo: 'Carta de renuncia',
      contenido: [
        "{{ciudad}}, {{fecha}}",
        "Señores **{{razon_social}}**",
        "Por medio de la presente presento mi **renuncia voluntaria**[[ al cargo de {{cargo}}]], que desempeño en {{empresa}} desde el {{fecha_ingreso}}. Mi último día de trabajo será el **{{fecha_retiro}}**.",
        "[[Motivo: {{observaciones}}]]",
        "Agradezco la oportunidad brindada y quedo atento(a) a la entrega de mi puesto de trabajo, al examen médico de egreso y a la liquidación de mis salarios y prestaciones sociales.",
      ].join('\n'),
    },
    variables: V_CARTA,
    variantes: [],
  },

  CARTA_ACEPTACION_RENUNCIA: {
    clave: 'CARTA_ACEPTACION_RENUNCIA',
    nombre: 'Aceptación de la renuncia',
    descripcion: 'En una renuncia, Talento Humano la firma y la envía al trabajador, que firma el recibido desde su autoservicio.',
    fijo: 'La app pone el encabezado de la empresa, las firmas de Talento Humano y del trabajador, y el pie.',
    membrete: false,
    defecto: {
      titulo: 'Aceptación de renuncia',
      contenido: [
        '{{ciudad_empresa}}, {{fecha}}',
        'Señor(a) **{{nombre}}**, {{documento}}[[ de {{lugar_expedicion}}]]',
        '{{ciudad}}[[ - {{departamento}}]][[ · {{correo}}]]',
        'Cordial saludo.',
        'Por medio de la presente, **{{razon_social}}** le comunica que se acepta su renuncia irrevocable[[ al cargo de **{{cargo}}**]], con efectos a partir del **{{fecha_retiro}}**, fecha en la cual se entenderá finalizada su relación laboral con nuestra empresa.',
        'En consecuencia, y con el fin de dar cumplimiento a las obligaciones legales y contractuales a cargo de ambas partes, le informamos lo siguiente:',
        '1. **Devolución de dotación y elementos de trabajo:** deberá reintegrar a la empresa, en buen estado y en la fecha de su retiro, toda la dotación, equipos, herramientas y demás elementos que le hayan sido entregados para el desempeño de sus funciones.',
        '2. **Examen médico ocupacional de retiro:** de acuerdo con las estipulaciones de Seguridad y Salud en el Trabajo, {{razon_social}} solicita la realización obligatoria del examen médico de retiro, de conformidad con la Resolución 1843 de 2025 y el numeral 7 del artículo 57 del Código Sustantivo del Trabajo.',
        '3. **Liquidación y pago de prestaciones sociales:** se procederá a realizar la liquidación final a que tenga derecho, incluyendo salarios causados, vacaciones, prima de servicios, cesantías, intereses a las cesantías y demás conceptos legales y contractuales aplicables. Los valores resultantes serán consignados en la cuenta bancaria que tiene registrada en nuestro sistema de nómina, dentro de los términos previstos por la ley.',
        'Agradecemos el tiempo, dedicación y aporte que brindó a {{razon_social}} durante el periodo en que formó parte de nuestra organización, y le deseamos éxitos en sus próximos proyectos.',
        'Cordialmente,',
        '~ Con su firma, el(la) trabajador(a) confirma que recibió esta comunicación.',
      ].join('\n'),
    },
    variables: V_CARTA,
    variantes: [],
  },

  CARTA_TERMINACION: {
    clave: 'CARTA_TERMINACION',
    nombre: 'Carta de terminación',
    descripcion: 'Cuando la empresa termina el contrato (con o sin justa causa, anticipada, periodo de prueba): Talento Humano la firma y el trabajador firma el recibido.',
    fijo: 'La app pone el encabezado de la empresa, las firmas de Talento Humano y del trabajador, y el pie.',
    membrete: false,
    defecto: {
      titulo: 'Terminación del contrato de trabajo',
      contenido: [
        "{{ciudad}}, {{fecha}}",
        "Señor(a) **{{nombre}}**, identificado(a) con documento {{documento}}[[, {{cargo}}]]",
        "Por medio de la presente le comunicamos que **{{razon_social}}** da por terminado el contrato de trabajo suscrito con usted, por **{{motivo}}**, con efectos a partir del **{{fecha_retiro}}**.",
        "[[Causa: {{observaciones}}]]",
        "Le informamos que su liquidación de salarios y prestaciones sociales se pondrá a su disposición conforme a la ley, junto con la constancia del pago de sus aportes a seguridad social de los últimos tres (3) meses (art. 65 CST, parágrafo 1).",
        "Le pedimos hacer la entrega de su puesto de trabajo (equipos, dotación, documentos y accesos) para expedir su paz y salvo. Así mismo, le entregamos la orden para el examen médico ocupacional de egreso, que debe realizarse dentro de los cinco (5) días hábiles siguientes a su retiro, y pondremos a su disposición la liquidación de sus salarios y prestaciones sociales.",
        "~ Con su firma, el(la) trabajador(a) confirma que recibió esta comunicación; no implica que esté de acuerdo con su contenido.",
      ].join('\n'),
    },
    variables: V_CARTA,
    variantes: [],
  },

  CARTA_NO_PRORROGA: {
    clave: 'CARTA_NO_PRORROGA',
    nombre: 'Aviso de no prórroga',
    descripcion: 'Contrato a término fijo que no se renueva: se envía con al menos 30 días de anticipación (art. 46 CST) y el trabajador firma el recibido.',
    fijo: 'La app pone el encabezado de la empresa, las firmas de Talento Humano y del trabajador, y el pie.',
    membrete: false,
    defecto: {
      titulo: 'Aviso de no prórroga del contrato',
      contenido: [
        "{{ciudad}}, {{fecha}}",
        "Señor(a) **{{nombre}}**[[, {{cargo}}]]",
        "De conformidad con el artículo 46 del Código Sustantivo del Trabajo, y con una anticipación no inferior a treinta (30) días, le informamos que **{{razon_social}}** ha decidido **no prorrogar** su contrato de trabajo a término fijo, el cual terminará el **{{fecha_retiro}}**.",
        "Le pedimos hacer la entrega de su puesto de trabajo (equipos, dotación, documentos y accesos) para expedir su paz y salvo. Así mismo, le entregamos la orden para el examen médico ocupacional de egreso, que debe realizarse dentro de los cinco (5) días hábiles siguientes a su retiro, y pondremos a su disposición la liquidación de sus salarios y prestaciones sociales.",
        "~ Con su firma, el(la) trabajador(a) confirma que recibió este aviso.",
      ].join('\n'),
    },
    variables: V_CARTA,
    variantes: [],
  },

  ACTA_MUTUO_ACUERDO: {
    clave: 'ACTA_MUTUO_ACUERDO',
    nombre: 'Acta de mutuo acuerdo',
    descripcion: 'Terminación por mutuo acuerdo (art. 61 CST): la firman Talento Humano y el trabajador.',
    fijo: 'La app pone el encabezado de la empresa, las firmas de Talento Humano y del trabajador, y el pie.',
    membrete: false,
    defecto: {
      titulo: 'Acta de terminación por mutuo acuerdo',
      contenido: [
        "En {{ciudad}}, a los {{fecha}}, **{{razon_social}}** (NIT {{nit}}) y **{{nombre}}**, identificado(a) con documento {{documento}}[[, en su cargo de {{cargo}}]], acuerdan libre y voluntariamente dar por terminado el contrato de trabajo vigente desde el {{fecha_ingreso}}, con efectos a partir del **{{fecha_retiro}}** (art. 61, literal b, CST).",
        "[[Condiciones acordadas: {{observaciones}}]]",
        "La empresa pagará al trabajador la liquidación de sus salarios y prestaciones sociales causados hasta la fecha de terminación. Las partes dejan constancia de que el acuerdo se firma sin presiones y con pleno conocimiento de sus efectos.",
        "~ Este acuerdo no implica renuncia a derechos ciertos e indiscutibles del trabajador (art. 14 CST).",
      ].join('\n'),
    },
    variables: V_CARTA,
    variantes: [],
  },

  ORDEN_EXAMEN_EGRESO: {
    clave: 'ORDEN_EXAMEN_EGRESO',
    nombre: 'Orden de examen de egreso',
    descripcion: 'Se genera en la terminación y le queda al trabajador en su autoservicio para presentarla en la IPS.',
    fijo: 'La app pone el encabezado de la empresa, el nombre de quien la expide en Talento Humano y el pie.',
    membrete: false,
    defecto: {
      titulo: 'Orden de examen médico ocupacional de egreso',
      contenido: [
        "{{ciudad}}, {{fecha}}",
        "**{{razon_social}}** (NIT {{nit}}) remite a **{{nombre}}**, identificado(a) con documento {{documento}}[[, quien se desempeñó como {{cargo}}]], para la práctica del **examen médico ocupacional de egreso**, con motivo de la terminación de su contrato de trabajo el {{fecha_retiro}}.",
        "El examen debe realizarse dentro de los cinco (5) días hábiles siguientes a la fecha de retiro (Resolución 2346 de 2007). Su costo corre por cuenta de la empresa. Si no se presenta en ese plazo, la empresa dejará constancia de ello.",
        "~ Presente esta orden y su documento de identidad en la IPS de salud ocupacional.",
      ].join('\n'),
    },
    variables: V_CARTA,
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

/** "28 días del mes de septiembre de 2026" ("1 día…" el primero), para "a los … días del mes de …". */
export function fechaEnDias(fecha: Date): string {
  const dia = fecha.getUTCDate()
  const mes = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', month: 'long' }).format(fecha)
  return `${dia} ${dia === 1 ? 'día' : 'días'} del mes de ${mes} de ${fecha.getUTCFullYear()}`
}

/** Frase de las comisiones en las certificaciones con valor. */
const FRASE_COMISIONES = 'comisiones mensuales por concepto de ventas realizadas'

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
  /** Ciudad de la sede del colaborador (vacía si no se sabe). */
  ciudad?: string
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
    ciudad: d.ciudad ?? '',
    fecha_dias: fechaEnDias(d.fecha),
    ...varsEmpresa(d.empresa),
  }
}

export type DatosVarsPazYSalvo = {
  colaborador: ColaboradorActa
  empresa: EmpresaTexto
  ciudad: string
  fecha: Date
  fechaIngreso: Date
  fechaRetiro: Date
  motivo: string
}

export function variablesPazYSalvo(d: DatosVarsPazYSalvo): Record<string, string> {
  return {
    ...varsActa(d),
    fecha_ingreso: formatFechaLarga(d.fechaIngreso),
    fecha_retiro: formatFechaLarga(d.fechaRetiro),
    motivo: d.motivo,
  }
}

export type DatosVarsCarta = DatosVarsPazYSalvo & {
  observaciones: string | null
  preavisoDias: number | null
  /** Datos del destinatario para el encabezado de la carta. */
  destinatario?: { correo: string | null; lugarExpedicion: string | null; departamento: string | null }
  /** Ciudad desde donde escribe la empresa (la de su sede principal). */
  ciudadEmpresa?: string | null
}

export function variablesCarta(d: DatosVarsCarta): Record<string, string> {
  return {
    ...variablesPazYSalvo(d),
    observaciones: d.observaciones?.trim() ?? '',
    preaviso_dias: d.preavisoDias != null ? String(d.preavisoDias) : '',
    lugar_expedicion: d.destinatario?.lugarExpedicion?.trim() ?? '',
    correo: d.destinatario?.correo?.trim() ?? '',
    departamento: d.destinatario?.departamento?.trim() ?? '',
    ciudad_empresa: d.ciudadEmpresa?.trim() || d.ciudad,
  }
}

export type DatosVarsLiquidacion = DatosVarsPazYSalvo & { dias: number; salarioBase: number; total: number }

export function variablesLiquidacion(d: DatosVarsLiquidacion): Record<string, string> {
  return {
    ...variablesPazYSalvo(d),
    dias: String(d.dias),
    salario: fmtCOP(d.salarioBase),
    total: fmtCOP(d.total),
    total_letras: pesosEnLetras(d.total),
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
    /** Lugar de expedición del documento (ficha); null si no está. */
    lugarExpedicion?: string | null
    /** Tuvo comisiones en los últimos meses: la certificación con valor las menciona. */
    tieneComisiones?: boolean
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
    tipo_documento_nombre: (TIPO_DOCUMENTO_IDENTIDAD[c.tipoDocumento] ?? c.tipoDocumento).toLowerCase(),
    documento: c.numeroDocumento,
    lugar_expedicion: c.lugarExpedicion?.trim() ?? '',
    comisiones: conValor && c.tieneComisiones ? FRASE_COMISIONES : '',
    destinatario: d.dirigidaA ?? '',
    ciudad: d.ciudad,
    fecha: formatFechaLarga(d.fecha),
    fecha_dias: fechaEnDias(d.fecha),
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
      honorarios_texto: !conValor || !o ? ''
        : o.valorMensual != null
          ? `honorarios mensuales equivalentes a la suma de **${pesosALetras(o.valorMensual)}**`
          : `honorarios por un valor total de **${pesosALetras(o.valorTotal)}**`,
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
    salario_en_letras: salario != null ? pesosALetras(salario) : '',
    funciones: d.tipo === 'CON_FUNCIONES' ? (c.funciones ?? '') : '',
  }
}
