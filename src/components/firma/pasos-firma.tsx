'use client'

import { FileText, Mail, MailCheck, Eye } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { FirmaCaptura } from '@/components/firma/firma-captura'

/**
 * Los tres pasos de firmar un documento en la app, en el mismo orden en todas
 * las pantallas: leer, autorizar con el código del correo y firmar. Cada paso
 * lleva su número y nada más: lo que antes explicaba cada bloque en un párrafo
 * lo dicen ahora el título del paso y el botón.
 */
export type DocumentoAFirmar = { id: string; titulo: string; etiqueta?: string; icono?: React.ElementType }

export function PasosFirma({
  documentos, correoEnviado, enviando, onEnviarCodigo, codigo, onCodigo, onFirma, idCodigo,
}: {
  documentos: DocumentoAFirmar[]
  /** Correo al que ya se mandó el código; null mientras no se pida. */
  correoEnviado: string | null
  enviando: boolean
  onEnviarCodigo: () => void
  codigo: string
  onCodigo: (v: string) => void
  onFirma: (dataUri: string | null) => void
  /** Id único del campo del código (hay un diálogo por contrato en la misma página). */
  idCodigo: string
}) {
  return (
    <div className="space-y-4">
      {documentos.length > 0 && (
        <section>
          <Paso n={1} titulo={documentos.length === 1 ? 'Lee el documento' : 'Lee los documentos'} />
          <ul className="mt-2 divide-y rounded-lg border px-3">
            {documentos.map((d) => {
              const Icono = d.icono ?? FileText
              return (
                <li key={d.id} className="flex items-center gap-2.5 py-2 text-sm">
                  <Icono className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{d.etiqueta ?? d.titulo}</span>
                  <VisorPdf documentoId={d.id} titulo={d.titulo} className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' shrink-0'}>
                    <Eye className="size-3.5" /> Ver
                  </VisorPdf>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section>
        <Paso n={documentos.length > 0 ? 2 : 1} titulo="Código de verificación" />
        {!correoEnviado ? (
          <Button size="sm" variant="outline" className="mt-2" onClick={onEnviarCodigo} disabled={enviando}>
            {enviando ? <Spinner /> : <Mail className="size-4" />} Enviar código a mi correo
          </Button>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
              <MailCheck className="size-4" /> Enviado a {correoEnviado}
            </p>
            <div className="flex items-center gap-2">
              <Input
                id={idCodigo}
                aria-label="Código de 6 dígitos"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="Código de 6 dígitos"
                value={codigo}
                onChange={(e) => onCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="font-mono tracking-[0.3em] placeholder:tracking-normal placeholder:font-sans"
              />
              <Button size="sm" variant="ghost" className="shrink-0" onClick={onEnviarCodigo} disabled={enviando}>
                {enviando ? <Spinner /> : 'Reenviar'}
              </Button>
            </div>
          </div>
        )}
      </section>

      <section>
        <Paso n={documentos.length > 0 ? 3 : 2} titulo="Tu firma" />
        <div className="mt-2">
          <FirmaCaptura onChange={onFirma} />
        </div>
      </section>
    </div>
  )
}

/** Número en tinta y título corto: el orden se ve de un vistazo. */
function Paso({ n, titulo }: { n: number; titulo: string }) {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-bold text-background">{n}</span>
      {titulo}
    </p>
  )
}
