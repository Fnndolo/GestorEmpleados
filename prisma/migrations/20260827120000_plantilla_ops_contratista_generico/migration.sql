-- La plantilla OPS se sembro LITERAL de un contrato real firmado por una mujer,
-- asi que todo el texto legal venia en femenino ("LA CONTRATISTA", "identificada",
-- "incursa"). Se generaliza a masculino generico para que sirva a cualquier
-- contratista. Se toca SOLO la plantilla: los contratos ya generados guardan su
-- propio texto congelado y esos NO se modifican (son prueba de lo que se firmo).
-- El orden importa: "DE LA CONTRATISTA" antes que "LA CONTRATISTA", si no queda
-- "DE EL CONTRATISTA".

UPDATE plantilla_contrato SET
  intro = replace(replace(replace(replace(
            intro, 'DE LA CONTRATISTA', 'DEL CONTRATISTA'),
            'de LA CONTRATISTA', 'del CONTRATISTA'),
            'LA CONTRATISTA', 'EL CONTRATISTA'),
            'identificada con cédula', 'identificado con cédula'),
  cierre = replace(replace(replace(
            cierre, 'DE LA CONTRATISTA', 'DEL CONTRATISTA'),
            'de LA CONTRATISTA', 'del CONTRATISTA'),
            'LA CONTRATISTA', 'EL CONTRATISTA')
WHERE intro LIKE '%CONTRATISTA%' OR cierre LIKE '%CONTRATISTA%';

UPDATE clausula_plantilla SET
  titulo = replace(replace(replace(
            titulo, 'DE LA CONTRATISTA', 'DEL CONTRATISTA'),
            'de LA CONTRATISTA', 'del CONTRATISTA'),
            'LA CONTRATISTA', 'EL CONTRATISTA'),
  cuerpo = replace(replace(replace(replace(replace(
            cuerpo, 'DE LA CONTRATISTA', 'DEL CONTRATISTA'),
            'de LA CONTRATISTA', 'del CONTRATISTA'),
            'LA CONTRATISTA', 'EL CONTRATISTA'),
            'identificada con cédula', 'identificado con cédula'),
            'estar incursa', 'estar incurso')
WHERE titulo LIKE '%CONTRATISTA%' OR cuerpo LIKE '%CONTRATISTA%';
