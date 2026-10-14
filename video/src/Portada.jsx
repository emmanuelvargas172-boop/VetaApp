import React from 'react';
import { AbsoluteFill, Img, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { VERDE } from './datos';

/* El logo es un PNG con fondo blanco, no transparente. Sobre el verde oscuro
   quedaría un rectángulo blanco suelto, así que se mete a propósito en una
   tarjeta blanca con esquinas redondeadas: deja de ser un error y pasa a ser
   parte del diseño. */
const Tarjeta = ({ escala = 1, opacidad = 1 }) => (
  <div
    style={{
      background: '#FFFFFF',
      borderRadius: 32,
      padding: '34px 46px',
      boxShadow: '0 24px 70px rgba(0,0,0,0.35)',
      transform: `scale(${escala})`,
      opacity: opacidad,
    }}
  >
    <Img src={staticFile('logo.png')} style={{ display: 'block', width: 620 }} />
  </div>
);

export const Portada = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame, fps, config: { damping: 180 }, durationInFrames: 28 });
  const t = spring({ frame: frame - 16, fps, config: { damping: 200 }, durationInFrames: 26 });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <Tarjeta escala={interpolate(e, [0, 1], [0.9, 1])} opacidad={e} />
      <div
        style={{
          marginTop: 64,
          width: 860,
          textAlign: 'center',
          fontSize: 54,
          lineHeight: 1.25,
          fontWeight: 600,
          color: '#FFFFFF',
          letterSpacing: '-0.015em',
          opacity: t,
          transform: `translateY(${interpolate(t, [0, 1], [24, 0])}px)`,
        }}
      >
        El cuaderno de citas, en el celular
      </div>
    </AbsoluteFill>
  );
};

export const Cierre = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame, fps, config: { damping: 180 }, durationInFrames: 26 });
  const p = spring({ frame: frame - 18, fps, config: { damping: 200 }, durationInFrames: 26 });
  const w = spring({ frame: frame - 34, fps, config: { damping: 200 }, durationInFrames: 26 });

  const linea = (texto, resorte, estilo) => (
    <div
      style={{
        opacity: resorte,
        transform: `translateY(${interpolate(resorte, [0, 1], [20, 0])}px)`,
        ...estilo,
      }}
    >
      {texto}
    </div>
  );

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <Tarjeta escala={interpolate(e, [0, 1], [0.94, 1])} opacidad={e} />

      {linea('Esencial $69.000 · Avanzado $99.000 al mes', p, {
        marginTop: 70,
        fontSize: 46,
        fontWeight: 600,
        color: '#FFFFFF',
        letterSpacing: '-0.015em',
      })}

      {/* Ocho días, no catorce: es lo que da la base de datos
          (010_prueba_8_dias.sql) y lo que ya dice la landing. */}
      {linea('8 días de prueba · sin tarjeta', p, {
        marginTop: 16,
        fontSize: 36,
        fontWeight: 500,
        color: VERDE.claro,
      })}

      {/* El número separado en tres grupos: el que lo ve sin sonido tiene que
          poder copiarlo de un vistazo, y diez dígitos seguidos no se retienen. */}
      {linea('WhatsApp 320 338 3837', w, {
        marginTop: 54,
        fontSize: 44,
        fontWeight: 700,
        color: '#FFFFFF',
        background: 'rgba(82,183,136,0.16)',
        border: `2px solid ${VERDE.claro}`,
        borderRadius: 999,
        padding: '20px 48px',
      })}
    </AbsoluteFill>
  );
};
