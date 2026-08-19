-- Firma escaneada del representante legal, para emitir documentos ya firmados
-- por la empresa. Solo se guarda la ruta; el archivo vive en almacenamiento
-- privado y nunca se sirve por URL.
ALTER TABLE "configuracion_empresa" ADD COLUMN "firma_rep_legal_path" TEXT;
