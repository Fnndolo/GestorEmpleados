-- Qué datos se comparten con AsistencIA (todo encendido: igual que hasta ahora).
ALTER TABLE "configuracion_empresa"
  ADD COLUMN "asistencia_colaboradores" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "asistencia_fotos" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "asistencia_horas" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "asistencia_horarios" BOOLEAN NOT NULL DEFAULT true;
