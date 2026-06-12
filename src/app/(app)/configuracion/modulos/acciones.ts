'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'

function slugify(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const campoSchema = z.object({
  clave: z.string().min(1).max(40),
  etiqueta: z.string().min(1).max(80),
  tipo: z.enum(['TEXTO', 'TEXTO_LARGO', 'NUMERO', 'DECIMAL', 'MONEDA', 'FECHA', 'OPCION', 'SI_NO', 'COLABORADOR']),
  requerido: z.boolean(),
  opciones: z.string().optional(),
  generaAlerta: z.boolean(),
})

export const crearModulo = accion(
  {
    modulo: 'configuracion',
    accion: 'CREAR',
    schema: z.object({
      nombre: z.string().trim().min(2).max(80),
      icono: z.string().default('Layers'),
      seccion: z.string().default('Personalizados'),
      vinculo: z.enum(['GLOBAL', 'POR_COLABORADOR', 'POR_SEDE']),
      descripcion: z.string().max(300).optional(),
      campos: z.array(campoSchema).min(1, 'Agrega al menos un campo'),
    }),
  },
  async (d) => {
    const slug = slugify(d.nombre)
    const dup = await prisma.moduloPersonalizado.findUnique({ where: { slug } })
    if (dup) throw new ErrorNegocio('Ya existe un módulo con ese nombre.')

    const modulo = await dbAuditado.moduloPersonalizado.create({
      data: {
        slug, nombre: d.nombre, icono: d.icono, seccion: d.seccion, vinculo: d.vinculo, descripcion: d.descripcion,
        campos: {
          create: d.campos.map((c, i) => ({
            clave: slugify(c.clave) || `campo${i}`, etiqueta: c.etiqueta, tipo: c.tipo,
            requerido: c.requerido, opciones: c.opciones || null, generaAlerta: c.generaAlerta, orden: i,
          })),
        },
      },
    })
    revalidatePath('/configuracion/modulos')
    return { id: modulo.id, slug }
  },
)

export const eliminarModulo = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    await dbAuditado.moduloPersonalizado.delete({ where: { id } })
    revalidatePath('/configuracion/modulos')
  },
)

export const agregarRegistro = accion(
  { modulo: 'configuracion', accion: 'CREAR', schema: z.object({ moduloId: z.uuid(), colaboradorId: z.string().optional(), sedeId: z.string().optional(), datos: z.record(z.string(), z.unknown()) }) },
  async (d) => {
    const registro = await dbAuditado.registroPersonalizado.create({
      data: { moduloId: d.moduloId, colaboradorId: d.colaboradorId || null, sedeId: d.sedeId || null, datos: d.datos as object },
    })
    const modulo = await prisma.moduloPersonalizado.findUniqueOrThrow({ where: { id: d.moduloId }, include: { campos: true } })

    // Campos FECHA con alerta → publican un Vencimiento
    const { publicarVencimiento } = await import('@/server/vencimientos/servicio')
    for (const campo of modulo.campos) {
      if (campo.tipo === 'FECHA' && campo.generaAlerta) {
        const valor = (d.datos as Record<string, string>)[campo.clave]
        if (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
          await publicarVencimiento({
            origen: 'MODULO_PERSONALIZADO',
            entidadTipo: 'RegistroPersonalizado',
            entidadId: registro.id,
            titulo: `${modulo.nombre}: ${campo.etiqueta}`,
            fechaVencimientoISO: valor,
            sedeId: d.sedeId || null,
          })
        }
      }
    }
    revalidatePath(`/modulos/${modulo.slug}`)
  },
)
