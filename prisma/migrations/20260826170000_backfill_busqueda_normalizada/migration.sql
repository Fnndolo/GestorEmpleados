-- Rellena la clave de busqueda de las fichas que nacieron sin ella (p. ej. las
-- creadas al convertir un acuerdo de evaluacion aprobado en colaborador). Con la
-- clave vacia el colaborador no aparecia en ningun buscador.
-- Replica normalizarTexto(): minusculas y sin tildes/diacriticos.
UPDATE colaborador
SET busqueda_normalizada = lower(
  translate(
    nombres || ' ' || apellidos || ' ' || numero_documento,
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
  )
)
WHERE busqueda_normalizada = '';
