import { prisma } from '@/lib/db'
import { Card, CardContent } from '@/components/ui/card'
import { Encabezado } from '@/components/shell/encabezado'
import { aplicaTramite, type Tramite } from '@/lib/tramites-vinculo'

/** Tipo de vínculo del colaborador, para decidir qué trámites aplican. */
export async function vinculoDe(colaboradorId: string): Promise<string | null> {
  const c = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { tipoVinculo: true } })
  return c?.tipoVinculo ?? null
}

/**
 * ¿Puede este colaborador entrar a la pantalla del trámite? Ocultar el tile del
 * panel no basta: la URL sigue siendo accesible a mano.
 */
export async function tramiteAplica(colaboradorId: string, tramite: Tramite): Promise<boolean> {
  return aplicaTramite(await vinculoDe(colaboradorId), tramite)
}

/** Pantalla de "este trámite no aplica a tu contrato", con el porqué. */
export function NoAplica({ titulo, motivo }: { titulo: string; motivo: string }) {
  return (
    <div className="max-w-3xl">
      <Encabezado titulo={titulo} />
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Este trámite no aplica a tu contrato</p>
        <p className="mx-auto mt-1.5 max-w-prose">{motivo}</p>
      </CardContent></Card>
    </div>
  )
}
