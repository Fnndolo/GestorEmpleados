import { prisma } from '@/lib/db'
import type { DatosEmpresa } from './membrete'
import { renderAcuerdoEvaluacion } from './acuerdo-evaluacion'
import { renderAutorizacionDatos } from './autorizacion-datos'
import { renderContratoOps } from './contrato-ops'
import { renderContratoLaboral } from './contrato-laboral'
import { construirVariables, sustituir, type PlantillaResuelta } from '@/lib/contrato-variables'
import { renderCuentaCobro } from './cuenta-cobro'
import { renderCambioHorario } from './cambio-horario'
import { renderActaActivo } from './acta-activo'
import { renderActaDotacion } from './acta-dotacion'
import { renderActaEpp } from './acta-epp'
import { renderCertificacion } from './certificacion'
import { renderOrdenPagoHorasExtra } from './pago-horas-extra'
import { renderDesprendible } from './desprendible'
import { renderActaPazYSalvo } from './paz-y-salvo'
import { renderLiquidacionDefinitiva } from './liquidacion-definitiva'
import { renderCartaTerminacion } from './carta-terminacion'
import { plantillaTexto } from '@/server/plantillas-documento'
import type { ClaveTexto, TextoDocumento } from '@/lib/plantillas-documento/textos'
import {
  muestraActaActivo, muestraActaDotacion, muestraActaEpp, muestraCertificacion, muestraOrdenPago, muestraPazYSalvo, AREAS_PAZ_Y_SALVO_MUESTRA, muestraLiquidacion, LIQUIDACION_MUESTRA, muestraCarta,
  muestraDesprendible, LINEAS_DESPRENDIBLE_MUESTRA, muestraCuentaCobro, muestraCambioHorario, HORARIO_MUESTRA,
} from '@/lib/plantillas-documento/textos-muestra'

/**
 * Documentos de MUESTRA para ver cómo queda el papel membretado sin tener que
 * crear un contrato real.
 *
 * Los datos son ficticios a propósito y se nota: el objetivo es revisar el
 * diseño —márgenes, si el texto pisa el logo o el pie—, no el contenido. Lo
 * único real son los datos de la empresa, porque son los que se imprimen sobre
 * el membrete y hay que verlos en su sitio.
 */

export const TIPOS_MUESTRA = ['acuerdo', 'contrato-ops', 'contrato-laboral', 'autorizacion', 'autorizacion-laboral'] as const
export type TipoMuestra = (typeof TIPOS_MUESTRA)[number]

export const NOMBRE_MUESTRA: Record<TipoMuestra, string> = {
  acuerdo: 'Acuerdo de evaluación previa',
  'contrato-ops': 'Contrato de prestación de servicios',
  'contrato-laboral': 'Contrato de trabajo',
  autorizacion: 'Autorización de datos · Contrato OPS',
  'autorizacion-laboral': 'Autorización de datos · Contrato laboral',
}

const ASPIRANTE = 'NOMBRE DE MUESTRA APELLIDO APELLIDO'
const DOCUMENTO = 'CC. 1.000.000.000 de Ciudad (X)'
const DIRECCION = 'Calle 00 # 00-00, Barrio de muestra'
const EMAIL = 'correo.de.muestra@ejemplo.com'
const CARGO = 'CARGO DE MUESTRA'

/** Cláusulas de relleno con la longitud típica de un contrato real. */
const PLANTILLA: PlantillaResuelta = {
  titulo: 'DOCUMENTO DE MUESTRA — NO TIENE VALIDEZ',
  numero: 'MUESTRA-000',
  intro:
    'Entre los suscritos a saber: por una parte la empresa, y por la otra la persona identificada ' +
    'arriba, se ha convenido celebrar el presente documento de muestra, cuyo único fin es revisar ' +
    'cómo queda el papel membretado. Este texto no tiene valor legal alguno.',
  cierre: 'Para constancia se firma este documento de muestra, que no produce efecto alguno.',
  clausulas: [
    {
      titulo: 'CLÁUSULA PRIMERA: — OBJETO',
      parrafos: [
        'Este párrafo existe para ocupar el ancho de la página y comprobar que el texto justificado ' +
        'no se monta sobre el logo del encabezado ni sobre la franja del pie. Si algo se pisa, hay ' +
        'que ajustar los márgenes del documento, no la imagen del membrete.',
      ],
    },
    {
      titulo: 'CLÁUSULA SEGUNDA: — DURACIÓN',
      parrafos: [
        'Segundo párrafo de relleno para que la muestra tenga el alto de un documento normal y se ' +
        'vea cómo se comporta el membrete cuando el contenido llega hasta abajo.',
      ],
    },
  ],
}

/** Datos reales de la empresa: son los que se imprimen sobre el membrete. */
async function empresaActual(): Promise<DatosEmpresa & { domicilio: string }> {
  const e = await prisma.configuracionEmpresa.findFirst()
  return {
    razonSocial: e?.razonSocial ?? 'Razón social sin configurar',
    nombreComercial: e?.nombreComercial ?? '',
    nit: e?.nit ?? '—',
    direccion: e?.direccion ?? null,
    telefono: e?.telefono ?? null,
    emailContacto: e?.emailContacto ?? null,
    sitioWeb: e?.sitioWeb ?? null,
    domicilio: e?.direccion ?? 'Domicilio sin configurar',
  }
}

export async function renderMuestra(tipo: TipoMuestra): Promise<Buffer> {
  const empresa = await empresaActual()
  const repLegal = (await prisma.configuracionEmpresa.findFirst())?.representanteLegal ?? 'Representante legal'

  if (tipo === 'acuerdo') {
    return renderAcuerdoEvaluacion({
      empresa,
      numero: 'MUESTRA-000',
      representanteLegal: repLegal,
      aspiranteNombre: ASPIRANTE,
      aspiranteDocumento: DOCUMENTO,
      aspiranteDireccion: DIRECCION,
      aspiranteEmail: EMAIL,
      cargoEvaluado: CARGO,
      fechaInicioTexto: 'uno (01) de enero de 2026',
      fechaFinTexto: 'quince (15) de enero de 2026',
      fechaFirmaTexto: 'uno (01) días del mes de enero del año 2026',
      ciudadFirma: 'Ciudad de muestra',
      aniosConfidencialidad: 'dos (02) años',
    })
  }

  if (tipo === 'autorizacion' || tipo === 'autorizacion-laboral') {
    // Con la línea "Firmado electrónicamente…" para que la muestra ocupe lo mismo
    // que el documento firmado, que es el que termina en el expediente.
    return renderAutorizacionDatos(
      {
        ciudadFecha: 'Ciudad de muestra, uno (01) de enero de 2026.',
        contratistaNombre: ASPIRANTE,
        contratistaCc: DOCUMENTO,
        cargo: CARGO,
        genero: null,
        vinculo: tipo === 'autorizacion-laboral' ? 'LABORAL' : 'OPS',
        empresa,
      },
      null,
      '(fecha de la firma)',
    )
  }

  if (tipo === 'contrato-ops') {
    return renderContratoOps({
      empresa,
      plantilla: PLANTILLA,
      encabezado: {
        contratanteNombre: empresa.razonSocial,
        contratanteRep: repLegal,
        contratanteNit: empresa.nit,
        contratanteDir: empresa.direccion ?? '—',
        contratistaNombre: ASPIRANTE,
        contratistaCc: DOCUMENTO,
        contratistaDir: DIRECCION,
        contratistaEmail: EMAIL,
        tipo: 'Prestación de servicios',
        plazo: '3 meses',
        valorTotal: '$ 0',
        honorarios: '$ 0 mensuales',
        fechaSuscripcion: '1 de enero de 2026',
        fechaTerminacion: '31 de marzo de 2026',
      },
      firmaContratanteNombre: repLegal,
      firmaContratistaNombre: ASPIRANTE,
    })
  }

  return renderContratoLaboral({
    empresa,
    plantilla: PLANTILLA,
    encabezado: {
      empleadorNombre: empresa.razonSocial,
      empleadorRep: repLegal,
      empleadorNit: empresa.nit,
      empleadorDir: empresa.direccion ?? '—',
      tipoContrato: 'Término indefinido',
      salario: '$ 0 mensuales',
      auxTransporte: 'No aplica',
      empleadoNombre: ASPIRANTE,
      empleadoCc: DOCUMENTO,
      empleadoDir: DIRECCION,
      empleadoEmail: EMAIL,
      duracion: 'Indefinida',
      fechaInicio: '1 de enero de 2026',
      fechaFin: '—',
    },
    firmaEmpleadorNombre: repLegal,
    firmaEmpleadoNombre: ASPIRANTE,
    firmaEmpleadoCc: DOCUMENTO,
  })
}

/**
 * Muestra de una plantilla concreta, para revisarla desde su editor.
 *
 * Las variables se resuelven con los mismos datos ficticios: si una está mal
 * escrita se ve el `{{token}}` crudo en el PDF, que es la forma más rápida de
 * detectar el error antes de usar la plantilla en un contrato real.
 */
export async function renderMuestraPlantilla(plantillaId: string): Promise<Buffer> {
  const p = await prisma.plantillaContrato.findUniqueOrThrow({
    where: { id: plantillaId },
    include: { clausulas: { orderBy: { orden: 'asc' } } },
  })
  const empresa = await empresaActual()
  const repLegal = (await prisma.configuracionEmpresa.findFirst())?.representanteLegal ?? 'Representante legal'

  const vars = construirVariables({
    empresa: {
      razonSocial: empresa.razonSocial,
      marca: empresa.nombreComercial,
      nit: empresa.nit,
      representanteLegal: repLegal,
      representanteLegalCc: '0.000.000',
      correoDevolucion: empresa.emailContacto,
    },
    contratista: {
      nombre: ASPIRANTE, cc: '1.000.000.000', ccLugar: 'Ciudad (X)',
      direccion: DIRECCION, email: EMAIL, telefono: '300 000 0000', genero: null,
    },
    contrato: {
      numero: 'MUESTRA-000', ciudad: 'Ciudad de muestra',
      fechaSuscripcion: '2026-01-01',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-03-31',
      plazoMeses: 3, valorTotal: 0, honorarioMensual: 0,
      salarioMensual: 0, auxTransporte: 0, cargoObjeto: CARGO,
    },
  })

  const plantilla: PlantillaResuelta = {
    titulo: p.titulo,
    numero: 'MUESTRA-000',
    intro: sustituir(p.intro, vars),
    cierre: sustituir(p.cierre, vars),
    clausulas: p.clausulas.map((c) => ({
      titulo: sustituir(c.titulo, vars),
      // Cada salto de línea es un párrafo; así se respeta el formato del editor.
      parrafos: sustituir(c.cuerpo, vars).split('\n').map((x) => x.trim()).filter(Boolean),
    })),
  }

  const encabezadoComun = {
    contratistaNombre: ASPIRANTE, contratistaCc: DOCUMENTO, contratistaDir: DIRECCION,
    contratistaEmail: EMAIL, fechaSuscripcion: '1 de enero de 2026',
  }

  if (p.tipo !== 'OPS') {
    return renderContratoLaboral({
      empresa, plantilla,
      encabezado: {
        empleadorNombre: empresa.razonSocial, empleadorRep: repLegal, empleadorNit: empresa.nit,
        empleadorDir: empresa.direccion ?? '—', tipoContrato: 'Término indefinido',
        salario: '$ 0 mensuales', auxTransporte: 'No aplica',
        empleadoNombre: ASPIRANTE, empleadoCc: DOCUMENTO, empleadoDir: DIRECCION,
        empleadoEmail: EMAIL, duracion: 'Indefinida',
        fechaInicio: '1 de enero de 2026', fechaFin: '—',
      },
      firmaEmpleadorNombre: repLegal, firmaEmpleadoNombre: ASPIRANTE, firmaEmpleadoCc: DOCUMENTO,
    })
  }

  return renderContratoOps({
    empresa, plantilla,
    encabezado: {
      ...encabezadoComun,
      contratanteNombre: empresa.razonSocial, contratanteRep: repLegal,
      contratanteNit: empresa.nit, contratanteDir: empresa.direccion ?? '—',
      tipo: 'Prestación de servicios', plazo: '3 meses',
      valorTotal: '$ 0', honorarios: '$ 0 mensuales',
      fechaTerminacion: '31 de marzo de 2026',
    },
    firmaContratanteNombre: repLegal, firmaContratistaNombre: ASPIRANTE,
  })
}

/**
 * Muestra de uno de los textos editables (actas de Mis entregas, orden de pago
 * de horas extra, certificaciones) con los mismos datos ficticios de la vista
 * previa del editor. Usa el texto guardado en Ajustes, salvo que se pase uno
 * (para ver un borrador sin guardarlo). `variante` elige el caso: tipo de
 * certificación, un activo o varios, entrega inicial o reposición.
 */
export async function renderMuestraTexto(clave: ClaveTexto, variante: string, plantilla?: TextoDocumento): Promise<Buffer> {
  const empresa = await empresaActual()
  const texto = plantilla ?? (await plantillaTexto(clave))

  switch (clave) {
    case 'ACTA_ACTIVO_ENTREGA':
    case 'ACTA_ACTIVO_DEVOLUCION':
      return renderActaActivo(
        { ...muestraActaActivo(variante, empresa), tipo: clave === 'ACTA_ACTIVO_ENTREGA' ? 'entrega' : 'devolucion', empresa, firmaDataUri: null, firmaFecha: null },
        texto,
      )
    case 'ACTA_DOTACION':
      return renderActaDotacion({ ...muestraActaDotacion(empresa), empresa }, texto)
    case 'ACTA_EPP':
      return renderActaEpp({ ...muestraActaEpp(variante, empresa), empresa }, texto)
    case 'ORDEN_PAGO_HORAS_EXTRA':
      return renderOrdenPagoHorasExtra({ ...muestraOrdenPago(empresa), empresa, firma: null }, texto)
    case 'DESPRENDIBLE_NOMINA':
      return renderDesprendible(
        {
          ...muestraDesprendible(empresa),
          empresa,
          ibc: 1_795_928,
          lineas: LINEAS_DESPRENDIBLE_MUESTRA.map((l, i) => ({ codigo: String(i), nombre: l.nombre, tipo: l.tipo, cantidad: l.cantidad, valor: l.valor })),
        },
        texto,
      )
    case 'PAZ_Y_SALVO':
      return renderActaPazYSalvo(
        {
          ...muestraPazYSalvo(empresa),
          empresa,
          areas: AREAS_PAZ_Y_SALVO_MUESTRA.map(([area, concepto, verificadoPor, verificadoEn]) => ({ area, concepto, verificadoPor, verificadoEn })),
        },
        texto,
      )
    case 'LIQUIDACION_DEFINITIVA': {
      const m = muestraLiquidacion(empresa)
      return renderLiquidacionDefinitiva(
        {
          ...m,
          empresa,
          ingresos: LIQUIDACION_MUESTRA.ingresos,
          deducciones: LIQUIDACION_MUESTRA.deducciones,
          totalIngresos: LIQUIDACION_MUESTRA.ingresos.reduce((t, f) => t + f.v, 0),
          totalDeducciones: LIQUIDACION_MUESTRA.deducciones.reduce((t, f) => t + f.v, 0),
        },
        texto,
      )
    }
    case 'CARTA_RENUNCIA':
    case 'CARTA_ACEPTACION_RENUNCIA':
    case 'CARTA_TERMINACION':
    case 'CARTA_NO_PRORROGA':
    case 'ACTA_MUTUO_ACUERDO':
    case 'ORDEN_EXAMEN_EGRESO':
      return renderCartaTerminacion(clave, { ...muestraCarta(empresa), empresa }, texto)
    case 'CAMBIO_HORARIO':
      return renderCambioHorario({ ...muestraCambioHorario(empresa), empresa, dias: HORARIO_MUESTRA }, texto)
    case 'CUENTA_COBRO':
      return renderCuentaCobro({ ...muestraCuentaCobro(empresa), empresa: { ...empresa, ...muestraCuentaCobro(empresa).empresa }, firmaDataUri: null }, texto)
    case 'CERTIFICACION_LABORAL':
    case 'CERTIFICACION_CONTRACTUAL':
      return renderCertificacion(
        { ...muestraCertificacion(clave === 'CERTIFICACION_CONTRACTUAL' ? 'CONTRACTUAL' : 'LABORAL', variante, empresa), empresa, firmaDataUri: null },
        texto,
      )
  }
}
