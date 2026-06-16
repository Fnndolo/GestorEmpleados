-- AlterEnum
ALTER TYPE "tipo_licencia" ADD VALUE 'DIA_COMPENSATORIO_VOTACION';

-- AlterTable
ALTER TABLE "cuenta_cobro_ops" ADD COLUMN     "concepto" TEXT,
ADD COLUMN     "creada_por_contratista" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "documento_id" UUID;

-- CreateTable
CREATE TABLE "plantilla_cuenta_cobro" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "logo_path" TEXT,
    "encabezado" TEXT,
    "cuerpo" TEXT NOT NULL,
    "pie_legal" TEXT,
    "es_defecto" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plantilla_cuenta_cobro_pkey" PRIMARY KEY ("id")
);
