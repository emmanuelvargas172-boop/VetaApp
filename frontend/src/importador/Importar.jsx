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
import Paso3Revisar from './paso3Revisar.jsx';

export default function Importar() {
  // `null` = todavía no pasó por ese paso.
  //
  // Lo de adelante se borra al AVANZAR, no al volver atrás: el `onListo`
  // del paso 1 limpia `columnas` antes de pasar al 2. Es al avanzar porque
  // ahí recién se sabe si la hoja cambió, y un mapeo guardado de la hoja
  // vieja apuntaría a columnas que en la nueva no existen. Volver atrás no
  // borra nada, y no hace falta: nadie puede saltarse el paso 2.
  //
  // El paso 2 además se desmonta cuando `paso` deja de ser 2, así que al
  // volver a entrar recalcula el mapeo desde cero contra los encabezados
  // de la hoja que esté elegida ahora.
  const [paso, setPaso] = useState(1);
  const [archivo, setArchivo] = useState(null);  // { libro, archivo, hoja }
  const [columnas, setColumnas] = useState(null); // { hoja, mapa, encabezados, grilla }
  const [confirmado, setConfirmado] = useState(null); // { envio, resumen, decisiones }

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
            <Paso3Revisar
              columnas={columnas}
              onAtras={() => setPaso(2)}
              onListo={(c) => { setConfirmado(c); setPaso(4); }}
            />
          )}
          {paso === 4 && confirmado && (
            // Tarea 13: acá va la escritura. El placeholder existe para que
            // el paso 4 no sea una pantalla en blanco mientras tanto.
            <pre style={{ fontSize: 12 }}>
              {JSON.stringify(confirmado.resumen, null, 2)}
            </pre>
          )}
        </div>
      </Page>
    </>
  );
}
