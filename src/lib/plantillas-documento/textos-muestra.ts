/**
 * Datos de MUESTRA (ficticios, y se nota) para ver cómo queda cada texto
 * editable: los usa la vista previa del editor y el PDF de muestra, con los
 * mismos valores para que lo que se ve en pantalla sea lo que sale en el PDF.
 * Lo único real son los datos de la empresa.
 */

import { fmtCOP } from '@/lib/moneda'
import { NOMBRE_DIA, ORDEN_DIAS, horasSemana, resumenHorario, textoFranja, textoHoras, type DiasHorario } from '@/lib/horarios'
import {
  variablesActaActivo, variablesDesprendible, variablesCuentaCobro, variablesCambioHorario, variablesActaDotacion, variablesActaEpp, variablesCertificacion, variablesOrdenPago, variablesPazYSalvo, variablesLiquidacion, variablesCarta,
  type ClaveTexto, type DatosVarsActaActivo, type DatosVarsActaDotacion, type DatosVarsActaEpp, type DatosVarsPazYSalvo, type DatosVarsLiquidacion, type DatosVarsCarta,
  type DatosVarsCertificacion, type DatosVarsOrdenPago, type DatosVarsDesprendible, type DatosVarsCuentaCobro, type DatosVarsCambioHorario, type EmpresaTexto, type TipoCertificacion,
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
  /** La firma que va donde dice `[firma]` (cuenta de cobro): el espacio, la raya y los datos debajo. */
  | { tipo: 'firma'; lineas: string[] }

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
    ciudad: MUESTRA_PERSONA.ciudad,
  }
}

/** Líneas de la muestra del desprendible: [concepto, cantidad, valor]. */
export const LINEAS_DESPRENDIBLE_MUESTRA: { nombre: string; tipo: 'DEVENGADO' | 'DEDUCCION'; cantidad: number | null; valor: number }[] = [
  { nombre: 'Salario básico', tipo: 'DEVENGADO', cantidad: 30, valor: 1_750_905 },
  { nombre: 'Auxilio de transporte', tipo: 'DEVENGADO', cantidad: 30, valor: 249_095 },
  { nombre: 'Recargo dominical', tipo: 'DEVENGADO', cantidad: 6, valor: 45_023 },
  { nombre: 'Salud (4%)', tipo: 'DEDUCCION', cantidad: null, valor: 71_837 },
  { nombre: 'Pensión (4%)', tipo: 'DEDUCCION', cantidad: null, valor: 71_837 },
]

export function muestraDesprendible(empresa: EmpresaTexto): DatosVarsDesprendible {
  const dev = LINEAS_DESPRENDIBLE_MUESTRA.filter((l) => l.tipo === 'DEVENGADO').reduce((t, l) => t + l.valor, 0)
  const ded = LINEAS_DESPRENDIBLE_MUESTRA.filter((l) => l.tipo === 'DEDUCCION').reduce((t, l) => t + l.valor, 0)
  return {
    empresa,
    periodo: 'Enero 2026',
    colaborador: { nombre: MUESTRA_PERSONA.nombre, documento: MUESTRA_PERSONA.documento, cargo: MUESTRA_PERSONA.cargo, sede: 'Sede de muestra' },
    diasTrabajados: 30,
    totalDevengado: dev,
    totalDeducido: ded,
    neto: dev - ded,
  }
}

/** Áreas de la muestra del acta de paz y salvo: [área, verificado, quién, cuándo]. */
export const AREAS_PAZ_Y_SALVO_MUESTRA: [string, string, string, string][] = [
  ['Activos', 'Equipos y activos asignados devueltos', 'Verificador de muestra', '14 ene. 2026'],
  ['Cartera', 'Préstamos y cartera al día', 'Verificador de muestra', '14 ene. 2026'],
  ['Documentos', 'Documentos y expedientes entregados', 'Verificador de muestra', '14 ene. 2026'],
  ['Sistemas', 'Accesos y correos revocados', 'Verificador de muestra', '15 ene. 2026'],
  ['Dotación', 'Dotación devuelta (si aplica)', 'Verificador de muestra', '15 ene. 2026'],
]

export function muestraPazYSalvo(empresa: EmpresaTexto): DatosVarsPazYSalvo {
  return {
    colaborador: { nombre: MUESTRA_PERSONA.nombre, documento: MUESTRA_PERSONA.documento, cargo: MUESTRA_PERSONA.cargo },
    empresa,
    ciudad: MUESTRA_PERSONA.ciudad,
    fecha: FECHA_MUESTRA,
    fechaIngreso: new Date(Date.UTC(2024, 2, 1)),
    fechaRetiro: new Date(Date.UTC(2026, 0, 10)),
    motivo: 'renuncia voluntaria',
  }
}

/** Liquidación de muestra: ingresos y deducciones ficticios, con sus totales. */
export const LIQUIDACION_MUESTRA = {
  ingresos: [
    { k: 'Salario', sub: '10 días', v: 500_000 },
    { k: 'Auxilio de transporte', v: 66_667 },
    { k: 'Cesantías', sub: '680 días', v: 2_833_333 },
    { k: 'Intereses cesantías', sub: '12% · 680 días', v: 340_000 },
    { k: 'Prima salarial', sub: '10 días', v: 55_556 },
    { k: 'Vacaciones compensadas', v: 708_333 },
  ],
  deducciones: [{ k: 'Salud', sub: '4%', v: 20_000 }, { k: 'Fondo de pensión', sub: '4%', v: 20_000 }],
}

export function muestraLiquidacion(empresa: EmpresaTexto): DatosVarsLiquidacion {
  const ingresos = LIQUIDACION_MUESTRA.ingresos.reduce((t, f) => t + f.v, 0)
  const deducciones = LIQUIDACION_MUESTRA.deducciones.reduce((t, f) => t + f.v, 0)
  return { ...muestraPazYSalvo(empresa), dias: 680, salarioBase: 1_500_000, total: ingresos - deducciones }
}

/** Carta de la terminación de muestra (renuncia, terminación, no prórroga…). */
export function muestraCarta(empresa: EmpresaTexto): DatosVarsCarta {
  return {
    ...muestraPazYSalvo(empresa), observaciones: 'Motivo de muestra escrito en la terminación.', preavisoDias: 30,
    destinatario: { correo: 'correo.muestra@ejemplo.com', lugarExpedicion: MUESTRA_PERSONA.ciudad, departamento: 'Departamento de muestra' },
    ciudadEmpresa: 'Ciudad de la empresa',
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
      lugarExpedicion: MUESTRA_PERSONA.ciudad,
      tieneComisiones: true,
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
/** Horario de muestra: tienda de lunes a sábado. */
export const HORARIO_MUESTRA: DiasHorario = {
  ...Object.fromEntries((['1', '2', '3', '4', '5'] as const).map((d) => [d, { entrada: '08:00', salida: '18:00', almuerzo_min: 60, almuerzo_desde: '13:00', almuerzo_hasta: '14:00' }])),
  '6': { entrada: '08:00', salida: '13:00', almuerzo_min: 0 },
}

/** Cambio de horario de muestra: de jornada de oficina a la de tienda. */
export function muestraCambioHorario(empresa: EmpresaTexto): DatosVarsCambioHorario {
  return {
    colaborador: { nombre: MUESTRA_PERSONA.nombre, documento: MUESTRA_PERSONA.documento, cargo: MUESTRA_PERSONA.cargo },
    empresa,
    ciudad: MUESTRA_PERSONA.ciudad,
    fecha: FECHA_MUESTRA,
    desde: new Date(Date.UTC(2026, 0, 19)),
    horario: 'Tienda lunes a sábado',
    resumen: resumenHorario(HORARIO_MUESTRA),
    horasSemana: textoHoras(horasSemana(HORARIO_MUESTRA)),
    anterior: 'Lun–Vie 07:00–16:00',
    motivo: 'Apertura del horario extendido de la tienda.',
  }
}

/** Cuenta de cobro de muestra: un contratista ficticio que cobra un mes de honorarios. */
export function muestraCuentaCobro(empresa: EmpresaTexto & { direccion?: string | null; emailContacto?: string | null }): DatosVarsCuentaCobro {
  return {
    empresa: { ...empresa, direccion: empresa.direccion ?? null, emailContacto: empresa.emailContacto ?? null },
    contratista: {
      nombre: MUESTRA_PERSONA.nombre,
      tipoDocumento: 'CC',
      numeroDocumento: '1000000000',
      lugarExpedicion: 'Ciudad de muestra',
      correo: 'correo.de.muestra@ejemplo.com',
      celular: '300 000 0000',
      banco: 'Banco de muestra',
      tipoCuenta: 'Ahorros',
      numeroCuenta: '000-000000-00',
    },
    numero: 'CC-0',
    periodo: '2026-01',
    concepto: 'servicios prestados como asesor comercial',
    valor: 1_000_000,
    ciudad: MUESTRA_PERSONA.ciudad,
    fecha: FECHA_MUESTRA,
  }
}

/** Lo que va bajo la raya de la firma del acreedor (igual en el PDF). */
export function lineasFirmaCuentaCobro(vars: Record<string, string>): string[] {
  return [
    `Nombre: ${vars.nombre}`,
    `${vars.tipo_documento}. No. ${vars.documento}${vars.lugar_expedicion ? ` ${vars.lugar_expedicion}` : ''}`,
    ...(vars.celular ? [`Cel. ${vars.celular}`] : []),
  ]
}

export function muestraTexto(clave: ClaveTexto, variante: string, empresa: EmpresaTexto & { direccion?: string | null; emailContacto?: string | null }): MuestraTexto {
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
    case 'DESPRENDIBLE_NOMINA': {
      const d = muestraDesprendible(empresa)
      const vars = variablesDesprendible(d)
      const linea = (l: (typeof LINEAS_DESPRENDIBLE_MUESTRA)[number]): [string, string] => [l.nombre, fmtCOP(l.valor)]
      return {
        vars,
        tabla: {
          tipo: 'pares',
          pares: [
            ...LINEAS_DESPRENDIBLE_MUESTRA.filter((l) => l.tipo === 'DEVENGADO').map(linea),
            ['Total devengado', vars.devengado],
            ...LINEAS_DESPRENDIBLE_MUESTRA.filter((l) => l.tipo === 'DEDUCCION').map(linea),
            ['Total deducido', vars.deducido],
            ['Neto a pagar', vars.neto],
          ],
        },
        fijos: {
          cabecera: 'membrete',
          filas: [['Colaborador', `${vars.nombre} · ${vars.documento}`], ['Periodo', `${vars.periodo} · ${vars.dias} días`], ['Cargo', vars.cargo], ['Sede', vars.sede]],
          firmas: [],
          pie: `${pie} · Documento generado electrónicamente`,
        },
      }
    }
    case 'PAZ_Y_SALVO': {
      const d = muestraPazYSalvo(empresa)
      return {
        vars: variablesPazYSalvo(d),
        tabla: {
          tipo: 'columnas',
          columnas: [
            { titulo: 'Área', ancho: '18%' }, { titulo: 'Verificado', ancho: '42%' },
            { titulo: 'Verificó', ancho: '24%' }, { titulo: 'Fecha', ancho: '16%' },
          ],
          filas: AREAS_PAZ_Y_SALVO_MUESTRA,
          total: null,
        },
        fijos: { cabecera: 'membrete', firmas: [FIRMA_COLABORADOR, firmaEmpresa('Talento Humano')], pie },
      }
    }
    case 'LIQUIDACION_DEFINITIVA': {
      const d = muestraLiquidacion(empresa)
      const filas = [...LIQUIDACION_MUESTRA.ingresos, ...LIQUIDACION_MUESTRA.deducciones.map((f) => ({ ...f, v: -f.v }))]
      return {
        vars: variablesLiquidacion(d),
        tabla: { tipo: 'pares', pares: [...filas.map((f): [string, string] => [f.k, fmtCOP(f.v)]), ['Total a pagar', fmtCOP(d.total)]] },
        fijos: { cabecera: 'membrete', firmas: [{ nombre: 'Talento Humano', detalle: 'Firmado electrónicamente el (fecha de envío)', conFirma: true }, FIRMA_COLABORADOR], pie },
      }
    }
    case 'CARTA_RENUNCIA':
    case 'CARTA_ACEPTACION_RENUNCIA':
    case 'CARTA_TERMINACION':
    case 'CARTA_NO_PRORROGA':
    case 'ACTA_MUTUO_ACUERDO':
    case 'ORDEN_EXAMEN_EGRESO': {
      const firmaTH = { nombre: 'Talento Humano', detalle: 'Firmado electrónicamente el (fecha de envío)', conFirma: clave !== 'ORDEN_EXAMEN_EGRESO' }
      const firmas = clave === 'CARTA_RENUNCIA' ? [FIRMA_COLABORADOR] : clave === 'ORDEN_EXAMEN_EGRESO' ? [firmaTH] : [firmaTH, FIRMA_COLABORADOR]
      return { vars: variablesCarta(muestraCarta(empresa)), tabla: null, fijos: { cabecera: 'membrete', firmas, pie } }
    }
    case 'CAMBIO_HORARIO': {
      const vars = variablesCambioHorario(muestraCambioHorario(empresa))
      return {
        vars,
        tabla: { tipo: 'pares', pares: ORDEN_DIAS.map((d): [string, string] => [NOMBRE_DIA[d], HORARIO_MUESTRA[d] ? textoFranja(HORARIO_MUESTRA[d]) : 'Descanso']) },
        fijos: { cabecera: 'membrete', firmas: [firmaEmpresa('Talento Humano')], pie },
      }
    }
    case 'CUENTA_COBRO': {
      // La firma va dentro del texto (`[firma]`), no al final: por eso no hay firmas fijas.
      const vars = variablesCuentaCobro(muestraCuentaCobro(empresa))
      return { vars, tabla: { tipo: 'firma', lineas: lineasFirmaCuentaCobro(vars) }, fijos: { cabecera: 'membrete', firmas: [], pie } }
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
