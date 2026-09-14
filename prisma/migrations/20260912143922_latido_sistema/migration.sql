-- Latido del sistema: la hora de la ultima escritura de datos, para que las
-- pantallas abiertas se refresquen solas (ver src/lib/db.ts).

-- CreateTable
CREATE TABLE "latido_sistema" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "cambio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "latido_sistema_pkey" PRIMARY KEY ("id")
);

-- La unica fila: quien lee el latido no tiene que preguntarse si existe.
INSERT INTO "latido_sistema" ("id", "cambio") VALUES (1, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
