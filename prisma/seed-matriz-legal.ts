/**
 * Matriz legal SST (normograma): normas base aplicables a cualquier empleador
 * colombiano. Idempotente: solo inserta las que no existan (por nombre de norma).
 * El estado de cumplimiento nace en NO_CUMPLE para que el responsable lo evalúe.
 */
import { prisma } from '../src/lib/db'

const NORMAS = [
  { norma: 'Decreto 1072 de 2015', emisor: 'Ministerio del Trabajo', tema: 'Decreto Único Reglamentario del Sector Trabajo — capítulo 6: SG-SST obligatorio', articulos: 'Libro 2, Parte 2, Título 4, Cap. 6' },
  { norma: 'Resolución 0312 de 2019', emisor: 'Ministerio del Trabajo', tema: 'Estándares mínimos del SG-SST según tamaño y riesgo de la empresa', articulos: 'Todos (según nivel 7/21/60)' },
  { norma: 'Ley 1562 de 2012', emisor: 'Congreso de la República', tema: 'Sistema General de Riesgos Laborales: afiliación ARL, definición de accidente y enfermedad laboral' },
  { norma: 'Resolución 2013 de 1986', emisor: 'Ministerios de Trabajo y Salud', tema: 'Conformación y funcionamiento del COPASST (antes COPASO)' },
  { norma: 'Resolución 652 de 2012', emisor: 'Ministerio del Trabajo', tema: 'Comité de Convivencia Laboral: conformación, funciones y periodicidad', articulos: 'Modificada por Res. 1356 de 2012' },
  { norma: 'Ley 1010 de 2006', emisor: 'Congreso de la República', tema: 'Prevención y sanción del acoso laboral' },
  { norma: 'Ley 2466 de 2025', emisor: 'Congreso de la República', tema: 'Reforma laboral: prevención del acoso y violencia en el mundo del trabajo' },
  { norma: 'Resolución 1401 de 2007', emisor: 'Ministerio de la Protección Social', tema: 'Investigación de incidentes y accidentes de trabajo (equipo investigador, plazo 15 días)' },
  { norma: 'Resolución 2346 de 2007', emisor: 'Ministerio de la Protección Social', tema: 'Evaluaciones médicas ocupacionales (ingreso, periódicas, egreso) y custodia de historias clínicas' },
  { norma: 'Decreto 1295 de 1994', emisor: 'Ministerio de Gobierno', tema: 'Organización y administración del Sistema General de Riesgos Profesionales' },
  { norma: 'Resolución 4272 de 2021', emisor: 'Ministerio del Trabajo', tema: 'Trabajo en alturas: requisitos mínimos de seguridad (si aplica por actividad)' },
  { norma: 'Ley 9 de 1979', emisor: 'Congreso de la República', tema: 'Código Sanitario Nacional: condiciones de higiene y seguridad en establecimientos de trabajo', articulos: 'Título III' },
] as const

export async function seedMatrizLegal() {
  for (const n of NORMAS) {
    const existe = await prisma.normaMatrizLegal.findFirst({ where: { norma: n.norma } })
    if (!existe) {
      await prisma.normaMatrizLegal.create({
        data: { norma: n.norma, emisor: n.emisor, tema: n.tema, articulos: 'articulos' in n ? n.articulos : null, responsableRol: 'Responsable SST' },
      })
      console.log(`Norma sembrada: ${n.norma}`)
    }
  }
}
