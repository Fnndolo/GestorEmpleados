import { PestanasPlantillas } from './pestanas'

/**
 * Las tres pantallas de plantillas comparten cabecera: al ser un layout de Next,
 * las pestañas no se vuelven a montar al cambiar de una a otra.
 */
export default function PlantillasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PestanasPlantillas />
      {children}
    </div>
  )
}
