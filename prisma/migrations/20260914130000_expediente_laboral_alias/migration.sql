-- Expediente del contrato de trabajo, segunda pasada: enlazar el catálogo REAL.
--
-- La migración 20260911130000 buscaba los tipos por nombre exacto. En producción
-- el catálogo se creó a mano con otros nombres («Hoja de vida actualizada»,
-- etc.), así que solo quedaron obligatorios los 5 tipos nuevos y la ficha
-- mostraba 6 documentos en vez de 12.
--
-- Esta pasada es idempotente y SOLO ADITIVA: no renombra, no borra, no quita
-- obligaciones. Para cada documento oficial:
--   1) si existe un tipo con el nombre exacto, lo usa;
--   2) si no, busca UN tipo activo por nombre aproximado (patrón); si hay varios
--      elige el que ya sea obligatorio para un contrato de trabajo, luego el que
--      tenga más documentos cargados, luego el más antiguo;
--   3) si no hay ninguno, lo crea con el nombre oficial;
--   4) lo marca obligatorio para TERMINO_INDEFINIDO, TERMINO_FIJO y OBRA_LABOR.
-- Si dos documentos oficiales caen en el mismo tipo (p. ej. un catálogo que junta
-- antecedentes judiciales y disciplinarios), queda una sola obligación: la de
-- ese tipo. Lo que no encaje se ajusta en Ajustes → Tipos de documento.
DO $$
DECLARE
  d RECORD;
  elegido UUID;
BEGIN
  FOR d IN
    SELECT * FROM (VALUES
      ('Hoja de vida', 'Actualizada y firmada.', '^hoja de vida'),
      -- «Foto» o «Fotografía…», pero no «Fotocopia de la cédula».
      ('Foto', 'Fondo blanco, tipo documento, en archivo aparte.', '^foto(graf[ií]a)?\M'),
      ('Documento de identidad', 'Fotocopia de la cédula de ciudadanía ampliada al 150 %.', '(identidad|c[eé]dula)'),
      ('Certificados de estudios y títulos académicos', 'Certificados de estudios y títulos académicos.', '(estudio|diploma|t[ií]tulo|acta de grado)'),
      ('Certificados de experiencia laboral', 'Certificaciones de los empleos anteriores.', 'experiencia'),
      ('Antecedentes judiciales (Policía Nacional)', 'Certificado de antecedentes judiciales.', 'judicial'),
      ('Antecedentes disciplinarios y fiscales (Procuraduría y Contraloría)', 'Certificado de antecedentes disciplinarios (Procuraduría) y fiscales (Contraloría).', '(procuradur|disciplinar|contralor)'),
      ('Certificado de medidas correctivas (Policía Nacional)', 'Consulta del Registro Nacional de Medidas Correctivas.', 'medidas correctivas'),
      ('Certificado de inhabilidades por delitos sexuales', 'Consulta de inhabilidades para trabajar con menores (Ley 1918 de 2018).', 'sexual'),
      ('Certificado de afiliación EPS', 'Certificado de afiliación a la EPS.', '\meps\M'),
      ('Certificado de afiliación AFP / pensión', 'Certificado de afiliación al fondo de pensiones.', '(\mafp\M|pensi[oó]n)'),
      ('Certificado de afiliación a fondo de cesantías', 'Certificado del fondo de cesantías.', 'cesant'),
      ('Examen médico de ingreso', 'Examen médico preocupacional; se entrega dentro de los 15 días siguientes al inicio.', '(examen.*(ingreso|preocupacional)|preocupacional)'),
      ('Certificación bancaria', 'Certificación de la cuenta para el pago de nómina. Solo Bancolombia.', 'bancari')
    ) AS v(nombre, descripcion, patron)
  LOOP
    -- 1) nombre exacto
    SELECT t.id INTO elegido FROM tipo_documento t WHERE t.nombre = d.nombre;

    -- 2) nombre aproximado, solo entre los activos, con desempate
    IF elegido IS NULL THEN
      SELECT t.id INTO elegido
        FROM tipo_documento t
       WHERE t.activo AND t.nombre ~* d.patron
       ORDER BY
         (EXISTS (SELECT 1 FROM documento_requerido r
                   WHERE r.tipo_documento_id = t.id
                     AND r.tipo_vinculo IN ('TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR'))) DESC,
         (SELECT count(*) FROM documento x WHERE x.tipo_documento_id = t.id) DESC,
         t.creado_en ASC
       LIMIT 1;
    END IF;

    -- 3) no existe con ningún nombre: se crea con el oficial
    IF elegido IS NULL THEN
      INSERT INTO tipo_documento (id, nombre, descripcion, requiere_vencimiento, nivel_acceso, activo)
      VALUES (gen_random_uuid(), d.nombre, d.descripcion, false, 'GENERAL', true)
      RETURNING id INTO elegido;
    END IF;

    -- 4) obligatorio para los contratos de trabajo
    INSERT INTO documento_requerido (id, tipo_vinculo, tipo_documento_id, obligatorio)
    SELECT gen_random_uuid(), v.vinculo::tipo_vinculo, elegido, true
      FROM unnest(ARRAY['TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR']) AS v(vinculo)
     WHERE NOT EXISTS (
       SELECT 1 FROM documento_requerido r
        WHERE r.tipo_documento_id = elegido AND r.tipo_vinculo = v.vinculo::tipo_vinculo
     );
  END LOOP;
END $$;

-- La tarjeta profesional no va por vínculo (la exige el cargo), pero el tipo debe existir.
INSERT INTO tipo_documento (id, nombre, descripcion, requiere_vencimiento, nivel_acceso, activo)
SELECT gen_random_uuid(), 'Tarjeta profesional', 'Solo si el cargo la exige (se marca en Ajustes → Cargos).', false, 'GENERAL', true
 WHERE NOT EXISTS (SELECT 1 FROM tipo_documento WHERE nombre = 'Tarjeta profesional');
