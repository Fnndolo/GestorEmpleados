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
