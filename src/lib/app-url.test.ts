import { describe, expect, it } from 'vitest'
import { urlApp } from './app-url'

// En pruebas NODE_ENV no es "production", así que cae en el respaldo de
// desarrollo cuando la variable no está definida.
describe('urlApp', () => {
  it('normaliza la ruta con y sin barra inicial', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://ejemplo.co'
    expect(urlApp('/login')).toBe('https://ejemplo.co/login')
    expect(urlApp('login')).toBe('https://ejemplo.co/login')
  })

  it('descarta la barra final de la variable, sin dejar dobles barras', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://ejemplo.co/'
    expect(urlApp('/firmar-acuerdo/abc')).toBe('https://ejemplo.co/firmar-acuerdo/abc')
    expect(urlApp()).toBe('https://ejemplo.co')
  })
})
