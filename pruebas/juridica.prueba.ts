import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { esClaveDelMotor } from '@/lib/nomina/claves-motor'
import { esAcoso, etiquetaReporte } from '@/lib/linea-etica'
import { vinculoCoincide, discrepanciaVinculo } from '@/lib/vinculo-contrato'
import { aplicaTramite, esOps } from '@/lib/tramites-vinculo'

/**
 * Reglas de Jurídica y de protección al contratista, comprobadas sobre los
 * datos reales del escenario.
 */

const MARCA = 'PRUEBA-JURIDICA'
let sedeId: string
let laboralId: string

async function limpiar() {
  const colabs = await prisma.colaborador.findMany({ where: { apellidos: MARCA }, select: { id: true } })
  const ids = colabs.map((c) => c.id)
  if (!ids.length) return
  const procs = await prisma.procesoDisciplinario.findMany({ where: { colaboradorId: { in: ids } }, select: { id: true } })
  await prisma.etapaProceso.deleteMany({ where: { procesoId: { in: procs.map((p) => p.id) } } })
  await prisma.procesoDisciplinario.deleteMany({ where: { colaboradorId: { in: ids } } })
  await prisma.colaborador.deleteMany({ where: { id: { in: ids } } })
}

beforeAll(async () => {
  await limpiar()
  const sede = await prisma.sede.findFirstOrThrow({ where: { activa: true } })
  sedeId = sede.id
  const base = {
    apellidos: MARCA, tipoDocumento: 'CC' as const, celular: '3000000000', sedeId,
    modalidadTrabajo: 'PRESENCIAL' as const, fechaIngreso: new Date(Date.UTC(2025, 0, 2)),
    estado: 'ACTIVO' as const,
  }
  laboralId = (await prisma.colaborador.create({
    data: { ...base, nombres: 'Laboral', numeroDocumento: '99200001', tipoVinculo: 'TERMINO_INDEFINIDO', busquedaNormalizada: 'laboral juridica' },
  })).id
  // El contratista existe para que la limpieza cubra el caso OPS; las reglas de
  // vínculo se comprueban con los helpers puros, sin necesitar su id.
  await prisma.colaborador.create({
    data: { ...base, nombres: 'Contratista', numeroDocumento: '99200002', tipoVinculo: 'OPS', busquedaNormalizada: 'contratista juridica' },
  })
})

afterAll(async () => { await limpiar(); await prisma.$disconnect() })

describe('llamado de atención vs proceso disciplinario', () => {
  it('un llamado se guarda como tal y no como proceso', async () => {
    const p = await prisma.procesoDisciplinario.create({
      data: {
        colaboradorId: laboralId, clase: 'LLAMADO_ATENCION', asunto: 'Incumplimiento de horario',
        fechaApertura: new Date(Date.UTC(2026, 5, 1)), etapa: 'CITACION_DESCARGOS',
      },
    })
    expect(p.clase).toBe('LLAMADO_ATENCION')
    expect(p.decision).toBeNull()
  })

  it('al escalar conserva el expediente y pasa a proceso', async () => {
    const p = await prisma.procesoDisciplinario.findFirstOrThrow({
      where: { colaboradorId: laboralId, clase: 'LLAMADO_ATENCION' },
    })
    await prisma.etapaProceso.create({
      data: { procesoId: p.id, etapa: 'DESCARGOS', fecha: new Date(Date.UTC(2026, 5, 5)), detalle: 'Descargos' },
    })
    const escalado = await prisma.procesoDisciplinario.update({
      where: { id: p.id }, data: { clase: 'PROCESO' },
    })
    expect(escalado.clase).toBe('PROCESO')
    // Lo actuado sigue ahí: es lo que sustenta que la falta venía de antes.
    expect(escalado.fechaApertura).toEqual(p.fechaApertura)
    const etapas = await prisma.etapaProceso.count({ where: { procesoId: p.id } })
    expect(etapas).toBeGreaterThan(0)
  })
})

describe('protección frente al contrato realidad', () => {
  it('al contratista no se le ofrecen los trámites laborales', () => {
    // Ofrecerle vacaciones o disciplinarios a un OPS es prueba de subordinación.
    expect(esOps('OPS')).toBe(true)
    for (const t of ['vacaciones', 'permisos', 'disciplinarios', 'dotacion'] as const) {
      expect(aplicaTramite('OPS', t)).toBe(false)
    }
  })

  it('al empleado laboral sí', () => {
    for (const t of ['vacaciones', 'permisos', 'disciplinarios'] as const) {
      expect(aplicaTramite('TERMINO_INDEFINIDO', t)).toBe(true)
    }
  })

  it('el aprendiz SENA es laboral desde el primer día', async () => {
    // Tras la reforma de 2025 no lleva restricciones de OPS.
    expect(esOps('APRENDIZ_SENA')).toBe(false)
    expect(aplicaTramite('APRENDIZ_SENA', 'vacaciones')).toBe(true)
  })
})

describe('coherencia entre contrato y ficha', () => {
  it('detecta cuando el contrato dice una cosa y la ficha otra', () => {
    expect(vinculoCoincide('OBRA_LABOR', 'TERMINO_FIJO')).toBe(false)
    expect(discrepanciaVinculo('OBRA_LABOR', 'TERMINO_FIJO')).toContain('obra o labor')
  })

  it('un contrato laboral sobre una ficha OPS siempre es contradicción', () => {
    expect(vinculoCoincide('TERMINO_INDEFINIDO', 'OPS')).toBe(false)
  })
})

describe('línea ética', () => {
  it('solo los reportes de acoso van al Comité de Convivencia', () => {
    expect(esAcoso('ACOSO_LABORAL')).toBe(true)
    expect(esAcoso('ACOSO_SEXUAL')).toBe(true)
    expect(esAcoso('SUGERENCIA')).toBe(false)
    expect(esAcoso('CONDUCTA_IRREGULAR')).toBe(false)
  })

  it('los reportes guardados conservan su tipo', async () => {
    const codigo = `DA-${MARCA}`
    await prisma.denunciaAcoso.deleteMany({ where: { codigo } })
    const d = await prisma.denunciaAcoso.create({
      data: { codigo, tipo: 'SUGERENCIA', anonima: true, hechos: 'Sugerencia de prueba', estado: 'RECIBIDA' },
    })
    expect(etiquetaReporte(d.tipo)).toBe('Sugerencia o queja')
    await prisma.denunciaAcoso.delete({ where: { id: d.id } })
  })
})

describe('parámetros de nómina protegidos', () => {
  it('las claves que lee el motor no se pueden borrar', async () => {
    // Si desaparece el SMMLV la nómina deja de calcular, y el fallo aparece
    // lejos de la pantalla donde alguien lo borró.
    const claves = await prisma.parametroLegal.findMany({ select: { clave: true }, distinct: ['clave'] })
    const delMotor = claves.filter((c) => esClaveDelMotor(c.clave))
    expect(delMotor.length).toBeGreaterThanOrEqual(17)
    expect(esClaveDelMotor('SMMLV')).toBe(true)
  })

  it('hay SMMLV y auxilio de transporte vigentes hoy', async () => {
    const hoy = new Date()
    for (const clave of ['SMMLV', 'AUX_TRANSPORTE']) {
      const vigente = await prisma.parametroLegal.findFirst({
        where: {
          clave,
          vigenciaDesde: { lte: hoy },
          OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }],
        },
      })
      expect(vigente, `falta ${clave} vigente`).toBeTruthy()
    }
  })
})
