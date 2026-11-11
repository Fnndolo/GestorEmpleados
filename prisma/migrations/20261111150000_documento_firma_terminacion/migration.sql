-- Documento para firmar enviado desde una terminación (mismo flujo del preaviso).
ALTER TABLE "preaviso_contrato" ADD COLUMN "terminacion_id" UUID;
CREATE INDEX "preaviso_contrato_terminacion_id_idx" ON "preaviso_contrato"("terminacion_id");
ALTER TABLE "preaviso_contrato" ADD CONSTRAINT "preaviso_contrato_terminacion_id_fkey" FOREIGN KEY ("terminacion_id") REFERENCES "terminacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
