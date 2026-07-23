import type { ClausulaPlantilla } from '@/lib/contrato-variables'

/**
 * Plantilla LABORAL genérica de respaldo: se usa en la vista previa (y como base
 * editable) cuando el tipo de contrato elegido aún no tiene una plantilla
 * sembrada, para que el documento no se vea vacío ni muestre un mensaje de error.
 * Los {{campos}} sin diligenciar se rendericen como «__________» (VACIO).
 */

export const TITULO_GENERICO_LABORAL = 'CONTRATO INDIVIDUAL DE TRABAJO'

export const INTRO_GENERICA_LABORAL =
  'Entre {{empresa_razon_social}}, identificada con NIT {{empresa_nit}}, representada legalmente por ' +
  '{{representante_legal}}, quien para efectos del presente contrato se denominará EL EMPLEADOR, y ' +
  '{{empleado_tratamiento}} {{empleado_nombre}}, mayor de edad, {{empleado_identificada}} con la cédula de ' +
  'ciudadanía No. {{empleado_cc}}, quien se denominará EL EMPLEADO, se ha celebrado el presente contrato ' +
  'individual de trabajo, que se regirá por las siguientes cláusulas:'

export const CIERRE_GENERICO_LABORAL =
  'Para constancia se firma en {{ciudad}}, en dos (2) ejemplares del mismo tenor, por las partes que en él intervienen.'

export const CLAUSULAS_GENERICAS_LABORAL: ClausulaPlantilla[] = [
  {
    orden: 1,
    esFunciones: false,
    titulo: 'PRIMERA: OBJETO Y CARGO',
    cuerpo:
      'EL EMPLEADO se obliga a prestar sus servicios personales a EL EMPLEADOR desempeñando el cargo de ' +
      '{{cargo_objeto}}, cumpliendo las órdenes e instrucciones que le impartan sus superiores conforme a la ' +
      'naturaleza del cargo y al reglamento interno de trabajo.',
  },
  {
    orden: 2,
    esFunciones: true,
    titulo: 'SEGUNDA: FUNCIONES',
    cuerpo: 'En desarrollo del objeto de este contrato, EL EMPLEADO ejecutará las siguientes funciones:',
  },
  {
    orden: 3,
    esFunciones: false,
    titulo: 'TERCERA: LUGAR DE TRABAJO Y JORNADA',
    cuerpo:
      'EL EMPLEADO prestará sus servicios en la ciudad de {{ciudad}}, en las instalaciones que EL EMPLEADOR ' +
      'destine para ello, cumpliendo la jornada de trabajo dentro de los límites máximos legales.',
  },
  {
    orden: 4,
    esFunciones: false,
    titulo: 'CUARTA: SALARIO',
    cuerpo:
      'EL EMPLEADOR pagará a EL EMPLEADO como remuneración por sus servicios la suma de {{salario_mcte_letras}} ' +
      'mensuales, más el auxilio legal de transporte de {{aux_transporte_mcte_letras}} cuando a él haya lugar, ' +
      'pagaderos en las fechas acordadas por las partes.',
  },
  {
    orden: 5,
    esFunciones: false,
    titulo: 'QUINTA: DURACIÓN Y PERIODO DE PRUEBA',
    cuerpo:
      'El presente contrato regirá a partir del {{fecha_inicio_larga}}. Las partes acuerdan un periodo de prueba ' +
      'dentro de los límites que autoriza la ley, durante el cual cualquiera de ellas podrá darlo por terminado ' +
      'unilateralmente y sin previo aviso.',
  },
  {
    orden: 6,
    esFunciones: false,
    titulo: 'SEXTA: OBLIGACIONES DEL EMPLEADO',
    cuerpo:
      'EL EMPLEADO se obliga a cumplir las funciones propias del cargo con diligencia y buena fe, guardar la ' +
      'debida reserva sobre la información de EL EMPLEADOR, cuidar los bienes y elementos que se le confíen y ' +
      'acatar el reglamento interno de trabajo y las normas de seguridad y salud en el trabajo.',
  },
  {
    orden: 7,
    esFunciones: false,
    titulo: 'SÉPTIMA: TERMINACIÓN',
    cuerpo:
      'El presente contrato podrá terminarse por las causales previstas en la ley laboral colombiana, sin ' +
      'perjuicio de las indemnizaciones a que hubiere lugar. Las situaciones no previstas se regirán por el ' +
      'Código Sustantivo del Trabajo y demás normas concordantes.',
  },
]

/** Plantilla genérica completa (título, intro, cláusulas y cierre). */
export function plantillaGenericaLaboral() {
  return {
    titulo: TITULO_GENERICO_LABORAL,
    intro: INTRO_GENERICA_LABORAL,
    cierre: CIERRE_GENERICO_LABORAL,
    clausulas: CLAUSULAS_GENERICAS_LABORAL,
  }
}
