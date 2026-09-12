-- Expediente del contrato de trabajo: lo que se le pide a quien entra con (o
-- pasa a) contrato laboral. Idempotente: los tipos se buscan por nombre, así
-- que se puede correr sobre una base que ya tenga parte del catálogo.

-- 1) Tipos que cambian de nombre. Conservan sus documentos (misma fila).
UPDATE tipo_documento
   SET nombre = 'Antecedentes disciplinarios y fiscales (Procuraduría y Contraloría)'
 WHERE nombre = 'Antecedentes (Procuraduría/Policía/Contraloría)'
   AND NOT EXISTS (SELECT 1 FROM tipo_documento WHERE nombre = 'Antecedentes disciplinarios y fiscales (Procuraduría y Contraloría)');

UPDATE tipo_documento
   SET nombre = 'Certificados de estudios y títulos académicos'
 WHERE nombre = 'Diploma o acta de grado'
   AND NOT EXISTS (SELECT 1 FROM tipo_documento WHERE nombre = 'Certificados de estudios y títulos académicos');

-- 2) Tipos nuevos.
INSERT INTO tipo_documento (id, nombre, descripcion, requiere_vencimiento, nivel_acceso, activo)
SELECT gen_random_uuid(), v.nombre, v.descripcion, false, 'GENERAL'::nivel_acceso_documento, true
FROM (VALUES
  ('Tarjeta profesional', 'Solo si el cargo la exige (se marca en Ajustes → Cargos).'),
  ('Certificados de experiencia laboral', 'Certificaciones de los empleos anteriores.'),
  ('Antecedentes judiciales (Policía Nacional)', 'Certificado de antecedentes judiciales.'),
  ('Certificado de medidas correctivas (Policía Nacional)', 'Consulta del Registro Nacional de Medidas Correctivas.'),
  ('Certificado de inhabilidades por delitos sexuales', 'Consulta de inhabilidades para trabajar con menores (Ley 1918 de 2018).'),
  ('Certificado de afiliación a fondo de cesantías', 'Certificado del fondo de cesantías.')
) AS v(nombre, descripcion)
WHERE NOT EXISTS (SELECT 1 FROM tipo_documento t WHERE t.nombre = v.nombre);

-- 3) Descripciones con lo que se pide exactamente.
UPDATE tipo_documento SET descripcion = 'Actualizada y firmada.' WHERE nombre = 'Hoja de vida';
UPDATE tipo_documento SET descripcion = 'Fotocopia de la cédula de ciudadanía ampliada al 150 %.' WHERE nombre = 'Documento de identidad';
UPDATE tipo_documento SET descripcion = 'Fondo blanco, tipo documento, en archivo aparte.' WHERE nombre = 'Foto';
UPDATE tipo_documento SET descripcion = 'Certificado de antecedentes disciplinarios (Procuraduría) y fiscales (Contraloría).'
 WHERE nombre = 'Antecedentes disciplinarios y fiscales (Procuraduría y Contraloría)';
UPDATE tipo_documento SET descripcion = 'Certificados de estudios y títulos académicos.'
 WHERE nombre = 'Certificados de estudios y títulos académicos';
UPDATE tipo_documento SET descripcion = 'Examen médico preocupacional; se entrega dentro de los 15 días siguientes al inicio.'
 WHERE nombre = 'Examen médico de ingreso';
UPDATE tipo_documento SET descripcion = 'Certificación de la cuenta para el pago de nómina. Solo Bancolombia.'
 WHERE nombre = 'Certificación bancaria';

-- 4) Obligatorios para los contratos de trabajo (indefinido, fijo, obra o labor).
INSERT INTO documento_requerido (id, tipo_vinculo, tipo_documento_id, obligatorio)
SELECT gen_random_uuid(), v.vinculo::tipo_vinculo, t.id, true
FROM tipo_documento t
JOIN (VALUES
  ('Hoja de vida'),
  ('Foto'),
  ('Documento de identidad'),
  ('Certificados de estudios y títulos académicos'),
  ('Certificados de experiencia laboral'),
  ('Antecedentes judiciales (Policía Nacional)'),
  ('Antecedentes disciplinarios y fiscales (Procuraduría y Contraloría)'),
  ('Certificado de medidas correctivas (Policía Nacional)'),
  ('Certificado de inhabilidades por delitos sexuales'),
  ('Certificado de afiliación EPS'),
  ('Certificado de afiliación AFP / pensión'),
  ('Certificado de afiliación a fondo de cesantías'),
  ('Examen médico de ingreso'),
  ('Certificación bancaria')
) AS d(nombre) ON d.nombre = t.nombre
CROSS JOIN (VALUES ('TERMINO_INDEFINIDO'), ('TERMINO_FIJO'), ('OBRA_LABOR')) AS v(vinculo)
WHERE NOT EXISTS (
  SELECT 1 FROM documento_requerido r
   WHERE r.tipo_documento_id = t.id AND r.tipo_vinculo = v.vinculo::tipo_vinculo
);

-- 5) La tarjeta profesional depende del cargo, no del vínculo.
ALTER TABLE cargo ADD COLUMN IF NOT EXISTS requiere_tarjeta_profesional BOOLEAN NOT NULL DEFAULT false;
