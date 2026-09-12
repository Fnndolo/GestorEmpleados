-- Contrato LABORAL subido como PDF para firmarse DENTRO de la app: espejo de lo
-- que ya tenia contrato_ops (20260829120000 y 20260910...). El PDF aportado es el
-- documento; las firmas se estampan sobre el en las posiciones confirmadas.
ALTER TABLE "contrato" ADD COLUMN IF NOT EXISTS "posicion_firmas" JSONB;

-- El empleador ya firmo en el PDF aportado: no se le pide firma digital y el
-- contrato queda FIRMADO con la sola firma del empleado.
ALTER TABLE "contrato" ADD COLUMN IF NOT EXISTS "firma_empleador_en_pdf" BOOLEAN NOT NULL DEFAULT false;
