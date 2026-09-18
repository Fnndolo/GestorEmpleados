-- Nuevo valor del enum en su propia migración: Postgres no deja USAR un valor
-- recién agregado en la misma transacción (la siguiente migración lo usa como default).
ALTER TYPE "tipo_reporte" ADD VALUE 'SIN_CLASIFICAR';
