-- AlterTable
ALTER TABLE "consulta_reclamo_datos" ADD COLUMN     "colaborador_id" UUID;

-- AddForeignKey
ALTER TABLE "consulta_reclamo_datos" ADD CONSTRAINT "consulta_reclamo_datos_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
