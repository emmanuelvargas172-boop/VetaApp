// ============================================================
// VetaApp · components/ConfirmDialog.jsx
// La pregunta que aparece antes de algo que no se puede deshacer.
//
// Archivo propio y no dentro de ui.jsx porque ui.jsx son primitivas sin
// estado —Button, Card, Badge— y esto escucha el teclado y mueve el foco.
//
// Reemplaza a `window.confirm`, que funciona pero tiene dos problemas que
// se ven en una clínica: lo pinta el navegador con su propio idioma y su
// propio look (en el screenshot de Chrome sale "localhost:3000 dice"), y
// algunos navegadores ofrecen "no volver a mostrar estos diálogos" — una
// casilla que, marcada por accidente, hace que `window.confirm` devuelva
// `false` para siempre y el borrado deje de funcionar sin ningún aviso.
//
// Props:
//   abierto         — si no, no se renderiza nada.
//   titulo, mensaje — el texto. Lo arma quien llama (para archivos lo arma
//                     `preguntaBorrado` en archivos/textos.js), no este
//                     componente: así el texto se puede probar y acá no
//                     queda ninguna decisión de redacción.
//   textoConfirmar  — la palabra del botón rojo. Que diga "Borrar" y no
//                     "Aceptar": el botón tiene que nombrar lo que hace.
//   onConfirmar     — se llama solo con clic en el botón rojo.
//   onCancelar      — clic en Cancelar, Escape, o clic afuera.
//   ocupado         — mientras la operación está en vuelo. Desactiva los
//                     dos botones y bloquea Escape y el clic afuera: si el
//                     DELETE ya salió, cerrar el modal no lo detiene y
//                     dejaría a la clínica creyendo que lo canceló.
// ============================================================

import { useEffect, useRef } from 'react';
import { Button } from './ui';

export default function ConfirmDialog({
  abierto,
  titulo,
  mensaje,
  textoConfirmar = 'Borrar',
  onConfirmar,
  onCancelar,
  ocupado = false,
}) {
  const pie = useRef(null);

  // El foco arranca en CANCELAR, no en el botón rojo. Quien abre este modal
  // está a un Enter de borrar una historia clínica que no se recupera, y el
  // Enter de reflejo —el que se aprieta sin leer— tiene que caer del lado
  // que no destruye nada.
  //
  // Se busca el primer <button> del pie en vez de pasarle una ref al botón
  // porque `Button` (ui.jsx) no reenvía refs, y agregarle forwardRef sería
  // tocar la primitiva que usa toda la app para resolver algo de acá.
  // Cancelar es el primero del pie A PROPÓSITO: eso fija tanto este foco
  // inicial como el orden del Tab.
  useEffect(() => {
    if (abierto) pie.current?.querySelector('button')?.focus();
  }, [abierto]);

  // Escape cancela. Se escucha en el documento y no en el div porque el
  // foco puede terminar en cualquier lado si el usuario le da Tab de más.
  useEffect(() => {
    if (!abierto) return;
    const alTeclado = (e) => {
      if (e.key === 'Escape' && !ocupado) onCancelar?.();
    };
    document.addEventListener('keydown', alTeclado);
    return () => document.removeEventListener('keydown', alTeclado);
  }, [abierto, ocupado, onCancelar]);

  if (!abierto) return null;

  return (
    <>
      {/* z-index 60 y no el 30 del overlay de Historias: el panel lateral
          de esa pantalla usa 40, y con menos este modal quedaría pintado
          debajo del panel. */}
      <div
        onClick={() => { if (!ocupado) onCancelar?.(); }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60 }}
      />

      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          zIndex: 61, width: 'min(420px, calc(100vw - 32px))',
          background: 'var(--surface)', borderRadius: 'var(--r-lg)',
          // --shadow-lg y no --shadow-xl: `--shadow-xl` no está definido en
          // index.css. Historias.jsx:758 lo usa para el panel lateral y por
          // eso ese panel se pinta sin sombra. Acá no se repite el error.
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
          padding: 20, boxSizing: 'border-box',
        }}
      >
        <h3 style={{
          margin: 0, fontSize: 16, fontWeight: 700,
          color: 'var(--text)', letterSpacing: '-0.015em',
        }}>
          {titulo}
        </h3>

        <p style={{
          margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.55,
          color: 'var(--text-muted)', wordBreak: 'break-word',
        }}>
          {mensaje}
        </p>

        <div
          ref={pie}
          style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}
        >
          <Button variant="secondary" size="md" onClick={onCancelar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button variant="danger" size="md" onClick={onConfirmar} disabled={ocupado}>
            {ocupado ? 'Borrando…' : textoConfirmar}
          </Button>
        </div>
      </div>
    </>
  );
}
