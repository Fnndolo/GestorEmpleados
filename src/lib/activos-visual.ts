import {
  Laptop, Smartphone, Monitor, Armchair, Printer, Keyboard, Headphones, Tablet, Car, Wrench, Package, Shirt, HardHat,
  Glasses, Hand, Footprints, Ear, Wind, Shield, type LucideIcon,
} from 'lucide-react'

/**
 * Cómo se ilustra cada cosa que la empresa entrega. Sin foto, la tarjeta
 * muestra el ícono que corresponde al tipo (escrito libre, así que se busca
 * por palabras); con foto, la foto.
 */

const ICONOS_ACTIVO: [RegExp, LucideIcon][] = [
  [/celular|tel[eé]fono|m[oó]vil|smartphone|iphone/i, Smartphone],
  [/tablet|ipad/i, Tablet],
  [/port[aá]til|laptop|computador|pc|equipo de c[oó]mputo/i, Laptop],
  [/monitor|pantalla|televisor|tv/i, Monitor],
  [/silla/i, Armchair],
  [/impresora|escáner|escaner/i, Printer],
  [/teclado|mouse|rat[oó]n/i, Keyboard],
  [/aud[ií]fono|diadema|headset/i, Headphones],
  [/veh[ií]culo|moto|carro|camioneta/i, Car],
  [/herramienta|taladro|destornillador/i, Wrench],
]

const ICONOS_EPP: [RegExp, LucideIcon][] = [
  [/casco/i, HardHat],
  [/gafa|lente|careta|visor/i, Glasses],
  [/guante/i, Hand],
  [/bota|calzado|zapato/i, Footprints],
  [/tap[oó]n|auditiv|orejera/i, Ear],
  [/tapabocas|mascarilla|respirador/i, Wind],
  [/chaleco|arn[eé]s|overol|delantal/i, Shield],
]

export function iconoActivo(tipo: string, nombre = ''): LucideIcon {
  const texto = `${tipo} ${nombre}`
  return ICONOS_ACTIVO.find(([re]) => re.test(texto))?.[1] ?? Package
}

export function iconoEpp(elemento: string): LucideIcon {
  return ICONOS_EPP.find(([re]) => re.test(elemento))?.[1] ?? HardHat
}

export const ICONO_DOTACION: LucideIcon = Shirt

/** URL de la foto del activo (con el path como versión, para que cambie al reemplazarla). */
export function urlFotoActivo(activoId: string, fotoPath: string | null | undefined): string | null {
  return fotoPath ? `/api/activos/${activoId}/foto?v=${encodeURIComponent(fotoPath)}` : null
}
