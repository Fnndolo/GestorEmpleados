-- CreateEnum
CREATE TYPE "origen_horario" AS ENUM ('MANUAL', 'ASISTENCIA');

-- CreateTable
CREATE TABLE "horario" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "dias" JSONB NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "horario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asignacion_horario" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "horario_id" UUID,
    "dias" JSONB NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE,
    "motivo" TEXT,
    "origen" "origen_horario" NOT NULL DEFAULT 'MANUAL',
    "documento_id" UUID,
    "sincronizado_en" TIMESTAMP(3),
    "error_sincronizacion" TEXT,
    "asignado_por_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asignacion_horario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turno_dominical" (
    "id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,
    "creado_por_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turno_dominical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cronograma_dominical" (
    "id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,
    "mes" TEXT NOT NULL,
    "publicado_en" TIMESTAMP(3),
    "publicado_por_id" UUID,
    "avisados" JSONB,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cronograma_dominical_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "horario_nombre_key" ON "horario"("nombre");

-- CreateIndex
CREATE INDEX "asignacion_horario_colaborador_id_desde_idx" ON "asignacion_horario"("colaborador_id", "desde");

-- CreateIndex
CREATE INDEX "turno_dominical_sede_id_fecha_idx" ON "turno_dominical"("sede_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "turno_dominical_fecha_colaborador_id_key" ON "turno_dominical"("fecha", "colaborador_id");

-- CreateIndex
CREATE UNIQUE INDEX "cronograma_dominical_sede_id_mes_key" ON "cronograma_dominical"("sede_id", "mes");

-- AddForeignKey
ALTER TABLE "asignacion_horario" ADD CONSTRAINT "asignacion_horario_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion_horario" ADD CONSTRAINT "asignacion_horario_horario_id_fkey" FOREIGN KEY ("horario_id") REFERENCES "horario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno_dominical" ADD CONSTRAINT "turno_dominical_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno_dominical" ADD CONSTRAINT "turno_dominical_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cronograma_dominical" ADD CONSTRAINT "cronograma_dominical_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permisos del módulo nuevo (Horarios y cronograma). Quién más accede se
-- define después desde Configuración → Roles; de entrada, quienes ya
-- administran personas.
INSERT INTO "rol_permiso" ("id", "rol_id", "modulo", "accion", "alcance")
SELECT gen_random_uuid(), r."id", 'horarios', a."accion"::"accion_permiso", 'TODAS_SEDES'
FROM "rol" r
CROSS JOIN (VALUES ('VER'), ('CREAR'), ('EDITAR'), ('ELIMINAR')) AS a("accion")
WHERE r."nombre" IN ('Administrador', 'Recursos Humanos')
ON CONFLICT ("rol_id", "modulo", "accion") DO NOTHING;
