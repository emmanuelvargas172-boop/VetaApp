/**
 * Guion del video, en datos.
 *
 * Separar el guion del dibujo deja cambiar un texto, un halo o la duración de
 * un tiempo sin tocar los componentes. Lo que más se va a editar es esto.
 */

export const FPS = 30;
export const ANCHO = 1080;
export const ALTO = 1920;

/* Las capturas son de 709x1600 y vienen con Chrome encima: barra de estado del
   teléfono (0-75) y barra de direcciones (75-162). Eso no es la app, así que se
   recorta dentro del marco en vez de editar los archivos: los originales quedan
   intactos por si hay que rehacer el video.
   Abajo se corta la barra de gestos de Android (1570-1600). */
export const CAPTURA_ANCHO = 709;
export const RECORTE_ARRIBA = 162;
export const RECORTE_ABAJO = 1570;

/* cap08 y cap10 traen además el botón flotante negro de la grabadora de
   pantalla, pegado a la esquina inferior izquierda. Cortar más abajo se lleva
   ese botón junto con la barra de navegación de la app. */
const RECORTE_ABAJO_SIN_NAV = 1478;

export const VERDE = {
  fondo: '#0F2A1F',
  fondo2: '#1B4332',
  claro: '#52B788',
  medio: '#2D6A4F',
};

/**
 * Cada tiempo del guion. Las coordenadas del halo están en píxeles de la
 * captura original (709x1600), no de la pantalla del video: así se pueden leer
 * mirando la imagen en el Finder, sin recalcular nada.
 */
export const TIEMPOS = [
  {
    etiqueta: 'EL DÍA DE HOY',
    texto: 'Abres la app y ves las citas de hoy y las vacunas que urgen',
    tomas: [
      { src: 'capturas/cap01.jpeg', halo: { x: 22, y: 390, w: 666, h: 122 } },
    ],
    duracion: 6 * FPS,
  },
  {
    etiqueta: 'PACIENTES',
    texto: 'Cada mascota con su dueño y su teléfono, a un toque',
    tomas: [
      { src: 'capturas/cap03.jpeg', halo: { x: 22, y: 846, w: 666, h: 156 } },
    ],
    duracion: 6 * FPS,
  },
  {
    etiqueta: 'HISTORIA CLÍNICA',
    texto: 'Qué le diagnosticó, qué le recetó y cuánto pesaba',
    tomas: [
      { src: 'capturas/cap04.jpeg', halo: { x: 46, y: 928, w: 614, h: 128 } },
    ],
    duracion: 6 * FPS,
  },
  {
    etiqueta: 'CITAS',
    texto: 'Las citas del cuaderno, en un calendario que no se pierde ni se moja',
    tomas: [
      { src: 'capturas/cap05.jpeg', halo: { x: 22, y: 866, w: 666, h: 400 } },
      { src: 'capturas/cap07.jpeg', halo: { x: 310, y: 902, w: 144, h: 112 } },
    ],
    duracion: 8 * FPS,
  },
  {
    etiqueta: 'INVENTARIO',
    texto: 'Qué se acabó, qué está por acabarse y cuánta plata hay en bodega',
    tomas: [
      { src: 'capturas/cap11.jpeg', halo: { x: 14, y: 392, w: 680, h: 230 } },
      { src: 'capturas/cap09.jpeg', halo: { x: 36, y: 1230, w: 644, h: 100 } },
    ],
    duracion: 8 * FPS,
  },
  {
    etiqueta: 'RECORDATORIOS',
    /* Dicho exactamente como en el speech: la app arma la lista y el mensaje,
       el envío lo da la veterinaria. Prometerlo automático se cae en dos días
       y está prohibido en §7 de speech-en-clinica.md. */
    texto: 'La app arma la lista y el mensaje. Usted da un clic y sale por WhatsApp',
    tomas: [
      {
        src: 'capturas/cap10.jpeg',
        halo: { x: 24, y: 284, w: 270, h: 70 },
        recorteAbajo: RECORTE_ABAJO_SIN_NAV,
      },
      {
        src: 'capturas/cap08.jpeg',
        halo: { x: 100, y: 536, w: 282, h: 66 },
        recorteAbajo: RECORTE_ABAJO_SIN_NAV,
      },
    ],
    duracion: 8 * FPS,
  },
];

export const DUR_PORTADA = 4 * FPS;
export const DUR_CIERRE = 5 * FPS;

export const DURACION_TOTAL =
  DUR_PORTADA + TIEMPOS.reduce((s, t) => s + t.duracion, 0) + DUR_CIERRE;
