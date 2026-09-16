/**
 * Autorización expresa para el tratamiento de datos personales (Ley 1581 de 2012).
 *
 * Hay DOS autorizaciones distintas, una por tipo de vínculo: la del contratista
 * OPS y la del trabajador con contrato laboral (esta última incluye el programa
 * de monitoreo de productividad, la huella, la videovigilancia y la imagen
 * promocional). Cada una tiene su texto de fábrica y se edita por separado en
 * Ajustes → Plantillas de documentos. Aquí viven las reglas puras (sin BD) que
 * comparten el PDF y la vista previa: los textos de fábrica, las variables, el
 * formato sencillo y la resolución final.
 */

export type VinculoAutorizacion = 'OPS' | 'LABORAL'

/** Categorías con que se guarda cada una en `PlantillaDocumento`. */
export const CATEGORIA_AUTORIZACION = 'AUTORIZACION_DATOS' // OPS (la primera que existió)
export const CATEGORIA_AUTORIZACION_LABORAL = 'AUTORIZACION_DATOS_LABORAL'

export function categoriaAutorizacion(vinculo: VinculoAutorizacion): string {
  return vinculo === 'LABORAL' ? CATEGORIA_AUTORIZACION_LABORAL : CATEGORIA_AUTORIZACION
}

export type PlantillaAutorizacion = { titulo: string; contenido: string }

/**
 * Texto de fábrica para el contratista OPS (formato real de KUPOCELL). Cada
 * línea es un párrafo; `**negrita**` y `__subrayado__` resaltan; `{{variable}}`
 * se llena con los datos de la persona y la empresa.
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

/**
 * Texto de fábrica para el trabajador con contrato laboral (formato real de
 * KUPOCELL, 2026). Además de negrita y subrayado usa listas: `- ` viñeta,
 * `✓ ` casilla, `1. ` numeración; y `~ ` para la nota pequeña que va debajo
 * de la firma.
 */
export const AUTORIZACION_LABORAL_POR_DEFECTO: PlantillaAutorizacion = {
  titulo: 'AUTORIZACIÓN EXPRESA PARA EL TRATAMIENTO DE DATOS PERSONALES',
  contenido: [
    'Yo, {{nombre}}, {{identificado}} con cédula de ciudadanía No. {{cedula}}, en calidad de: {{calidad}}, AUTORIZO EXPRESAMENTE a la empresa {{empresa}} en calidad de EMPLEADOR e identificada con NIT No. {{nit}} con domicilio en {{domicilio}}, correo electrónico {{correo_empresa}}, como responsable del Tratamiento, para recoger, almacenar, usar, circular y suprimir mis datos conforme a la Ley 1581 de 2012:',
    'SECCIÓN 1: Implementación de Programa de Monitoreo de Productividad.',
    'Este programa mide el rendimiento laboral mediante el registro del tiempo invertido en cada página web visitada, evaluando la utilidad de las actividades realizadas en ellas. La medición se realiza de manera diferenciada, considerando las siguientes particularidades:',
    '- Algunas __personas que ya están autorizadas__ podrán utilizar su chat personal para trabajos laborales; el resto del personal deberá emplear exclusivamente el **chat empresarial proporcionado**.',
    '- Queda estrictamente prohibido el acceso a páginas de redes sociales, entretenimiento u otros sitios no relacionados con las funciones laborales.',
    '- El programa genera __alertas automáticas__ en caso de uso inadecuado de los recursos, lo que podrá derivar en un llamado de atención formal y, de persistir la conducta, en la terminación del contrato, conforme a las políticas disciplinarias de la empresa.',
    'SECCIÓN 2: Autorización Expresa para Tratamiento de Datos.',
    'Datos autorizados:',
    '✓ Huella dactilar para control de ingreso a las instalaciones.',
    '✓ Imágenes/audio de videovigilancia, instaladas en todas las áreas de cada una de las sedes.',
    '✓ Imagen promocional (fotos/videos para redes, web, publicidad).',
    '✓ Datos de monitoreo (tiempo en sitios web, actividades en equipos).',
    'FINALIDADES:',
    '1. **Protección de bienes y seguridad integral**: Garantizar la salvaguarda de activos empresariales mediante el uso de datos biométricos (huellas dactilares) para control de accesos y videovigilancia en áreas de exhibición y almacenamiento, previniendo sustracciones, daños o riesgos no autorizados.',
    '2. **Promoción comercial y difusión de imagen corporativa**: Empleo de imágenes y videos promocionales de asesores en redes sociales, sitio web y materiales publicitarios, conforme a cláusulas contractuales, para fortalecer la visibilidad y atractivo de los servicios de asesoría ofrecidos por {{empresa}}.',
    '3. **Monitoreo y optimización de la productividad:** Registro y análisis de datos generados por el programa de monitoreo instalado en equipos asignados —incluyendo tiempo invertido en sitios web y naturaleza de actividades realizadas—, con el propósito de evaluar el rendimiento, verificar el cumplimiento de metas específicas estipuladas en contratos individuales, promover la dedicación exclusiva a funciones contratadas, garantizar el uso adecuado de recursos tecnológicos y prevenir riesgos como infecciones por virus, malware o exposición a delitos informáticos.',
    'DERECHOS ARCO: Acceso, rectificación, cancelación, oposición, revocatoria a talentohumanosmart2215@gmail.com (respuesta en 2 días hábiles).',
    'Acepto las condiciones descritas y confirmo haber recibido información completa.',
    'Atentamente,',
    '~ El tratamiento de los datos personales se realiza conforme a la Ley 1581 de 2012 y demás normas concordantes, garantizando la protección, confidencialidad y uso adecuado de la información.',
  ].join('\n'),
}

export function autorizacionPorDefecto(vinculo: VinculoAutorizacion): PlantillaAutorizacion {
  return vinculo === 'LABORAL' ? AUTORIZACION_LABORAL_POR_DEFECTO : AUTORIZACION_POR_DEFECTO
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
  vinculo?: VinculoAutorizacion
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

/**
 * Reemplaza {{clave}} por su valor; una clave desconocida se deja tal cual, para
 * que el error se vea. Si el valor termina en punto ("KUPOCELL S.A.S.") y el texto
 * sigue con otro, se deja uno solo: "S.A.S.." no es lo que nadie quiso escribir.
 */
export function sustituirVariables(texto: string, vars: Record<string, string>): string {
  return texto
    .replace(/\{\{\s*([\w]+)\s*\}\}/g, (m, clave: string) => (clave in vars ? vars[clave] : m))
    .replace(/(?<!\.)\.\.(?!\.)/g, '.')
}

/** Trozo de párrafo con su formato. */
export type Tramo = { texto: string; negrita?: boolean; subrayado?: boolean }

/**
 * Párrafo ya resuelto. `vineta` es el marcador que va a la izquierda con
 * sangría francesa ("•", "✓" o "1."); sin él es un párrafo corrido.
 */
export type Parrafo = { tramos: Tramo[]; vineta?: string }

/** Formato sencillo dentro de un párrafo: `**negrita**` y `__subrayado__`. */
export function tramosDe(texto: string): Tramo[] {
  const tramos: Tramo[] = []
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

/**
 * Lee el marcador de lista al inicio de una línea: `- ` (viñeta), `✓ ` (casilla)
 * o `1. ` (numeración). Devuelve el marcador y el texto sin él.
 */
export function marcadorDe(linea: string): { vineta?: string; texto: string } {
  const m = /^(?:(-|•|✓)|(\d{1,2}\.))\s+(.*)$/.exec(linea)
  if (!m) return { texto: linea }
  const vineta = m[1] === '-' ? '•' : (m[1] ?? m[2])
  return { vineta, texto: m[3] }
}

/** Prefijo de la nota pequeña que va debajo de la firma. */
const PREFIJO_NOTA = '~ '

/**
 * Título, párrafos y notas (una línea = un párrafo) con variables y formato ya
 * resueltos. Las líneas que empiezan por `~ ` no van en el cuerpo: son la nota
 * en letra pequeña que se imprime debajo de la firma.
 */
export function resolverAutorizacion(
  plantilla: PlantillaAutorizacion,
  d: DatosAutorizacion,
): { titulo: string; parrafos: Parrafo[]; notas: Tramo[][] } {
  const vars = variablesAutorizacion(d)
  const lineas = plantilla.contenido
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)
  const parrafos: Parrafo[] = []
  const notas: Tramo[][] = []
  for (const linea of lineas) {
    if (linea.startsWith(PREFIJO_NOTA)) {
      notas.push(tramosDe(sustituirVariables(linea.slice(PREFIJO_NOTA.length).trim(), vars)))
      continue
    }
    const { vineta, texto } = marcadorDe(linea)
    parrafos.push({ tramos: tramosDe(sustituirVariables(texto, vars)), ...(vineta ? { vineta } : {}) })
  }
  return { titulo: sustituirVariables(plantilla.titulo, vars).trim(), parrafos, notas }
}

/** Etiqueta del bloque de firma según el vínculo. */
export function rolFirmaAutorizacion(vinculo?: VinculoAutorizacion): string {
  return vinculo === 'LABORAL' ? 'Trabajador' : 'Contratista'
}
