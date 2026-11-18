import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { ListaCorreos } from './lista'

export const metadata = { title: 'Correos no enviados · Configuración' }

export default async function CorreosPage() {
  await requerirPermiso('configuracion', 'VER')
  // Pendientes que ya fallaron al menos una vez, y los que se dieron por fallidos.
  const mensajes = await prisma.mensajeSaliente.findMany({
    where: {
      canal: 'EMAIL',
      OR: [{ estado: 'FALLIDO' }, { estado: 'EN_COLA', intentos: { gt: 0 } }],
    },
    orderBy: { creadoEn: 'desc' },
    take: 200,
    select: { id: true, destino: true, asunto: true, estado: true, intentos: true, error: true, creadoEn: true },
  })
  return (
    <div>
      <Encabezado
        enLinea
        titulo="Correos no enviados"
        ayuda="Correos que el sistema intentó enviar y no pudo. Los pendientes se reintentan solos una vez al día; después de 5 intentos quedan como fallidos. Si el correo llegó a enviarse pero cayó en spam o la dirección estaba mal, eso no aparece aquí: revisa la bandeja del correo que envía."
      />
      <ListaCorreos
        mensajes={mensajes.map((m) => ({
          id: m.id,
          destino: m.destino,
          asunto: m.asunto ?? '(sin asunto)',
          estado: m.estado,
          intentos: m.intentos,
          error: m.error,
          creadoEn: m.creadoEn.toISOString(),
        }))}
      />
    </div>
  )
}
