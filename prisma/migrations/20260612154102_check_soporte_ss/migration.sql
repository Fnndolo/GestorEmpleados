-- Defensa en BD (C11): una cuenta de cobro OPS no puede quedar APROBADA ni PAGADA
-- sin un soporte de seguridad social con verificación VALIDA. Se implementa con un
-- trigger (un CHECK no puede referenciar otra tabla en PostgreSQL).

CREATE OR REPLACE FUNCTION verificar_soporte_ss_cuenta_cobro()
RETURNS TRIGGER AS $$
DECLARE
  v_estado_ss text;
BEGIN
  IF NEW.estado IN ('APROBADA', 'PAGADA') THEN
    SELECT s.estado_verificacion::text INTO v_estado_ss
    FROM soporte_ss_ops s
    WHERE s.cuenta_cobro_id = NEW.id;

    IF v_estado_ss IS NULL OR v_estado_ss <> 'VALIDA' THEN
      RAISE EXCEPTION 'No se puede aprobar o pagar una cuenta de cobro sin soporte de seguridad social válido';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verificar_soporte_ss ON cuenta_cobro_ops;
CREATE TRIGGER trg_verificar_soporte_ss
  BEFORE INSERT OR UPDATE ON cuenta_cobro_ops
  FOR EACH ROW
  EXECUTE FUNCTION verificar_soporte_ss_cuenta_cobro();
