import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { formatFechaCorta } from '@/lib/fechas'
import { Encabezado } from '@/components/shell/encabezado'
import { GENERAR_CONTRATOS_DESDE_PLANTILLA } from '@/lib/contratos-config'
import { plantillaAutorizacionDatos } from '@/server/plantillas-documento'
import { DocumentosPlantillas } from './documentos-cliente'
import { EDITORES, type Editor } from './editores'

export const metadata = { title: 'Plantillas de documentos · Configuración' }

/**
 * Los documentos que la aplicación genera sola, en una sola lista: cada uno se
 * edita en una ventana emergente. Antes esta ruta saltaba al papel membretado y
 * los editores vivían en pestañas y páginas aparte.
 */
export default async function PlantillasPage({ searchParams }: { searchParams: Promise<{ abrir?: string }> }) {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR')
  const { abrir } = await searchParams

  const [empresa, autorizacionOps, autorizacionLaboral, plantillasCC, plantillasContrato] = await Promise.all([
    prisma.configuracionEmpresa.findFirst({
      select: { membreteFondoPath: true, emailContacto: true, nit: true, sitioWeb: true, razonSocial: true, direccion: true },
    }),
    plantillaAutorizacionDatos('OPS'),
    plantillaAutorizacionDatos('LABORAL'),
    prisma.plantillaCuentaCobro.findMany({ orderBy: { creadoEn: 'desc' } }),
    GENERAR_CONTRATOS_DESDE_PLANTILLA ? prisma.plantillaContrato.count({ where: { activa: true } }) : Promise.resolve(0),
  ])

  const abrirInicial = EDITORES.includes(abrir as Editor) ? (abrir as Editor) : null

  // Mismo armado que el PDF real: ciudad de la sede + dirección de la empresa.
  const empresaAutorizacion = {
    razonSocial: empresa?.razonSocial ?? 'Razón social sin configurar',
    nit: empresa?.nit ?? '—',
    domicilio: ['Ciudad de muestra', empresa?.direccion].filter(Boolean).join(', '),
    emailContacto: empresa?.emailContacto ?? null,
  }
  const estadoDe = (a: { personalizada: boolean; actualizadoEn: Date | null }) =>
    a.actualizadoEn ? `Personalizado · ${formatFechaCorta(a.actualizadoEn)}` : 'Texto de la aplicación'

  return (
    <div className="max-w-4xl">
      <Encabezado
        titulo="Plantillas de documentos"
        descripcion="Documentos que la aplicación genera sola. Aquí se edita su texto y se ve cómo quedan, sin tocar código."
      />
      <DocumentosPlantillas
        abrirInicial={abrirInicial}
        puedeEditar={puedeEditar}
        membrete={{
          tieneMembrete: Boolean(empresa?.membreteFondoPath),
          pie: [empresa?.emailContacto, empresa?.nit ? `NIT ${empresa.nit}` : null, empresa?.sitioWeb].filter(Boolean).join('     ·     '),
        }}
        autorizacion={{
          plantilla: { titulo: autorizacionOps.titulo, contenido: autorizacionOps.contenido },
          personalizada: autorizacionOps.personalizada,
          estado: estadoDe(autorizacionOps),
          empresa: empresaAutorizacion,
        }}
        autorizacionLaboral={{
          plantilla: { titulo: autorizacionLaboral.titulo, contenido: autorizacionLaboral.contenido },
          personalizada: autorizacionLaboral.personalizada,
          estado: estadoDe(autorizacionLaboral),
          empresa: empresaAutorizacion,
        }}
        cuentasCobro={{
          plantillas: plantillasCC.map((p) => ({
            id: p.id, nombre: p.nombre, encabezado: p.encabezado, cuerpo: p.cuerpo, pieLegal: p.pieLegal,
            esDefecto: p.esDefecto, tieneLogo: Boolean(p.logoPath),
          })),
          empresa: { razonSocial: empresa?.razonSocial ?? 'Razón social sin configurar', nit: empresa?.nit ?? '—' },
        }}
        plantillasContrato={plantillasContrato}
      />
    </div>
  )
}
