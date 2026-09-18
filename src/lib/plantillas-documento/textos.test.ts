import { describe, it, expect } from 'vitest'
import {
  CLAVES_TEXTO, TEXTOS, conTablaImplicita, resolverOpcionales, resolverTexto, variablesActaActivo, variablesCertificacion,
  variablesOrdenPago, type BloqueTexto,
} from './textos'
import { muestraTexto } from './textos-muestra'

const EMPRESA = { razonSocial: 'KUPOCELL S.A.S.', nombreComercial: 'Smart Gadgets', nit: '900.000.000-1' }

const plano = (bloques: BloqueTexto[]) =>
  bloques.map((b) => (b.tipo === 'tabla' ? '[tabla]' : b.parrafo.tramos.map((t) => t.texto).join(''))).join('\n')

describe('resolverOpcionales', () => {
  it('quita el trozo cuando una de sus variables está vacía y lo deja cuando todas tienen valor', () => {
    expect(resolverOpcionales('documento 1[[, en su cargo de {{cargo}}]], recibe', { cargo: '' })).toBe('documento 1, recibe')
    expect(resolverOpcionales('documento 1[[, en su cargo de {{cargo}}]], recibe', { cargo: 'CAJERA' })).toBe('documento 1, en su cargo de CAJERA, recibe')
  })

  it('se anida: el trozo de adentro se decide primero', () => {
    const t = '[[Honorarios de {{total}}[[, en cuotas de {{cuota}}]].]]'
    expect(resolverOpcionales(t, { total: '$ 9', cuota: '$ 1' })).toBe('Honorarios de $ 9, en cuotas de $ 1.')
    expect(resolverOpcionales(t, { total: '$ 9', cuota: '' })).toBe('Honorarios de $ 9.')
    expect(resolverOpcionales(t, { total: '', cuota: '$ 1' })).toBe('')
  })

  it('una variable desconocida no anula el trozo: queda a la vista', () => {
    expect(resolverOpcionales('[[ver {{inventada}}]]', {})).toBe('ver {{inventada}}')
  })
})

describe('resolverTexto', () => {
  it('pone las variables, marca la tabla, descarta las líneas vacías y separa las notas', () => {
    const r = resolverTexto(
      { titulo: 'Acta de {{que}}', contenido: 'Hola **{{nombre}}**\n[tabla]\n[[Cargo: {{cargo}}]]\n- punto\n~ nota al pie de {{nombre}}' },
      { que: 'entrega', nombre: 'Ana', cargo: '' },
    )
    expect(r.titulo).toBe('Acta de entrega')
    expect(r.bloques).toHaveLength(3)
    expect(r.bloques[0]).toEqual({ tipo: 'parrafo', parrafo: { tramos: [{ texto: 'Hola ' }, { texto: 'Ana', negrita: true }] } })
    expect(r.bloques[1]).toEqual({ tipo: 'tabla' })
    expect(r.bloques[2]).toEqual({ tipo: 'parrafo', parrafo: { tramos: [{ texto: 'punto' }], vineta: '•' } })
    expect(r.notas).toEqual([[{ texto: 'nota al pie de Ana' }]])
  })

  it('un segundo [tabla] se ignora', () => {
    const r = resolverTexto({ titulo: 't', contenido: '[tabla]\nx\n[TABLA]' }, {})
    expect(r.bloques.filter((b) => b.tipo === 'tabla')).toHaveLength(1)
  })

  it('sin [tabla] la tabla va tras el primer párrafo', () => {
    const r = resolverTexto({ titulo: 't', contenido: 'uno\ndos' }, {})
    expect(plano(conTablaImplicita(r.bloques))).toBe('uno\n[tabla]\ndos')
    expect(plano(conTablaImplicita([]))).toBe('[tabla]')
  })
})

describe('variables', () => {
  const base = { colaborador: { nombre: 'Ana Pérez', documento: '1.000', cargo: null }, empresa: EMPRESA, ciudad: 'Pasto', fecha: new Date(Date.UTC(2026, 0, 15)) }

  it('acta de activos: singular o plural, y el total solo si hay valores', () => {
    const uno = variablesActaActivo({ ...base, activos: [{ codigo: 'A1', nombre: 'Portátil', valor: null }] })
    expect(uno.activos).toBe('el siguiente activo')
    expect(uno.los_activos).toBe('el activo')
    expect(uno.total).toBe('')
    expect(uno.cargo).toBe('')
    expect(uno.fecha).toBe('15 de enero de 2026')
    const varios = variablesActaActivo({ ...base, activos: [{ codigo: 'A1', nombre: 'Portátil', valor: 1000 }, { codigo: 'A2', nombre: 'Celular', valor: 500 }] })
    expect(varios.activos).toBe('los siguientes 2 activos')
    expect(varios.lista).toBe('Portátil (A1), Celular (A2)')
    expect(varios.total).toContain('1.500')
  })

  it('certificación laboral: el salario solo en los tipos que lo llevan; las funciones solo en la de funciones', () => {
    const colaborador = {
      nombres: 'Ana', apellidos: 'Pérez', tipoDocumento: 'CC', numeroDocumento: '1.000', cargo: 'Cajera', funciones: 'Cobrar',
      tipoVinculo: 'TERMINO_FIJO', fechaIngreso: new Date(Date.UTC(2025, 2, 1)), salario: 1_800_000,
    }
    const d = { clase: 'LABORAL' as const, dirigidaA: null, empresa: EMPRESA, colaborador, ciudad: 'Pasto', fecha: new Date(Date.UTC(2026, 0, 15)) }
    expect(variablesCertificacion({ ...d, tipo: 'SIMPLE' })).toMatchObject({ nombre: 'ANA PÉREZ', tipo_contrato: 'Término fijo', salario: '', funciones: '', destinatario: '' })
    expect(variablesCertificacion({ ...d, tipo: 'CON_SALARIO' }).salario).toContain('1.800.000')
    expect(variablesCertificacion({ ...d, tipo: 'ENTIDAD_FINANCIERA', dirigidaA: 'Banco' })).toMatchObject({ salario_letras: '1.800.000 pesos M/CTE', destinatario: 'Banco' })
    expect(variablesCertificacion({ ...d, tipo: 'CON_FUNCIONES' })).toMatchObject({ salario: '', funciones: 'Cobrar' })
  })

  it('certificación contractual: sin contrato OPS no hay número, fin ni honorarios', () => {
    const colaborador = {
      nombres: 'Luis', apellidos: 'Ruiz', tipoDocumento: 'CC', numeroDocumento: '2.000', cargo: null, funciones: null,
      tipoVinculo: 'OPS', fechaIngreso: new Date(Date.UTC(2026, 0, 1)), salario: null,
    }
    const sin = variablesCertificacion({ tipo: 'CON_SALARIO', clase: 'CONTRACTUAL', dirigidaA: null, empresa: EMPRESA, colaborador, contratoOps: null, ciudad: 'Pasto', fecha: new Date(Date.UTC(2026, 0, 15)) })
    expect(sin).toMatchObject({ contrato_numero: '', contrato_fin: '', honorarios: '', contrato_inicio: '1 de enero de 2026' })
    expect('tipo_contrato' in sin).toBe(false)
  })

  it('orden de pago: la cuenta se arma con lo que haya', () => {
    const v = variablesOrdenPago({
      empresa: EMPRESA, numero: 'OP-1', fecha: new Date(Date.UTC(2026, 0, 15)),
      colaborador: { nombre: 'Ana', documento: '1', banco: 'Banco', tipoCuenta: null, numeroCuenta: '123' },
      periodo: { desde: '2026-01-01', hasta: '2026-01-15' }, horasExtra: 12.5, valor: 187_500,
    })
    expect(v).toMatchObject({ cuenta: 'Banco 123', horas: '12,5 h', periodo_desde: '1 de enero de 2026', periodo_hasta: '15 de enero de 2026' })
    expect(v.valor).toContain('187.500')
  })
})

describe('textos de fábrica', () => {
  it.each(CLAVES_TEXTO)('%s se resuelve con la muestra sin dejar variables sueltas', (clave) => {
    const def = TEXTOS[clave]
    const variantes = def.variantes.length ? def.variantes.map((v) => v.valor) : ['']
    for (const variante of variantes) {
      const m = muestraTexto(clave, variante, EMPRESA)
      const r = resolverTexto(def.defecto, m.vars)
      const texto = `${r.titulo}\n${plano(r.bloques)}`
      expect(texto, `${clave} ${variante}`).not.toMatch(/\{\{|\[\[|\]\]/)
      expect(r.titulo.length).toBeGreaterThan(3)
      // Toda variable anunciada en la definición existe en la muestra.
      for (const v of def.variables) expect(v.clave in m.vars, `${clave}: ${v.clave}`).toBe(true)
      // Y si el documento lleva tabla, el texto de fábrica dice dónde va.
      if (def.tabla) expect(r.bloques.some((b) => b.tipo === 'tabla')).toBe(true)
    }
  })

  it('la certificación laboral cambia según el tipo pedido', () => {
    const def = TEXTOS.CERTIFICACION_LABORAL.defecto
    const simple = plano(resolverTexto(def, muestraTexto('CERTIFICACION_LABORAL', 'SIMPLE', EMPRESA).vars).bloques)
    const salario = plano(resolverTexto(def, muestraTexto('CERTIFICACION_LABORAL', 'CON_SALARIO', EMPRESA).vars).bloques)
    const funciones = plano(resolverTexto(def, muestraTexto('CERTIFICACION_LABORAL', 'CON_FUNCIONES', EMPRESA).vars).bloques)
    const banco = plano(resolverTexto(def, muestraTexto('CERTIFICACION_LABORAL', 'ENTIDAD_FINANCIERA', EMPRESA).vars).bloques)
    expect(simple).not.toContain('Devenga')
    expect(simple).not.toContain('Funciones')
    expect(simple).toContain('a solicitud del interesado en Ciudad de muestra')
    expect(salario).toContain('Devenga una asignación salarial mensual de')
    expect(funciones).toContain('Funciones del cargo: Atender')
    expect(banco).toContain('dirigida a Banco de muestra,')
  })

  it('el acta de activos no deja "en su cargo de" colgando cuando no hay cargo', () => {
    const m = muestraTexto('ACTA_ACTIVO_ENTREGA', 'uno', EMPRESA)
    const r = resolverTexto(TEXTOS.ACTA_ACTIVO_ENTREGA.defecto, { ...m.vars, cargo: '' })
    expect(plano(r.bloques)).toContain('con documento 1.000.000.000, recibe el siguiente activo')
  })
})
