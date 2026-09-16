import { describe, it, expect } from 'vitest'
import {
  AUTORIZACION_POR_DEFECTO, AUTORIZACION_LABORAL_POR_DEFECTO, autorizacionPorDefecto, categoriaAutorizacion,
  resolverAutorizacion, tramosDe, marcadorDe, sustituirVariables, variablesAutorizacion,
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

const plano = (r: ReturnType<typeof resolverAutorizacion>) =>
  r.parrafos.map((p) => p.tramos.map((t) => t.texto).join('')).join('\n')

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

describe('marcadorDe', () => {
  it('reconoce viñeta, casilla y numeración, y deja el resto como párrafo', () => {
    expect(marcadorDe('- uno')).toEqual({ vineta: '•', texto: 'uno' })
    expect(marcadorDe('• uno')).toEqual({ vineta: '•', texto: 'uno' })
    expect(marcadorDe('✓ dos')).toEqual({ vineta: '✓', texto: 'dos' })
    expect(marcadorDe('12. tres')).toEqual({ vineta: '12.', texto: 'tres' })
    expect(marcadorDe('SECCIÓN 1: algo')).toEqual({ texto: 'SECCIÓN 1: algo' })
    // Un guion pegado o un número sin punto no son lista
    expect(marcadorDe('-sin espacio')).toEqual({ texto: '-sin espacio' })
    expect(marcadorDe('2026 fue')).toEqual({ texto: '2026 fue' })
  })
})

describe('sustituirVariables', () => {
  it('reemplaza las conocidas y deja las desconocidas para que el error se vea', () => {
    expect(sustituirVariables('{{nombre}} y {{ inventada }}', { nombre: 'Ana' })).toBe('Ana y {{ inventada }}')
  })

  it('no deja punto doble cuando el valor ya termina en punto', () => {
    expect(sustituirVariables('ofrecidos por {{empresa}}.', { empresa: 'KUPOCELL S.A.S.' })).toBe('ofrecidos por KUPOCELL S.A.S.')
    expect(sustituirVariables('ofrecidos por {{empresa}}.', { empresa: 'KUPOCELL SAS' })).toBe('ofrecidos por KUPOCELL SAS.')
    // Los puntos suspensivos se respetan
    expect(sustituirVariables('etcétera...', {})).toBe('etcétera...')
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
  it('el texto de fábrica OPS se resuelve completo, sin variables sueltas', () => {
    const r = resolverAutorizacion(AUTORIZACION_POR_DEFECTO, persona)
    expect(r.titulo).toBe('AUTORIZACIÓN EXPRESA PARA EL TRATAMIENTO DE DATOS PERSONALES')
    expect(r.parrafos).toHaveLength(5)
    expect(r.notas).toHaveLength(0)
    const texto = plano(r)
    expect(texto).not.toMatch(/\{\{/)
    expect(texto).toContain('Yo, ANA PÉREZ, identificada con cédula de ciudadanía No. 1.000.000.000 de Pasto (N) en calidad de: CONTRATISTA INDEPENDIENTE')
    expect(texto).toContain('KUPOCELL S.A.S. identificada con NIT No. 900.000.000-1')
    expect(texto.endsWith('Atentamente,')).toBe(true)
    // El segundo párrafo conserva el subrayado de la finalidad
    expect(r.parrafos[1].tramos.some((t) => t.subrayado && t.texto.startsWith('seguridad de las personas'))).toBe(true)
    expect(r.parrafos.every((p) => !p.vineta)).toBe(true)
  })

  it('el texto de fábrica laboral trae listas, la nota bajo la firma y ninguna variable suelta', () => {
    const r = resolverAutorizacion(AUTORIZACION_LABORAL_POR_DEFECTO, { ...persona, vinculo: 'LABORAL' })
    const texto = plano(r)
    expect(texto).not.toMatch(/\{\{/)
    expect(texto).toContain('Yo, ANA PÉREZ, identificada con cédula de ciudadanía No. 1.000.000.000 de Pasto (N), en calidad de: TRABAJADOR, AUTORIZO EXPRESAMENTE a la empresa KUPOCELL S.A.S. en calidad de EMPLEADOR')
    expect(texto).toContain('con domicilio en Pasto, Calle 1 # 2-3, correo electrónico contacto@ejemplo.com')
    expect(r.parrafos.filter((p) => p.vineta === '•')).toHaveLength(3)
    expect(r.parrafos.filter((p) => p.vineta === '✓')).toHaveLength(4)
    expect(r.parrafos.map((p) => p.vineta).filter((v) => /^\d\.$/.test(v ?? ''))).toEqual(['1.', '2.', '3.'])
    // La finalidad numerada conserva la negrita del encabezado
    expect(r.parrafos.find((p) => p.vineta === '1.')?.tramos[0]).toEqual({ texto: 'Protección de bienes y seguridad integral', negrita: true })
    expect(texto.endsWith('Atentamente,')).toBe(true)
    expect(r.notas).toHaveLength(1)
    expect(r.notas[0].map((t) => t.texto).join('')).toMatch(/^El tratamiento de los datos personales se realiza conforme a la Ley 1581 de 2012/)
  })

  it('cada línea es un párrafo y las vacías se ignoran', () => {
    const r = resolverAutorizacion({ titulo: 'T', contenido: 'uno\n\n  \ndos {{nombre}}\n' }, persona)
    expect(r.parrafos.map((p) => p.tramos.map((t) => t.texto).join(''))).toEqual(['uno', 'dos ANA PÉREZ'])
  })
})

describe('una plantilla por vínculo', () => {
  it('cada vínculo tiene su categoría y su texto de fábrica', () => {
    expect(categoriaAutorizacion('OPS')).toBe('AUTORIZACION_DATOS')
    expect(categoriaAutorizacion('LABORAL')).toBe('AUTORIZACION_DATOS_LABORAL')
    expect(autorizacionPorDefecto('OPS')).toBe(AUTORIZACION_POR_DEFECTO)
    expect(autorizacionPorDefecto('LABORAL')).toBe(AUTORIZACION_LABORAL_POR_DEFECTO)
    expect(AUTORIZACION_LABORAL_POR_DEFECTO.contenido).not.toBe(AUTORIZACION_POR_DEFECTO.contenido)
  })
})

describe('rolFirmaAutorizacion', () => {
  it('distingue contratista de trabajador', () => {
    expect(rolFirmaAutorizacion()).toBe('Contratista')
    expect(rolFirmaAutorizacion('OPS')).toBe('Contratista')
    expect(rolFirmaAutorizacion('LABORAL')).toBe('Trabajador')
  })
})
