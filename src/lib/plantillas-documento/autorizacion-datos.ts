/**
 * Autorización expresa para el tratamiento de datos personales (Ley 1581 de 2012).
 *
 * El texto lo edita la empresa en Ajustes → Plantillas de documentos; aquí viven
 * las reglas puras (sin BD) que comparten el PDF y la vista previa: el texto de
 * fábrica, las variables, el formato sencillo y la resolución final.
 */

/** Categoría con que se guarda en `PlantillaDocumento`. */
export const CATEGORIA_AUTORIZACION = 'AUTORIZACION_DATOS'

export type PlantillaAutorizacion = { titulo: string; contenido: string }

/**
 * Texto con que viene la aplicación (formato real de KUPOCELL). Cada línea es un
 * párrafo; `**negrita**` y `__subrayado__` resaltan; `{{variable}}` se llena con
 * los datos de la persona y la empresa.
 */
export const AUTORIZACION_POR_DEFECTO: PlantillaAutorizacion = {
  titulo: 'AUTORIZACIÓN EXPRESA PARA EL TRATAMIENTO DE DATOS PERSONALES',
  contenido: [
    'Yo, {{nombre}}, {{identificado}} con cédula de ciudadanía No. {{cedula}} en calidad de: {{calidad}}, AUTORIZO EXPRESAMENTE de manera previa, informada e inequívoca a la empresa {{empresa}} identificada con NIT No. {{nit}}, domicilio {{domicilio}}, correo electrónico {{correo_empresa}}, como responsable del Tratamiento, para recoger, almacenar, usar, circular, suprimir mis datos y conservar mi imagen por medio de videocámaras de seguridad instaladas en los establecimientos de la entidad, en cumplimiento a la Ley 1581 de 2012 y en desarrollo del {{tipo_contrato}} suscrito entre las partes.',
    'Declaro que fui {{informado}} que la finalidad del tratamiento es la __seguridad de las personas, control de acceso, vigilancia de instalaciones, prevención de incidentes y soporte de eventuales investigaciones internas o administrativas__, y que las imágenes podrán ser conservadas por el tiempo razonable y necesario para cumplir dichas finalidades, conforme a la normativa aplicable.',
    'Asimismo, manifiesto que se me informó sobre los canales para ejercer mis derechos de acceso, rectificación, supresión, revocatoria y demás derechos que me asisten como titular de los datos, y que esta autorización se otorga de forma libre y voluntaria, sin perjuicio de las obligaciones contractuales y legales aplicables.',
    'DERECHOS ARCO: Acceso, rectificación, cancelación, oposición, revocatoria a pqrsmaskuposas@gmail.com (respuesta en 2 días hábiles).',
    'Atentamente,',
  ].join('\n'),
}

/** Variables que admite el texto, con la explicación que ve quien lo edita. */
export const VARIABLES_AUTORIZACION: { clave: string; descripcion: string }[] = [
  { clave: 'nombre', descripcion: 'Nombre completo de la persona' },
  { clave: 'cedula', descripcion: 'Número de cédula y lugar de expedición' },
  { clave: 'cargo', descripcion: 'Cargo o rol pactado' },
  { clave: 'calidad', descripcion: '"CONTRATISTA INDEPENDIENTE" en OPS o "TRABAJADOR" en contrato laboral' },
  { clave: 'tipo_contrato', descripcion: '"contrato de prestación de servicios" o "contrato de trabajo"' },
  { clave: 'identificado', descripcion: 'identificado / identificada, según el género' },
  { clave: 'informado', descripcion: 'informado / informada, según el género' },
  { clave: 'empresa', descripcion: 'Razón social de la empresa' },
  { clave: 'nit', descripcion: 'NIT de la empresa' },
  { clave: 'domicilio', descripcion: 'Ciudad y dirección de la empresa' },
  { clave: 'correo_empresa', descripcion: 'Correo de contacto de la empresa' },
  { clave: 'fecha', descripcion: 'Ciudad y fecha de la firma, en letras' },
]

export type DatosAutorizacion = {
  /** "Pasto, Nariño, diez (10) de julio de 2026." */
  ciudadFecha: string
  nombre: string
  /** "1.086.298.085 de Funes (N)": número y lugar de expedición. */
  cedula: string
  cargo: string
  genero?: string | null
  /** OPS = contratista independiente (por defecto); LABORAL = trabajador. */
  vinculo?: 'OPS' | 'LABORAL'
  empresa: { razonSocial: string; nit: string; domicilio: string; emailContacto?: string | null }
}

/** Valores de cada variable para una persona y una empresa concretas. */
export function variablesAutorizacion(d: DatosAutorizacion): Record<string, string> {
  const masc = d.genero === 'MASCULINO'
  const laboral = d.vinculo === 'LABORAL'
  return {
    fecha: d.ciudadFecha,
    nombre: d.nombre,
    cedula: d.cedula,
    cargo: d.cargo,
    calidad: laboral ? 'TRABAJADOR' : 'CONTRATISTA INDEPENDIENTE',
    tipo_contrato: laboral ? 'contrato de trabajo' : 'contrato de prestación de servicios',
    identificado: masc ? 'identificado' : 'identificada',
    informado: masc ? 'informado' : 'informada',
    empresa: d.empresa.razonSocial,
    nit: d.empresa.nit,
    domicilio: d.empresa.domicilio,
    correo_empresa: d.empresa.emailContacto ?? '',
  }
}

/** Reemplaza {{clave}} por su valor; una clave desconocida se deja tal cual, para que el error se vea. */
export function sustituirVariables(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\{\{\s*([\w]+)\s*\}\}/g, (m, clave: string) => (clave in vars ? vars[clave] : m))
}

/** Trozo de párrafo con su formato. */
export type Tramo = { texto: string; negrita?: boolean; subrayado?: boolean }
export type Parrafo = Tramo[]

/** Formato sencillo dentro de un párrafo: `**negrita**` y `__subrayado__`. */
export function tramosDe(texto: string): Parrafo {
  const tramos: Parrafo = []
  const re = /\*\*([^*]+)\*\*|__([^_]+)__/g
  let ultimo = 0
  for (const m of texto.matchAll(re)) {
    const i = m.index ?? 0
    if (i > ultimo) tramos.push({ texto: texto.slice(ultimo, i) })
    if (m[1] !== undefined) tramos.push({ texto: m[1], negrita: true })
    else tramos.push({ texto: m[2], subrayado: true })
    ultimo = i + m[0].length
  }
  if (ultimo < texto.length) tramos.push({ texto: texto.slice(ultimo) })
  return tramos
}

/** Título y párrafos (una línea = un párrafo) con variables y formato ya resueltos. */
export function resolverAutorizacion(
  plantilla: PlantillaAutorizacion,
  d: DatosAutorizacion,
): { titulo: string; parrafos: Parrafo[] } {
  const vars = variablesAutorizacion(d)
  const parrafos = plantilla.contenido
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => tramosDe(sustituirVariables(p, vars)))
  return { titulo: sustituirVariables(plantilla.titulo, vars).trim(), parrafos }
}

/** Etiqueta del bloque de firma según el vínculo. */
export function rolFirmaAutorizacion(vinculo?: 'OPS' | 'LABORAL'): string {
  return vinculo === 'LABORAL' ? 'Trabajador' : 'Contratista'
}
