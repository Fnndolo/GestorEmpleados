import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Paquetes que solo deben ejecutarse en el servidor (no empaquetar al cliente)
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg', '@react-pdf/renderer'],
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
