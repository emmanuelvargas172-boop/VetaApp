// ============================================================
// VetaApp · importador/paso2Columnas.jsx
// Qué columna del archivo es qué campo de VetaApp.
//
// La app adivina y MUESTRA lo que entendió, con un ejemplo real al lado.
// Lo que no reconoce entra como "No importar", nunca como basura: una
// columna de observaciones metida en `cedula` deja 54 cédulas inventadas
// que nadie va a notar hasta que haya que buscar a alguien por la suya.
// ============================================================

import { useMemo, useState } from 'react';
import { Button, Card } from '../components/ui.jsx';
import { CAMPOS, mapearEncabezados, faltanRequeridos } from './nucleo/mapear.js';
import { leerHoja } from './leerXlsx.js';

/**
 * Una entrada por columna del archivo, en el orden del archivo.
 *
 * Mira el archivo y no el mapa, porque la pantalla se lee de izquierda a
 * derecha igual que el Excel. Al revés —una fila por campo de VetaApp— las
 * columnas que no se importan desaparecerían de la vista, y ésas son
 * justo las que hay que revisar.
 *
 * Exportada aparte de la vista para poder probarla sin montar React.
 */
export function columnasConEjemplo(encabezados, grilla, mapa) {
  // Del mapa { clave: indice } al inverso { indice: clave }. Si dos claves
  // apuntaran al mismo índice gana la primera, pero eso no pasa:
  // mapearEncabezados no repite índices y la pantalla libera el anterior
  // antes de asignar.
  const porIndice = {};
  for (const [clave, i] of Object.entries(mapa)) {
    if (porIndice[i] === undefined) porIndice[i] = clave;
  }

  return encabezados.map((enc, i) => {
    // El primer valor con datos, no el de la primera fila: la columna de
    // observaciones suele estar vacía arriba y llena abajo, y un ejemplo
    // vacío no sirve para decidir nada.
    let ejemplo = '';
    for (const fila of grilla) {
      const v = String(fila[i] ?? '').trim();
      if (v) { ejemplo = v; break; }
    }
    return {
      i,
      // Un encabezado en blanco se muestra como "Columna 3" y no vacío:
      // hay que poder nombrar la fila para poder cambiarla.
      // Se conserva tal cual si no está vacío (los espacios al final son
      // propios del archivo y la clínica los reconoce así).
      encabezado: String(enc ?? '').trim() ? String(enc) : `Columna ${i + 1}`,
      clave: porIndice[i] ?? null,
      ejemplo,
    };
  });
}

export default function Paso2Columnas({ libro, archivo, hoja, onAtras, onListo }) {
  // Leer la hoja es lo más caro de la pantalla. `useMemo` para que cambiar
  // un desplegable no vuelva a parsear 54 filas en cada tecla.
  const { encabezados, grilla } = useMemo(() => leerHoja(libro, hoja), [libro, hoja]);
  const [mapa, setMapa] = useState(() => mapearEncabezados(encabezados));

  const cols = columnasConEjemplo(encabezados, grilla, mapa);
  const faltan = faltanRequeridos(mapa);

  /**
   * Mandar la columna `i` al campo `clave`.
   *
   * Dos columnas en el mismo campo no es un error que valga la pena
   * explicar: se libera la que lo tenía. La alternativa —dejar las dos y
   * que el núcleo use una— es un dato perdido sin aviso.
   */
  const asignar = (i, clave) => setMapa((m) => {
    const sig = {};
    for (const [k, v] of Object.entries(m)) {
      if (v === i) continue;      // la columna cambió de campo
      if (k === clave) continue;  // el campo cambió de columna
      sig[k] = v;
    }
    if (clave) sig[clave] = i;
    return sig;
  });

  return (
    <Card>
      <h3 style={{ margin: 0, fontSize: 15 }}>2 · Las columnas</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Esto es lo que entendí de <strong>{archivo}</strong>, hoja{' '}
        <strong>{hoja}</strong>. Corregí lo que esté mal. Lo que diga
        <em> No importar</em> se queda en el archivo y no entra a VetaApp.
      </p>

      <div style={{ display: 'grid', gap: 6 }}>
        {cols.map((c) => (
          <div key={c.i} style={{
            display: 'grid', gridTemplateColumns: '1fr 180px 1fr', gap: 10,
            alignItems: 'center', padding: '8px 10px', fontSize: 13,
            background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
          }}>
            <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{c.encabezado}</span>
            <select
              value={c.clave ?? ''}
              onChange={(e) => asignar(c.i, e.target.value || null)}
              style={{ fontSize: 13, padding: '5px 7px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}
            >
              <option value="">No importar</option>
              {CAMPOS.map((f) => (
                <option key={f.clave} value={f.clave}>
                  {f.etiqueta}{f.requerido ? ' *' : ''}
                </option>
              ))}
            </select>
            {/* El ejemplo va cortado: una observación de 200 caracteres
                desarma la grilla y tapa las columnas de abajo. */}
            <span style={{ color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.ejemplo}>
              {c.ejemplo ? `"${c.ejemplo.slice(0, 60)}"` : 'columna vacía'}
            </span>
          </div>
        ))}
      </div>

      {/* El único freno del paso 2, y dice QUÉ falta. "No se puede
          continuar" a secas obliga a adivinar entre catorce desplegables. */}
      {faltan.length > 0 && (
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--danger)', lineHeight: 1.5 }}>
          {/* El `join` con etiquetas adentro NO sirve: JSX escapa el texto
              de un nodo y la clínica leería los `<strong>` literales.
              La coma y el "y" se arman con nodos, no con una cadena. */}
          Falta decirme cuál columna es{' '}
          {faltan.map((f, i) => (
            <span key={f}>
              {i > 0 && (i === faltan.length - 1 ? ' y ' : ', ')}
              <strong>{f}</strong>
            </span>
          ))}.
          Sin eso no hay nada que crear: son el nombre del dueño y el nombre
          de la mascota.
        </p>
      )}

      <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
        <Button variant="secondary" onClick={onAtras}>Atrás</Button>
        <Button
          disabled={faltan.length > 0}
          onClick={() => onListo({ hoja, mapa, encabezados, grilla })}
        >
          Siguiente
        </Button>
      </div>
    </Card>
  );
}
