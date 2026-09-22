'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, Save, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { SelectorFirmasPdf, ETIQUETAS_LABORAL, type Posicion } from '@/components/contratos/selector-firmas-pdf'
import { GenerarAutorizacion } from '@/components/contratos/generar-autorizacion'
import { leerComoDataUri, MAX_PDF_BYTES, mensajePdfPesado, subirPdfTemporal } from '@/lib/archivos'
import { fmtCOP } from '@/lib/moneda'
import { duracionContrato } from '@/lib/fechas'
import { avisoVinculoAjustado, avisoReactivacion, type AjusteVinculo, type Reactivacion } from '@/lib/vinculo-contrato'
import type { ContratoInput } from '@/lib/validaciones/contrato'
import { analizarPdfContratoLaboral, subirContratoParaFirma } from './acciones'

/**
 * Alta de un contrato LABORAL aportando el PDF, para firmarse dentro de la app.
 *
 * Espejo del alta OPS con PDF (`ContratoOpsSubido`), con los datos de un contrato
 * de trabajo: los mismos que registra el alta de un contrato ya firmado en
 * físico, porque nómina y las alertas de vencimiento los necesitan igual. El
 * empleado firma desde su autoservicio; el empleador desde el detalle, salvo que
 * el PDF ya venga firmado por él.
 */

/** Posición de arranque cuando el PDF no permite proponer nada (escaneos). */
const POR_DEFECTO: Omit<Posicion, 'pagina'> = { x: 80, y: 150, ancho: 150, alto: 45 }

const TIPOS: { v: ContratoInput['tipo']; l: string }[] = [
  { v: 'TERMINO_INDEFINIDO', l: 'Término indefinido' },
  { v: 'TERMINO_FIJO', l: 'Término fijo' },
  { v: 'OBRA_LABOR', l: 'Obra o labor' },
  { v: 'APRENDIZAJE_SENA', l: 'Aprendizaje SENA' },
]

type Props = {
  catalogos: {
    sedes: { id: string; nombre: string; ciudad: string }[]
    cargos: { id: string; nombre: string }[]
    smmlv: number
    auxTransporte: number
  }
}

export function ContratoLaboralSubido({ catalogos }: Props) {
  const router = useRouter()
  const [guardando, empezar] = useTransition()
  const [analizando, setAnalizando] = useState(false)

  // `pdf` es el data URI para la vista previa (local); `pdfRef` es la referencia
  // con que el servidor lee el archivo del depósito temporal.
  const [pdf, setPdf] = useState<string | null>(null)
  const [pdfRef, setPdfRef] = useState<string | null>(null)
  const [archivoPdf, setArchivoPdf] = useState<File | null>(null)
  // Cambia con cada PDF elegido: remonta el selector para que vuelva a la página propuesta.
  const [version, setVersion] = useState(0)
  const [paginas, setPaginas] = useState(1)
  const [detectado, setDetectado] = useState<{ contratista: boolean; contratante: boolean } | null>(null)
  // Claves del selector: `contratista` es el trabajador y `contratante` el empleador.
  const [posiciones, setPosiciones] = useState<Record<'contratista' | 'contratante', Posicion>>({
    contratista: { ...POR_DEFECTO, pagina: 1 },
    contratante: { ...POR_DEFECTO, pagina: 1 },
  })
  // El PDF ya viene firmado por el representante legal: solo firma el empleado.
  const [empleadorFirmo, setEmpleadorFirmo] = useState(false)
  // La autorización de datos (Ley 1581) la arma la app y la firma el empleado
  // con el contrato. No siempre hace falta: a veces ya se recogió aparte.
  const [generarAutorizacion, setGenerarAutorizacion] = useState(true)

  const [f, setF] = useState({
    colaboradorId: '', tipo: 'TERMINO_INDEFINIDO' as ContratoInput['tipo'], cargoId: '', sedeId: '',
    modalidadTrabajo: 'PRESENCIAL' as ContratoInput['modalidadTrabajo'],
    ganaSalarioMinimo: false, salarioBase: '', tipoSalario: 'ORDINARIO' as ContratoInput['tipoSalario'],
    tieneAuxTransporte: true, auxConectividad: '',
    jornada: 'TIEMPO_COMPLETO' as ContratoInput['jornada'], horasSemanales: '',
    fechaInicio: '', fechaFin: '', periodoPruebaDias: '', objetoObraLabor: '', etapaAprendizaje: '', observaciones: '',
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))

  // Lo derivado se muestra en vivo: es lo que se está pactando.
  const salario = f.ganaSalarioMinimo ? catalogos.smmlv : Number(f.salarioBase) || 0
  const aplicaAux = f.tieneAuxTransporte && f.tipoSalario === 'ORDINARIO' && catalogos.smmlv > 0 && salario > 0 && salario <= 2 * catalogos.smmlv
  const duracion = duracionContrato(
    f.fechaInicio ? new Date(`${f.fechaInicio}T00:00:00Z`) : null,
    f.fechaFin ? new Date(`${f.fechaFin}T00:00:00Z`) : null,
  )

  async function alElegirPdf(archivo: File) {
    if (archivo.type !== 'application/pdf') { toast.error('El archivo debe ser un PDF.'); return }
    if (archivo.size > MAX_PDF_BYTES) { toast.error(mensajePdfPesado(archivo.size)); return }
    const dataUri = await leerComoDataUri(archivo)
    setPdf(dataUri)
    setArchivoPdf(archivo)

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
    const res = await analizarPdfContratoLaboral({ pdfRef: ref })
    setAnalizando(false)
    if (!res.ok) { toast.error(res.error ?? 'No se pudo leer el PDF.'); return }
    const d = res.datos
    setPaginas(d.paginas)
    // Sin detección se cae a la ÚLTIMA página: es donde va el bloque de firmas.
    setPosiciones({
      contratista: d.contratista ?? { ...POR_DEFECTO, pagina: d.paginas, x: 330 },
      contratante: d.contratante ?? { ...POR_DEFECTO, pagina: d.paginas },
    })
    setDetectado({ contratista: !!d.contratista, contratante: !!d.contratante })
    setVersion((v) => v + 1)
  }

  function guardar() {
    if (!pdf || !archivoPdf || !pdfRef) { toast.error('Adjunta el PDF del contrato.'); return }
    if (!f.colaboradorId) { toast.error('Selecciona al colaborador que va a firmar.'); return }
    if (!f.sedeId) { toast.error('Selecciona la sede.'); return }
    if (!f.fechaInicio) { toast.error('Indica la fecha de inicio.'); return }
    if (f.tipo === 'TERMINO_FIJO' && !f.fechaFin) { toast.error('Un contrato a término fijo requiere fecha de fin.'); return }
    if (f.tipo === 'OBRA_LABOR' && !f.objetoObraLabor.trim()) { toast.error('Indica el objeto de la obra o labor.'); return }
    if (salario <= 0) { toast.error('Indica el salario base.'); return }

    empezar(async () => {
      const res = await subirContratoParaFirma({
        pdfRef,
        colaboradorId: f.colaboradorId,
        tipo: f.tipo,
        cargoId: f.cargoId,
        sedeId: f.sedeId,
        jornada: f.jornada,
        horasSemanales: f.horasSemanales ? Number(f.horasSemanales) : undefined,
        modalidadTrabajo: f.modalidadTrabajo,
        salarioBase: salario,
        ganaSalarioMinimo: f.ganaSalarioMinimo,
        tieneAuxTransporte: f.tieneAuxTransporte,
        auxConectividad: f.auxConectividad ? Number(f.auxConectividad) : undefined,
        tipoSalario: f.tipoSalario,
        fechaInicio: f.fechaInicio,
        fechaFin: f.tipo === 'TERMINO_FIJO' ? f.fechaFin : '',
        objetoObraLabor: f.tipo === 'OBRA_LABOR' ? f.objetoObraLabor : '',
        etapaAprendizaje: f.tipo === 'APRENDIZAJE_SENA' ? (f.etapaAprendizaje as 'LECTIVA' | 'PRODUCTIVA' | '') : '',
        periodoPruebaDias: f.periodoPruebaDias ? Number(f.periodoPruebaDias) : undefined,
        observaciones: f.observaciones,
        posicionEmpleado: posiciones.contratista,
        posicionEmpleador: empleadorFirmo ? undefined : posiciones.contratante,
        empleadorFirmoEnPdf: empleadorFirmo,
        generarAutorizacion,
      })
      if (!res.ok) { toast.error(res.error ?? 'No se pudo subir el contrato.'); return }
      toast.success(empleadorFirmo
        ? 'Contrato subido. Con la firma del empleado desde su autoservicio quedará completo.'
        : 'Contrato subido. El empleado ya puede firmarlo desde su autoservicio.')
      const datos = res.datos as { id: string; vinculoAjustado?: AjusteVinculo; reactivado?: Reactivacion | null }
      for (const aviso of [avisoReactivacion(datos.reactivado), avisoVinculoAjustado(datos.vinculoAjustado)]) {
        if (aviso) toast.info(aviso, { duration: 8000 })
      }
      router.push(`/contratos/${datos.id}`)
    })
  }

  return (
    /* Una sola columna, como el alta OPS: datos, luego el PDF con la posición de
       las firmas, y el botón al final. */
    <Card><CardContent className="space-y-4 py-4">
      {/* ── Identificación ── */}
      <div className="space-y-1.5">
        <Label>Colaborador (quien va a firmar)</Label>
        <SelectorColaborador
          value={f.colaboradorId}
          onChange={(id) => set('colaboradorId', id)}
          placeholder="Busca por nombre o documento…"
        />
        <p className="text-[11px] text-muted-foreground">Necesita usuario de acceso: firma desde su autoservicio.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Tipo de contrato</Label>
          <Select value={f.tipo} onValueChange={(v) => set('tipo', v as ContratoInput['tipo'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Modalidad de trabajo</Label>
          <Select value={f.modalidadTrabajo} onValueChange={(v) => set('modalidadTrabajo', v as ContratoInput['modalidadTrabajo'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PRESENCIAL">Presencial</SelectItem>
              <SelectItem value="REMOTO">Remoto</SelectItem>
              <SelectItem value="HIBRIDO">Híbrido</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Sede</Label>
          <Select value={f.sedeId} onValueChange={(v) => set('sedeId', v)}>
            <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>{catalogos.sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre} · {s.ciudad}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Cargo (opcional)</Label>
          <Select value={f.cargoId || undefined} onValueChange={(v) => set('cargoId', v)}>
            <SelectTrigger><SelectValue placeholder="— Sin definir —" /></SelectTrigger>
            <SelectContent>{catalogos.cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Remuneración ── */}
      <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 rounded-lg border p-3 text-sm sm:col-span-2">
          <Checkbox checked={f.ganaSalarioMinimo} onCheckedChange={(c) => set('ganaSalarioMinimo', c === true)} />
          <span>
            Gana salario mínimo
            {catalogos.smmlv > 0 && <span className="text-muted-foreground"> ({fmtCOP(catalogos.smmlv)} — se actualiza con el parámetro)</span>}
          </span>
        </label>
        {!f.ganaSalarioMinimo && (
          <div className="space-y-1.5">
            <Label>Salario base</Label>
            <Input type="number" min={0} step="1" value={f.salarioBase} onChange={(e) => set('salarioBase', e.target.value)} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Tipo de salario</Label>
          <Select value={f.tipoSalario} onValueChange={(v) => set('tipoSalario', v as ContratoInput['tipoSalario'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ORDINARIO">Ordinario</SelectItem>
              <SelectItem value="INTEGRAL">Integral</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 rounded-lg border p-3 text-sm sm:col-span-2">
          <Checkbox checked={f.tieneAuxTransporte} onCheckedChange={(c) => set('tieneAuxTransporte', c === true)} />
          <span>
            Tiene auxilio de transporte
            {catalogos.auxTransporte > 0 && <span className="text-muted-foreground"> ({fmtCOP(catalogos.auxTransporte)}/mes si es elegible: ≤ 2 SMMLV y salario ordinario)</span>}
            {aplicaAux && <span className="block text-xs text-emerald-700 dark:text-emerald-300">Aplica con el salario indicado.</span>}
          </span>
        </label>
        <div className="space-y-1.5">
          <Label>Auxilio de conectividad (opcional, mensual)</Label>
          <Input type="number" min={0} step="1" value={f.auxConectividad} onChange={(e) => set('auxConectividad', e.target.value)} placeholder="0" />
        </div>
      </div>

      {/* ── Jornada y vigencia ── */}
      <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Jornada</Label>
          <Select value={f.jornada} onValueChange={(v) => set('jornada', v as ContratoInput['jornada'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TIEMPO_COMPLETO">Tiempo completo</SelectItem>
              <SelectItem value="MEDIO_TIEMPO">Medio tiempo</SelectItem>
              <SelectItem value="POR_DIAS">Por días</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Horas semanales</Label>
          <Input type="number" min={1} max={60} value={f.horasSemanales} onChange={(e) => set('horasSemanales', e.target.value)} placeholder="42" />
        </div>
        <div className="space-y-1.5">
          <Label>Fecha de inicio</Label>
          <Input type="date" value={f.fechaInicio} onChange={(e) => set('fechaInicio', e.target.value)} />
        </div>
        {f.tipo === 'TERMINO_FIJO' && (
          <div className="space-y-1.5">
            <Label>Fecha de fin (término fijo)</Label>
            <Input type="date" value={f.fechaFin} onChange={(e) => set('fechaFin', e.target.value)} />
            {duracion && <p className="text-[11px] text-muted-foreground">Duración: {duracion}. El último día cuenta.</p>}
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Días de periodo de prueba</Label>
          <Input type="number" min={0} max={365} value={f.periodoPruebaDias} onChange={(e) => set('periodoPruebaDias', e.target.value)} placeholder="60" />
        </div>
        {f.tipo === 'APRENDIZAJE_SENA' && (
          <div className="space-y-1.5">
            <Label>Etapa de aprendizaje</Label>
            <Select value={f.etapaAprendizaje || undefined} onValueChange={(v) => set('etapaAprendizaje', v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LECTIVA">Lectiva</SelectItem>
                <SelectItem value="PRODUCTIVA">Productiva</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {f.tipo === 'OBRA_LABOR' && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Objeto de la obra o labor</Label>
            <Textarea rows={2} value={f.objetoObraLabor} onChange={(e) => set('objetoObraLabor', e.target.value)} />
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Observaciones (opcional)</Label>
          <Textarea rows={2} value={f.observaciones} onChange={(e) => set('observaciones', e.target.value)} />
        </div>
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
              <span className="flex min-w-0 items-center gap-1.5"><Upload className="size-3.5 shrink-0" /> <span className="truncate">{archivoPdf.name}</span></span>
              <VisorPdf archivo={archivoPdf} titulo={archivoPdf.name} className="flex items-center gap-1 font-medium text-primary hover:underline">
                <Eye className="size-3.5" /> Ver PDF
              </VisorPdf>
            </p>
          )}
        </div>

        {/* A veces el PDF llega ya firmado por el representante legal: entonces solo
            se ubica la firma del empleado y con ella el contrato queda completo. */}
        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <Checkbox checked={empleadorFirmo} onCheckedChange={(v) => setEmpleadorFirmo(v === true)} className="mt-0.5" />
          <span>
            <span className="font-medium">El PDF ya viene firmado por el empleador</span>
            <span className="block text-xs text-muted-foreground">
              Solo se le pedirá la firma al empleado; con ella el contrato queda firmado. No se estampa otra firma de la empresa.
            </span>
          </span>
        </label>

        <GenerarAutorizacion
          generar={generarAutorizacion}
          onGenerar={setGenerarAutorizacion}
          firmante="el empleado"
          vistaPreviaUrl={f.colaboradorId
            ? `/api/contratos/autorizacion-datos?${new URLSearchParams({
                colaboradorId: f.colaboradorId, vinculo: 'LABORAL',
                ...(f.fechaInicio ? { fecha: f.fechaInicio } : {}),
              })}`
            : null}
        />

        {analizando && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="size-4" /> Leyendo el PDF para proponer dónde va cada firma…</p>}

        {detectado && (
          <p className="text-[11px] text-muted-foreground">
            {detectado.contratista && (detectado.contratante || empleadorFirmo)
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
            partes={empleadorFirmo ? ['contratista'] : ['contratante', 'contratista']}
            etiquetas={ETIQUETAS_LABORAL}
          />
        )}
      </div>

      <Button onClick={guardar} disabled={guardando || !pdf} className="w-full">
        {guardando ? <Spinner className="size-4" /> : <Save className="size-4" />} Subir y enviar a firma
      </Button>
    </CardContent></Card>
  )
}
