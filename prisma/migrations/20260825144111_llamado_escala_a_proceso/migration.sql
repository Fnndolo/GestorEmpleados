-- AlterTable
ALTER TABLE "llamado_atencion" ADD COLUMN     "proceso_id" UUID;

-- CreateIndex
CREATE INDEX "llamado_atencion_proceso_id_idx" ON "llamado_atencion"("proceso_id");

-- AddForeignKey
ALTER TABLE "llamado_atencion" ADD CONSTRAINT "llamado_atencion_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "proceso_disciplinario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
