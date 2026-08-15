import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * Colaboradores para el sistema de asistencia (ArriveControl), por HTTP.
 *
 * Antes asistencia leía `public.colaborador` directamente porque compartían
 * base de datos. Ya no: son dos sistemas separados, cada uno dueño de sus
 * tablas, y esta es la única puerta.
 *
 * Tres usos, todos con la misma clave compartida:
 *  · ?buscar=texto        → buscador para registrar a alguien en asistencia
 *  · ?id=uuid             → un colaborador concreto (validación del alta)
 *  · ?documentos=1,2,3    → estado de cédulas ya registradas (para saber si
 *                           alguien fue retirado y no debe poder marcar)
 *
 * Se exponen SOLO los campos mínimos para identificar a la persona: nada de
 * salud, salario ni datos sensibles.
 */

export const runtime = 'nodejs'

const MAX_BUSQUEDA = 15
const MAX_DOCUMENTOS = 500

export async function GET(req: NextRequest) {
  const clave = process.env.INTEGRACION_HORAS_API_KEY
  const enviada = req.headers.get('x-api-key')
  if (process.env.NODE_ENV === 'production' || clave) {
    if (!clave || enviada !== clave) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }
  }

  const { searchParams } = new URL(req.url)
  const buscar = (searchParams.get('buscar') ?? '').trim().toLowerCase()
  const documentos = (searchParams.get('documentos') ?? '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)

  // ── Un colaborador concreto, para validar un alta ────────────────────
  const id = (searchParams.get('id') ?? '').trim()
  if (id) {
    const c = await prisma.colaborador
      .findUnique({
        where: { id },
        select: {
          id: true, nombres: true, apellidos: true, numeroDocumento: true,
          estado: true, fotoPath: true, sede: { select: { nombre: true } },
        },
      })
      .catch(() => null) // id con formato inválido
    if (!c || c.estado !== 'ACTIVO') {
      return NextResponse.json({ ok: true, colaborador: null })
    }
    return NextResponse.json({
      ok: true,
      colaborador: {
        id: c.id,
        nombres: c.nombres,
        apellidos: c.apellidos,
        cedula: c.numeroDocumento,
        sede_gestor: c.sede?.nombre ?? null,
        tiene_foto: c.fotoPath != null,
      },
    })
  }

  // ── Estado de cédulas concretas ──────────────────────────────────────
  // Asistencia pregunta "¿estas personas siguen activas?" para no dejar
  // marcar a quien ya fue retirado.
  if (documentos.length > 0) {
    if (documentos.length > MAX_DOCUMENTOS) {
      return NextResponse.json(
        { ok: false, error: `Máximo ${MAX_DOCUMENTOS} documentos por consulta.` },
        { status: 400 },
      )
    }
    const filas = await prisma.colaborador.findMany({
      where: { numeroDocumento: { in: documentos } },
      select: { id: true, numeroDocumento: true, estado: true },
    })
    return NextResponse.json({
      ok: true,
      colaboradores: filas.map((c) => ({
        id: c.id,
        cedula: c.numeroDocumento,
        activo: c.estado === 'ACTIVO',
      })),
    })
  }

  // ── Búsqueda para el alta ────────────────────────────────────────────
  if (buscar.length < 2) return NextResponse.json({ ok: true, colaboradores: [] })

  const filas = await prisma.colaborador.findMany({
    where: {
      estado: 'ACTIVO',
      OR: [
        { busquedaNormalizada: { contains: buscar } },
        { numeroDocumento: { startsWith: buscar } },
      ],
    },
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      numeroDocumento: true,
      fotoPath: true,
      sede: { select: { nombre: true } },
    },
    orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
    take: MAX_BUSQUEDA,
  })

  return NextResponse.json({
    ok: true,
    colaboradores: filas.map((c) => ({
      id: c.id,
      nombres: c.nombres,
      apellidos: c.apellidos,
      cedula: c.numeroDocumento,
      sede_gestor: c.sede?.nombre ?? null,
      tiene_foto: c.fotoPath != null,
    })),
  })
}
