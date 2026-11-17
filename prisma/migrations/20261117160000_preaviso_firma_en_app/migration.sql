-- El documento enviado se puede firmar dentro de la app (como el contrato).
ALTER TABLE "preaviso_contrato" ADD COLUMN "firma_en_app" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "preaviso_contrato" ADD COLUMN "posicion_firma" JSONB;
ALTER TABLE "preaviso_contrato" ADD COLUMN "firma_path" TEXT;
