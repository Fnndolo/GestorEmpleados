'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, Save, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { SelectorFirmasPdf, type Posicion } from '@/components/contratos/selector-firmas-pdf'
import { GenerarAutorizacion } from '@/components/contratos/generar-autorizacion'
import { leerComoDataUri, MAX_PDF_BYTES, mensajePdfPesado, subirPdfTemporal } from '@/lib/archivos'
import { analizarPdfContratoOps, subirContratoOpsParaFirma } from '../../ops-acciones'

/**
 * Alta de un contrato OPS aportando el PDF, para firmarse dentro de la app.
 *
 * Se usa cuando el contrato se redactó por fuera y forzar la plantilla saldría
 * peor. A diferencia de «subir contrato existente» (que da por firmado el
 * documento porque venía firmado en físico), este entra al mismo flujo de firma
 * que un contrato de plantilla: el contratista lo firma desde su autoservicio.
 *
 * Los datos estructurados se piden igual que en el alta normal porque no son
 * decoración: nómina, alertas de vencimiento y cuentas de cobro los necesitan.
 */

/**
 * Posición de arranque cuando el PDF no permite proponer nada (escaneos).
 * La página se fija después, al saber cuántas tiene: el bloque de firmas va
 * casi siempre en la última, así que empezar en la 1 obligaba a pasar hojas.
 */
const POR_DEFECTO: Omit<Posicion, 'pagina'> = { x: 80, y: 150, ancho: 150, alto: 45 }

type Props = {
  sedes: { id: string; nombre: string; ciudad: string }[]
  cargos: { id: string; nombre: string }[]
}

export function ContratoOpsSubido({ sedes, cargos }: Props) {
  const router = useRouter()
  const [guardando, empezar] = useTransition()
  const [analizando, setAnalizando] = useState(false)

  // `pdf` es el data URI para la vista previa (local); `pdfRef` es la referencia
  // con que el servidor lee el archivo del depósito temporal.
  const [pdf, setPdf] = useState<string | null>(null)
  const [pdfRef, setPdfRef] = useState<string | null>(null)
  // El mismo archivo, sin codificar: el visor lo muestra desde el navegador.
  const [archivoPdf, setArchivoPdf] = useState<File | null>(null)
  // Cambia con cada PDF elegido: remonta el selector para que vuelva a la página
  // propuesta en vez de quedarse en la que se estaba mirando del archivo anterior.
  const [version, setVersion] = useState(0)
  const [nombrePdf, setNombrePdf] = useState('')
  const [paginas, setPaginas] = useState(1)
  const [detectado, setDetectado] = useState<{ contratista: boolean; contratante: boolean } | null>(null)
  const [posiciones, setPosiciones] = useState<Record<'contratista' | 'contratante', Posicion>>({
    contratista: { ...POR_DEFECTO, pagina: 1 },
    contratante: { ...POR_DEFECTO, pagina: 1 },
  })
  // El PDF ya viene firmado por el representante legal: solo firma el contratista.
  const [contratanteFirmo, setContratanteFirmo] = useState(false)
  // La autorización de datos (Ley 1581) la arma la app y la firma el contratista
  // con el contrato. No siempre hace falta: a veces ya se recogió aparte.
  const [generarAutorizacion, setGenerarAutorizacion] = useState(true)

  const [f, setF] = useState({
    colaboradorId: '', numero: '', cargoId: '', cargoObjeto: '', sedeId: '',
    valorTotal: '', valorMensual: '', supervisorId: '', rut: '',
    fechaInicio: '', fechaFin: '', ciudad: '', fechaSuscripcion: '',
  })
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  async function alElegirPdf(archivo: File) {
    if (archivo.type !== 'application/pdf') { toast.error('El archivo debe ser un PDF.'); return }
    if (archivo.size > MAX_PDF_BYTES) { toast.error(mensajePdfPesado(archivo.size)); return }
    const dataUri = await leerComoDataUri(archivo)
    setPdf(dataUri)
    setArchivoPdf(archivo)
    setNombrePdf(archivo.name)

    // El PDF se sube una vez al depósito temporal: la misma referencia sirve
    // para analizarlo ahora y para crear el contrato después.
    setAnalizando(true)
    let ref: string
    try {
      ref = await subirPdfTemporal(archivo)
    } catch (e) {
      setAnalizando(false); setPdf(null); setArchivoPdf(null)
      toast.error(e instanceof Error ? e.message : 'No se pudo subir el PDF.')
      return
    }
    setPdfRef(ref)

    // La app propone dónde firma cada parte; si el PDF es un escaneo no habrá
    // nada que proponer y se marca a mano sobre el documento.
    const res = await analizarPdfContratoOps({ pdfRef: ref })
    setAnalizando(false)
    if (!res.ok) { toast.error(res.error ?? 'No se pudo leer el PDF.'); return }
    const d = res.datos as { paginas: number; contratista: Posicion | null; contratante: Posicion | null }
    setPaginas(d.paginas)
    // Sin deteccion, se cae a la ULTIMA pagina: es donde va el bloque de firmas.
    setPosiciones({
      contratista: d.contratista ?? { ...POR_DEFECTO, pagina: d.paginas, x: 330 },
      contratante: d.contratante ?? { ...POR_DEFECTO, pagina: d.paginas },
    })
    setDetectado({ contratista: !!d.contratista, contratante: !!d.contratante })
    setVersion((v) => v + 1)
  }

  function guardar() {
    if (!pdf || !pdfRef) { toast.error('Adjunta el PDF del contrato.'); return }
    if (!f.colaboradorId) { toast.error('Selecciona al contratista que va a firmar.'); return }
    if (!f.sedeId) { toast.error('Selecciona la sede.'); return }
    if (!f.fechaInicio || !f.fechaFin) { toast.error('Indica las fechas de inicio y fin.'); return }

    empezar(async () => {
      const res = await subirContratoOpsParaFirma({
        pdfRef,
        colaboradorId: f.colaboradorId,
        numero: f.numero,
        cargoId: f.cargoId,
        cargoObjeto: f.cargoObjeto,
        sedeId: f.sedeId,
        valorTotal: Number(f.valorTotal) || 0,
        valorMensual: f.valorMensual ? Number(f.valorMensual) : undefined,
        supervisorId: f.supervisorId,
        rut: f.rut,
        fechaInicio: f.fechaInicio,
        fechaFin: f.fechaFin,
        ciudad: f.ciudad,
        fechaSuscripcion: f.fechaSuscripcion,
        posicionContratista: posiciones.contratista,
        posicionContratante: contratanteFirmo ? undefined : posiciones.contratante,
        contratanteFirmoEnPdf: contratanteFirmo,
        generarAutorizacion,
      })
      if (!res.ok) { toast.error(res.error ?? 'No se pudo subir el contrato.'); return }
      toast.success(contratanteFirmo
        ? 'Contrato subido. Con la firma del contratista desde su autoservicio quedará completo.'
        : 'Contrato subido. El contratista ya puede firmarlo desde su autoservicio.')
      router.push(`/contratos/ops/${(res.datos as { id: string }).id}`)
    })
  }

  return (
    /* Una sola columna: datos, luego el PDF con la posición de las firmas, y el
       botón al final. Se abre en una ventana emergente; a dos columnas la mitad
       derecha quedaba casi vacía hasta que se elegía el archivo. */
    <Card><CardContent className="space-y-4 py-4">
      {/* ── Datos del contrato ── */}
      <div className="space-y-1.5">
        <Label>Contratista (quien va a firmar)</Label>
        <SelectorColaborador
          value={f.colaboradorId}
          onChange={(id) => set('colaboradorId', id)}
          placeholder="Busca por nombre o documento…"
        />
        <p className="text-[11px] text-muted-foreground">Necesita usuario de acceso: firma desde su autoservicio.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Sede</Label>
          <Select value={f.sedeId} onValueChange={(v) => set('sedeId', v)}>
            <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre} · {s.ciudad}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Cargo (opcional)</Label>
          <Select value={f.cargoId} onValueChange={(v) => { set('cargoId', v); const c = cargos.find((x) => x.id === v); if (c) set('cargoObjeto', c.nombre) }}>
            <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>{cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Rol en el contrato</Label>
          <Input value={f.cargoObjeto} onChange={(e) => set('cargoObjeto', e.target.value)} placeholder="p. ej. auxiliar contable" />
          <p className="text-[11px] text-muted-foreground">De aquí sale el resumen que se ve en los listados.</p>
        </div>
        <div className="space-y-1.5"><Label>Fecha de inicio</Label><Input type="date" value={f.fechaInicio} onChange={(e) => set('fechaInicio', e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Fecha de fin</Label><Input type="date" value={f.fechaFin} onChange={(e) => set('fechaFin', e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Valor total</Label><Input type="number" min={0} value={f.valorTotal} onChange={(e) => set('valorTotal', e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Honorario mensual (opcional)</Label><Input type="number" min={0} value={f.valorMensual} onChange={(e) => set('valorMensual', e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Número (opcional)</Label><Input value={f.numero} onChange={(e) => set('numero', e.target.value)} placeholder="Se asigna solo" /></div>
        <div className="space-y-1.5"><Label>RUT (opcional)</Label><Input value={f.rut} onChange={(e) => set('rut', e.target.value)} /></div>
        <div className="space-y-1.5">
          <Label>Supervisor (opcional)</Label>
          <SelectorColaborador value={f.supervisorId} onChange={(id) => set('supervisorId', id)} placeholder="Selecciona…" />
        </div>
        <div className="space-y-1.5"><Label>Ciudad (opcional)</Label><Input value={f.ciudad} onChange={(e) => set('ciudad', e.target.value)} placeholder="Pasto, Nariño" /></div>
      </div>

      {/* ── PDF y posición de las firmas ── */}
      <div className="space-y-3 border-t pt-4">
        <div className="space-y-1.5">
          <Label>PDF del contrato</Label>
          <Input
            type="file"
            accept="application/pdf"
            onChange={(e) => { const a = e.target.files?.[0]; if (a) alElegirPdf(a) }}
          />
          {archivoPdf && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1.5"><Upload className="size-3.5 shrink-0" /> <span className="truncate">{nombrePdf}</span></span>
              {/* Mirarlo entero antes de enviarlo: el selector de firmas muestra una página a la vez. */}
              <VisorPdf archivo={archivoPdf} titulo={nombrePdf} className="flex items-center gap-1 font-medium text-primary hover:underline">
                <Eye className="size-3.5" /> Ver PDF
              </VisorPdf>
            </p>
          )}
        </div>

        {/* A veces el PDF llega ya firmado por el representante legal: entonces solo
            se ubica la firma del contratista y con ella el contrato queda completo. */}
        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <Checkbox checked={contratanteFirmo} onCheckedChange={(v) => setContratanteFirmo(v === true)} className="mt-0.5" />
          <span>
            <span className="font-medium">El PDF ya viene firmado por el contratante</span>
            <span className="block text-xs text-muted-foreground">
              Solo se le pedirá la firma al contratista; con ella el contrato queda firmado. No se estampa otra firma de la empresa.
            </span>
          </span>
        </label>

        <GenerarAutorizacion
          generar={generarAutorizacion}
          onGenerar={setGenerarAutorizacion}
          firmante="el contratista"
          vistaPreviaUrl={f.colaboradorId
            ? `/api/contratos/autorizacion-datos?${new URLSearchParams({
                colaboradorId: f.colaboradorId, vinculo: 'OPS',
                ...(f.cargoObjeto ? { cargo: f.cargoObjeto } : {}),
                ...(f.ciudad ? { ciudad: f.ciudad } : {}),
                ...(f.fechaSuscripcion ? { fecha: f.fechaSuscripcion } : {}),
              })}`
            : null}
        />

        {analizando && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="size-4" /> Leyendo el PDF para proponer dónde va cada firma…</p>}

        {detectado && (
          <p className="text-[11px] text-muted-foreground">
            {detectado.contratista && detectado.contratante
              ? 'Se encontró el bloque de firmas. Revisa que los recuadros estén bien y ajústalos si hace falta.'
              : 'No se pudo ubicar el bloque de firmas en este PDF (suele pasar con escaneos). Arrastra cada recuadro al lugar correcto.'}
          </p>
        )}

        {pdf && !analizando && (
          <SelectorFirmasPdf
            key={version}
            pdfDataUri={pdf}
            paginas={paginas}
            valor={posiciones}
            onChange={setPosiciones}
            partes={contratanteFirmo ? ['contratista'] : ['contratante', 'contratista']}
          />
        )}
      </div>

      <Button onClick={guardar} disabled={guardando || !pdf} className="w-full">
        {guardando ? <Spinner className="size-4" /> : <Save className="size-4" />} Subir y enviar a firma
      </Button>
    </CardContent></Card>
  )
}
