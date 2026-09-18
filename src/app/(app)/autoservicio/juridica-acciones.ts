'use server'

import { revalidatePath } from 'next/cache'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO, hoyBogota } from '@/lib/fechas'
import { avisarPorRol } from '@/server/notificaciones/avisar'
import { nombreCorto } from '@/lib/notificaciones/texto'
import { sumarDiasHabiles, festivosDeRango } from '@/lib/dias-habiles'


/**
 * Canal anti-acoso desde el autoservicio del colaborador (Ley 2466 de 2025).
 *
 * El reporte va A NOMBRE de quien lo envía (decisión de la empresa, 2026-09-17):
 * se guarda su ficha y su nombre, tomados de la sesión —no de un campo libre,
 * que permitía firmar con cualquier nombre—. Lo confidencial es quién lo lee:
 * solo Jurídica; no aparece en el autoservicio ni en Mi actividad. El código
 * sigue siendo la forma de consultar en qué va. El tipo no lo elige quien
 * reporta: entra «por clasificar» y Jurídica lo clasifica al revisarlo.
 */
export const crearMiDenuncia = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({
      asunto: z.string().trim().min(3, 'Escribe de qué se trata.').max(120),
      hechos: z.string().trim().min(10, 'Describe los hechos (mínimo 10 caracteres).').max(2000),
      fechaHechos: z.string().optional(),
    }),
  },
  async (d, usuario) => {
    const codigo = `DA-${randomBytes(4).toString('hex').toUpperCase()}`
    const ficha = usuario.colaboradorId
      ? await prisma.colaborador.findUnique({ where: { id: usuario.colaboradorId }, select: { nombres: true, apellidos: true } })
      : null
    const nombre = ficha ? `${ficha.nombres} ${ficha.apellidos}` : usuario.nombre
    await dbAuditado.denunciaAcoso.create({
      data: {
        codigo,
        tipo: 'SIN_CLASIFICAR',
        asunto: d.asunto,
        anonima: false,
        denuncianteNombre: nombre,
        colaboradorId: usuario.colaboradorId ?? null,
        hechos: d.hechos,
        fechaHechos: parseFechaISO(d.fechaHechos || null),
        estado: 'RECIBIDA',
      },
    })

    // A Jurídica le llega el asunto y el código; el detalle lo ve en la bandeja.
    await avisarPorRol(['Jurídica', 'Administrador', 'Subgerencia'], {
      evento: 'denuncia_acoso',
      titulo: 'Línea ética: nuevo reporte',
      mensaje: `${d.asunto} · Código ${codigo} · Confidencial.`,
      enlace: '/juridica?tab=denuncias',
      llamadoAccion: 'Revisar la línea ética',
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
      colaboradorId: usuario.colaboradorId,
      titulo: `${nombreCorto(colab.nombres, colab.apellidos)} radicó ${d.tipo === 'CONSULTA' ? 'una consulta' : 'un reclamo'} de habeas data`,
      mensaje: `Plazo legal: ${d.tipo === 'CONSULTA' ? '10' : '15'} días hábiles.`,
      enlace: '/juridica?tab=habeas',
      llamadoAccion: 'Atender la solicitud',
    })

    revalidatePath('/autoservicio/juridica')
    return { ok: true }
  },
)
