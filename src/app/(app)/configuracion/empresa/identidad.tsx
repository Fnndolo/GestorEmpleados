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
    <div className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      {/* La marca: el mismo ícono de la app (el del manifiesto PWA). Va sobre
          blanco porque la imagen ya trae ese fondo, y así se ve igual en modo
          oscuro. Se amplía un poco porque el ícono trae margen propio. */}
      <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-white">
        <Image src="/icono-192.png" alt="Smart Gadgets" width={64} height={64} className="size-full scale-[1.2] object-contain" />
      </span>

      <div className="min-w-0 flex-1 basis-64">
        <p className="truncate text-xl font-bold tracking-tight">{nombre || 'Sin nombre'}</p>
        {nombreComercial && razonSocial && nombreComercial !== razonSocial && (
          <p className="truncate text-[12.5px] text-muted-foreground">{razonSocial}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Dato etiqueta="NIT" valor={nit} mono />
          <Dato etiqueta="Rep. legal" valor={representanteLegal} />
          <Dato etiqueta="Sedes" valor={String(sedes)} />
          <Dato etiqueta="Colaboradores" valor={String(colaboradores)} />
        </div>
      </div>
    </div>
  )
}

function Dato({ etiqueta, valor, mono }: { etiqueta: string; valor: string; mono?: boolean }) {
  const falta = !valor.trim() || valor.trim().toLowerCase() === 'por definir'
  return (
    <span className="rounded-full border px-2.5 py-0.5 text-[11.5px] text-muted-foreground">
      {etiqueta}{' '}
      <b className={falta ? 'font-semibold text-amber-600 dark:text-amber-400' : `font-semibold text-foreground${mono ? ' tabular-nums' : ''}`}>
        {falta ? 'sin definir' : valor}
      </b>
    </span>
  )
}
