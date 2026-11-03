-- CreateEnum
CREATE TYPE "descuenta_de" AS ENUM ('NOMINA', 'LIQUIDACION');

-- AlterTable
ALTER TABLE "cuota_prestamo" ADD COLUMN "descuenta_de" "descuenta_de" NOT NULL DEFAULT 'NOMINA';

-- CreateTable
CREATE TABLE "documento_descuento" (
    "id" UUID NOT NULL,
    "prestamo_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento_id" UUID NOT NULL,
    "requiere_firma" BOOLEAN NOT NULL DEFAULT false,
    "posicion_firma" JSONB,
    "firmado_doc_id" UUID,
    "firma_empleado_fecha" TIMESTAMP(3),
    "firma_empleado_path" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_descuento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documento_descuento_prestamo_id_idx" ON "documento_descuento"("prestamo_id");

-- AddForeignKey
ALTER TABLE "documento_descuento" ADD CONSTRAINT "documento_descuento_prestamo_id_fkey" FOREIGN KEY ("prestamo_id") REFERENCES "prestamo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
