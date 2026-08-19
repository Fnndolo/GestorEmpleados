-- Papel membretado configurable desde Ajustes: ruta de la imagen de fondo que
-- sube la empresa. Vacío = se usa el membrete que trae la aplicación.
ALTER TABLE "configuracion_empresa" ADD COLUMN "membrete_fondo_path" TEXT;
