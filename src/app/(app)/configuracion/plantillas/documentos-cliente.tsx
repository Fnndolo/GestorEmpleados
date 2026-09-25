'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  FileSignature, FileText, Receipt, ScrollText, Pencil, Eye, FileBadge, Laptop, Undo2, Shirt, HardHat, Clock, type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { enfocarDialogo } from '@/components/ui-kit'
import { GENERAR_CONTRATOS_DESDE_PLANTILLA } from '@/lib/contratos-config'
import type { DatosAutorizacion, PlantillaAutorizacion } from '@/lib/plantillas-documento/autorizacion-datos'
import { TEXTOS, esClaveTexto, type ClaveTexto, type TextoDocumento } from '@/lib/plantillas-documento/textos'
import { MembretePanel } from './membrete/membrete-panel'
import { EditorAutorizacion } from './autorizacion-datos/editor'
import { PlantillasCliente } from './cuentas-cobro/plantillas-cliente'
import { EditorTexto, type EmpresaPreview } from './textos/editor-texto'
import type { Editor } from './editores'

type Autorizacion = {
  plantilla: PlantillaAutorizacion
  personalizada: boolean
  estado: string
  empresa: DatosAutorizacion['empresa']
}

export type TextoEditable = {
  plantilla: TextoDocumento
  personalizada: boolean
  estado: string
}

type Props = {
  /** Editor que debe abrirse de entrada (`?abrir=…`, para enlaces viejos y avisos). */
  abrirInicial: Editor | null
  puedeEditar: boolean
  membrete: { tieneMembrete: boolean; pie: string }
  /** Autorización de datos del contratista OPS. */
  autorizacion: Autorizacion
  /** Autorización de datos del trabajador con contrato laboral. */
  autorizacionLaboral: Autorizacion
  cuentasCobro: {
    plantillas: React.ComponentProps<typeof PlantillasCliente>['plantillas']
    empresa: { razonSocial: string; nit: string }
  }
  plantillasContrato: number
  /** Textos editables: actas de Mis entregas, orden de pago de horas extra y certificaciones. */
  textos: Record<ClaveTexto, TextoEditable>
  empresaTextos: EmpresaPreview
}

type Fila = { clave: Editor; icono: LucideIcon; titulo: string; desc: string; muestra: string | null }

const ICONO_TEXTO: Record<ClaveTexto, LucideIcon> = {
  CERTIFICACION_LABORAL: FileBadge,
  CERTIFICACION_CONTRACTUAL: FileBadge,
  ACTA_ACTIVO_ENTREGA: Laptop,
  ACTA_ACTIVO_DEVOLUCION: Undo2,
  ACTA_DOTACION: Shirt,
  ACTA_EPP: HardHat,
  ORDEN_PAGO_HORAS_EXTRA: Clock,
}

function filaTexto(clave: ClaveTexto): Fila {
  const def = TEXTOS[clave]
  const variante = def.variantes[0]?.valor
  return {
    clave, icono: ICONO_TEXTO[clave], titulo: def.nombre, desc: def.descripcion,
    muestra: `/api/configuracion/membrete/muestra?tipo=texto&clave=${clave}${variante ? `&variante=${variante}` : ''}`,
  }
}

/** La lista, por grupos: los de la vinculación, las certificaciones, las actas de Mis entregas y la nómina. */
const GRUPOS: { titulo: string; filas: Fila[] }[] = [
  {
    titulo: 'Vinculación',
    filas: [
      {
        clave: 'membrete', icono: FileSignature, titulo: 'Papel membretado',
        desc: 'El fondo (logo, marca de agua y pie de contacto) de todos los documentos legales que genera la app.',
        muestra: null,
      },
      {
        clave: 'autorizacion', icono: ScrollText, titulo: 'Autorización de datos · Contrato OPS',
        desc: 'Se genera con cada contrato de prestación de servicios y la firma el contratista. Texto editable con vista previa al instante.',
        muestra: '/api/configuracion/membrete/muestra?tipo=autorizacion',
      },
      {
        clave: 'autorizacion-laboral', icono: ScrollText, titulo: 'Autorización de datos · Contrato laboral',
        desc: 'Se genera con cada contrato de trabajo y la firma el trabajador: monitoreo de productividad, huella, videovigilancia e imagen promocional.',
        muestra: '/api/configuracion/membrete/muestra?tipo=autorizacion-laboral',
      },
      {
        clave: 'cuentas-cobro', icono: Receipt, titulo: 'Cuenta de cobro',
        desc: 'La radican los contratistas OPS desde su autoservicio. Puede haber varias plantillas (días laborados, bonos, servicios…).',
        muestra: '/api/configuracion/membrete/muestra?tipo=cuenta-cobro',
      },
    ],
  },
  { titulo: 'Certificaciones', filas: [filaTexto('CERTIFICACION_LABORAL'), filaTexto('CERTIFICACION_CONTRACTUAL')] },
  {
    titulo: 'Actas de Mis entregas',
    filas: [filaTexto('ACTA_ACTIVO_ENTREGA'), filaTexto('ACTA_ACTIVO_DEVOLUCION'), filaTexto('ACTA_DOTACION'), filaTexto('ACTA_EPP')],
  },
  { titulo: 'Nómina', filas: [filaTexto('ORDEN_PAGO_HORAS_EXTRA')] },
]

/**
 * Lista de los documentos que la aplicación genera sola. Cada "Editar" abre su
 * editor en una ventana emergente centrada: no hay pestañas ni páginas aparte.
 */
export function DocumentosPlantillas({
  abrirInicial, puedeEditar, membrete, autorizacion, autorizacionLaboral, cuentasCobro, plantillasContrato, textos, empresaTextos,
}: Props) {
  const [abierto, setAbierto] = useState<Editor | null>(abrirInicial)

  function cerrar() {
    setAbierto(null)
    // Si se llegó con ?abrir=…, se limpia la URL para que recargar no vuelva a abrirlo.
    if (abrirInicial && typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }

  const n = cuentasCobro.plantillas.length
  const estado: Record<string, string> = {
    membrete: membrete.tieneMembrete ? 'Propio' : 'De la app',
    autorizacion: autorizacion.estado,
    'autorizacion-laboral': autorizacionLaboral.estado,
    'cuentas-cobro': `${n} plantilla${n === 1 ? '' : 's'}`,
    ...Object.fromEntries(Object.entries(textos).map(([k, t]) => [k, t.estado])),
  }

  const textoAbierto = esClaveTexto(abierto) ? abierto : null

  return (
    <>
      {/* Una fila por plantilla: ícono, nombre y estado; a la derecha solo íconos
          (ver muestra, editar). La descripción, solo en pantallas anchas. */}
      <Card className="py-0"><CardContent className="p-0">
        {GRUPOS.map((g) => (
          <div key={g.titulo} className="border-b last:border-b-0">
            <p className="bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.titulo}</p>
            <div className="divide-y">
              {g.filas.map((f) => (
                <FilaPlantilla
                  key={f.clave}
                  icono={f.icono} titulo={f.titulo} desc={f.desc} estado={estado[f.clave]}
                  muestra={f.muestra}
                  editar={{ etiqueta: puedeEditar ? 'Editar' : 'Ver', onClick: () => setAbierto(f.clave) }}
                />
              ))}

              {g.titulo === 'Vinculación' && GENERAR_CONTRATOS_DESDE_PLANTILLA && (
                <FilaPlantilla
                  icono={FileText} titulo="Contratos" desc="Texto de los contratos laborales y OPS que se redactan dentro de la app."
                  estado={`${plantillasContrato} plantilla${plantillasContrato === 1 ? '' : 's'}`}
                  muestra="/api/configuracion/membrete/muestra?tipo=contrato-ops"
                  editar={{ etiqueta: 'Editar', href: '/configuracion/plantillas/contratos' }}
                />
              )}
            </div>
          </div>
        ))}
      </CardContent></Card>

      {/* Papel membretado */}
      <Dialog open={abierto === 'membrete'} onOpenChange={(o) => !o && cerrar()}>
        <DialogContent onOpenAutoFocus={enfocarDialogo} aria-describedby={undefined} className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Papel membretado</DialogTitle>
          </DialogHeader>
          <MembretePanel tieneMembrete={membrete.tieneMembrete} puedeEditar={puedeEditar} pie={membrete.pie} />
        </DialogContent>
      </Dialog>

      {/* Autorización de datos · OPS */}
      <Dialog open={abierto === 'autorizacion'} onOpenChange={(o) => !o && cerrar()}>
        <DialogContent onOpenAutoFocus={enfocarDialogo} aria-describedby={undefined} className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Autorización de datos · Contrato OPS</DialogTitle>
          </DialogHeader>
          <EditorAutorizacion
            vinculo="OPS"
            plantilla={autorizacion.plantilla}
            personalizada={autorizacion.personalizada}
            puedeEditar={puedeEditar}
            empresa={autorizacion.empresa}
          />
        </DialogContent>
      </Dialog>

      {/* Autorización de datos · Laboral */}
      <Dialog open={abierto === 'autorizacion-laboral'} onOpenChange={(o) => !o && cerrar()}>
        <DialogContent onOpenAutoFocus={enfocarDialogo} aria-describedby={undefined} className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Autorización de datos · Contrato laboral</DialogTitle>
          </DialogHeader>
          <EditorAutorizacion
            vinculo="LABORAL"
            plantilla={autorizacionLaboral.plantilla}
            personalizada={autorizacionLaboral.personalizada}
            puedeEditar={puedeEditar}
            empresa={autorizacionLaboral.empresa}
          />
        </DialogContent>
      </Dialog>

      {/* Cuentas de cobro */}
      <Dialog open={abierto === 'cuentas-cobro'} onOpenChange={(o) => !o && cerrar()}>
        <DialogContent onOpenAutoFocus={enfocarDialogo} aria-describedby={undefined} className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Plantillas de cuenta de cobro</DialogTitle>
          </DialogHeader>
          <PlantillasCliente plantillas={cuentasCobro.plantillas} empresa={cuentasCobro.empresa} />
        </DialogContent>
      </Dialog>

      {/* Textos editables: un solo diálogo, con el editor del texto abierto. */}
      <Dialog open={textoAbierto !== null} onOpenChange={(o) => !o && cerrar()}>
        <DialogContent onOpenAutoFocus={enfocarDialogo} aria-describedby={undefined} className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
          {textoAbierto && (
            <>
              <DialogHeader>
                <DialogTitle>{TEXTOS[textoAbierto].nombre}</DialogTitle>
              </DialogHeader>
              <EditorTexto
                key={textoAbierto}
                clave={textoAbierto}
                plantilla={textos[textoAbierto].plantilla}
                personalizada={textos[textoAbierto].personalizada}
                puedeEditar={puedeEditar}
                empresa={empresaTextos}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Fila de la lista: ícono, nombre y estado; ver muestra y editar como íconos. */
function FilaPlantilla({ icono: Icono, titulo, desc, estado, muestra, editar }: {
  icono: LucideIcon; titulo: string; desc: string; estado: string; muestra: string | null
  editar: { etiqueta: string; onClick?: () => void; href?: string }
}) {
  const icono = buttonVariants({ variant: 'ghost', size: 'icon' })
  return (
    <div className="flex items-center gap-3 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-foreground text-background">
        <Icono className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{titulo}</p>
        <p className="truncate text-xs text-muted-foreground">
          {estado}<span className="hidden sm:inline"> · {desc}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        {muestra && (
          <VisorPdf url={muestra} titulo={`Muestra · ${titulo}`} className={icono}>
            <Eye className="size-4" /><span className="sr-only">Ver muestra en PDF</span>
          </VisorPdf>
        )}
        {editar.href ? (
          <Link href={editar.href} className={icono} aria-label={`${editar.etiqueta} ${titulo}`} title={editar.etiqueta}>
            <Pencil className="size-4" />
          </Link>
        ) : (
          <Button variant="ghost" size="icon" onClick={editar.onClick} aria-label={`${editar.etiqueta} ${titulo}`} title={editar.etiqueta}>
            <Pencil className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
