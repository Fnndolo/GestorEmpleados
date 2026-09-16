-- Fecha de respuesta de una consulta o reclamo de habeas data (prueba del plazo).
ALTER TABLE "consulta_reclamo_datos" ADD COLUMN "respondida_en" TIMESTAMP(3);
