import React from 'react';
import { AbsoluteFill, Img, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CAPTURA_ANCHO, RECORTE_ARRIBA, RECORTE_ABAJO, VERDE } from './datos';

/* Ancho de la pantalla del teléfono dentro del video. Las capturas llegaron
   comprimidas por WhatsApp a 709px de ancho, así que 620 las deja todavía por
   debajo de su tamaño real: ampliarlas a pantalla completa se vería borroso. */
const ANCHO_PANTALLA = 620;
const BISEL = 13;
const CENTRO_Y = 1105; // centro vertical del teléfono; arriba queda el texto

/**
 * Una toma: el teléfono con una captura adentro, el recorte del navegador, el
 * zoom lento y el halo que señala el dato del que habla el texto.
 *
 * `inicio` y `duracion` llegan por props en vez de leerse de la Sequence para
 * que el zoom pueda arrancar en 0 aunque la toma vaya en mitad del tiempo.
 */
export const Marco = ({ toma, duracion }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const recorteAbajo = toma.recorteAbajo ?? RECORTE_ABAJO;
  const escala = ANCHO_PANTALLA / CAPTURA_ANCHO;
  const altoVisible = (recorteAbajo - RECORTE_ARRIBA) * escala;

  // El halo en coordenadas del video: la captura se midió en sus 709x1600
  // originales, acá se le quita el recorte de arriba y se aplica la escala.
  const halo = toma.halo && {
    left: toma.halo.x * escala,
    top: (toma.halo.y - RECORTE_ARRIBA) * escala,
    width: toma.halo.w * escala,
    height: toma.halo.h * escala,
  };

  // Zoom lento hacia el halo: poniendo el origen de la transformación en el
  // centro del halo, el mismo zoom hace de paneo y no hay que animar dos cosas.
  const zoom = interpolate(frame, [0, duracion], [1, 1.07], {
    extrapolateRight: 'clamp',
  });
  const origen = halo
    ? `${halo.left + halo.width / 2}px ${halo.top + halo.height / 2}px`
    : 'center center';

  const entrada = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 18 });
  const haloVisible = spring({
    frame: frame - 22,
    fps,
    config: { damping: 200 },
    durationInFrames: 20,
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          position: 'absolute',
          top: CENTRO_Y - altoVisible / 2 - BISEL,
          width: ANCHO_PANTALLA + BISEL * 2,
          padding: BISEL,
          borderRadius: 46,
          background: '#0A1A12',
          boxShadow: '0 30px 80px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(82,183,136,0.25)',
          opacity: entrada,
          transform: `translateY(${interpolate(entrada, [0, 1], [26, 0])}px)`,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: ANCHO_PANTALLA,
            height: altoVisible,
            overflow: 'hidden',
            borderRadius: 34,
            background: '#FAFAF9',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transform: `scale(${zoom})`,
              transformOrigin: origen,
            }}
          >
            {/* El recorte va en `top` y no en `marginTop`: el margen negativo
                de un hijo en bloque colapsa con el padre y termina corriendo
                al contenedor entero, con lo que el halo quedaba 140px arriba
                del dato que señala. Posicionado absoluto no colapsa. */}
            <Img
              src={staticFile(toma.src)}
              style={{
                position: 'absolute',
                left: 0,
                top: -RECORTE_ARRIBA * escala,
                display: 'block',
                width: ANCHO_PANTALLA,
              }}
            />
            {halo && (
              /* El box-shadow de 9999px oscurece todo lo que queda por fuera
                 del recuadro; el contenedor lo recorta. Es lo que vuelve el
                 video didáctico y no solo bonito: el ojo no tiene a dónde más
                 irse. */
              <div
                style={{
                  position: 'absolute',
                  left: halo.left,
                  top: halo.top,
                  width: halo.width,
                  height: halo.height,
                  borderRadius: 14,
                  border: `3px solid ${VERDE.claro}`,
                  boxShadow: `0 0 0 9999px rgba(10,26,18,${0.6 * haloVisible})`,
                  opacity: haloVisible,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
