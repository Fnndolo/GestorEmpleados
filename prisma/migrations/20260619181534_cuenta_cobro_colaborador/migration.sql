-- DropForeignKey
ALTER TABLE "cuenta_cobro_ops" DROP CONSTRAINT "cuenta_cobro_ops_contrato_ops_id_fkey";

-- AlterTable
ALTER TABLE "cuenta_cobro_ops" ADD COLUMN     "colaborador_id" UUID,
ALTER COLUMN "contrato_ops_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "cuenta_cobro_ops" ADD CONSTRAINT "cuenta_cobro_ops_contrato_ops_id_fkey" FOREIGN KEY ("contrato_ops_id") REFERENCES "contrato_ops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuenta_cobro_ops" ADD CONSTRAINT "cuenta_cobro_ops_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
