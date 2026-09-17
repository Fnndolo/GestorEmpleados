'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { esAdministrador } from '@/lib/permisos/tipos'
import { hoyBogotaISO } from '@/lib/fechas'
import { ASISTENCIA_URL_DEFECTO, ErrorAsistencia, conexionAsistencia, resumenAsistencia } from '@/server/asistencia/cliente'
import { sincronizarFotosAsistencia } from '@/server/asistencia/fotos-asistencia'

/**
 * La clave de API de AsistencIA la conecta y la quita SOLO el administrador:
 * es un secreto de la empresa (con ella se leen las horas de todo el personal
 * y se anotan pagos allá), así que no basta con el permiso de editar Ajustes
 * que tienen otros roles.
 */

const soloAdmin = (u: { rolNombre: string; rolNombres: string[] }) => {
  if (!esAdministrador(u)) throw new ErrorNegocio('Solo el administrador puede conectar o desconectar AsistencIA.')
}

/**
 * Guarda la clave. Se prueba ANTES de guardarla, pidiendo el resumen del mes en
 * curso: una clave mal pegada se rechaza aquí mismo, no el día del cierre.
 */
export const conectarAsistencia = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({
      clave: z.string().trim().min(8, 'Pega la clave completa.').max(500),
      url: z.string().trim().url('La dirección debe empezar por https://').optional().or(z.literal('')),
    }),
  },
  async (d, usuario) => {
    soloAdmin(usuario)
    const url = (d.url || ASISTENCIA_URL_DEFECTO).replace(/\/+$/, '')
    await resumenAsistencia({ mes: hoyBogotaISO().slice(0, 7) }, { url, clave: d.clave }).catch((e: unknown) => {
      if (e instanceof ErrorAsistencia) throw new ErrorNegocio(e.message)
      throw e
    })

    const actual = await prisma.configuracionEmpresa.findFirst()
    if (!actual) throw new ErrorNegocio('Configura primero los datos de la empresa en Ajustes → Empresa.')
    await dbAuditado.configuracionEmpresa.update({
      where: { id: actual.id },
      data: { asistenciaApiKey: d.clave, asistenciaUrl: d.url || null },
    })
    revalidatePath('/configuracion/integraciones')
    revalidatePath('/nomina/novedades')
    return { ok: true }
  },
)

/** Manda a AsistencIA las fotos de perfil de todos los colaboradores activos. */
export const enviarFotosAsistencia = accion(
  { modulo: 'configuracion', accion: 'EDITAR' },
  async (_, usuario) => {
    soloAdmin(usuario)
    if (!(await conexionAsistencia())) throw new ErrorNegocio('Conecta primero AsistencIA.')
    return sincronizarFotosAsistencia()
  },
)

export const desconectarAsistencia = accion(
  { modulo: 'configuracion', accion: 'EDITAR' },
  async (_, usuario) => {
    soloAdmin(usuario)
    const actual = await prisma.configuracionEmpresa.findFirst()
    if (actual?.asistenciaApiKey) {
      await dbAuditado.configuracionEmpresa.update({ where: { id: actual.id }, data: { asistenciaApiKey: null, asistenciaUrl: null } })
    }
    revalidatePath('/configuracion/integraciones')
    revalidatePath('/nomina/novedades')
    return { ok: true }
  },
)
