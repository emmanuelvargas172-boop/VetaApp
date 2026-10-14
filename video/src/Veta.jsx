import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, interpolate, useCurrentFrame } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Geist';
import { LINEA, DURACION_TOTAL, RETARDO_VOZ, FPS, VERDE } from './datos';
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

/* Ventanas en las que está hablando la voz, en frames. Se arman desde la misma
   LINEA que dibuja el video para que no puedan desfasarse. */
const VENTANAS_VOZ = LINEA.filter((b) => b.audio).map((b) => [
  b.desde + RETARDO_VOZ,
  b.desde + RETARDO_VOZ + b.audio.segundos * FPS,
]);

const MUSICA_SOLA = 0.3;
const MUSICA_BAJO_VOZ = 0.1;
const RAMPA = 14; // frames que tarda en bajar o subir

/**
 * La música baja cuando alguien habla y vuelve a subir en los silencios.
 *
 * Dejarla a volumen fijo obliga a elegir entre que tape la voz o que no se
 * oiga nunca. Bajarla solo mientras hay narración deja las dos cosas: se
 * entiende lo que dicen y el video no queda mudo entre frase y frase.
 */
const volumenMusica = (frame) => {
  for (const [inicio, fin] of VENTANAS_VOZ) {
    if (frame >= inicio - RAMPA && frame <= fin + RAMPA) {
      return interpolate(
        frame,
        [inicio - RAMPA, inicio, fin, fin + RAMPA],
        [MUSICA_SOLA, MUSICA_BAJO_VOZ, MUSICA_BAJO_VOZ, MUSICA_SOLA],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      );
    }
  }
  return MUSICA_SOLA;
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

/** Un tiempo del guion: el título arriba y una o dos tomas abajo. */
const Bloque = ({ bloque }) => {
  if (bloque.tipo === 'portada') return <Portada />;
  if (bloque.tipo === 'cierre') return <Cierre />;

  const t = bloque.tiempo;
  const durToma = Math.floor(bloque.duracion / t.tomas.length);

  return (
    <>
      <Titulo etiqueta={t.etiqueta} texto={t.texto} />
      {t.tomas.map((toma, j) => (
        <Sequence key={j} from={j * durToma} durationInFrames={durToma}>
          <Desvanece duracion={durToma} salida={7}>
            <Marco toma={toma} duracion={durToma} />
          </Desvanece>
        </Sequence>
      ))}
    </>
  );
};

export const Veta = () => (
  <AbsoluteFill
    style={{
      fontFamily,
      background: `radial-gradient(120% 80% at 50% 0%, ${VERDE.fondo2} 0%, ${VERDE.fondo} 62%)`,
    }}
  >
    <Audio src={staticFile('audio/musica.wav')} volume={volumenMusica} />

    {LINEA.map((bloque) => (
      <Sequence key={bloque.id} from={bloque.desde} durationInFrames={bloque.duracion}>
        <Desvanece duracion={bloque.duracion}>
          <Bloque bloque={bloque} />
        </Desvanece>
        {bloque.audio && (
          <Sequence from={RETARDO_VOZ}>
            <Audio src={staticFile(bloque.audio.archivo)} />
          </Sequence>
        )}
      </Sequence>
    ))}

    <Avance />
  </AbsoluteFill>
);
