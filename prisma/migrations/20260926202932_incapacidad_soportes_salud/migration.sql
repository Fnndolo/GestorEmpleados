-- Los soportes de incapacidad son datos de salud (Ley 1581): los que ya estaban
-- adjuntos a una solicitud de incapacidad quedaban con acceso general. Desde
-- ahora solo los abre quien tiene el permiso de datos de salud (y el colaborador).
UPDATE "documento"
SET "nivel_acceso" = 'SST_MEDICO'
WHERE "nivel_acceso" = 'GENERAL'
  AND (
    "entidad_tipo" = 'Incapacidad'
    OR ("entidad_tipo" = 'Solicitud' AND "entidad_id" IN (SELECT "id" FROM "solicitud" WHERE "tipo" = 'INCAPACIDAD'))
  );
