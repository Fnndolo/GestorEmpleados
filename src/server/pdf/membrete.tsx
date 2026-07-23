import { View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { MEMBRETE_FONDO } from './assets/membrete-fondo'

export type DatosEmpresa = {
  razonSocial: string
  nombreComercial: string
  nit: string
  direccion?: string | null
  telefono?: string | null
  emailContacto?: string | null
  sitioWeb?: string | null
}

/** Línea de pie de página del membrete (correo · NIT · sitio web). */
export function pieContacto(empresa: DatosEmpresa): string {
  return [empresa.emailContacto, `NIT ${empresa.nit}`, empresa.sitioWeb]
    .filter(Boolean)
    .join('     ·     ')
}

// Papel membretado oficial de KUPOCELL S.A.S.: imagen a página completa renderizada
// desde "Membrete Kupocell.docx" (encabezado con logo KUPOCELL y franjas azules,
// marca de agua Smart Gadgets al centro y pie con datos de contacto e iconos). Se
// pinta `fixed` → se repite en cada página, detrás del contenido.
const m = StyleSheet.create({
  fondo: { position: 'absolute', top: 0, left: 0, width: 612, height: 792 }, // carta en pt
})

/**
 * Fondo de papel membretado para contratos y autorizaciones. Debe ir como PRIMER
 * hijo del <Page> (para quedar detrás del contenido). Las páginas deben reservar
 * espacio con paddingTop ≥ ~118 y paddingBottom ≥ ~64 para no pisar encabezado/pie.
 *
 * El pie de contacto ya viene impreso en la imagen del membrete.
 */
export function MembreteFondo() {
  return <Image src={MEMBRETE_FONDO} style={m.fondo} fixed />
}

export function Membrete({ empresa }: { empresa: DatosEmpresa }) {
  return (
    <View style={estilos.membrete}>
      <View>
        <Text style={estilos.empresaNombre}>{empresa.nombreComercial}</Text>
        <Text style={estilos.empresaRazon}>{empresa.razonSocial} · NIT {empresa.nit}</Text>
      </View>
      <View>
        {empresa.direccion ? <Text style={estilos.empresaDatos}>{empresa.direccion}</Text> : null}
        {empresa.telefono ? <Text style={estilos.empresaDatos}>Tel: {empresa.telefono}</Text> : null}
        {empresa.emailContacto ? <Text style={estilos.empresaDatos}>{empresa.emailContacto}</Text> : null}
      </View>
    </View>
  )
}

export function Pie({ texto }: { texto: string }) {
  return <Text style={estilos.pie} fixed>{texto}</Text>
}
