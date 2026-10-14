import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Geist';
import { TIEMPOS, DUR_PORTADA, DUR_CIERRE, DURACION_TOTAL, VERDE } from './datos';
import { Marco } from './Marco';
import { Titulo } from './Titulo';
import { Portada, Cierre } from './Portada';

// La misma tipografía de la app, para que el video y la pantalla que luego ve
// la veterinaria se vean como la misma cosa. Se piden solo los tres pesos que
// se usan y solo latin: sin eso, cada cuadro del render baja 90 archivos de
// fuentes.
const { fontFamily } = loadFont('normal', {
  weights: ['500', '600', '700'],
  subsets: ['latin'],
});

/**
 * Entrada y salida en suave. Lee el frame local de la Sequence que lo
 * contiene, así que el mismo componente sirve para un tiempo de 8 segundos y
 * para una toma de 4 sin pasarle nada más que su duración.
 */
const Desvanece = ({ duracion, children, salida = 9 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, 9, duracion - salida, duracion],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

/* Barra de avance abajo. En un video que se manda por WhatsApp y se ve sin
   sonido, es lo único que le dice al que mira cuánto le falta. */
const Avance = () => {
  const frame = useCurrentFrame();
  const pct = interpolate(frame, [0, DURACION_TOTAL], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        position: 'absolute',
        left: 90,
        right: 90,
        bottom: 70,
        height: 6,
        borderRadius: 999,
        background: 'rgba(255,255,255,0.14)',
      }}
    >
      <div
        style={{
          width: `${pct * 100}%`,
          height: '100%',
          borderRadius: 999,
          background: VERDE.claro,
        }}
      />
    </div>
  );
};

export const Veta = () => {
  // Cada tiempo arranca donde terminó el anterior. Se acumula acá y no en
  // datos.js para que cambiar una duración no obligue a recalcular a mano.
  let cursor = DUR_PORTADA;

  return (
    <AbsoluteFill
      style={{
        fontFamily,
        background: `radial-gradient(120% 80% at 50% 0%, ${VERDE.fondo2} 0%, ${VERDE.fondo} 62%)`,
      }}
    >
      <Sequence durationInFrames={DUR_PORTADA}>
        <Desvanece duracion={DUR_PORTADA}>
          <Portada />
        </Desvanece>
      </Sequence>

      {TIEMPOS.map((t, i) => {
        const desde = cursor;
        cursor += t.duracion;
        const durToma = Math.floor(t.duracion / t.tomas.length);

        return (
          <Sequence key={i} from={desde} durationInFrames={t.duracion}>
            <Desvanece duracion={t.duracion}>
              <Titulo etiqueta={t.etiqueta} texto={t.texto} />
              {t.tomas.map((toma, j) => (
                <Sequence key={j} from={j * durToma} durationInFrames={durToma}>
                  <Desvanece duracion={durToma} salida={7}>
                    <Marco toma={toma} duracion={durToma} />
                  </Desvanece>
                </Sequence>
              ))}
            </Desvanece>
          </Sequence>
        );
      })}

      <Sequence from={cursor} durationInFrames={DUR_CIERRE}>
        <Desvanece duracion={DUR_CIERRE}>
          <Cierre />
        </Desvanece>
      </Sequence>

      <Avance />
    </AbsoluteFill>
  );
};
