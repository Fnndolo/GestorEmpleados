import Image from 'next/image'

/**
 * Portada de Ajustes: quién es la empresa, antes que el formulario.
 *
 * Los datos que muestra son los que encabezan contratos, certificaciones y
 * actas, así que verlos de un vistazo —y notar los que faltan— importa más que
 * llegar directo a los campos editables.
 */
export function IdentidadEmpresa({ nombreComercial, razonSocial, nit, representanteLegal, sedes, colaboradores }: {
  nombreComercial: string
  razonSocial: string
  nit: string
  representanteLegal: string
  sedes: number
  colaboradores: number
}) {
  const nombre = nombreComercial || razonSocial

  return (
    <div className="mb-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-3 sm:gap-4">
      {/* La marca: el mismo ícono de la app (el del manifiesto PWA). Va sobre
          blanco porque la imagen ya trae ese fondo, y así se ve igual en modo
          oscuro. Se amplía un poco porque el ícono trae margen propio. */}
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border bg-white sm:size-16 sm:rounded-2xl">
        <Image src="/icono-192.png" alt="Smart Gadgets" width={64} height={64} className="size-full scale-[1.2] object-contain" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-bold tracking-tight sm:text-xl">{nombre || 'Sin nombre'}</p>
        {nombreComercial && razonSocial && nombreComercial !== razonSocial && (
          <p className="truncate text-xs text-muted-foreground">{razonSocial}</p>
        )}
      </div>
      </div>
      {/* El representante (el dato más largo) a lo ancho en el celular; en fila desde sm. */}
      <dl className="mt-3 grid grid-cols-[1.7fr_0.7fr_1.2fr] gap-2 sm:grid-cols-5">
        <Dato etiqueta="Representante legal" valor={representanteLegal} className="col-span-3 sm:order-2 sm:col-span-2" />
        <Dato etiqueta="NIT" valor={nit} mono className="sm:order-1" />
        <Dato etiqueta="Sedes" valor={String(sedes)} className="sm:order-3" />
        <Dato etiqueta="Colaboradores" valor={String(colaboradores)} className="sm:order-4" />
      </dl>
    </div>
  )
}

function Dato({ etiqueta, valor, mono, className }: { etiqueta: string; valor: string; mono?: boolean; className?: string }) {
  const falta = !valor.trim() || valor.trim().toLowerCase() === 'por definir'
  return (
    <div className={`min-w-0 rounded-lg bg-muted/50 px-2.5 py-1.5 ${className ?? ''}`}>
      <dt className="text-[11px] text-muted-foreground">{etiqueta}</dt>
      <dd className={falta ? 'truncate text-[13px] font-semibold text-amber-600 sm:text-sm dark:text-amber-400' : `truncate text-[13px] font-semibold sm:text-sm${mono ? ' tabular-nums' : ''}`} title={falta ? undefined : valor}>
        {falta ? 'Sin definir' : valor}
      </dd>
    </div>
  )
}
