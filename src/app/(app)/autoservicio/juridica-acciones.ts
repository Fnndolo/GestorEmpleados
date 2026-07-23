'use server'

import { revalidatePath } from 'next/cache'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO, hoyBogota } from '@/lib/fechas'
import { avisarPorRol } from '@/server/notificaciones/avisar'
import { sumarDiasHabiles, festivosDeRango } from '@/lib/dias-habiles'

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

/**
 * Canal anti-acoso desde el autoservicio del colaborador (Ley 2466 de 2025).
 *
 * CONFIDENCIALIDAD: se usa `prisma` (NO `dbAuditado`) a propósito, para que el
 * AuditLog NO registre quién radicó la denuncia. Tampoco se guarda el
 * colaboradorId ni ningún vínculo con el usuario: la denuncia no es rastreable
 * hasta su autor. Si es anónima, ni siquiera se guarda el nombre. El colaborador
 * recibe un CÓDIGO para dar seguimiento sin revelar su identidad.
 */
export const crearMiDenuncia = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({
      anonima: z.boolean(),
      denuncianteNombre: z.string().max(150).optional(),
      hechos: z.string().trim().min(10, 'Describe los hechos (mínimo 10 caracteres).').max(2000),
      fechaHechos: z.string().optional(),
    }),
  },
  async (d) => {
    const codigo = `DA-${randomBytes(4).toString('hex').toUpperCase()}`
    // prisma (sin auditar): no se registra el autor en ninguna parte → confidencial.
    await prisma.denunciaAcoso.create({
      data: {
        codigo,
        anonima: d.anonima,
        denuncianteNombre: d.anonima ? null : v(d.denuncianteNombre),
        hechos: d.hechos,
        fechaHechos: parseFechaISO(d.fechaHechos || null),
        estado: 'RECIBIDA',
      },
    })

    // Avisar al Comité de Convivencia / Jurídica SIN revelar identidad (solo el código).
    await avisarPorRol(['Jurídica', 'Administrador', 'Subgerencia'], {
      evento: 'denuncia_acoso',
      titulo: 'Nueva denuncia anti-acoso recibida',
      mensaje: `Se recibió una denuncia por el canal de convivencia (código ${codigo}). Revísala de forma confidencial.`,
      enlace: '/juridica?tab=denuncias',
      llamadoAccion: 'Revisar el canal anti-acoso',
    })

    revalidatePath('/autoservicio/juridica')
    return { codigo }
  },
)

/**
 * Límite de consultas de denuncia por usuario y día (anti fuerza bruta de códigos).
 * En memoria a propósito: no deja rastro persistente de quién consulta el canal
 * (confidencialidad); se reinicia con el proceso, suficiente para frenar barridos.
 */
const CONSULTAS_DENUNCIA_MAX_DIA = 10
const consultasDenuncia = new Map<string, { dia: string; intentos: number }>()

function verificarLimiteConsulta(usuarioId: string) {
  const dia = new Date().toISOString().slice(0, 10)
  const reg = consultasDenuncia.get(usuarioId)
  if (!reg || reg.dia !== dia) {
    consultasDenuncia.set(usuarioId, { dia, intentos: 1 })
    return
  }
  if (reg.intentos >= CONSULTAS_DENUNCIA_MAX_DIA) {
    throw new ErrorNegocio('Alcanzaste el límite de consultas por hoy. Inténtalo mañana.')
  }
  reg.intentos++
}

/**
 * Consulta ANÓNIMA del estado de una denuncia por su código de seguimiento.
 * Devuelve solo el estado y, si está resuelta, la resolución comunicable — nunca
 * los hechos ni datos internos. Se usa `prisma` (sin auditar) para no dejar
 * rastro de quién consulta, coherente con la confidencialidad del canal.
 */
export const consultarMiDenuncia = accion(
  {
    modulo: 'autoservicio',
    accion: 'VER',
    schema: z.object({ codigo: z.string().trim().min(4).max(20) }),
  },
  async (d, usuario) => {
    verificarLimiteConsulta(usuario.id)
    const denuncia = await prisma.denunciaAcoso.findUnique({
      where: { codigo: d.codigo.toUpperCase() },
      select: { estado: true, creadoEn: true, actualizadoEn: true, resolucion: true },
    })
    if (!denuncia) throw new ErrorNegocio('No se encontró una denuncia con ese código. Verifica que esté bien escrito.')
    return {
      estado: denuncia.estado,
      radicadaEn: denuncia.creadoEn.toISOString(),
      actualizadaEn: denuncia.actualizadoEn.toISOString(),
      // La resolución solo se comunica cuando el caso cerró.
      resolucion: denuncia.estado === 'RESUELTA' || denuncia.estado === 'ARCHIVADA' ? denuncia.resolucion : null,
    }
  },
)

/**
 * Habeas data (Ley 1581): el colaborador radica su propia consulta/reclamo sobre
 * el tratamiento de sus datos personales. Aquí SÍ se identifica (ejerce derechos
 * propios) y queda vinculado para que pueda ver el estado y el plazo legal.
 */
export const crearMiConsultaReclamo = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({
      tipo: z.enum(['CONSULTA', 'RECLAMO']),
      descripcion: z.string().trim().min(5, 'Describe tu consulta o reclamo.').max(1000),
    }),
  },
  async (d, usuario) => {
    if (!usuario.colaboradorId) throw new ErrorNegocio('Tu usuario no está vinculado a una ficha de colaborador.')
    const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: usuario.colaboradorId }, select: { nombres: true, apellidos: true } })

    // Plazo legal en días HÁBILES (Ley 1581): consulta 10, reclamo 15.
    const hoy = hoyBogota()
    const festivos = festivosDeRango(hoy.getUTCFullYear(), hoy.getUTCFullYear() + 1)
    const fechaLimite = sumarDiasHabiles(hoy, d.tipo === 'CONSULTA' ? 10 : 15, festivos)

    await dbAuditado.consultaReclamoDatos.create({
      data: {
        tipo: d.tipo,
        titular: `${colab.nombres} ${colab.apellidos}`,
        colaboradorId: usuario.colaboradorId,
        descripcion: d.descripcion,
        fechaRadicacion: hoy,
        fechaLimite,
        estado: 'ABIERTO',
      },
    })

    await avisarPorRol(['Jurídica', 'Administrador'], {
      evento: 'habeas_data',
      titulo: `Nuevo ${d.tipo === 'CONSULTA' ? 'consulta' : 'reclamo'} de habeas data`,
      mensaje: `${colab.nombres} ${colab.apellidos} radicó ${d.tipo === 'CONSULTA' ? 'una consulta' : 'un reclamo'} sobre el tratamiento de sus datos. Plazo legal: ${d.tipo === 'CONSULTA' ? '10' : '15'} días hábiles.`,
      enlace: '/juridica?tab=habeas',
      llamadoAccion: 'Atender la solicitud',
    })

    revalidatePath('/autoservicio/juridica')
    return { ok: true }
  },
)
