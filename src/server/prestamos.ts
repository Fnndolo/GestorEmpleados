import 'server-only'
import { prisma } from '@/lib/db'
import { subirArchivo } from '@/server/storage'
import { renderPazSalvoPrestamo } from '@/server/pdf/paz-salvo-prestamo'
import { hoyBogota } from '@/lib/fechas'

/** Genera el paz y salvo de un préstamo pagado y lo guarda como Documento. Devuelve el id del documento. */
export async function generarPazSalvoPrestamo(prestamoId: string, usuarioId: string): Promise<string> {
  const prestamo = await prisma.prestamo.findUniqueOrThrow({
    where: { id: prestamoId },
    include: { colaborador: { include: { sede: { include: { ciudad: true } } } } },
  })
  if (Number(prestamo.saldo) > 0 || prestamo.estado !== 'PAGADO') {
    throw new Error('El préstamo aún tiene saldo pendiente; no se puede generar el paz y salvo.')
  }
  const empresa = await prisma.configuracionEmpresa.findFirstOrThrow()
  const c = prestamo.colaborador

  const pdf = await renderPazSalvoPrestamo({
    empresa: { razonSocial: empresa.razonSocial, nit: empresa.nit },
    colaborador: { nombre: `${c.nombres} ${c.apellidos}`, documento: `${c.tipoDocumento} ${c.numeroDocumento}` },
    valorTotal: Number(prestamo.valorTotal),
    numeroCuotas: prestamo.numeroCuotas,
    descripcion: prestamo.descripcion,
    fechaInicio: prestamo.fechaInicio,
    ciudad: c.sede?.ciudad.nombre ?? 'Bogotá',
    fecha: hoyBogota(),
  })

  const archivo = await subirArchivo(`prestamos/${prestamo.id}`, `paz-y-salvo-prestamo-${prestamo.id}.pdf`, pdf, 'application/pdf')
  const doc = await prisma.documento.create({
    data: {
      entidadTipo: 'Prestamo', entidadId: prestamo.id, nombre: `Paz y salvo de préstamo — ${c.nombres} ${c.apellidos}`,
      bucket: archivo.bucket, storagePath: archivo.storagePath, mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes, nivelAcceso: 'RRHH', sedeId: c.sedeId, subidoPorId: usuarioId,
    },
  })
  return doc.id
}
