import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { cargarFestivos } from '@/server/vencimientos/festivos'
import { JORNADA_VIGENCIAS } from '@/server/nomina/horas'

/**
 * Configuración laboral de SOLO LECTURA para el sistema de asistencia
 * (ArriveControl). Fuente única: aquí viven la jornada legal (Ley 2101) y los
 * festivos (calendario Emiliani + excepciones decretadas); asistencia los
 * consume, no los edita. Se edita en /configuracion/parametros-nomina.
 *
 * Autenticación: la misma clave compartida de la integración de horas.
 */

export const runtime = 'nodejs'

const ANIO_MIN = 2000
const ANIO_MAX = 2100

export async function GET(req: NextRequest) {
  const clave = process.env.INTEGRACION_HORAS_API_KEY
  const enviada = req.headers.get('x-api-key')
  if (process.env.NODE_ENV === 'production' || clave) {
    if (!clave || enviada !== clave) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }
  }

  const { searchParams } = new URL(req.url)
  const anioActual = new Date().getFullYear()
  const anioDesde = Number(searchParams.get('anioDesde') ?? anioActual - 1)
  const anioHasta = Number(searchParams.get('anioHasta') ?? anioActual + 1)
  if (
    !Number.isInteger(anioDesde) || !Number.isInteger(anioHasta) ||
    anioDesde < ANIO_MIN || anioHasta > ANIO_MAX || anioDesde > anioHasta ||
    anioHasta - anioDesde > 10
  ) {
    return NextResponse.json(
      { ok: false, error: `Rango de años inválido (entre ${ANIO_MIN} y ${ANIO_MAX}, máximo 10 años).` },
      { status: 400 },
    )
  }

  const [festivos, empresa] = await Promise.all([
    cargarFestivos(anioDesde, anioHasta),
    prisma.configuracionEmpresa.findFirst({ select: { sabadoHabil: true } }),
  ])

  return NextResponse.json({
    ok: true,
    jornada: {
      // Vigencias de la jornada semanal legal, de la más reciente a la más
      // antigua. horasDia asume semana de 6 días (la de esta empresa).
      vigencias: JORNADA_VIGENCIAS.map((v) => ({
        desde: v.desde,
        horasSemana: v.horasSemana,
        horasDia: v.horasSemana / 6,
      })),
      sabadoHabil: empresa?.sabadoHabil ?? true,
    },
    festivos: [...festivos].sort(),
    editarEn: '/configuracion/parametros-nomina',
  })
}
