'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { accion } from '@/server/accion'
import { eliminarDocumento } from '@/server/documentos'

export const borrarDocumento = accion(
  { modulo: 'documentos', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), entidadId: z.uuid() }) },
  async ({ id, entidadId }) => {
    await eliminarDocumento(id)
    revalidatePath(`/colaboradores/${entidadId}`)
  },
)
