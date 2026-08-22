-- CreateEnum
CREATE TYPE "tipo_llamado_atencion" AS ENUM ('VERBAL', 'ESCRITO');

-- CreateTable
CREATE TABLE "llamado_atencion" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "tipo" "tipo_llamado_atencion" NOT NULL,
    "motivo" TEXT NOT NULL,
    "detalle" TEXT,
    "fecha" DATE NOT NULL,
    "creado_por_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llamado_atencion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llamado_atencion_colaborador_id_fecha_idx" ON "llamado_atencion"("colaborador_id", "fecha");

-- AddForeignKey
ALTER TABLE "llamado_atencion" ADD CONSTRAINT "llamado_atencion_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
