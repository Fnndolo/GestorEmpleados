-- AlterTable
ALTER TABLE "contrato" ADD COLUMN     "aux_conectividad" DECIMAL(14,2),
ADD COLUMN     "gana_salario_minimo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tiene_aux_transporte" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "incapacidad" ADD COLUMN     "solicitud_id" UUID;

-- AlterTable
ALTER TABLE "licencia" ADD COLUMN     "solicitud_id" UUID;

-- AlterTable
ALTER TABLE "permiso" ADD COLUMN     "solicitud_id" UUID;

-- AlterTable
ALTER TABLE "vacaciones" ADD COLUMN     "solicitud_id" UUID;
