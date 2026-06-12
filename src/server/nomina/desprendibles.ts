import 'server-only'
import { prisma } from '@/lib/db'
import { subirArchivo } from '@/server/storage'
import { renderDesprendible } from '@/server/pdf/desprendible'

/** Genera los desprendibles PDF de un periodo en lotes y los guarda como Documento. */
export async function generarDesprendibles(periodoId: string, usuarioId: string): Promise<{ generados: number }> {
  const periodo = await prisma.periodoNomina.findUniqueOrThrow({ where: { id: periodoId } })
  const empresa = await prisma.configuracionEmpresa.findFirstOrThrow()
  const liquidaciones = await prisma.liquidacionNomina.findMany({
    where: { periodoId },
    include: {
      detalles: true,
      colaborador: { include: { cargo: true, sede: true } },
    },
  })

  const datosEmpresa = {
    razonSocial: empresa.razonSocial, nombreComercial: empresa.nombreComercial, nit: empresa.nit,
    direccion: empresa.direccion, telefono: empresa.telefono, emailContacto: empresa.emailContacto,
  }

  let generados = 0
  // Lotes de 25 para no exceder límites de tiempo en serverless
  for (let i = 0; i < liquidaciones.length; i += 25) {
    const lote = liquidaciones.slice(i, i + 25)
    for (const liq of lote) {
      const pdf = await renderDesprendible({
        empresa: datosEmpresa,
        periodo: periodo.nombre,
        colaborador: {
          nombre: `${liq.colaborador.nombres} ${liq.colaborador.apellidos}`,
          documento: liq.colaborador.numeroDocumento,
          cargo: liq.colaborador.cargo?.nombre ?? null,
          sede: liq.colaborador.sede.nombre,
        },
        diasTrabajados: Number(liq.diasTrabajados),
        ibc: Number(liq.ibc),
        lineas: liq.detalles.map((d) => ({ codigo: d.conceptoCodigo, nombre: d.conceptoNombre, tipo: d.tipo, cantidad: d.cantidad ? Number(d.cantidad) : null, valor: Number(d.valor) })),
        totalDevengado: Number(liq.totalDevengado),
        totalDeducido: Number(liq.totalDeducido),
        neto: Number(liq.neto),
      })
      const archivo = await subirArchivo(`nomina/desprendibles/${liq.colaboradorId}`, `desprendible-${periodo.nombre}.pdf`, pdf, 'application/pdf')
      const doc = await prisma.documento.create({
        data: {
          entidadTipo: 'Colaborador', entidadId: liq.colaboradorId,
          nombre: `Desprendible ${periodo.nombre}`,
          bucket: archivo.bucket, storagePath: archivo.storagePath, mimeType: 'application/pdf',
          tamanoBytes: archivo.tamanoBytes, nivelAcceso: 'RRHH', sedeId: liq.colaborador.sedeId, subidoPorId: usuarioId,
        },
      })
      await prisma.liquidacionNomina.update({ where: { id: liq.id }, data: { documentoId: doc.id } })
      generados++
    }
  }
  return { generados }
}
