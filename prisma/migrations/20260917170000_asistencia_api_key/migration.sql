-- Conexión con AsistencIA: clave de API por empresa (antes solo por variable de entorno).
ALTER TABLE "configuracion_empresa" ADD COLUMN "asistencia_api_key" TEXT, ADD COLUMN "asistencia_url" TEXT;
