-- Rellena colaborador_id en las notificaciones que ya existían antes de guardar
-- de quién habla cada aviso, para que la campana les ponga la foto también.
-- Solo toca filas con colaborador_id nulo, así que es idempotente.

-- 1) El enlace apunta directo a la ficha: /colaboradores/{id}
UPDATE "notificacion" n
SET "colaborador_id" = c."id"
FROM "colaborador" c
WHERE n."colaborador_id" IS NULL
  AND n."enlace" ~ '^/colaboradores/[0-9a-f-]{36}'
  AND c."id"::text = substring(n."enlace" from '^/colaboradores/([0-9a-f-]{36})');

-- 2) El enlace apunta a un contrato OPS: /contratos/ops/{id}
UPDATE "notificacion" n
SET "colaborador_id" = k."colaborador_id"
FROM "contrato_ops" k
WHERE n."colaborador_id" IS NULL
  AND k."colaborador_id" IS NOT NULL
  AND n."enlace" ~ '^/contratos/ops/[0-9a-f-]{36}'
  AND k."id"::text = substring(n."enlace" from '^/contratos/ops/([0-9a-f-]{36})');

-- 3) El enlace apunta a un contrato laboral: /contratos/{id}
UPDATE "notificacion" n
SET "colaborador_id" = k."colaborador_id"
FROM "contrato" k
WHERE n."colaborador_id" IS NULL
  AND n."enlace" ~ '^/contratos/[0-9a-f-]{36}'
  AND k."id"::text = substring(n."enlace" from '^/contratos/([0-9a-f-]{36})');

-- 4) Avisos sobre otra persona cuyo texto la nombra (formato viejo con nombre
--    completo en el mensaje, o nuevo con "Nombres Apellido" al inicio del título).
--    Se limita a los eventos que hablan de alguien distinto del destinatario:
--    los avisos a uno mismo ("Tu permiso fue aprobado") no llevan foto.
UPDATE "notificacion" n
SET "colaborador_id" = c."id"
FROM "colaborador" c
WHERE n."colaborador_id" IS NULL
  AND n."evento" IN (
    'solicitud_creada', 'solicitud_resuelta', 'licencia_reportada', 'incapacidad_reportada',
    'ficha_actualizada', 'documento_aportado', 'contrato_firmado', 'contrato_por_firmar',
    'cuenta_cobro_radicada', 'soporte_ss_adjuntado', 'habeas_data',
    'disciplinario_descargos', 'disciplinario_apelacion', 'dotacion_firmada',
    'comprobante_permiso_entregado', 'comprobante_permiso_vencido',
    'contrato_vencido_sin_cierre', 'induccion_pendiente', 'vencimiento_alerta',
    'cumpleanos_facturas_entregadas', 'cumpleanos_recordatorio', 'cumpleanos_encargado_asignado'
  )
  AND (
    position(c."nombres" || ' ' || c."apellidos" in n."mensaje") > 0
    OR position(c."nombres" || ' ' || c."apellidos" in n."titulo") > 0
    OR n."titulo" LIKE c."nombres" || ' ' || split_part(c."apellidos", ' ', 1) || ' %'
    OR n."titulo" LIKE c."nombres" || ' ' || split_part(c."apellidos", ' ', 1) || ':%'
  );
