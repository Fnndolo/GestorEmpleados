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
  // Sobre la franja del pie, centrado y por encima de la imagen.
  pie: {
    position: 'absolute', bottom: 46, left: 72, right: 72,
    textAlign: 'center', fontSize: 7.5, color: '#475569',
  },
})

/**
 * Fondo de papel membretado para contratos, autorizaciones y acuerdos. Debe ir
 * como PRIMER hijo del <Page> (para quedar detrás del contenido). Las páginas
 * deben reservar espacio con paddingTop ≥ ~118 y paddingBottom ≥ ~64 para no
 * pisar encabezado ni pie.
 *
 * Sin argumentos usa el membrete de fábrica, que ya trae el pie de contacto
 * impreso en la imagen. Cuando la empresa sube el suyo —que se espera SIN pie,
 * ver `fondoMembrete`— la app escribe encima el correo, NIT y sitio web tomados
 * de Configuración → Empresa, para que cambiarlos no obligue a rehacer la imagen.
 */
export function MembreteFondo({ fondo, empresa }: { fondo?: string; empresa?: DatosEmpresa } = {}) {
  return (
    <>
      <Image src={fondo ?? MEMBRETE_FONDO} style={m.fondo} fixed />
      {fondo && empresa && <Text style={m.pie} fixed>{pieContacto(empresa)}</Text>}
    </>
  )
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
