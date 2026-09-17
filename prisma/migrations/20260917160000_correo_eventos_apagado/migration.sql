-- Correo al mínimo (decisión del 2026-09-17): las cuentas de muchas personas
-- comparten un buzón, así que ningún evento manda correo mientras no se
-- encienda a mano en Ajustes → Notificaciones. Se apaga lo que estuviera
-- encendido y se descarta lo que quedó en cola sin salir.
UPDATE "preferencia_notificacion" SET "correo" = false, "actualizado_en" = now() WHERE "correo" = true;
UPDATE "mensaje_saliente" SET "estado" = 'DESCARTADO' WHERE "canal" = 'EMAIL' AND "estado" = 'EN_COLA';
