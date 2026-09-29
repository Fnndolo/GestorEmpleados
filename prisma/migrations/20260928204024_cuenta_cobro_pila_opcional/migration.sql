-- AlterTable
ALTER TABLE "cuenta_cobro_ops" ADD COLUMN     "requiere_pila" BOOLEAN NOT NULL DEFAULT true;

-- La defensa en BD (C11) sigue, pero solo donde la PILA aplica: cuentas ligadas a
-- un contrato OPS a las que se les pidió. Antes bloqueaba también las cuentas de
-- empleados no OPS (comisiones, saldos), que la aplicación ya dejaba aprobar.
CREATE OR REPLACE FUNCTION verificar_soporte_ss_cuenta_cobro()
RETURNS TRIGGER AS $$
DECLARE
  v_estado_ss text;
BEGIN
  IF NEW.estado IN ('APROBADA', 'PAGADA') AND NEW.contrato_ops_id IS NOT NULL AND NEW.requiere_pila THEN
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
