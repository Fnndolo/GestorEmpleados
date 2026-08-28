-- Contrato OPS subido como PDF para firmarse DENTRO de la app.
-- Se distingue de SUBIDO (que significa "ya venia firmado en fisico, no pidas
-- firma digital") porque este si entra al flujo de firma: la diferencia es que
-- no hay plantilla que regenerar, asi que las firmas se estampan sobre el PDF.
ALTER TYPE "OrigenPdfContrato" ADD VALUE IF NOT EXISTS 'SUBIDO_PARA_FIRMA';

-- Posicion confirmada de cada firma dentro del PDF subido. Sin esto no se puede
-- estampar: el archivo no lo diagramo la app y no hay forma de saber donde firmar.
ALTER TABLE "contrato_ops" ADD COLUMN IF NOT EXISTS "posicion_firmas" JSONB;
