-- Vencimiento de contratos de prestación de servicios (OPS).
--
-- Los contratos OPS nunca se conectaron al sistema de vencimientos: no había
-- origen para ellos y nadie publicaba su fecha de fin, así que no generaban
-- ninguna alerta previa. Lo único que los cubría era el aviso semanal de
-- «contrato vencido sin cerrar», que por diseño llega DESPUÉS de vencerse.

-- El nuevo valor no se usa en esta misma migración: en PostgreSQL un valor de
-- enum recién agregado no se puede utilizar dentro de la transacción que lo
-- crea. Las filas de abajo solo tocan `regla_alerta.clave`, que es texto.
ALTER TYPE "origen_vencimiento" ADD VALUE IF NOT EXISTS 'CONTRATO_OPS' AFTER 'CONTRATO_FIJO';

-- Reglas de alerta. Estaban en el seed desde hace tiempo pero la tabla quedó
-- vacía en producción, así que todo caía al respaldo del código (10 días
-- hábiles / 3). Para un contrato a término fijo eso llega tarde: el preaviso de
-- no prórroga del art. 46 CST son 30 días CALENDARIO, y 10 hábiles son ~14
-- corridos. Se siembran aquí para que existan sin depender de correr el seed.
--
-- ON CONFLICT DO NOTHING: si alguien ya ajustó los días desde Configuración →
-- Alertas, su ajuste manda y esta migración no lo pisa.
INSERT INTO "regla_alerta" ("id", "clave", "descripcion", "dias_primera_alerta", "primera_en_habiles", "dias_ultima_alerta", "ultima_en_habiles", "creado_en", "actualizado_en")
VALUES
  (gen_random_uuid(), 'GLOBAL', 'Regla por defecto para todos los vencimientos', 10, true, 3, true, now(), now()),
  (gen_random_uuid(), 'OBLIGACION_LEGAL', 'Calendario de obligaciones legales (5 días hábiles y 1 día antes)', 5, true, 1, false, now(), now()),
  (gen_random_uuid(), 'CONTRATO_FIJO', 'Vencimiento de contratos a término fijo (40 y 30 días calendario antes; el preaviso legal es de 30)', 40, false, 30, false, now(), now()),
  (gen_random_uuid(), 'CONTRATO_OPS', 'Vencimiento de contratos de prestación de servicios (30 y 15 días calendario antes)', 30, false, 15, false, now(), now())
ON CONFLICT ("clave") DO NOTHING;
