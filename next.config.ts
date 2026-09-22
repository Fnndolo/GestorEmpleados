import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Paquetes que solo deben ejecutarse en el servidor (no empaquetar al cliente)
  // pdfjs-dist va aparte porque, empaquetado, su "worker falso" busca
  // pdf.worker.mjs dentro del bundle del servidor, donde no existe, y la lectura
  // del texto de un PDF subido (para proponer dónde va la firma) fallaba en
  // silencio: siempre tocaba ubicar la firma a mano. Nativo desde node_modules
  // resuelve el worker por su ruta real.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg', '@react-pdf/renderer', 'pdfjs-dist'],
  experimental: {
    // Sin caché persistente de Turbopack en dev (Next ≥16.1 la activa sola).
    // Dos veces (2026-08-28 y 2026-09-11) quedó desfasada tras crear o borrar
    // archivos de ruta en src/app y el servidor respondía 404 en rutas que sí
    // existían, sin intentar compilarlas y sin arreglarse al reiniciar: solo
    // borrando .next. El arranque en frío es algo más lento; a cambio, lo que
    // hay en disco es lo que se sirve.
    turbopackFileSystemCacheForDev: false,
    serverActions: {
      // Permite Server Actions detrás del túnel de VS Code (probar en el celular):
      // el túnel reescribe Origin a localhost pero deja x-forwarded-host con su
      // dominio, y sin esto Next aborta por su protección anti-CSRF.
      allowedOrigins: ['localhost:3000', '*.devtunnels.ms'],
      // Subir un contrato ya firmado manda el PDF como data URI dentro de la
      // Server Action, y el límite por defecto (1 MB) rechazaba cualquier
      // escaneo real. 4 MB es el techo útil: Vercel corta el cuerpo de la
      // petición en 4,5 MB y base64 infla el archivo un 33 %.
      // Los PDF grandes (contratos, otrosíes, acuerdos, adjuntos) ya NO viajan
      // por aquí: van a /api/archivos/pdf y la acción recibe una referencia
      // (ver src/server/archivos-temporales.ts).
      bodySizeLimit: '4mb',
    },
    // Tope del cuerpo que el proxy deja pasar (por defecto 10 MB). Solo aplica
    // en desarrollo y al respaldo por el servidor: en producción el archivo
    // grande va del navegador directo al almacenamiento con una URL firmada,
    // porque allá el cuerpo se corta en ~4,5 MB pase lo que pase aquí.
    proxyClientMaxBodySize: '30mb',
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
}

export default nextConfig
