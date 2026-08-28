// Reemplazo vacío de `server-only` para las pruebas (ver alias en vitest.config.ts).
// El paquete real lanza al importarse fuera de un Server Component, lo que impedía
// probar cualquier módulo de `src/server`.
export {}
