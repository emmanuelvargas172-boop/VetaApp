// ============================================================
// VetaApp · importador/Importar.jsx
// La máquina de estados de los cuatro pasos. Nada más.
//
// Cada paso recibe lo que armó el anterior y avisa para arriba. Ningún
// paso lee el estado de otro: así el paso 3 —el único que decide qué se
// escribe— se puede leer completo y auditar sin seguir hilos.
//
// No existe un botón que salte del 1 al 4. Es a propósito: el paso 3 es
// la pantalla que hace que esto sea seguro, y una base de clientes ajena
// subida por error solo se nota ahí.
// ============================================================

import { useState } from 'react';
import { Topbar, Page } from '../components/ui.jsx';
import Paso1Archivo from './paso1Archivo.jsx';
import Paso2Columnas from './paso2Columnas.jsx';

export default function Importar() {
  // `null` = todavía no pasó por ese paso. Volver atrás BORRA lo de
  // adelante: si se guardara, cambiar la hoja en el paso 1 dejaría el
  // mapeo de la hoja vieja apuntando a columnas que ya no existen.
  const [paso, setPaso] = useState(1);
  const [archivo, setArchivo] = useState(null);  // { libro, archivo, hoja }
  const [columnas, setColumnas] = useState(null); // { hoja, mapa, encabezados, grilla }

  const titulos = {
    1: 'Elegí el archivo',
    2: 'Revisá las columnas',
    3: 'Mirá qué va a pasar',
    4: 'Listo',
  };

  return (
    <>
      <Topbar
        title="Importar base de clientes"
        subtitle={`Paso ${paso} de 4 · ${titulos[paso]}`}
      />
      <Page>
        <div style={{ maxWidth: 820 }}>
          {paso === 1 && (
            <Paso1Archivo onListo={(a) => { setArchivo(a); setColumnas(null); setPaso(2); }} />
          )}
          {paso === 2 && archivo && (
            <Paso2Columnas
              libro={archivo.libro}
              archivo={archivo.archivo}
              hoja={archivo.hoja}
              onAtras={() => setPaso(1)}
              onListo={(c) => { setColumnas(c); setPaso(3); }}
            />
          )}
          {paso === 3 && columnas && (
            // Tarea 12.
            <pre style={{ fontSize: 12 }}>
              {JSON.stringify({ hoja: columnas.hoja, mapa: columnas.mapa, filas: columnas.grilla.length }, null, 2)}
            </pre>
          )}
        </div>
      </Page>
    </>
  );
}
