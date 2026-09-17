-- Las horas extra de AsistencIA se pagan APARTE de la nómina en esta empresa: se
-- necesitaba llevar el estado de ese pago (persona por persona), con la orden de
-- pago que arma la app y el comprobante de que ya se pagó.

-- CreateEnum
CREATE TYPE "estado_pago_horas_extra" AS ENUM ('PENDIENTE', 'PAGADO');

-- CreateTable
CREATE TABLE "pago_horas_extra" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "horas_extra" DECIMAL(7,2) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "detalle_horas" JSONB,
    "estado" "estado_pago_horas_extra" NOT NULL DEFAULT 'PENDIENTE',
    "orden_doc_id" UUID,
    "comprobante_doc_id" UUID,
    "pagado_en" TIMESTAMP(3),
    "pagado_por_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pago_horas_extra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pago_horas_extra_colaborador_id_desde_hasta_key" ON "pago_horas_extra"("colaborador_id", "desde", "hasta");

-- AddForeignKey
ALTER TABLE "pago_horas_extra" ADD CONSTRAINT "pago_horas_extra_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
