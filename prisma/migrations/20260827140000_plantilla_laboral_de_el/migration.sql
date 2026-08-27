-- La plantilla laboral se sembro literal del contrato real y arrastra "DE EL
-- EMPLEADO" / "DE EL EMPLEADOR" donde el castellano pide la contraccion "DEL".
-- Solo se corrige la forma en MAYUSCULA: en minuscula "de el" es casi siempre
-- parte de "desde el ...", que esta bien escrito y no se debe tocar.
-- Como en la migracion anterior, esto cambia SOLO la plantilla; los contratos ya
-- generados conservan su texto congelado.

UPDATE plantilla_contrato SET
  intro  = replace(intro,  'DE EL ', 'DEL '),
  cierre = replace(cierre, 'DE EL ', 'DEL ')
WHERE intro LIKE '%DE EL %' OR cierre LIKE '%DE EL %';

UPDATE clausula_plantilla SET
  titulo = replace(titulo, 'DE EL ', 'DEL '),
  cuerpo = replace(cuerpo, 'DE EL ', 'DEL ')
WHERE titulo LIKE '%DE EL %' OR cuerpo LIKE '%DE EL %';
