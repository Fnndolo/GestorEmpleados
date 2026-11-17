-- Documento para firmar enviado desde un contrato OPS (mismo flujo del preaviso).
ALTER TABLE "preaviso_contrato" ALTER COLUMN "contrato_id" DROP NOT NULL;
ALTER TABLE "preaviso_contrato" ADD COLUMN "contrato_ops_id" UUID;
CREATE INDEX "preaviso_contrato_contrato_ops_id_idx" ON "preaviso_contrato"("contrato_ops_id");
ALTER TABLE "preaviso_contrato" ADD CONSTRAINT "preaviso_contrato_contrato_ops_id_fkey" FOREIGN KEY ("contrato_ops_id") REFERENCES "contrato_ops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
