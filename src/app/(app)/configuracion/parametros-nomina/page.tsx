import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { formatFechaISO } from '@/lib/fechas'
import { esClaveDelMotor } from '@/lib/nomina/claves-motor'
import { Encabezado } from '@/components/shell/encabezado'
import { ParametrosForm, type ParametroItem, type TipoHoraItem } from './form'

export const metadata = { title: 'Parámetros de nómina · Configuración' }

export default async function ParametrosNominaPage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR')

  const hoy = new Date()
  const [parametros, tiposHora, config, soportes] = await Promise.all([
    prisma.parametroLegal.findMany({ orderBy: [{ clave: 'asc' }, { vigenciaDesde: 'desc' }] }),
    prisma.tipoHora.findMany({ orderBy: [{ codigo: 'asc' }, { vigenteDesde: 'desc' }] }),
    prisma.configuracionEmpresa.findFirst(),
    // Soporte legal adjunto a cada vigencia (el decreto en PDF): el texto de la
    // fuente lo escribe una persona; el papel es lo que sostiene la cifra.
    prisma.documento.findMany({
      where: { entidadTipo: 'VigenciaParametro' },
      select: { id: true, nombre: true, entidadId: true },
    }),
  ])
  const soportePorVigencia = new Map(soportes.map((d) => [d.entidadId, { id: d.id, nombre: d.nombre }]))

  // Vigente por clave = el más reciente cuya vigencia cubre hoy (o el último si ninguna).
  // Las demás filas de esa clave son su histórico: existían desde el principio
  // pero no había dónde consultarlas, aunque el sistema prometiera guardarlas.
  const porClave = new Map<string, ParametroItem>()
  for (const p of parametros) {
    const fila = {
      id: p.id,
      valor: Number(p.valor),
      desde: formatFechaISO(p.vigenciaDesde) ?? '',
      hasta: p.vigenciaHasta ? formatFechaISO(p.vigenciaHasta) : null,
      fuente: p.fuenteLegal,
      soporte: soportePorVigencia.get(p.id) ?? null,
    }
    const ya = porClave.get(p.clave)
    if (ya) { ya.historial.push(fila); continue }
    porClave.set(p.clave, {
      clave: p.clave,
      id: p.id,
      valor: fila.valor,
      desde: fila.desde,
      fuente: p.fuenteLegal,
      descripcion: p.descripcion,
      vigente: p.vigenciaDesde <= hoy && (!p.vigenciaHasta || p.vigenciaHasta >= hoy),
      delMotor: esClaveDelMotor(p.clave),
      historial: [fila],
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
