import 'server-only'
import { prisma } from '@/lib/db'
import { ErrorNegocio } from '@/server/accion'
import { construirDatosAutorizacion } from '@/server/contratos-ops-pdf'
import type { DatosAutorizacionPdf } from '@/server/pdf/autorizacion-datos'

const v = (s: string | null | undefined) => (s && s.trim() !== '' ? s : null)

/**
 * Datos de la autorización de tratamiento de datos (Ley 1581) de un colaborador.
 *
 * El titular sale de su ficha; lo que venga del formulario o del contrato se
 * pone por encima. Es el único sitio donde se decide de dónde sale cada dato:
 * antes cada acción lo armaba a su manera, y la del OPS subido llegó a producir
 * autorizaciones sin nombre ni cédula, que no identifican a nadie y por tanto
 * no autorizan nada. La empresa se deja vacía a propósito:
 * `construirDatosAutorizacion` la completa con la configuración.
 */
export async function datosAutorizacionDeColaborador(opts: {
  colaboradorId: string
  vinculo: 'OPS' | 'LABORAL'
  numero?: string | null
  contrato?: { ciudad?: string | null; fechaSuscripcion?: string | null; cargoObjeto?: string | null }
  contratista?: {
    nombre?: string | null; cc?: string | null; ccLugar?: string | null
    direccion?: string | null; email?: string | null; telefono?: string | null; genero?: string | null
  }
}): Promise<DatosAutorizacionPdf> {
  const col = await prisma.colaborador.findUnique({
    where: { id: opts.colaboradorId },
    include: { ciudadResidencia: true, cargo: true, sede: { include: { ciudad: true } } },
  })
  if (!col) throw new ErrorNegocio('Colaborador no encontrado.')

  const c = opts.contratista ?? {}
  const k = opts.contrato ?? {}
  const genero = v(c.genero) ?? col.genero ?? null
  return construirDatosAutorizacion({
    vinculo: opts.vinculo,
    genero,
    datos: {
      empresa: { razonSocial: '' },
      contratista: {
        nombre: v(c.nombre) ?? `${col.nombres} ${col.apellidos}`.toUpperCase(),
        cc: v(c.cc) ?? `${col.tipoDocumento} ${col.numeroDocumento}`,
        ccLugar: v(c.ccLugar) ?? col.lugarExpedicionDoc ?? null,
        direccion: v(c.direccion) ?? col.direccion ?? null,
        email: v(c.email) ?? col.emailPersonal ?? null,
        telefono: v(c.telefono) ?? col.celular ?? null,
        genero,
      },
      contrato: {
        numero: opts.numero ?? null,
        ciudad: v(k.ciudad) ?? col.ciudadResidencia?.nombre ?? col.sede?.ciudad?.nombre ?? null,
        fechaSuscripcion: v(k.fechaSuscripcion),
        cargoObjeto: v(k.cargoObjeto) ?? col.cargo?.nombre ?? null,
      },
    },
  })
}
