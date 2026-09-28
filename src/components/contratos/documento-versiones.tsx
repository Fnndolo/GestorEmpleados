import { CircleCheck, Clock, ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VerDocumento } from './fila-documento'

/** Una versión archivada del documento (la más reciente primero). */
export type VersionDocumento = { id: string; nombre: string; fecha: string }

/** Cómo va la firma de cada parte, para mostrarla dentro de la fila del documento. */
export type FirmaParte = { rol: string; texto: string; ok: boolean }

/**
 * Un documento del contrato en UNA fila: su versión vigente (la última que se
 * generó: la firmada si ya la hay), el estado y la firma de cada parte ahí
 * mismo, y las versiones anteriores plegadas en «Historial». Antes cada versión
 * y cada firma eran filas sueltas y no se sabía cuál era el documento vigente.
 */
export function DocumentoVersiones({ icono: Icono, titulo, estado, tono, partes, versiones, acciones }: {
  icono: LucideIcon
  titulo: string
  estado: string
  /** Verde si el documento está completo; ámbar si le falta algo. */
  tono?: 'ok' | 'pendiente'
  partes?: FirmaParte[]
  /** La primera es la vigente; el resto va al historial. */
  versiones: VersionDocumento[]
  /** Botones propios del documento (p. ej. firmar), junto al de verlo. */
  acciones?: React.ReactNode
}) {
  const [vigente, ...anteriores] = versiones
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icono className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{titulo}</p>
          <p className={cn('text-xs', tono === 'ok' ? 'text-emerald-600' : tono === 'pendiente' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
            {estado}
          </p>
        </div>
        {(acciones || vigente) && (
          <div className="flex shrink-0 items-center gap-1">
            {acciones}
            {vigente && <VerDocumento documentoId={vigente.id} titulo={vigente.nombre} />}
          </div>
        )}
      </div>

      {/* Debajo y a todo el ancho: en el celular los botones no le quitan espacio. */}
      {partes && partes.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-11">
          {partes.map((p) => (
            <li key={p.rol} className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              {p.ok
                ? <CircleCheck className="size-3 shrink-0 text-emerald-600" />
                : <Clock className="size-3 shrink-0 text-amber-600" />}
              <span className="truncate"><span className="font-medium text-foreground">{p.rol}</span> · {p.texto}</span>
            </li>
          ))}
        </ul>
      )}

      {anteriores.length > 0 && (
        <details className="group mt-1.5 pl-11">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
            Historial · {anteriores.length} versión{anteriores.length === 1 ? '' : 'es'} anterior{anteriores.length === 1 ? '' : 'es'}
          </summary>
          <ul className="mt-1.5 divide-y rounded-lg border px-3">
            {anteriores.map((v) => (
              <li key={v.id} className="flex items-center gap-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate">{v.nombre}</span>
                <span className="shrink-0 text-muted-foreground">{v.fecha}</span>
                <VerDocumento documentoId={v.id} titulo={v.nombre} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}
