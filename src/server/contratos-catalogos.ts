import 'server-only'
import { prisma } from '@/lib/db'
import { valorParametroVigente } from '@/server/nomina/parametros'
import { GENERAR_CONTRATOS_DESDE_PLANTILLA } from '@/lib/contratos-config'
import type { FuncionesCargo } from '@/lib/contrato-variables'

/**
 * Catálogos que necesitan los formularios de alta de contrato (OPS y laboral).
 *
 * Los dos se abren en una ventana emergente sobre la lista de contratación, así
 * que es la lista quien los carga y se los pasa. Van juntos porque comparten la
 * mitad (sedes, cargos, empresa), y viven aquí y no en el componente para que a
 * los componentes cliente les llegue solo datos serializables.
 *
 * Las plantillas de contrato solo se traen si se ofrece redactar en la app: sin
 * eso el alta es «datos + PDF» y arrastrar veinticinco cláusulas por petición
 * sería peso muerto en cada carga de la lista.
 */
export async function catalogosNuevoContrato() {
  const [sedesRaw, cargosRaw, empresa, smmlv, auxTransporte, plantillaOps, plantillasLaborales] = await Promise.all([
    prisma.sede.findMany({ where: { activa: true }, include: { ciudad: true }, orderBy: { nombre: 'asc' } }),
    prisma.cargo.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true, funcionesContrato: true } }),
    prisma.configuracionEmpresa.findFirst(),
    valorParametroVigente('SMMLV'),
    valorParametroVigente('AUX_TRANSPORTE'),
    GENERAR_CONTRATOS_DESDE_PLANTILLA
      ? prisma.plantillaContrato.findFirst({ where: { tipo: 'OPS', activa: true }, include: { clausulas: { orderBy: { orden: 'asc' } } } })
      : Promise.resolve(null),
    GENERAR_CONTRATOS_DESDE_PLANTILLA
      ? prisma.plantillaContrato.findMany({ where: { activa: true, tipo: { not: 'OPS' } }, include: { clausulas: { orderBy: { orden: 'asc' } } } })
      : Promise.resolve([]),
  ])

  const sedes = sedesRaw.map((s) => ({ id: s.id, nombre: s.nombre, ciudad: s.ciudad.nombre }))
  const cargos = cargosRaw.map((c) => ({ id: c.id, nombre: c.nombre, funciones: (c.funcionesContrato as FuncionesCargo | null) ?? null }))
  const clausulasDe = (p: { clausulas: { titulo: string; cuerpo: string; esFunciones: boolean; orden: number }[] }) =>
    p.clausulas.map((c) => ({ titulo: c.titulo, cuerpo: c.cuerpo, esFunciones: c.esFunciones, orden: c.orden }))

  return {
    ops: {
      sedes,
      cargos,
      empresa: {
        razonSocial: empresa?.razonSocial ?? '',
        marca: empresa?.nombreComercial ?? '',
        nit: empresa?.nit ?? '',
        representanteLegal: empresa?.representanteLegal ?? '',
        representanteLegalCc: empresa?.representanteLegalCc ?? '',
        direccion: empresa?.direccion ?? '',
        correoDevolucion: empresa?.emailContacto ?? '',
      },
      plantilla: plantillaOps
        ? { titulo: plantillaOps.titulo, intro: plantillaOps.intro, cierre: plantillaOps.cierre, clausulas: clausulasDe(plantillaOps) }
        : null,
    },
    laboral: {
      catalogos: { sedes, cargos, smmlv, auxTransporte },
      plantillas: plantillasLaborales.map((p) => ({
        tipo: p.tipo, titulo: p.titulo, intro: p.intro, cierre: p.cierre, clausulas: clausulasDe(p),
      })),
      empresa: {
        razonSocial: empresa?.razonSocial ?? '',
        marca: empresa?.nombreComercial ?? null,
        nit: empresa?.nit ?? null,
        representanteLegal: empresa?.representanteLegal ?? null,
        representanteLegalCc: empresa?.representanteLegalCc ?? null,
        direccion: empresa?.direccion ?? null,
      },
    },
  }
}
