-- CreateTable
CREATE TABLE "suscripcion_push" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suscripcion_push_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suscripcion_push_endpoint_key" ON "suscripcion_push"("endpoint");

-- CreateIndex
CREATE INDEX "suscripcion_push_user_id_idx" ON "suscripcion_push"("user_id");
