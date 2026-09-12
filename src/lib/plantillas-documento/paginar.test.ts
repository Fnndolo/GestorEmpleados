import { describe, it, expect } from 'vitest'
import { paginar, type BloqueMedido } from './paginar'

const L = 16 // interlineado
const parrafo = (lineas: number, margenAbajo = 10): BloqueMedido => ({ alto: lineas * L, margenArriba: 0, margenAbajo, interlineado: L, divisible: true })
const firma = (alto: number, margenArriba = 16): BloqueMedido => ({ alto, margenArriba, margenAbajo: 0, interlineado: L, divisible: false })

describe('paginar', () => {
  it('todo en una página cuando cabe', () => {
    const paginas = paginar([parrafo(3), parrafo(2), firma(100)], 574)
    expect(paginas).toHaveLength(1)
    expect(paginas[0].map((t) => t.bloque)).toEqual([0, 1, 2])
    expect(paginas[0].every((t) => t.inicio && t.fin)).toBe(true)
  })

  it('la firma no se parte: si no cabe, pasa entera a la siguiente página', () => {
    // 3 líneas (48) + margen 10 = 58; la firma necesita 16 + 100 = 116 → disponible 150: no cabe
    const paginas = paginar([parrafo(3), firma(100)], 150)
    expect(paginas).toHaveLength(2)
    expect(paginas[0].map((t) => t.bloque)).toEqual([0])
    expect(paginas[1]).toEqual([{ bloque: 1, desde: 0, alto: 100, inicio: true, fin: true }])
  })

  it('un párrafo largo se parte por líneas completas', () => {
    // Disponible para 5 líneas exactas: el párrafo de 8 se parte 5 + 3
    const paginas = paginar([parrafo(8)], 5 * L)
    expect(paginas).toHaveLength(2)
    expect(paginas[0]).toEqual([{ bloque: 0, desde: 0, alto: 5 * L, inicio: true, fin: false }])
    expect(paginas[1]).toEqual([{ bloque: 0, desde: 5 * L, alto: 3 * L, inicio: false, fin: true }])
  })

  it('no deja una sola línea huérfana ni viuda: pasa el párrafo entero', () => {
    // Caben 1 línea → no se parte; se va completo a la página 2
    const p1 = paginar([parrafo(4), parrafo(3)], 4 * L + 10 + L)
    expect(p1).toHaveLength(2)
    expect(p1[1][0]).toMatchObject({ bloque: 1, desde: 0, fin: true })
    // Caben 2 de 3 líneas → dejaría 1 viuda: tampoco se parte
    const p2 = paginar([parrafo(4), parrafo(3)], 4 * L + 10 + 2 * L)
    expect(p2).toHaveLength(2)
    expect(p2[0].map((t) => t.bloque)).toEqual([0])
  })

  it('el margen superior cuenta solo al comienzo del bloque y el inferior solo al final', () => {
    // Disponible justo para el párrafo con su margen inferior y la firma con su margen superior
    const paginas = paginar([parrafo(2, 10), firma(50, 20)], 2 * L + 10 + 20 + 50)
    expect(paginas).toHaveLength(1)
  })

  it('un bloque no divisible más alto que la página se muestra igual (desborda) sin ciclar', () => {
    const paginas = paginar([firma(900)], 574)
    expect(paginas).toHaveLength(1)
    expect(paginas[0][0]).toMatchObject({ bloque: 0, alto: 900 })
  })
})
