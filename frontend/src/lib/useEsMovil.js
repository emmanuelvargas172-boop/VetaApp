import { useEffect, useState } from 'react';

/**
 * ¿La pantalla es de celular?
 *
 * Existe porque casi toda la app está escrita con `style={{}}` inline, y los
 * estilos inline no admiten media queries. La única forma de ramificar el
 * layout es decidirlo en JS y pasar un valor distinto:
 *
 *   gridTemplateColumns: esMovil ? '1fr' : '2fr 1.4fr 0.9fr'
 *
 * Se usa matchMedia y no window.innerWidth con un listener de `resize`
 * porque matchMedia solo dispara al cruzar el umbral, no en cada píxel que
 * el usuario arrastra.
 *
 * 768px es el corte: por debajo está cualquier celular en vertical (el más
 * ancho de uso común ronda los 430 CSS px) y las tablets pequeñas en
 * vertical, que sufren los mismos grids de seis columnas.
 */
export function useEsMovil(maxAncho = 768) {
  const consulta = `(max-width: ${maxAncho}px)`;

  // El valor inicial se lee de una vez, no en un efecto: si arrancara en
  // false el usuario vería un frame con el layout de escritorio y un salto.
  const [esMovil, setEsMovil] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(consulta).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const alCambiar = (e) => setEsMovil(e.matches);
    // Se vuelve a leer aquí por si el umbral cambió entre renders.
    setEsMovil(mq.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, [consulta]);

  return esMovil;
}

export default useEsMovil;
