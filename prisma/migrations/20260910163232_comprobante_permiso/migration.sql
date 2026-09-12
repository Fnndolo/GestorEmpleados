-- CreateEnum
CREATE TYPE "estado_comprobante_permiso" AS ENUM ('NO_REQUERIDO', 'PENDIENTE', 'ENTREGADO', 'VERIFICADO');

-- DropForeignKey
ALTER TABLE "contrato_ops" DROP CONSTRAINT "contrato_ops_colaborador_id_fkey";

-- AlterTable
ALTER TABLE "configuracion_empresa" ADD COLUMN     "plazo_comprobante_permiso_dias" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "permiso" ADD COLUMN     "comprobante_entregado_en" TIMESTAMP(3),
ADD COLUMN     "comprobante_estado" "estado_comprobante_permiso" NOT NULL DEFAULT 'NO_REQUERIDO',
ADD COLUMN     "comprobante_nota" TEXT,
ADD COLUMN     "comprobante_vence" DATE,
ADD COLUMN     "comprobante_verificado_en" TIMESTAMP(3),
ADD COLUMN     "comprobante_verificado_por_id" UUID;

-- CreateIndex
CREATE INDEX "permiso_comprobante_estado_comprobante_vence_idx" ON "permiso"("comprobante_estado", "comprobante_vence");

-- AddForeignKey
ALTER TABLE "contrato_ops" ADD CONSTRAINT "contrato_ops_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
