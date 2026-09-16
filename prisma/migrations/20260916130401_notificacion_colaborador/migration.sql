-- AlterTable
ALTER TABLE "notificacion" ADD COLUMN     "colaborador_id" UUID;

-- CreateIndex
CREATE INDEX "notificacion_colaborador_id_idx" ON "notificacion"("colaborador_id");

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
