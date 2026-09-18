-- Textos editables: si el PDF va sobre el papel membretado (null = lo de fabrica de cada documento)
ALTER TABLE "plantilla_documento" ADD COLUMN "usa_membrete" BOOLEAN;
