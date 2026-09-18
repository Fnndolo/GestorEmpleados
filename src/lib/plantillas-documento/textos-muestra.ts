/**
 * Datos de MUESTRA (ficticios, y se nota) para ver cómo queda cada texto
 * editable: los usa la vista previa del editor y el PDF de muestra, con los
 * mismos valores para que lo que se ve en pantalla sea lo que sale en el PDF.
 * Lo único real son los datos de la empresa.
 */

import { fmtCOP } from '@/lib/moneda'
import {
  variablesActaActivo, variablesActaDotacion, variablesActaEpp, variablesCertificacion, variablesOrdenPago,
  type ClaveTexto, type DatosVarsActaActivo, type DatosVarsActaDotacion, type DatosVarsActaEpp,
  type DatosVarsCertificacion, type DatosVarsOrdenPago, type EmpresaTexto, type TipoCertificacion,
} from './textos'

export const MUESTRA_PERSONA = {
  nombres: 'NOMBRE DE MUESTRA',
  apellidos: 'APELLIDO APELLIDO',
  nombre: 'NOMBRE DE MUESTRA APELLIDO APELLIDO',
  documento: '1.000.000.000',
  cargo: 'CARGO DE MUESTRA',
  ciudad: 'Ciudad de muestra',
} as const

/** Una fecha fija: la muestra no debe cambiar de un día para otro. */
export const FECHA_MUESTRA = new Date(Date.UTC(2026, 0, 15))

type ActivoMuestra = { codigo: string; nombre: string; tipo: string; marca: string | null; serie: string | null; valor: number | null }

const ACTIVOS_MUESTRA: ActivoMuestra[] = [
  { codigo: 'ACT-001', nombre: 'Computador portátil de muestra', tipo: 'Cómputo', marca: 'Marca', serie: 'SN-000001', valor: 2_500_000 },
  { codigo: 'ACT-002', nombre: 'Celular de muestra', tipo: 'Comunicación', marca: 'Marca', serie: 'SN-000002', valor: 900_000 },
  { codigo: 'ACT-003', nombre: 'Silla ergonómica', tipo: 'Mobiliario', marca: null, serie: null, valor: null },
]

/** Tabla que arma la app en el sitio de `[tabla]`, descrita para pintarla en la vista previa. */
export type TablaMuestra =
  | { tipo: 'columnas'; columnas: { titulo: string; ancho: string; derecha?: boolean }[]; filas: string[][]; total?: string | null }
  | { tipo: 'pares'; pares: [string, string][] }
  | { tipo: 'horas'; filas: [string, string][]; totalHoras: string; totalPagar: string }

/** Bloques fijos que rodean al texto: cómo es la cabecera y quién firma. */
export type FijosMuestra = {
  cabecera: 'membrete' | 'fondo'
  /** Texto bajo el título (solo la orden de pago). */
  subtitulo?: string
  /** Filas etiqueta/valor bajo el subtítulo (solo la orden de pago). */
  filas?: [string, string][]
  firmas: { nombre: string; detalle: string; conFirma: boolean }[]
  /** Pie de texto, para cuando el documento va sin papel membretado. */
  pie: string
}

export type MuestraTexto = {
  vars: Record<string, string>
  tabla: TablaMuestra | null
  fijos: FijosMuestra
}

export function muestraActaActivo(variante: string, empresa: EmpresaTexto): Omit<DatosVarsActaActivo, 'activos'> & { activos: ActivoMuestra[] } {
  return {
    colaborador: { nombre: MUESTRA_PERSONA.nombre, documento: MUESTRA_PERSONA.documento, cargo: MUESTRA_PERSONA.cargo },
    empresa,
    ciudad: MUESTRA_PERSONA.ciudad,
    fecha: FECHA_MUESTRA,
    activos: variante === 'varios' ? ACTIVOS_MUESTRA : ACTIVOS_MUESTRA.slice(0, 1),
  }
}

export function muestraActaDotacion(empresa: EmpresaTexto): DatosVarsActaDotacion {
  return {
    colaborador: { nombre: MUESTRA_PERSONA.nombre, documento: MUESTRA_PERSONA.documento, cargo: MUESTRA_PERSONA.cargo },
    empresa,
    ciudad: MUESTRA_PERSONA.ciudad,
    fecha: FECHA_MUESTRA,
    anio: 2026,
    corte: 'Abril',
    items: '2 camisas, 1 pantalón, 1 par de zapatos',
  }
}

export function muestraActaEpp(variante: string, empresa: EmpresaTexto): DatosVarsActaEpp {
  return {
    colaborador: { nombre: MUESTRA_PERSONA.nombre, documento: MUESTRA_PERSONA.documento, cargo: MUESTRA_PERSONA.cargo },
    empresa,
    ciudad: MUESTRA_PERSONA.ciudad,
    fecha: FECHA_MUESTRA,
    elemento: 'Guantes de nitrilo',
    cantidad: 2,
    reposicion: variante === 'reposicion',
  }
}

export const HORAS_MUESTRA: Record<string, number> = { HED: 6, HEN: 2.5, HEDDF: 0, HENDF: 4 }

export function muestraOrdenPago(empresa: EmpresaTexto): DatosVarsOrdenPago & { detalleHoras: Record<string, number> } {
  return {
    empresa,
    numero: 'OP-MUESTRA',
    fecha: FECHA_MUESTRA,
    colaborador: {
      nombre: MUESTRA_PERSONA.nombre, documento: MUESTRA_PERSONA.documento,
      banco: 'Banco de muestra', tipoCuenta: 'cuenta de ahorros', numeroCuenta: '000-000000-00',
    },
    periodo: { desde: '2026-01-01', hasta: '2026-01-15' },
    detalleHoras: HORAS_MUESTRA,
    horasExtra: 12.5,
    valor: 187_500,
  }
}

export function muestraCertificacion(clase: 'LABORAL' | 'CONTRACTUAL', variante: string, empresa: EmpresaTexto): DatosVarsCertificacion {
  const tipo = (['SIMPLE', 'CON_SALARIO', 'CON_FUNCIONES', 'ENTIDAD_FINANCIERA'] as TipoCertificacion[]).includes(variante as TipoCertificacion)
    ? (variante as TipoCertificacion)
    : 'SIMPLE'
  return {
    tipo,
    clase,
    dirigidaA: tipo === 'ENTIDAD_FINANCIERA' ? 'Banco de muestra' : null,
    empresa,
    colaborador: {
      nombres: MUESTRA_PERSONA.nombres, apellidos: MUESTRA_PERSONA.apellidos,
      tipoDocumento: 'CC', numeroDocumento: MUESTRA_PERSONA.documento,
      cargo: MUESTRA_PERSONA.cargo,
      funciones: 'Atender a los clientes, registrar las ventas y mantener el inventario de la tienda al día.',
      tipoVinculo: clase === 'CONTRACTUAL' ? 'OPS' : 'TERMINO_INDEFINIDO',
      fechaIngreso: new Date(Date.UTC(2025, 2, 1)),
      salario: 1_800_000,
    },
    contratoOps: clase === 'CONTRACTUAL'
      ? {
          numero: 'OPS-2026-0001',
          objeto: 'Prestación de servicios de asesoría comercial de muestra.',
          valorTotal: 9_000_000,
          valorMensual: 1_500_000,
          fechaInicio: new Date(Date.UTC(2026, 0, 1)),
          fechaFin: new Date(Date.UTC(2026, 5, 30)),
        }
      : null,
    ciudad: MUESTRA_PERSONA.ciudad,
    fecha: FECHA_MUESTRA,
  }
}

const ETIQUETA_HORA: Record<string, string> = { HED: 'Diurna', HEN: 'Nocturna', HEDDF: 'Dom/fest. diurna', HENDF: 'Dom/fest. nocturna' }

const FIRMA_COLABORADOR = { nombre: MUESTRA_PERSONA.nombre, detalle: 'Colaborador · firmado digitalmente el (fecha de la firma)', conFirma: true }

/** Variables, tabla y bloques fijos de la muestra de un texto, con la variante pedida. */
export function muestraTexto(clave: ClaveTexto, variante: string, empresa: EmpresaTexto): MuestraTexto {
  const pie = `${empresa.razonSocial} · NIT ${empresa.nit}`
  const firmaEmpresa = (rol: string) => ({ nombre: rol, detalle: empresa.nombreComercial || empresa.razonSocial, conFirma: false })

  switch (clave) {
    case 'ACTA_ACTIVO_ENTREGA':
    case 'ACTA_ACTIVO_DEVOLUCION': {
      const d = muestraActaActivo(variante, empresa)
      const varios = d.activos.length > 1
      return {
        vars: variablesActaActivo(d),
        tabla: {
          tipo: 'columnas',
          columnas: [
            { titulo: 'Código', ancho: '14%' }, { titulo: 'Activo', ancho: '30%' }, { titulo: 'Tipo', ancho: '16%' },
            { titulo: 'Marca', ancho: '14%' }, { titulo: 'Serie', ancho: '14%' }, { titulo: 'Valor', ancho: '12%', derecha: true },
          ],
          filas: d.activos.map((a) => [a.codigo, a.nombre, a.tipo, a.marca ?? '—', a.serie ?? '—', a.valor != null ? fmtCOP(a.valor) : '—']),
          total: varios ? fmtCOP(d.activos.reduce((s, a) => s + (a.valor ?? 0), 0)) : null,
        },
        fijos: { cabecera: 'membrete', firmas: [FIRMA_COLABORADOR, firmaEmpresa('Talento Humano')], pie },
      }
    }
    case 'ACTA_DOTACION': {
      const d = muestraActaDotacion(empresa)
      return {
        vars: variablesActaDotacion(d),
        tabla: { tipo: 'pares', pares: [['Elementos entregados', d.items]] },
        fijos: { cabecera: 'membrete', firmas: [FIRMA_COLABORADOR, firmaEmpresa('Talento Humano')], pie },
      }
    }
    case 'ACTA_EPP': {
      const d = muestraActaEpp(variante, empresa)
      return {
        vars: variablesActaEpp(d),
        tabla: { tipo: 'pares', pares: [['Elemento', d.elemento], ['Cantidad', String(d.cantidad)], ['Tipo de entrega', d.reposicion ? 'Reposición' : 'Entrega inicial']] },
        fijos: { cabecera: 'membrete', firmas: [FIRMA_COLABORADOR, firmaEmpresa('Responsable SST')], pie },
      }
    }
    case 'ORDEN_PAGO_HORAS_EXTRA': {
      const d = muestraOrdenPago(empresa)
      const vars = variablesOrdenPago(d)
      return {
        vars,
        tabla: {
          tipo: 'horas',
          filas: Object.entries(d.detalleHoras).filter(([, h]) => h > 0).map(([c, h]) => [ETIQUETA_HORA[c] ?? c, `${h.toLocaleString('es-CO', { maximumFractionDigits: 2 })} h`]),
          totalHoras: vars.horas,
          totalPagar: vars.valor,
        },
        fijos: {
          cabecera: 'fondo',
          subtitulo: `No. ${vars.numero} · ${vars.fecha}`,
          filas: [['Colaborador', `${vars.nombre} · ${vars.documento}`], ['Período', `${vars.periodo_desde} a ${vars.periodo_hasta}`]],
          firmas: [{ nombre: MUESTRA_PERSONA.nombre, detalle: `${MUESTRA_PERSONA.documento} · Firmado electrónicamente el (fecha de la firma)`, conFirma: true }],
          pie,
        },
      }
    }
    case 'CERTIFICACION_LABORAL':
    case 'CERTIFICACION_CONTRACTUAL': {
      const d = muestraCertificacion(clave === 'CERTIFICACION_CONTRACTUAL' ? 'CONTRACTUAL' : 'LABORAL', variante, empresa)
      return {
        vars: variablesCertificacion(d),
        tabla: null,
        fijos: {
          cabecera: 'membrete',
          firmas: [{ nombre: 'Departamento de Talento Humano', detalle: empresa.nombreComercial || empresa.razonSocial, conFirma: true }],
          pie: `${pie} · Documento generado electrónicamente`,
        },
      }
    }
  }
}
