import { fmtCOP } from '@/lib/moneda'
import { filasLiquidacion, type CifrasLiquidacion, type DetalleLiquidacion, type FilaLiquidacion } from '@/lib/terminaciones/liquidacion-filas'

/**
 * Resumen de la liquidación con la estructura de la colilla que revisa el
 * contador: el total arriba, ingresos y deducciones (lado a lado en pantalla
 * ancha) y las bases al final. Las mismas filas del PDF que firma el trabajador.
 */
export function ResumenLiquidacion({ liq, detalle }: { liq: CifrasLiquidacion; detalle: DetalleLiquidacion | null }) {
  const f = filasLiquidacion(liq, detalle)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2 rounded-lg bg-muted/60 p-3">
        <div>
          <p className="text-xs text-muted-foreground">Total a pagar</p>
          <p className="text-2xl font-semibold tabular-nums text-emerald-600">{fmtCOP(f.total)}</p>
        </div>
        <p className="text-xs text-muted-foreground">{f.dias} días · salario base {fmtCOP(f.salarioBase)}</p>
      </div>

      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
        <Bloque titulo="Ingresos" filas={f.ingresos} total={f.totalIngresos} />
        {(f.deducciones.length > 0 || f.totalDeducciones > 0) && <Bloque titulo="Deducciones" filas={f.deducciones} total={f.totalDeducciones} />}
      </div>

      {/* Las bases son lo primero que revisa el contador: de ellas salen cesantías y prima. */}
      {detalle?.baseCesantias != null && (
        <details className="group rounded-lg border px-3 py-2 text-xs">
          <summary className="cursor-pointer select-none font-medium text-muted-foreground">Bases del cálculo</summary>
          <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            <Base k="Cesantías" v={detalle.baseCesantias} ayuda="salario + auxilio + promedio del año" />
            <Base k="Prima" v={detalle.basePrima} ayuda="salario + auxilio + promedio del semestre" />
            <Base k="Vacaciones" v={detalle.baseVacaciones} ayuda="salario ordinario, sin auxilio" />
            <Base k="Seguridad social" v={detalle.baseSeguridadSocial} ayuda="solo lo que constituye salario" />
          </dl>
        </details>
      )}
    </div>
  )
}

function Bloque({ titulo, filas, total }: { titulo: string; filas: FilaLiquidacion[]; total: number }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <dl className="divide-y text-sm">
        {filas.map((x) => (
          <div key={x.k} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="min-w-0">
              {x.k}
              {x.sub && <span className="ml-1.5 text-xs text-muted-foreground">{x.sub}</span>}
            </dt>
            <dd className="shrink-0 tabular-nums">{fmtCOP(x.v)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-1 flex justify-between border-t pt-1.5 text-sm font-medium">
        <span>Total {titulo.toLowerCase()}</span>
        <span className="tabular-nums">{fmtCOP(total)}</span>
      </div>
    </div>
  )
}

function Base({ k, v, ayuda }: { k: string; v: number | undefined; ayuda: string }) {
  if (v == null) return null
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k} <span className="hidden sm:inline">· {ayuda}</span></dt>
      <dd className="shrink-0 tabular-nums">{fmtCOP(v)}</dd>
    </div>
  )
}
