'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIPO_VINCULO_CORTO, MODALIDAD_TRABAJO, ESTADO_COLABORADOR, iniciales, colorAvatar } from '@/lib/etiquetas'

type Colaborador = {
  id: string; nombres: string; apellidos: string; tipoDocumento: string
  numeroDocumento: string; cargo: string | null; sede: string; ciudad: string
  tipoVinculo: string; modalidadTrabajo: string; estado: string; fotoPath: string | null
}
type Tab = { valor: string; conteo: number }

const TAB_LABEL: Record<string, string> = {
  TODOS: 'Todos',
  TERMINO_INDEFINIDO: 'Indefinido',
  TERMINO_FIJO: 'Término fijo',
  OBRA_LABOR: 'Obra/labor',
  APRENDIZ_SENA: 'Aprendices',
  OPS: 'OPS',
  PRACTICANTE: 'Practicantes',
}

const ESTADO_VARIANTE: Record<string, 'default' | 'secondary' | 'outline'> = {
  ACTIVO: 'default', INACTIVO: 'secondary', RETIRADO: 'outline',
}

export function ListaColaboradores({
  colaboradores, tabs, tabActivo, busqueda,
}: {
  colaboradores: Colaborador[]; tabs: Tab[]; tabActivo: string; busqueda: string
}) {
  const router = useRouter()
  const [q, setQ] = useState(busqueda)
  const [, startTransition] = useTransition()

  function navegar(tab: string, texto: string) {
    const params = new URLSearchParams()
    if (tab !== 'TODOS') params.set('tab', tab)
    if (texto.trim()) params.set('q', texto.trim())
    startTransition(() => router.push(`/colaboradores${params.toString() ? `?${params}` : ''}`))
  }

  return (
    <div className="space-y-4">
      {/* Búsqueda */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && navegar(tabActivo, q)}
          placeholder="Buscar por nombre o documento…"
          className="pl-9"
        />
      </div>

      {/* Filtro por vínculo — móvil: desplegable (sin scroll); escritorio: pestañas */}
      <div className="sm:hidden">
        <Select value={tabActivo} onValueChange={(v) => navegar(v, q)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tabs.map((t) => (
              <SelectItem key={t.valor} value={t.valor}>
                {TAB_LABEL[t.valor]} ({t.conteo})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden gap-1.5 overflow-x-auto pb-1 sm:flex">
        {tabs.map((t) => (
          <button
            key={t.valor}
            onClick={() => navegar(t.valor, q)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              tabActivo === t.valor ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
          >
            {TAB_LABEL[t.valor]}
            <span className={cn('rounded-full px-1.5 text-xs', tabActivo === t.valor ? 'bg-primary-foreground/20' : 'bg-background')}>
              {t.conteo}
            </span>
          </button>
        ))}
      </div>

      {/* Lista */}
      {colaboradores.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Users /></EmptyMedia>
            <EmptyTitle>Sin colaboradores</EmptyTitle>
            <EmptyDescription>
              {busqueda ? 'No hay resultados para tu búsqueda.' : 'Aún no hay colaboradores en esta vista.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {colaboradores.map((c) => (
            <Link
              key={c.id}
              href={`/colaboradores/${c.id}`}
              className="flex items-center gap-3 p-3 hover:bg-accent/50 transition-colors"
            >
              <Avatar className="size-10">
                {c.fotoPath && <AvatarImage src={`/api/documentos/foto/${c.id}`} alt="" />}
                <AvatarFallback
                  className="text-xs font-semibold text-white"
                  style={{ backgroundColor: colorAvatar(`${c.nombres} ${c.apellidos}`) }}
                >
                  {iniciales(c.nombres, c.apellidos)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{c.nombres} {c.apellidos}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {c.cargo ?? 'Sin cargo'} · {c.sede}
                </p>
              </div>
              <div className="hidden sm:flex flex-col items-end gap-1">
                <Badge variant="outline" className="text-[10px]">{TIPO_VINCULO_CORTO[c.tipoVinculo]}</Badge>
                <span className="text-[10px] text-muted-foreground">{MODALIDAD_TRABAJO[c.modalidadTrabajo]}</span>
              </div>
              <Badge variant={ESTADO_VARIANTE[c.estado]} className="hidden md:inline-flex">
                {ESTADO_COLABORADOR[c.estado]}
              </Badge>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </CardContent></Card>
      )}
      {colaboradores.length === 200 && (
        <p className="text-xs text-muted-foreground text-center">
          Mostrando los primeros 200 resultados. Usa la búsqueda para refinar.
        </p>
      )}
    </div>
  )
}
