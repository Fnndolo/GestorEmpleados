import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { formatFechaISO } from '@/lib/fechas'
import { Encabezado } from '@/components/shell/encabezado'
import { ParametrosForm, type ParametroItem, type TipoHoraItem } from './form'

export const metadata = { title: 'Parámetros de nómina · Configuración' }

export default async function ParametrosNominaPage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR')

  const hoy = new Date()
  const [parametros, tiposHora, config] = await Promise.all([
    prisma.parametroLegal.findMany({ orderBy: [{ clave: 'asc' }, { vigenciaDesde: 'desc' }] }),
    prisma.tipoHora.findMany({ orderBy: [{ codigo: 'asc' }, { vigenteDesde: 'desc' }] }),
    prisma.configuracionEmpresa.findFirst(),
  ])

  // Vigente por clave = el más reciente cuya vigencia cubre hoy (o el último si ninguna).
  const porClave = new Map<string, ParametroItem>()
  for (const p of parametros) {
    if (porClave.has(p.clave)) continue
    const vigente = p.vigenciaDesde <= hoy && (!p.vigenciaHasta || p.vigenciaHasta >= hoy)
    porClave.set(p.clave, {
      clave: p.clave,
      valor: Number(p.valor),
      desde: formatFechaISO(p.vigenciaDesde) ?? '',
      fuente: p.fuenteLegal,
      descripcion: p.descripcion,
      vigente,
    })
  }

  const tiposPorCodigo = new Map<string, TipoHoraItem>()
  for (const t of tiposHora) {
    if (tiposPorCodigo.has(t.codigo)) continue
    tiposPorCodigo.set(t.codigo, {
      codigo: t.codigo,
      nombre: t.nombre,
      factor: Number(t.factor),
      desde: formatFechaISO(t.vigenteDesde) ?? '',
    })
  }

  return (
    <div className="max-w-5xl">
      <Encabezado
        titulo="Parámetros de nómina"
        descripcion="Valores legales vigentes que usa el motor de nómina. Registra una nueva vigencia cuando cambie la norma: el histórico se conserva para auditoría."
      />
      <ParametrosForm
        puedeEditar={puedeEditar}
        parametros={[...porClave.values()]}
        tiposHora={[...tiposPorCodigo.values()]}
        aplicaRetefuente={config?.aplicaRetefuente ?? false}
        empresaExonerada={config?.empresaExonerada ?? true}
      />
    </div>
  )
}
