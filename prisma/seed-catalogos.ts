import { prisma } from '../src/lib/db'
import type { TipoEntidadSS, TipoVinculo, NivelAccesoDocumento } from '../src/generated/prisma/enums'

const ENTIDADES: { tipo: TipoEntidadSS; nombres: string[] }[] = [
  { tipo: 'EPS', nombres: ['Sura EPS', 'EPS Sanitas', 'Nueva EPS', 'Compensar EPS', 'Salud Total', 'Famisanar', 'Coosalud', 'Mutual Ser', 'Aliansalud'] },
  { tipo: 'AFP', nombres: ['Porvenir', 'Protección', 'Colfondos', 'Skandia', 'Colpensiones'] },
  { tipo: 'FONDO_CESANTIAS', nombres: ['Porvenir', 'Protección', 'Colfondos', 'Skandia', 'FNA'] },
  { tipo: 'CAJA_COMPENSACION', nombres: ['Compensar', 'Cafam', 'Colsubsidio', 'Comfama', 'Comfenalco'] },
  { tipo: 'ARL', nombres: ['ARL Sura', 'Positiva', 'Colmena Seguros', 'Seguros Bolívar', 'La Equidad', 'Liberty Seguros'] },
]

const BANCOS = [
  'Bancolombia', 'Banco de Bogotá', 'Davivienda', 'BBVA Colombia', 'Banco de Occidente',
  'Banco Popular', 'Scotiabank Colpatria', 'Banco Agrario', 'Banco Caja Social',
  'Nequi', 'Daviplata', 'Banco AV Villas', 'Itaú',
]

// ─────────────────────────────────────────────────────────────────────────────
// Estructura organizativa de EJEMPLO. NO se siembra en una instalación nueva:
// las áreas y los cargos son propios de cada empresa y se crean desde
// Configuración → Áreas y Configuración → Cargos. Solo la usa el seed de demo
// (`pnpm db:seed:demo`), que necesita cargos para colgarles colaboradores.
// ─────────────────────────────────────────────────────────────────────────────
const AREAS = ['Dirección General', 'Administrativa y Financiera', 'Talento Humano', 'Comercial y Ventas', 'Servicio Técnico', 'Logística y Bodega', 'Tecnología']

const CARGOS: { area: string; nombre: string; nivel: string }[] = [
  { area: 'Dirección General', nombre: 'Gerente General', nivel: 'directivo' },
  { area: 'Dirección General', nombre: 'Subgerente', nivel: 'directivo' },
  { area: 'Administrativa y Financiera', nombre: 'Contador', nivel: 'coordinacion' },
  { area: 'Administrativa y Financiera', nombre: 'Auxiliar Contable', nivel: 'operativo' },
  { area: 'Talento Humano', nombre: 'Coordinador de Talento Humano', nivel: 'coordinacion' },
  { area: 'Talento Humano', nombre: 'Auxiliar de Talento Humano', nivel: 'operativo' },
  { area: 'Comercial y Ventas', nombre: 'Líder Comercial', nivel: 'coordinacion' },
  { area: 'Comercial y Ventas', nombre: 'Asesor Comercial', nivel: 'operativo' },
  { area: 'Servicio Técnico', nombre: 'Técnico de Reparación', nivel: 'operativo' },
  { area: 'Logística y Bodega', nombre: 'Auxiliar de Bodega', nivel: 'operativo' },
]

const NA = (n: NivelAccesoDocumento) => n

const TIPOS_DOC: {
  nombre: string; requiereVencimiento?: boolean; nivelAcceso?: NivelAccesoDocumento; descripcion?: string
}[] = [
  { nombre: 'Documento de identidad', descripcion: 'Cédula, cédula de extranjería o pasaporte' },
  { nombre: 'Hoja de vida' },
  { nombre: 'Contrato firmado', nivelAcceso: NA('RRHH') },
  { nombre: 'RUT', descripcion: 'Registro Único Tributario (OPS)' },
  { nombre: 'Certificado de afiliación EPS' },
  { nombre: 'Certificado de afiliación AFP / pensión' },
  { nombre: 'Certificación bancaria', nivelAcceso: NA('RRHH') },
  { nombre: 'Antecedentes (Procuraduría/Policía/Contraloría)' },
  { nombre: 'Diploma o acta de grado' },
  { nombre: 'Foto' },
  { nombre: 'Examen médico de ingreso', requiereVencimiento: false, nivelAcceso: NA('SST_MEDICO') },
  { nombre: 'Examen médico periódico', requiereVencimiento: true, nivelAcceso: NA('SST_MEDICO') },
  { nombre: 'Planilla de seguridad social', requiereVencimiento: true, descripcion: 'Pago mensual SS del independiente (OPS)' },
  { nombre: 'Licencia de conducción', requiereVencimiento: true },
  { nombre: 'Curso de alturas / certificaciones SST', requiereVencimiento: true, nivelAcceso: NA('SST_MEDICO') },
]

// Documentos obligatorios por tipo de vínculo (semáforo documental)
const REQUERIDOS: Record<string, TipoVinculo[]> = {
  'Documento de identidad': ['TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR', 'APRENDIZ_SENA', 'OPS', 'PRACTICANTE'],
  'Hoja de vida': ['TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR', 'APRENDIZ_SENA', 'PRACTICANTE'],
  'Contrato firmado': ['TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR', 'APRENDIZ_SENA', 'OPS', 'PRACTICANTE'],
  'Certificado de afiliación EPS': ['TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR', 'APRENDIZ_SENA'],
  'Certificado de afiliación AFP / pensión': ['TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR'],
  'Certificación bancaria': ['TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR', 'OPS'],
  'Examen médico de ingreso': ['TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR', 'APRENDIZ_SENA'],
  'RUT': ['OPS'],
  'Planilla de seguridad social': ['OPS'],
}

export async function seedCatalogos() {
  for (const grupo of ENTIDADES) {
    for (const nombre of grupo.nombres) {
      await prisma.entidadSeguridadSocial.upsert({
        where: { tipo_nombre: { tipo: grupo.tipo, nombre } },
        create: { tipo: grupo.tipo, nombre },
        update: {},
      })
    }
  }
  for (const nombre of BANCOS) {
    await prisma.banco.upsert({ where: { nombre }, create: { nombre }, update: {} })
  }
  for (const t of TIPOS_DOC) {
    await prisma.tipoDocumento.upsert({
      where: { nombre: t.nombre },
      create: {
        nombre: t.nombre,
        descripcion: t.descripcion,
        requiereVencimiento: t.requiereVencimiento ?? false,
        nivelAcceso: t.nivelAcceso ?? 'GENERAL',
      },
      update: {},
    })
  }
  for (const [nombreDoc, vinculos] of Object.entries(REQUERIDOS)) {
    const td = await prisma.tipoDocumento.findUnique({ where: { nombre: nombreDoc } })
    if (!td) continue
    for (const v of vinculos) {
      await prisma.documentoRequerido.upsert({
        where: { tipoVinculo_tipoDocumentoId: { tipoVinculo: v, tipoDocumentoId: td.id } },
        create: { tipoVinculo: v, tipoDocumentoId: td.id, obligatorio: true },
        update: {},
      })
    }
  }
  console.log('Catálogos listos (EPS/ARL/AFP/cajas, bancos, tipos de documento)')
}

/**
 * Siembra la estructura organizativa de ejemplo (áreas y cargos). Solo la usa
 * el seed de demostración: una instalación real crea la suya desde la app.
 * Es idempotente — no pisa lo que ya exista con el mismo nombre.
 */
export async function seedEstructuraDemo() {
  for (const nombre of AREAS) {
    await prisma.area.upsert({ where: { nombre }, create: { nombre }, update: {} })
  }
  for (const c of CARGOS) {
    const area = await prisma.area.findUniqueOrThrow({ where: { nombre: c.area } })
    const existe = await prisma.cargo.findFirst({ where: { nombre: c.nombre, areaId: area.id } })
    if (!existe) await prisma.cargo.create({ data: { nombre: c.nombre, areaId: area.id, nivel: c.nivel } })
  }
  console.log('Estructura de ejemplo lista (áreas y cargos de demostración)')
}
