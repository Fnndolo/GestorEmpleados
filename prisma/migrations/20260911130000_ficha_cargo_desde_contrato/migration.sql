-- Fichas sin cargo cuyo contrato vigente si lo tiene.
--
-- El cargo se pedia (opcional) al crear al colaborador y otra vez al crear el
-- contrato, y el alta del contrato no se lo pasaba a la ficha: quien se creo sin
-- cargo seguia "Sin cargo" aunque su contrato lo dijera. Desde esta version el
-- alta lo alinea (alinearCargoFicha); esto arregla los que ya quedaron asi.
--
-- Se toma el contrato vigente mas reciente: el laboral antes que el OPS, y el
-- de fecha de inicio mas nueva. El area va con el cargo, porque cada cargo
-- pertenece a una y la ficha exige que coincidan.
WITH candidato AS (
  SELECT DISTINCT ON (colaborador_id) colaborador_id, cargo_id
  FROM (
    SELECT colaborador_id, cargo_id, fecha_inicio, 0 AS prioridad
    FROM contrato
    WHERE cargo_id IS NOT NULL AND estado IN ('ACTIVO', 'SUSPENDIDO')
    UNION ALL
    SELECT colaborador_id, cargo_id, fecha_inicio, 1 AS prioridad
    FROM contrato_ops
    WHERE colaborador_id IS NOT NULL AND cargo_id IS NOT NULL AND estado IN ('ACTIVO', 'FIRMADO')
  ) vigentes
  ORDER BY colaborador_id, prioridad, fecha_inicio DESC
)
UPDATE colaborador c
SET cargo_id = candidato.cargo_id,
    area_id = cargo.area_id
FROM candidato
JOIN cargo ON cargo.id = candidato.cargo_id
WHERE c.id = candidato.colaborador_id
  AND c.cargo_id IS NULL;
