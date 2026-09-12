-- Bienestar: cumpleanos. Talento Humano le encarga a un colaborador la celebracion
-- del cumpleanos de otro; el encargado sube las facturas y TH cierra.

-- CreateEnum
CREATE TYPE "estado_celebracion" AS ENUM ('ASIGNADA', 'FACTURAS_ENTREGADAS', 'CERRADA');

-- AlterTable
ALTER TABLE "configuracion_empresa" ADD COLUMN     "dias_recordatorio_cumpleanos" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "celebracion_cumpleanos" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "anio" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "encargado_id" UUID NOT NULL,
    "estado" "estado_celebracion" NOT NULL DEFAULT 'ASIGNADA',
    "nota" TEXT,
    "valor_reportado" DECIMAL(14,2),
    "motivo_devolucion" TEXT,
    "facturas_entregadas_en" TIMESTAMP(3),
    "cerrada_en" TIMESTAMP(3),
    "cerrada_por_id" UUID,
    "asignada_por_id" UUID NOT NULL,
    "recordatorio_enviado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "celebracion_cumpleanos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "celebracion_cumpleanos_encargado_id_estado_idx" ON "celebracion_cumpleanos"("encargado_id", "estado");

-- CreateIndex
CREATE INDEX "celebracion_cumpleanos_fecha_estado_idx" ON "celebracion_cumpleanos"("fecha", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "celebracion_cumpleanos_colaborador_id_anio_key" ON "celebracion_cumpleanos"("colaborador_id", "anio");

-- AddForeignKey
ALTER TABLE "celebracion_cumpleanos" ADD CONSTRAINT "celebracion_cumpleanos_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "celebracion_cumpleanos" ADD CONSTRAINT "celebracion_cumpleanos_encargado_id_fkey" FOREIGN KEY ("encargado_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permiso del modulo nuevo `bienestar` para los roles que administran personas.
-- El seed solo siembra la matriz cuando el rol no tiene permisos (no pisa lo
-- editado por el administrador), asi que una base existente lo recibe aqui.
-- Los demas roles se ajustan desde Configuracion -> Roles.
INSERT INTO "rol_permiso" ("id", "rol_id", "modulo", "accion", "alcance")
SELECT gen_random_uuid(), r."id", 'bienestar', a."accion"::"accion_permiso", 'TODAS_SEDES'
FROM "rol" r
CROSS JOIN (VALUES ('VER'), ('CREAR'), ('EDITAR'), ('ELIMINAR')) AS a("accion")
WHERE r."nombre" IN ('Administrador', 'Recursos Humanos')
ON CONFLICT ("rol_id", "modulo", "accion") DO NOTHING;
