import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Paquetes que solo deben ejecutarse en el servidor (no empaquetar al cliente)
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg', '@react-pdf/renderer'],
  experimental: {
    serverActions: {
      // Permite Server Actions detrás del túnel de VS Code (probar en el celular):
      // el túnel reescribe Origin a localhost pero deja x-forwarded-host con su
      // dominio, y sin esto Next aborta por su protección anti-CSRF.
      allowedOrigins: ['localhost:3000', '*.devtunnels.ms'],
      // Subir un contrato ya firmado manda el PDF como data URI dentro de la
      // Server Action, y el límite por defecto (1 MB) rechazaba cualquier
      // escaneo real. 4 MB es el techo útil: Vercel corta el cuerpo de la
      // petición en 4,5 MB y base64 infla el archivo un 33 %.
      bodySizeLimit: '4mb',
    },
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
