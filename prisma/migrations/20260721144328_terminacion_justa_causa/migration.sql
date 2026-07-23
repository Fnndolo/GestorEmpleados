-- AlterTable
ALTER TABLE "terminacion" ADD COLUMN     "proceso_disciplinario_id" UUID;

-- AddForeignKey
ALTER TABLE "terminacion" ADD CONSTRAINT "terminacion_proceso_disciplinario_id_fkey" FOREIGN KEY ("proceso_disciplinario_id") REFERENCES "proceso_disciplinario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
