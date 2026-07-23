import { prisma } from '../src/lib/db'
import type { TipoConcepto, TipoCalculoConcepto } from '../src/generated/prisma/enums'

const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

// Parámetros legales con vigencia (valores verificados, ver docs/diseno/d2_payroll.md)
const PARAMETROS: { clave: string; valor: number; desde: Date; hasta?: Date; fuente: string; desc: string }[] = [
  // Salario mínimo y auxilio de transporte
  { clave: 'SMMLV', valor: 1_423_500, desde: D(2025, 1, 1), hasta: D(2025, 12, 31), fuente: 'Decreto 1572 de 2024', desc: 'Salario mínimo 2025' },
  { clave: 'SMMLV', valor: 1_750_905, desde: D(2026, 1, 1), fuente: 'Decreto 1469 de 2025', desc: 'Salario mínimo 2026' },
  { clave: 'AUX_TRANSPORTE', valor: 200_000, desde: D(2025, 1, 1), hasta: D(2025, 12, 31), fuente: 'Decreto 1573 de 2024', desc: 'Auxilio de transporte 2025' },
  { clave: 'AUX_TRANSPORTE', valor: 249_095, desde: D(2026, 1, 1), fuente: 'Decreto 1470 de 2025', desc: 'Auxilio de transporte 2026' },
  { clave: 'UVT', valor: 49_799, desde: D(2025, 1, 1), hasta: D(2025, 12, 31), fuente: 'Resolución DIAN 193 de 2024', desc: 'UVT 2025' },
  { clave: 'UVT', valor: 52_480, desde: D(2026, 1, 1), fuente: 'Resolución DIAN (provisional)', desc: 'UVT 2026 (editable)' },
  // Porcentajes (estables; una sola vigencia abierta)
  { clave: 'SALUD_EMPLEADO', valor: 0.04, desde: D(2025, 1, 1), fuente: 'Ley 100 de 1993', desc: 'Aporte salud empleado 4%' },
  { clave: 'SALUD_EMPLEADOR', valor: 0.085, desde: D(2025, 1, 1), fuente: 'Ley 100 de 1993', desc: 'Aporte salud empleador 8.5%' },
  { clave: 'PENSION_EMPLEADO', valor: 0.04, desde: D(2025, 1, 1), fuente: 'Ley 100 de 1993', desc: 'Aporte pensión empleado 4%' },
  { clave: 'PENSION_EMPLEADOR', valor: 0.12, desde: D(2025, 1, 1), fuente: 'Ley 100 de 1993', desc: 'Aporte pensión empleador 12%' },
  { clave: 'CAJA', valor: 0.04, desde: D(2025, 1, 1), fuente: 'Ley 21 de 1982', desc: 'Caja de compensación 4%' },
  { clave: 'SENA', valor: 0.02, desde: D(2025, 1, 1), fuente: 'Ley 119 de 1994', desc: 'SENA 2% (exonerado <10 SMMLV)' },
  { clave: 'ICBF', valor: 0.03, desde: D(2025, 1, 1), fuente: 'Ley 89 de 1988', desc: 'ICBF 3% (exonerado <10 SMMLV)' },
  { clave: 'ARL_I', valor: 0.00522, desde: D(2025, 1, 1), fuente: 'Decreto 1607 de 2002', desc: 'ARL clase I' },
  { clave: 'ARL_II', valor: 0.01044, desde: D(2025, 1, 1), fuente: 'Decreto 1607 de 2002', desc: 'ARL clase II' },
  { clave: 'ARL_III', valor: 0.02436, desde: D(2025, 1, 1), fuente: 'Decreto 1607 de 2002', desc: 'ARL clase III' },
  { clave: 'ARL_IV', valor: 0.04350, desde: D(2025, 1, 1), fuente: 'Decreto 1607 de 2002', desc: 'ARL clase IV' },
  { clave: 'ARL_V', valor: 0.06960, desde: D(2025, 1, 1), fuente: 'Decreto 1607 de 2002', desc: 'ARL clase V' },
  { clave: 'CESANTIAS', valor: 0.0833, desde: D(2025, 1, 1), fuente: 'Ley 50 de 1990', desc: 'Provisión cesantías 8.33%' },
  { clave: 'INTERESES_CESANTIAS', valor: 0.12, desde: D(2025, 1, 1), fuente: 'Ley 52 de 1975', desc: 'Intereses a las cesantías 12% anual' },
  { clave: 'PRIMA', valor: 0.0833, desde: D(2025, 1, 1), fuente: 'CST art. 306', desc: 'Provisión prima 8.33%' },
  { clave: 'VACACIONES', valor: 0.0417, desde: D(2025, 1, 1), fuente: 'CST art. 186', desc: 'Provisión vacaciones 4.17%' },
  { clave: 'FSP', valor: 0.01, desde: D(2025, 1, 1), fuente: 'Ley 797 de 2003', desc: 'Fondo solidaridad pensional 1% (≥4 SMMLV)' },
  { clave: 'EXONERACION_SMMLV', valor: 10, desde: D(2025, 1, 1), fuente: 'Ley 1819 de 2016 art. 114-1', desc: 'Tope exoneración salud/SENA/ICBF (10 SMMLV)' },
  { clave: 'AUX_TRANSPORTE_TOPE_SMMLV', valor: 2, desde: D(2025, 1, 1), fuente: 'Ley 15 de 1959', desc: 'Auxilio de transporte hasta 2 SMMLV' },
]

// Tipos de hora (Ley 2466 de 2025). factor = multiplicador de la hora ordinaria.
const TIPOS_HORA: { codigo: string; nombre: string; factor: number; desde: Date; hasta?: Date }[] = [
  { codigo: 'HED', nombre: 'Hora extra diurna', factor: 1.25, desde: D(2025, 1, 1) },
  { codigo: 'HEN', nombre: 'Hora extra nocturna', factor: 1.75, desde: D(2025, 1, 1) },
  { codigo: 'RN', nombre: 'Recargo nocturno', factor: 0.35, desde: D(2025, 1, 1) },
  // Recargo dominical/festivo escalonado (Ley 2466): 80% → 90% el 1-jul-2026
  { codigo: 'RD', nombre: 'Recargo dominical/festivo', factor: 0.80, desde: D(2025, 7, 1), hasta: D(2026, 6, 30) },
  { codigo: 'RD', nombre: 'Recargo dominical/festivo', factor: 0.90, desde: D(2026, 7, 1), hasta: D(2027, 6, 30) },
  { codigo: 'RD', nombre: 'Recargo dominical/festivo', factor: 1.00, desde: D(2027, 7, 1) },
  { codigo: 'RND', nombre: 'Recargo nocturno dominical', factor: 1.15, desde: D(2025, 7, 1), hasta: D(2026, 6, 30) },
  { codigo: 'RND', nombre: 'Recargo nocturno dominical', factor: 1.25, desde: D(2026, 7, 1), hasta: D(2027, 6, 30) },
  { codigo: 'RND', nombre: 'Recargo nocturno dominical', factor: 1.35, desde: D(2027, 7, 1) },
  { codigo: 'HEDD', nombre: 'Hora extra diurna dominical', factor: 2.00, desde: D(2025, 7, 1), hasta: D(2026, 6, 30) },
  { codigo: 'HEDD', nombre: 'Hora extra diurna dominical', factor: 2.10, desde: D(2026, 7, 1), hasta: D(2027, 6, 30) },
  { codigo: 'HEDD', nombre: 'Hora extra diurna dominical', factor: 2.20, desde: D(2027, 7, 1) },
  { codigo: 'HEND', nombre: 'Hora extra nocturna dominical', factor: 2.50, desde: D(2025, 7, 1), hasta: D(2026, 6, 30) },
  { codigo: 'HEND', nombre: 'Hora extra nocturna dominical', factor: 2.60, desde: D(2026, 7, 1), hasta: D(2027, 6, 30) },
  { codigo: 'HEND', nombre: 'Hora extra nocturna dominical', factor: 2.70, desde: D(2027, 7, 1) },
]

const C = (
  codigo: string, nombre: string, tipo: TipoConcepto, tipoCalculo: TipoCalculoConcepto,
  opts: Partial<{ constitutivoSalario: boolean; afectaIbcSs: boolean; basePrestaciones: boolean; baseVacaciones: boolean; afectaRetefuente: boolean; porcentaje: number; cuentaContable: string; orden: number }> = {},
) => ({ codigo, nombre, tipo, tipoCalculo, esSistema: true, ...opts })

const CONCEPTOS = [
  // Devengados
  C('SALARIO', 'Salario básico', 'DEVENGADO', 'SISTEMA', { constitutivoSalario: true, afectaIbcSs: true, basePrestaciones: true, baseVacaciones: true, afectaRetefuente: true, cuentaContable: '510506', orden: 10 }),
  C('AUX_TRANSPORTE', 'Auxilio de transporte', 'DEVENGADO', 'SISTEMA', { basePrestaciones: true, cuentaContable: '510527', orden: 20 }),
  C('HORAS_EXTRA', 'Horas extra y recargos', 'DEVENGADO', 'SISTEMA', { constitutivoSalario: true, afectaIbcSs: true, basePrestaciones: true, afectaRetefuente: true, cuentaContable: '510515', orden: 30 }),
  C('COMISION', 'Comisiones', 'DEVENGADO', 'SISTEMA', { constitutivoSalario: true, afectaIbcSs: true, basePrestaciones: true, baseVacaciones: true, afectaRetefuente: true, cuentaContable: '510518', orden: 40 }),
  C('BONIFICACION_C', 'Bonificación constitutiva', 'DEVENGADO', 'SISTEMA', { constitutivoSalario: true, afectaIbcSs: true, basePrestaciones: true, afectaRetefuente: true, cuentaContable: '510524', orden: 50 }),
  C('BONIFICACION_NC', 'Bonificación no constitutiva', 'DEVENGADO', 'SISTEMA', { cuentaContable: '510524', orden: 51 }),
  C('INCAPACIDAD', 'Incapacidad', 'DEVENGADO', 'SISTEMA', { afectaIbcSs: true, basePrestaciones: true, cuentaContable: '510569', orden: 60 }),
  // Deducciones
  C('SALUD_EMP', 'Salud empleado (4%)', 'DEDUCCION', 'SISTEMA', { porcentaje: 0.04, cuentaContable: '237005', orden: 110 }),
  C('PENSION_EMP', 'Pensión empleado (4%)', 'DEDUCCION', 'SISTEMA', { porcentaje: 0.04, cuentaContable: '238030', orden: 120 }),
  C('FSP_EMP', 'Fondo de solidaridad pensional', 'DEDUCCION', 'SISTEMA', { cuentaContable: '238030', orden: 130 }),
  C('RETEFUENTE', 'Retención en la fuente', 'DEDUCCION', 'SISTEMA', { cuentaContable: '236505', orden: 140 }),
  C('PRESTAMO', 'Cuota de préstamo', 'DEDUCCION', 'SISTEMA', { cuentaContable: '123005', orden: 150 }),
  // Provisiones
  C('PROV_CESANTIAS', 'Provisión cesantías', 'PROVISION', 'SISTEMA', { cuentaContable: '261005', orden: 210 }),
  C('PROV_INT_CESANTIAS', 'Provisión intereses cesantías', 'PROVISION', 'SISTEMA', { cuentaContable: '261010', orden: 220 }),
  C('PROV_PRIMA', 'Provisión prima', 'PROVISION', 'SISTEMA', { cuentaContable: '261015', orden: 230 }),
  C('PROV_VACACIONES', 'Provisión vacaciones', 'PROVISION', 'SISTEMA', { cuentaContable: '261020', orden: 240 }),
  // Aportes patronales
  C('APORTE_SALUD', 'Aporte salud empleador', 'APORTE_PATRONAL', 'SISTEMA', { cuentaContable: '510570', orden: 310 }),
  C('APORTE_PENSION', 'Aporte pensión empleador', 'APORTE_PATRONAL', 'SISTEMA', { cuentaContable: '510572', orden: 320 }),
  C('APORTE_ARL', 'Aporte ARL', 'APORTE_PATRONAL', 'SISTEMA', { cuentaContable: '510568', orden: 330 }),
  C('APORTE_CAJA', 'Aporte caja de compensación', 'APORTE_PATRONAL', 'SISTEMA', { cuentaContable: '510575', orden: 340 }),
  C('APORTE_SENA', 'Aporte SENA', 'APORTE_PATRONAL', 'SISTEMA', { cuentaContable: '510578', orden: 350 }),
  C('APORTE_ICBF', 'Aporte ICBF', 'APORTE_PATRONAL', 'SISTEMA', { cuentaContable: '510581', orden: 360 }),
]

export async function seedNomina() {
  for (const p of PARAMETROS) {
    const existe = await prisma.parametroLegal.findFirst({ where: { clave: p.clave, vigenciaDesde: p.desde } })
    if (!existe) {
      await prisma.parametroLegal.create({
        data: { clave: p.clave, valor: p.valor, vigenciaDesde: p.desde, vigenciaHasta: p.hasta ?? null, fuenteLegal: p.fuente, descripcion: p.desc },
      })
    }
  }
  for (const t of TIPOS_HORA) {
    const existe = await prisma.tipoHora.findFirst({ where: { codigo: t.codigo, vigenteDesde: t.desde } })
    if (!existe) {
      await prisma.tipoHora.create({ data: { codigo: t.codigo, nombre: t.nombre, factor: t.factor, vigenteDesde: t.desde, vigenteHasta: t.hasta ?? null } })
    }
  }
  for (const c of CONCEPTOS) {
    await prisma.conceptoNomina.upsert({ where: { codigo: c.codigo }, create: c, update: { nombre: c.nombre, cuentaContable: c.cuentaContable } })
  }
  console.log('Nómina: parámetros legales 2025/2026, tipos de hora (Ley 2466) y conceptos listos')
}
