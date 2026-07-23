-- AlterTable
ALTER TABLE "contrato" ADD COLUMN     "contenido_pdf" JSONB,
ADD COLUMN     "firma_empleado_fecha" TIMESTAMP(3),
ADD COLUMN     "firma_empleado_path" TEXT,
ADD COLUMN     "firma_empleado_por_id" UUID,
ADD COLUMN     "firma_empleador_fecha" TIMESTAMP(3),
ADD COLUMN     "firma_empleador_path" TEXT,
ADD COLUMN     "firma_empleador_por_id" UUID;
