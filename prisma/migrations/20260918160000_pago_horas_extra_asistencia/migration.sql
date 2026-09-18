-- Pago aparte de horas extra: cuando se le anoto a AsistencIA (cierre + pagado) al firmar la orden
ALTER TABLE "pago_horas_extra" ADD COLUMN "asistencia_anotado_en" TIMESTAMP(3);
