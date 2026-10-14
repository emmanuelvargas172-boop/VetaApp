import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { VERDE } from './datos';

/**
 * El texto de cada tiempo, arriba del teléfono.
 *
 * Va arriba y no abajo porque en el celular la mano tapa el tercio inferior
 * cuando Emmanuel le pasa el teléfono a la veterinaria.
 */
export const Titulo = ({ etiqueta, texto }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const e = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 22 });
  const t = spring({ frame: frame - 6, fps, config: { damping: 200 }, durationInFrames: 24 });

  return (
    <div
      style={{
        position: 'absolute',
        top: 150,
        left: 90,
        width: 900,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '0.18em',
          color: VERDE.claro,
          opacity: e,
          transform: `translateY(${interpolate(e, [0, 1], [18, 0])}px)`,
        }}
      >
        {etiqueta}
      </div>
      <div
        style={{
          marginTop: 18,
          fontSize: 50,
          lineHeight: 1.22,
          fontWeight: 600,
          color: '#FFFFFF',
          letterSpacing: '-0.015em',
          opacity: t,
          transform: `translateY(${interpolate(t, [0, 1], [22, 0])}px)`,
        }}
      >
        {texto}
      </div>
    </div>
  );
};
