'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ExcelJS from 'exceljs'
import { toast } from 'sonner'
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { importarColaboradores } from './acciones'

const CAMPOS = [
  'tipoDocumento', 'numeroDocumento', 'nombres', 'apellidos', 'celular', 'emailPersonal',
  'fechaNacimiento', 'direccion', 'tipoVinculo', 'modalidadTrabajo', 'sede', 'area', 'cargo',
  'fechaIngreso', 'eps', 'afp', 'fondoCesantias', 'cajaCompensacion', 'arl', 'banco',
  'tipoCuenta', 'numeroCuenta', 'vacacionesPendientes',
] as const

type Fila = Record<(typeof CAMPOS)[number], string>

function celdaTexto(valor: ExcelJS.CellValue): string {
  if (valor == null) return ''
  if (typeof valor === 'object' && 'text' in valor) return String((valor as { text: unknown }).text)
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  return String(valor).trim()
}

export function ImportadorCliente() {
  const router = useRouter()
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [archivoNombre, setArchivoNombre] = useState('')
  const [parsing, setParsing] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<{ insertadas: number; errores: { fila: number; mensaje: string }[] } | null>(null)

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    setResultado(null)
    try {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const hoja = wb.worksheets[0]
      const parsed: Fila[] = []
      hoja.eachRow((row, num) => {
        if (num === 1) return // encabezado
        const fila = {} as Fila
        CAMPOS.forEach((campo, i) => {
          fila[campo] = celdaTexto(row.getCell(i + 1).value)
        })
        // ignorar filas totalmente vacías
        if (Object.values(fila).some((v) => v.trim() !== '')) parsed.push(fila)
      })
      setFilas(parsed)
      setArchivoNombre(file.name)
      if (parsed.length === 0) toast.warning('El archivo no tiene filas de datos.')
    } catch {
      toast.error('No se pudo leer el archivo. ¿Es la plantilla correcta?')
    } finally {
      setParsing(false)
    }
  }

  async function confirmar() {
    if (!filas) return
    setImportando(true)
    const res = await importarColaboradores({ archivoNombre, filas })
    setImportando(false)
    if (res.ok) {
      setResultado(res.datos)
      if (res.datos.insertadas > 0) toast.success(`${res.datos.insertadas} colaborador(es) importado(s).`)
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  return (
    <div className="space-y-4">
      {/* Paso 1: plantilla */}
      <Card>
        <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 py-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Download className="size-5" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">1. Descarga la plantilla</p>
            <p className="text-xs text-muted-foreground">
              Incluye una hoja con los nombres válidos de sedes, áreas, cargos y entidades.
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href="/api/colaboradores/plantilla"><Download className="size-4" /> Descargar plantilla</a>
          </Button>
        </CardContent>
      </Card>

      {/* Paso 2: subir */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Upload className="size-5" />
            </div>
            <div>
              <p className="font-medium text-sm">2. Sube el archivo completado</p>
              <p className="text-xs text-muted-foreground">Se valida en tu navegador antes de importar.</p>
            </div>
          </div>
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={onArchivo}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
          />
          {parsing && <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2"><Spinner className="size-4" /> Leyendo…</p>}
        </CardContent>
      </Card>

      {/* Paso 3: vista previa + confirmar */}
      {filas && !resultado && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-muted-foreground" />
              <span className="font-medium text-sm">{archivoNombre}</span>
              <Badge variant="outline">{filas.length} fila(s)</Badge>
            </div>
            <div className="rounded-lg border overflow-x-auto max-h-72">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="p-2 text-left">#</th>
                    <th className="p-2 text-left">Documento</th>
                    <th className="p-2 text-left">Nombre</th>
                    <th className="p-2 text-left">Vínculo</th>
                    <th className="p-2 text-left">Sede</th>
                    <th className="p-2 text-left">Ingreso</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(0, 50).map((f, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 text-muted-foreground">{i + 2}</td>
                      <td className="p-2">{f.tipoDocumento} {f.numeroDocumento}</td>
                      <td className="p-2">{f.nombres} {f.apellidos}</td>
                      <td className="p-2">{f.tipoVinculo}</td>
                      <td className="p-2">{f.sede}</td>
                      <td className="p-2">{f.fechaIngreso}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filas.length > 50 && <p className="text-xs text-muted-foreground">Mostrando las primeras 50 filas.</p>}
            <div className="flex justify-end">
              <Button onClick={confirmar} disabled={importando}>
                {importando ? <Spinner /> : <ArrowRight className="size-4" />} Importar {filas.length} colaborador(es)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultado */}
      {resultado && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-2">
              {resultado.errores.length === 0
                ? <CheckCircle2 className="size-5 text-emerald-600" />
                : <AlertTriangle className="size-5 text-amber-500" />}
              <p className="font-medium">
                {resultado.insertadas} importado(s) · {resultado.errores.length} con error
              </p>
            </div>
            {resultado.errores.length > 0 && (
              <div className="rounded-lg border max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr><th className="p-2 text-left">Fila</th><th className="p-2 text-left">Motivo</th></tr>
                  </thead>
                  <tbody>
                    {resultado.errores.map((e, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 text-muted-foreground">{e.fila}</td>
                        <td className="p-2">{e.mensaje}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setFilas(null); setResultado(null) }}>Importar otro archivo</Button>
              <Button onClick={() => router.push('/colaboradores')}>Ver colaboradores</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
