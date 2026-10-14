import React from 'react';
import { Composition } from 'remotion';
import { Veta } from './Veta';
import { FPS, ANCHO, ALTO, DURACION_TOTAL } from './datos';

/* Vertical 1080x1920: el video se va a ver en el celular y se va a mandar por
   WhatsApp, que es donde está el cliente. Un 16:9 ahí sale con dos franjas
   negras y se ve pequeño. */
export const Root = () => (
  <>
    <Composition
      id="Veta"
      component={Veta}
      durationInFrames={DURACION_TOTAL}
      fps={FPS}
      width={ANCHO}
      height={ALTO}
    />
  </>
);
