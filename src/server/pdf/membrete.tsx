import { View, Text } from '@react-pdf/renderer'
import { estilos } from './estilos'

export type DatosEmpresa = {
  razonSocial: string
  nombreComercial: string
  nit: string
  direccion?: string | null
  telefono?: string | null
  emailContacto?: string | null
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
