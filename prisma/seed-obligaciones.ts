import { prisma } from '../src/lib/db'
import type { CategoriaObligacion, PeriodicidadObligacion } from '../src/generated/prisma/enums'

type Ob = {
  nombre: string; categoria: CategoriaObligacion; periodicidad: PeriodicidadObligacion
  mesBase?: number; diaBase?: number; mesesBase?: string; porSede?: boolean; cadaNAnios?: number
  responsableRol?: string; fuenteLegal?: string
}

// Lista completa de obligaciones legales recurrentes (requerimiento 4.1)
const OBLIGACIONES: Ob[] = [
  // Societario / Cámara de Comercio
  { nombre: 'Renovación matrícula mercantil', categoria: 'SOCIETARIO', periodicidad: 'ANUAL', mesBase: 3, diaBase: 31, porSede: true, responsableRol: 'Jurídica', fuenteLegal: 'Código de Comercio art. 33' },
  { nombre: 'Reunión ordinaria de asamblea y aprobación de estados financieros', categoria: 'SOCIETARIO', periodicidad: 'ANUAL', mesBase: 3, diaBase: 31, responsableRol: 'Subgerencia', fuenteLegal: 'Ley 222 de 1995' },
  // Tributario
  { nombre: 'Declaración de renta anual', categoria: 'TRIBUTARIO', periodicidad: 'ANUAL', mesBase: 4, diaBase: 30, responsableRol: 'Contador', fuenteLegal: 'Estatuto Tributario' },
  { nombre: 'Declaración de IVA (bimestral)', categoria: 'TRIBUTARIO', periodicidad: 'BIMESTRAL', diaBase: 18, responsableRol: 'Contador', fuenteLegal: 'Estatuto Tributario art. 600' },
  { nombre: 'Retención en la fuente (mensual)', categoria: 'TRIBUTARIO', periodicidad: 'MENSUAL', diaBase: 18, responsableRol: 'Contador', fuenteLegal: 'Estatuto Tributario' },
  { nombre: 'ICA y retención de ICA por municipio', categoria: 'TRIBUTARIO', periodicidad: 'BIMESTRAL', diaBase: 20, porSede: true, responsableRol: 'Contador', fuenteLegal: 'Acuerdos municipales' },
  { nombre: 'Información exógena anual', categoria: 'TRIBUTARIO', periodicidad: 'ANUAL', mesBase: 5, diaBase: 15, responsableRol: 'Contador', fuenteLegal: 'Resolución DIAN' },
  { nombre: 'Registro Único de Beneficiarios Finales (RUB)', categoria: 'TRIBUTARIO', periodicidad: 'ANUAL', mesBase: 7, diaBase: 31, responsableRol: 'Jurídica', fuenteLegal: 'Resolución DIAN 164 de 2021' },
  // Laboral / seguridad social
  { nombre: 'PILA mensual (aportes seguridad social)', categoria: 'LABORAL', periodicidad: 'MENSUAL', diaBase: 5, responsableRol: 'Nómina', fuenteLegal: 'Decreto 1990 de 2016' },
  { nombre: 'Consignación de cesantías', categoria: 'LABORAL', periodicidad: 'ANUAL', mesBase: 2, diaBase: 14, responsableRol: 'Nómina', fuenteLegal: 'Ley 50 de 1990' },
  { nombre: 'Pago de intereses a las cesantías', categoria: 'LABORAL', periodicidad: 'ANUAL', mesBase: 1, diaBase: 31, responsableRol: 'Nómina', fuenteLegal: 'Ley 52 de 1975' },
  { nombre: 'Pago de prima de servicios', categoria: 'LABORAL', periodicidad: 'SEMESTRAL', mesesBase: '6,12', diaBase: 20, responsableRol: 'Nómina', fuenteLegal: 'CST art. 306' },
  // Habeas data (Ley 1581)
  { nombre: 'Actualización anual del RNBD', categoria: 'HABEAS_DATA', periodicidad: 'ANUAL', mesBase: 3, diaBase: 31, responsableRol: 'Jurídica', fuenteLegal: 'Decreto 1377 de 2013' },
  { nombre: 'Reporte semestral de reclamos a la SIC', categoria: 'HABEAS_DATA', periodicidad: 'SEMESTRAL', mesesBase: '2,8', diaBase: 20, responsableRol: 'Jurídica', fuenteLegal: 'Ley 1581 de 2012' },
  // SST
  { nombre: 'Autoevaluación anual de estándares mínimos SG-SST', categoria: 'SST', periodicidad: 'ANUAL', mesBase: 12, diaBase: 31, responsableRol: 'Responsable SST', fuenteLegal: 'Resolución 0312 de 2019' },
  { nombre: 'Plan de trabajo anual SG-SST', categoria: 'SST', periodicidad: 'ANUAL', mesBase: 1, diaBase: 31, responsableRol: 'Responsable SST', fuenteLegal: 'Decreto 1072 de 2015' },
  { nombre: 'Simulacro de evacuación por sede', categoria: 'SST', periodicidad: 'ANUAL', mesBase: 10, diaBase: 31, porSede: true, responsableRol: 'Responsable SST', fuenteLegal: 'Decreto 1072 de 2015' },
  { nombre: 'Jornada Día de la Familia', categoria: 'LABORAL', periodicidad: 'SEMESTRAL', mesesBase: '6,12', diaBase: 30, responsableRol: 'Recursos Humanos', fuenteLegal: 'Ley 1857 de 2017' },
  // Renovación de comités cada 2 años
  { nombre: 'Renovación COPASST', categoria: 'SST', periodicidad: 'CADA_N_ANIOS', cadaNAnios: 2, mesBase: 1, diaBase: 31, responsableRol: 'Responsable SST', fuenteLegal: 'Resolución 2013 de 1986' },
  { nombre: 'Renovación Comité de Convivencia Laboral', categoria: 'SST', periodicidad: 'CADA_N_ANIOS', cadaNAnios: 2, mesBase: 1, diaBase: 31, responsableRol: 'Responsable SST', fuenteLegal: 'Resolución 652 de 2012' },
  // Comercial
  { nombre: 'Renovación marca ante la SIC (cada 10 años)', categoria: 'COMERCIAL', periodicidad: 'CADA_N_ANIOS', cadaNAnios: 10, mesBase: 1, diaBase: 31, responsableRol: 'Jurídica', fuenteLegal: 'Decisión Andina 486' },
]

export async function seedObligaciones() {
  for (const o of OBLIGACIONES) {
    const existe = await prisma.obligacionLegal.findFirst({ where: { nombre: o.nombre } })
    if (!existe) {
      await prisma.obligacionLegal.create({
        data: {
          nombre: o.nombre, categoria: o.categoria, periodicidad: o.periodicidad,
          mesBase: o.mesBase ?? null, diaBase: o.diaBase ?? null, mesesBase: o.mesesBase ?? null,
          porSede: o.porSede ?? false, cadaNAnios: o.cadaNAnios ?? null,
          responsableRol: o.responsableRol ?? null, fuenteLegal: o.fuenteLegal ?? null, activa: true,
        },
      })
    }
  }
  console.log(`Calendario legal: ${OBLIGACIONES.length} obligaciones legales sembradas`)
}
