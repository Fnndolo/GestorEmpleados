// Motor de variables para plantillas de contrato. Compartido cliente/servidor
// (sin imports server-only). Construye el mapa {{variable}} → valor y resuelve
// la plantilla (título + intro + cláusulas) sustituyendo y anexando funciones.

import { pesosALetras, fechaLargaLetras, mesesALetras } from './numero-letras'

export type FuncionesCargo = { grupo: string; items: string[] }[]

/** Texto simple → estructura. Líneas "# Grupo" abren grupo; "- ítem" agregan viñeta. */
export function parseFuncionesTexto(texto: string): FuncionesCargo {
  const grupos: FuncionesCargo = []
  for (const raw of texto.split('\n')) {
    const linea = raw.trim()
    if (!linea) continue
    if (linea.startsWith('#')) {
      grupos.push({ grupo: linea.replace(/^#+\s*/, '').trim(), items: [] })
    } else {
      const item = linea.replace(/^[-•*]\s*/, '').trim()
      if (!item) continue
      if (grupos.length === 0) grupos.push({ grupo: '', items: [] })
      grupos[grupos.length - 1].items.push(item)
    }
  }
  return grupos.filter((g) => g.items.length > 0)
}

/** Estructura → texto simple editable. */
export function formatearFuncionesTexto(f: FuncionesCargo | null | undefined): string {
  if (!f || f.length === 0) return ''
  return f.map((g) => `# ${g.grupo}\n${g.items.map((i) => `- ${i}`).join('\n')}`).join('\n\n')
}

export type DatosContrato = {
  empresa: {
    razonSocial: string
    marca?: string | null
    nit?: string | null
    representanteLegal?: string | null
    representanteLegalCc?: string | null
    direccion?: string | null
    correoDevolucion?: string | null
  }
  contratista: {
    nombre?: string | null
    cc?: string | null
    ccLugar?: string | null
    direccion?: string | null
    email?: string | null
    telefono?: string | null
    /** 'MASCULINO' ajusta el tratamiento; cualquier otro valor usa femenino (texto original). */
    genero?: string | null
  }
  contrato: {
    numero?: string | null
    ciudad?: string | null
    fechaSuscripcion?: string | null
    fechaInicio?: string | null
    fechaFin?: string | null
    plazoMeses?: number | null
    valorTotal?: number | null
    honorarioMensual?: number | null
    cargoObjeto?: string | null
    // Campos propios del contrato LABORAL (la plantilla OPS los ignora)
    salarioMensual?: number | null
    auxTransporte?: number | null
  }
}

export type PlantillaResuelta = {
  titulo: string
  numero: string
  intro: string
  cierre: string
  clausulas: { titulo: string; parrafos: string[]; funciones?: FuncionesCargo }[]
  /** "LA CONTRATISTA" o "EL CONTRATISTA" según el género (para el bloque de firmas). */
  denominacionContratista?: string
}

/**
 * Ajusta el tratamiento del contratista cuando es masculino. El texto legal
 * original está redactado en femenino; esto permite usar la misma plantilla
 * (incluida la ya guardada en BD) para ambos casos sin duplicarla.
 */
export function ajustarGeneroContratista(texto: string, genero?: string | null): string {
  if (genero !== 'MASCULINO') return texto
  return texto
    .replaceAll('LA CONTRATISTA', 'EL CONTRATISTA')
    .replaceAll('la señora', 'el señor')
    .replaceAll('identificada con cédula', 'identificado con cédula')
    .replaceAll('operadora autónoma', 'operador autónomo')
    .replaceAll('contratista autónoma', 'contratista autónomo')
}

export type ClausulaPlantilla = { titulo: string; cuerpo: string; esFunciones: boolean; orden: number }

/** Marcador visible cuando un dato aún no se ha capturado (para la vista previa). */
const VACIO = '__________'

function fechaOpc(v?: string | null) {
  return v ? fechaLargaLetras(v) : VACIO
}
function pesosOpc(v?: number | null) {
  return v != null ? pesosALetras(v) : VACIO
}
function txt(v?: string | null) {
  return v && v.trim() ? v.trim() : VACIO
}

/** Construye el mapa de variables a partir de los datos del contrato. */
export function construirVariables(d: DatosContrato): Record<string, string> {
  return {
    empresa_razon_social: txt(d.empresa.razonSocial),
    empresa_marca: txt(d.empresa.marca ?? d.empresa.razonSocial),
    empresa_nit: txt(d.empresa.nit),
    representante_legal: txt(d.empresa.representanteLegal),
    representante_legal_cc: txt(d.empresa.representanteLegalCc),
    correo_devolucion: txt(d.empresa.correoDevolucion),
    correo_envio: txt(d.contratista.email),

    // Tratamiento según género (el texto legal original está en femenino)
    contratista_tratamiento: d.contratista.genero === 'MASCULINO' ? 'el señor' : 'la señora',
    contratista_identificada: d.contratista.genero === 'MASCULINO' ? 'identificado' : 'identificada',
    denominacion_contratista: d.contratista.genero === 'MASCULINO' ? 'EL CONTRATISTA' : 'LA CONTRATISTA',

    contratista_nombre: txt(d.contratista.nombre),
    contratista_cc: txt(d.contratista.cc),
    contratista_cc_lugar: txt(d.contratista.ccLugar),
    contratista_direccion: txt(d.contratista.direccion),
    contratista_email: txt(d.contratista.email),
    contratista_telefono: txt(d.contratista.telefono),

    numero: txt(d.contrato.numero),
    ciudad: txt(d.contrato.ciudad),
    fecha_suscripcion_larga: fechaOpc(d.contrato.fechaSuscripcion),
    fecha_inicio_larga: fechaOpc(d.contrato.fechaInicio),
    fecha_fin_larga: fechaOpc(d.contrato.fechaFin),
    plazo_letras: d.contrato.plazoMeses != null ? mesesALetras(d.contrato.plazoMeses) : VACIO,
    valor_total_mcte_letras: pesosOpc(d.contrato.valorTotal),
    honorario_mensual_letras: pesosOpc(d.contrato.honorarioMensual),
    cargo_objeto: txt(d.contrato.cargoObjeto),

    // ── Variables del contrato LABORAL ─────────────────────────────────────
    // La misma persona: en plantillas laborales se nombra "empleado".
    empleado_nombre: txt(d.contratista.nombre),
    empleado_cc: txt(d.contratista.cc),
    empleado_cc_lugar: txt(d.contratista.ccLugar),
    empleado_direccion: txt(d.contratista.direccion),
    empleado_email: txt(d.contratista.email),
    empleado_tratamiento: d.contratista.genero === 'MASCULINO' ? 'el señor' : 'la señora',
    empleado_identificada: d.contratista.genero === 'MASCULINO' ? 'identificado' : 'identificada',
    salario_mcte_letras: pesosOpc(d.contrato.salarioMensual),
    aux_transporte_mcte_letras: pesosOpc(d.contrato.auxTransporte),
  }
}

/** Reemplaza {{clave}} por su valor; deja el token si la clave no existe. */
export function sustituir(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\{\{\s*([\w]+)\s*\}\}/g, (m, clave) => (clave in vars ? vars[clave] : m))
}

/** Resuelve la plantilla completa lista para renderizar (previa HTML o PDF). */
export function resolverPlantilla(
  plantilla: { titulo: string; intro: string; cierre?: string; clausulas: ClausulaPlantilla[] },
  datos: DatosContrato,
  funciones: FuncionesCargo | null,
): PlantillaResuelta {
  const vars = construirVariables(datos)
  const genero = datos.contratista.genero
  const resolver = (texto: string) => ajustarGeneroContratista(sustituir(texto, vars), genero)
  const clausulas = [...plantilla.clausulas]
    .sort((a, b) => a.orden - b.orden)
    .map((c) => ({
      titulo: resolver(c.titulo),
      parrafos: resolver(c.cuerpo)
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean),
      funciones: c.esFunciones ? funciones ?? [] : undefined,
    }))
  return {
    titulo: resolver(plantilla.titulo),
    numero: vars.numero,
    intro: resolver(plantilla.intro),
    cierre: resolver(plantilla.cierre ?? ''),
    clausulas,
    denominacionContratista: vars.denominacion_contratista,
  }
}
