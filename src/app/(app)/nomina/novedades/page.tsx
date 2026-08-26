import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { formatFechaISO, hoyBogotaISO } from '@/lib/fechas'
import { CONTRATOS_DE_NOMINA } from '@/lib/vinculo-contrato'
import { urlPanelAsistencia } from '@/server/asistencia/horas-asistencia'
import { NovedadesNomina } from './novedades-cliente'

export const metadata = { title: 'Novedades de nómina · Smart Gadgets RH' }

/** Últimas novedades que se muestran. Más atrás es historia, no operación. */
const LIMITE = 200

/**
 * Novedades de nómina, fuera de todo periodo.
 *
 * Antes esto vivía dentro de un periodo, lo que obligaba a crear la nómina del
 * mes antes de poder registrar una comisión — y a quien se retiraba a mitad de
 * mes se le perdía lo causado. Ahora se registran cuando ocurren, con su fecha,
 * y el periodo las recoge por rango.
 */
export default async function NovedadesNominaPage() {
  await requerirPermiso('nomina', 'CREAR')

  const nomColab = { colaborador: { select: { nombres: true, apellidos: true } } }
  const conPeriodo = { periodo: { select: { nombre: true } } }

  const [comisiones, horas, novedadesConcepto, conceptos, contratos] = await Promise.all([
    prisma.comision.findMany({
      include: { ...nomColab, ...conPeriodo }, orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }], take: LIMITE,
    }),
    prisma.novedadHoras.findMany({
      include: { ...nomColab, ...conPeriodo }, orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }], take: LIMITE,
    }),
    prisma.novedadConcepto.findMany({
      include: { ...nomColab, ...conPeriodo, concepto: true }, orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }], take: LIMITE,
    }),
    // Solo los que se aplican a mano: los de cálculo SISTEMA los liquida el motor.
    prisma.conceptoNomina.findMany({ where: { activo: true, tipoCalculo: { not: 'SISTEMA' } }, orderBy: { nombre: 'asc' } }),
    prisma.contrato.findMany({
      where: { estado: 'ACTIVO', tipo: { in: [...CONTRATOS_DE_NOMINA] } },
      select: { colaboradorId: true, colaborador: { select: { nombres: true, apellidos: true } } },
      orderBy: { colaborador: { apellidos: 'asc' } },
    }),
  ])

  const nombre = (c: { colaborador: { nombres: string; apellidos: string } }) =>
    `${c.colaborador.nombres} ${c.colaborador.apellidos}`

  return (
    <div className="max-w-4xl">
      <Link href="/nomina" className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Nómina
      </Link>
      <Encabezado
        titulo="Novedades"
        descripcion="Comisiones, horas extra y conceptos aplicados. Se registran cuando ocurren; el periodo de nómina los recoge por fecha."
      />

      <NovedadesNomina
        hoy={hoyBogotaISO()}
        colaboradores={[...new Map(contratos.map((c) => [
          c.colaboradorId,
          { id: c.colaboradorId, nombre: `${c.colaborador.nombres} ${c.colaborador.apellidos}` },
        ])).values()]}
        conceptos={conceptos.map((c) => ({
          id: c.id, nombre: c.nombre, tipo: c.tipo,
          valorFijo: c.valorFijo != null ? Number(c.valorFijo) : null,
        }))}
        comisiones={comisiones.map((c) => ({
          id: c.id, colaborador: nombre(c), fecha: formatFechaISO(c.fecha), tipo: c.tipo,
          baseCalculo: Number(c.baseCalculo), valor: Number(c.valor),
          descripcion: c.descripcion, pagadaEn: c.periodo?.nombre ?? null,
        }))}
        horas={horas.map((h) => ({
          id: h.id, colaborador: nombre(h), fecha: formatFechaISO(h.fecha), tipoHora: h.tipoHora,
          horas: Number(h.horas), horaInicio: h.horaInicio, horaFin: h.horaFin,
          pagadaEn: h.periodo?.nombre ?? null,
        }))}
        conceptosNovedades={novedadesConcepto.map((n) => ({
          id: n.id, colaborador: nombre(n), fecha: formatFechaISO(n.fecha),
          concepto: n.concepto.nombre, tipo: n.concepto.tipo, valor: Number(n.valor),
          pagadaEn: n.periodo?.nombre ?? null,
        }))}
        urlAsistencia={urlPanelAsistencia()}
      />
    </div>
  )
}
