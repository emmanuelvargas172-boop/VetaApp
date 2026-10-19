// ============================================================
// VetaApp · importador/paso4Escribir.jsx
// El único paso que escribe.
//
// ---------- EL ORDEN, Y POR QUÉ ----------
//   1. abrirImportacion()  → la fila queda en 'en_curso', sin nada escrito
//   2. aplicar()           → UNA llamada, UNA transacción, todo o nada
//   3. si revienta         → marcarFallida() y el error crudo en pantalla
//
// Si el wifi se corta entre 1 y 2 queda una fila en 'en_curso' con cero
// filas colgadas: eso se puede mirar. Si se corta durante 2, la
// transacción no llega al commit y Postgres la deshace entera: no hay
// medio import. Si se corta entre 2 y 3 —escribió y la respuesta no
// volvió— la fila queda en 'en_curso' CON los datos adentro, y la salida
// es deshacerla desde la lista de importaciones.
//
// NO hay reintento automático, y es por ese último caso: sobre una
// llamada que no se sabe si llegó, reintentar solo es la forma de
// duplicar un import entero.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '../components/ui.jsx';
import { abrirImportacion, aplicar, marcarFallida, deshacer } from './escribir.js';
import { textoResultado, textoOmitidos, textoConservadas, textoDeshecho } from './textos.js';

export default function Paso4Escribir({ confirmado, archivo, onReiniciar }) {
  const [fase, setFase] = useState('escribiendo'); // escribiendo | listo | error | deshaciendo | deshecho
  const [res, setRes] = useState(null);
  const [desRes, setDesRes] = useState(null);
  const [error, setError] = useState('');
  const [impId, setImpId] = useState(null);

  // React en desarrollo monta cada efecto dos veces. Sin este candado, un
  // `npm run dev` escribiría el import DOS veces en la cuenta real. Es el
  // único lugar de la app donde ese detalle de React cuesta 54 clientes
  // duplicados, así que el candado va acá y no se saca.
  const arrancado = useRef(false);

  useEffect(() => {
    if (arrancado.current) return;
    arrancado.current = true;

    (async () => {
      let id = null;
      try {
        id = await abrirImportacion({
          archivo: archivo.archivo,
          hoja: archivo.hoja,
          mapeo: archivo.mapa,
        });
        setImpId(id);
        const r = await aplicar(id, confirmado.envio, confirmado.resumen);
        setRes(r);
        setFase('listo');
      } catch (err) {
        setError(err.message || String(err));
        setFase('error');
        // Deja constancia de que alguien intentó importar y falló. No tira
        // nunca: si tirara, taparía el error de verdad que está arriba.
        if (id) await marcarFallida(id, err.message || String(err), confirmado.resumen);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // El array vacío es intencional: el efecto corre una sola vez, controlado
  // por el candado arrancado. `confirmado` y `archivo` no cambian entre
  // renders en este paso —el paso 4 es terminal— y agregarlos al array no
  // cambiaría nada, pero sacar el candado sí: en dev React montaría dos
  // veces y escribiría el import dos veces en la cuenta real.

  const hacerDeshacer = async () => {
    if (!impId) return;
    setFase('deshaciendo');
    try {
      const d = await deshacer(impId);
      setDesRes(d);
      setFase('deshecho');
    } catch (err) {
      setError(err.message || String(err));
      setFase('error');
    }
  };

  if (fase === 'escribiendo') {
    return (
      <Card>
        <h3 style={{ margin: 0, fontSize: 15 }}>4 · Importando</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Escribiendo {confirmado.resumen.tutores_nuevos} tutores y{' '}
          {confirmado.resumen.mascotas_nuevas} mascotas. Es una sola operación:
          no cierres esta pestaña.
        </p>
        {/* Una barra que avanza sola sería una mentira: la escritura es una
            sola llamada y no hay progreso que reportar. Un indicador que
            da vueltas dice la verdad —está pasando algo, no sé cuánto
            falta— y es lo que ya usa el resto de la app (Splash). */}
        <div style={{ width: 22, height: 22, borderRadius: '50%', border: '3px solid var(--verde-100)', borderTopColor: 'var(--verde-500)', animation: 'spin 0.7s linear infinite' }} />
      </Card>
    );
  }

  if (fase === 'error') {
    return (
      <Card>
        <h3 style={{ margin: 0, fontSize: 15 }}>No se pudo importar</h3>
        {/* El error de Postgres va crudo. Reemplazarlo por "ocurrió un
            error" borra la única pista que sirve para arreglarlo, y el
            mensaje de las funciones de la tarea 7 ya está escrito en
            español para que se pueda leer. */}
        <p style={{ fontSize: 13, color: 'var(--danger)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{error}</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          No quedó nada a medias: la escritura es una sola operación, así que o
          entró todo o no entró nada.
          {impId && <> Si querés asegurarte, la importación quedó anotada con el número <strong>{impId}</strong> en Configuración → Datos y backups.</>}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={onReiniciar}>Empezar de nuevo</Button>
          {impId && <Button variant="secondary" onClick={hacerDeshacer}>Deshacer por si quedó algo</Button>}
        </div>
      </Card>
    );
  }

  if (fase === 'deshaciendo') {
    return <Card>Deshaciendo…</Card>;
  }

  if (fase === 'deshecho') {
    const conservadas = textoConservadas(desRes.conservadas);
    const borrado = textoDeshecho(desRes);
    return (
      <Card>
        <h3 style={{ margin: 0, fontSize: 15 }}>
          {desRes.estado === 'deshecho_parcial' ? 'Deshecho, casi todo' : 'Deshecho'}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {borrado.length > 0
            ? <>Borré {borrado.join(', ')}.</>
            // El deshacer funcionó y no borró nada porque todo tenía trabajo
            // clínico encima. Hay que decir que funcionó, porque una lista
            // de ceros se lee como que falló.
            : <>No borré nada: a todo lo que había entrado por el archivo le quedó algo escrito encima.</>}
        </p>

        {/* Lo más importante de esta pantalla. Si no se explica, la clínica
            cree que "Deshacer" falló — y lo que pasó es que NO borró el
            trabajo clínico que ella escribió después. */}
        {conservadas.length > 0 && (
          <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
              {conservadas.length === 1
                ? 'A una mascota no la borré'
                : `A ${conservadas.length} mascotas no las borré`}
            </p>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {conservadas.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
            {/* Dice "todo eso de arriba" y no "esas consultas y esas citas":
                014 mira cinco contadores (historias, citas, vacunas, baños y
                cobros), así que nombrar dos sería afirmar algo falso en los
                otros tres casos. Lo que arriba ya está nombrado una por una
                no hace falta repetirlo acá mal. */}
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
              Borrarlas se habría llevado con ellas todo eso de arriba, que lo
              escribió la clínica y no el archivo. Se quedaron, y sus dueños
              también. Si de verdad querés sacarlas, hay que borrarlas una por
              una desde su ficha.
            </p>
          </div>
        )}

        <Button variant="secondary" onClick={onReiniciar}>Importar otro archivo</Button>
      </Card>
    );
  }

  // fase === 'listo'
  // Lo que se muestra es lo que devolvió Postgres, NO lo que predijo el
  // paso 3. El paso 3 dijo 54 mascotas; la función puede haber escrito 53
  // porque una cédula estaba repetida. Mostrar la predicción sería mentir
  // con un número que ya se sabe falso.
  const lineas = textoResultado(res);
  const omitidos = textoOmitidos(res.omitidos);

  return (
    <Card>
      <h3 style={{ margin: 0, fontSize: 15 }}>Listo</h3>
      {lineas.length > 0 ? (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.8 }}>
          {lineas.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          No había nada nuevo: todo lo del archivo ya estaba cargado.
        </p>
      )}

      {omitidos.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
            {omitidos.length === 1
              ? 'Un dato que no pude guardar'
              : `${omitidos.length} datos que no pude guardar`}
          </p>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {omitidos.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link to="/app/mascotas"><Button>Ver mis clientes</Button></Link>
        <Button variant="secondary" onClick={onReiniciar}>Importar otro archivo</Button>
        {/* Deshacer va ACÁ y no solo en la lista. Este es el momento en que
            la clínica mira los números y decide si está bien; mandarla a
            buscar otra pantalla cuando ya vio que está mal es cuando menos
            va a encontrar dónde. */}
        <Button variant="secondary" onClick={hacerDeshacer}>Deshacer esta importación</Button>
      </div>
    </Card>
  );
}
