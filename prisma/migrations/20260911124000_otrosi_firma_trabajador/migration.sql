-- Otrosí de contrato laboral con la misma lógica de firma del contrato subido:
-- el PDF aportado es el otrosí y el trabajador lo firma desde su autoservicio.
-- La descripción libre deja de ser obligatoria (los nuevos no la llevan).
ALTER TYPE "proposito_codigo_firma" ADD VALUE IF NOT EXISTS 'FIRMA_OTROSI';

ALTER TABLE "otrosi_contrato" ALTER COLUMN "descripcion" DROP NOT NULL;

ALTER TABLE "otrosi_contrato"
  ADD COLUMN IF NOT EXISTS "requiere_firma" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "documento_original_id" UUID,
  ADD COLUMN IF NOT EXISTS "posicion_firma" JSONB,
  ADD COLUMN IF NOT EXISTS "firma_empleado_path" TEXT,
  ADD COLUMN IF NOT EXISTS "firma_empleado_fecha" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "firma_empleado_por_id" UUID;

-- Rastro probatorio de la firma del otrosí (además del contrato al que pertenece).
ALTER TABLE "evidencia_firma_contrato" ADD COLUMN IF NOT EXISTS "otrosi_id" UUID;
ALTER TABLE "evidencia_firma_contrato"
  ADD CONSTRAINT "evidencia_firma_contrato_otrosi_id_fkey"
  FOREIGN KEY ("otrosi_id") REFERENCES "otrosi_contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
