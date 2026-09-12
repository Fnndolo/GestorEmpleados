import { describe, it, expect } from 'vitest'
import {
  AUTORIZACION_POR_DEFECTO, resolverAutorizacion, tramosDe, sustituirVariables, variablesAutorizacion,
  rolFirmaAutorizacion, type DatosAutorizacion,
} from './autorizacion-datos'

const persona: DatosAutorizacion = {
  ciudadFecha: 'Pasto, Nariño, uno (01) de enero de 2026.',
  nombre: 'ANA PÉREZ',
  cedula: '1.000.000.000 de Pasto (N)',
  cargo: 'ASESORA COMERCIAL',
  genero: 'FEMENINO',
  empresa: { razonSocial: 'KUPOCELL S.A.S.', nit: '900.000.000-1', domicilio: 'Pasto, Calle 1 # 2-3', emailContacto: 'contacto@ejemplo.com' },
}

describe('tramosDe', () => {
  it('separa negrita y subrayado del texto plano', () => {
    expect(tramosDe('Hola **mundo** y __adiós__ fin')).toEqual([
      { texto: 'Hola ' },
      { texto: 'mundo', negrita: true },
      { texto: ' y ' },
      { texto: 'adiós', subrayado: true },
      { texto: ' fin' },
    ])
  })

  it('un texto sin marcas es un solo tramo', () => {
    expect(tramosDe('sin formato')).toEqual([{ texto: 'sin formato' }])
  })

  it('una marca sin cerrar se deja como texto', () => {
    expect(tramosDe('abre **pero no cierra')).toEqual([{ texto: 'abre **pero no cierra' }])
  })
})

describe('sustituirVariables', () => {
  it('reemplaza las conocidas y deja las desconocidas para que el error se vea', () => {
    expect(sustituirVariables('{{nombre}} y {{ inventada }}', { nombre: 'Ana' })).toBe('Ana y {{ inventada }}')
  })
})

describe('variablesAutorizacion', () => {
  it('ajusta calidad, tipo de contrato y género', () => {
    const ops = variablesAutorizacion(persona)
    expect(ops.calidad).toBe('CONTRATISTA INDEPENDIENTE')
    expect(ops.tipo_contrato).toBe('contrato de prestación de servicios')
    expect(ops.identificado).toBe('identificada')
    const lab = variablesAutorizacion({ ...persona, vinculo: 'LABORAL', genero: 'MASCULINO' })
    expect(lab.calidad).toBe('TRABAJADOR')
    expect(lab.tipo_contrato).toBe('contrato de trabajo')
    expect(lab.identificado).toBe('identificado')
    expect(lab.informado).toBe('informado')
  })
})

describe('resolverAutorizacion', () => {
  it('el texto de fábrica se resuelve completo, sin variables sueltas', () => {
    const r = resolverAutorizacion(AUTORIZACION_POR_DEFECTO, persona)
    expect(r.titulo).toBe('AUTORIZACIÓN EXPRESA PARA EL TRATAMIENTO DE DATOS PERSONALES')
    expect(r.parrafos).toHaveLength(5)
    const plano = r.parrafos.map((p) => p.map((t) => t.texto).join('')).join('\n')
    expect(plano).not.toMatch(/\{\{/)
    expect(plano).toContain('Yo, ANA PÉREZ, identificada con cédula de ciudadanía No. 1.000.000.000 de Pasto (N) en calidad de: CONTRATISTA INDEPENDIENTE')
    expect(plano).toContain('KUPOCELL S.A.S. identificada con NIT No. 900.000.000-1')
    expect(plano.endsWith('Atentamente,')).toBe(true)
    // El segundo párrafo conserva el subrayado de la finalidad
    expect(r.parrafos[1].some((t) => t.subrayado && t.texto.startsWith('seguridad de las personas'))).toBe(true)
  })

  it('cada línea es un párrafo y las vacías se ignoran', () => {
    const r = resolverAutorizacion({ titulo: 'T', contenido: 'uno\n\n  \ndos {{nombre}}\n' }, persona)
    expect(r.parrafos.map((p) => p.map((t) => t.texto).join(''))).toEqual(['uno', 'dos ANA PÉREZ'])
  })
})

describe('rolFirmaAutorizacion', () => {
  it('distingue contratista de trabajador', () => {
    expect(rolFirmaAutorizacion()).toBe('Contratista')
    expect(rolFirmaAutorizacion('OPS')).toBe('Contratista')
    expect(rolFirmaAutorizacion('LABORAL')).toBe('Trabajador')
  })
})
