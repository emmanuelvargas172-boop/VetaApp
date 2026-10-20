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
import { textoResultado, textoOmitidos, textoConservadas, textoDeshecho, textoVaAEscribir, textoRestaurados } from './textos.js';

export default function Paso4Escribir({ confirmado, archivo, onReiniciar }) {
  const [fase, setFase] = useState('escribiendo'); // escribiendo | listo | error | deshaciendo | deshecho | error_deshacer
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
        // `marcarFallida` va ANTES de pintar la pantalla, y no después.
        // La pantalla de error trae un botón de Deshacer: si se pinta
        // primero, un clic adentro del roundtrip manda el deshacer en
        // paralelo, y el update de marcarFallida puede aterrizar último y
        // pisar la fila —`estado` de vuelta a 'fallido' y la columna
        // `resumen` entera reemplazada, porque el update de Supabase no
        // mezcla jsonb (escribir.js:250-257)—, borrando el registro de qué
        // conservó el deshacer. No tira nunca (escribir.js:225-265), así
        // que esperarla no puede tapar el error de verdad.
        if (id) await marcarFallida(id, err.message || String(err), confirmado.resumen);
        setError(err.message || String(err));
        setFase('error');
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
      // Fase aparte y NO 'error'. La fase 'error' es la del fallo de
      // escritura y dice "no entró nada": acá el import SÍ entró y lo que
      // falló fue sacarlo. Mandar los dos fallos a la misma pantalla le
      // afirmaría a la clínica que su base está vacía mientras tiene 54
      // mascotas adentro.
      setError(err.message || String(err));
      setFase('error_deshacer');
    }
  };

  if (fase === 'escribiendo') {
    const vaAEscribir = textoVaAEscribir(confirmado.resumen);
    return (
      <Card>
        <h3 style={{ margin: 0, fontSize: 15 }}>4 · Importando</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {/* vaAEscribir no puede quedar vacío acá: paso3Revisar.jsx:119-121
              no deja confirmar si los seis contadores están en cero. Si esa
              condición cambia alguna vez, esta frase depende de ella. */}
          Escribiendo {vaAEscribir.join(', ')}. Es una sola operación: no
          cierres esta pestaña.
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
          {/* No dice "no entró nada". La escritura es atómica, así que no hay
              medio import — pero si lo que se perdió fue la respuesta y no la
              escritura (wifi, portátil cerrado), entró todo y acá se ve un
              error igual. Es el caso que el encabezado de este archivo
              describe y para el que existe el tapón de `aplicar`. Afirmar
              "no entró nada" sería afirmar lo que no se sabe. */}
          No hay medio import: la escritura es una sola operación, así que o
          entró completa o no entró. Lo que no se puede saber desde acá es
          cuál de las dos fue, porque el error puede ser que se haya perdido
          la respuesta y no la escritura.
          {impId && <> La importación quedó anotada con el número <strong>{impId}</strong> en Configuración → Datos y backups: ahí se ve si entró, y se puede deshacer.</>}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={onReiniciar}>Empezar de nuevo</Button>
          {impId && <Button variant="secondary" onClick={hacerDeshacer}>Deshacer por si quedó algo</Button>}
        </div>
      </Card>
    );
  }

  if (fase === 'deshaciendo') {
    return (
      <Card>
        <h3 style={{ margin: 0, fontSize: 15 }}>Deshaciendo…</h3>
        <div style={{ width: 22, height: 22, borderRadius: '50%', border: '3px solid var(--verde-100)', borderTopColor: 'var(--verde-500)', animation: 'spin 0.7s linear infinite' }} />
      </Card>
    );
  }

  if (fase === 'deshecho') {
    const conservadas = textoConservadas(desRes.conservadas);
    const borrado = textoDeshecho(desRes);
    const restaurados = textoRestaurados(desRes);
    return (
      <Card>
        <h3 style={{ margin: 0, fontSize: 15 }}>
          {desRes.estado === 'deshecho_parcial' ? 'Deshecho, casi todo' : 'Deshecho'}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {borrado.length > 0
            ? <>Borré {borrado.join(', ')}.</>
            // De los tres ramos sin nada borrado, solo el de las conservadas
            // puede decir POR QUÉ: ahí los contadores de 014 muestran qué
            // tenía encima cada mascota. Los otros dos no tienen con qué. Los
            // contadores miden lo que existía al momento de deshacer, y que
            // una mascota no se haya borrado ni conservado significa solo que
            // no estaba. Acá eso casi siempre es "el import no la creó",
            // porque entre escribir y deshacer pasan segundos — pero "casi
            // siempre" no alcanza para afirmarlo, así que la frase dice lo que
            // se midió y no la causa.
            //
            // El ramo de `restaurados` existe porque sin él los dos textos se
            // contradicen: un import que solo completó datos no borra ni
            // conserva nada, caía en el último ramo, y la pantalla decía "de
            // este archivo no quedaba nada en la base" y enseguida "Devolví 2
            // datos a como estaban".
            //
            // Dice "lo que QUEDABA de este archivo" y no "lo que había
            // entrado": los contadores no ven lo que ya no está. Un import
            // que creó dos mascotas, una con una consulta encima y la otra
            // borrada a mano, cae en este ramo — y de la borrada a mano no es
            // cierto que le quedó algo escrito encima.
            : conservadas.length > 0
              ? <>No borré nada: a todo lo que quedaba de este archivo le quedó algo escrito encima.</>
              : restaurados
                ? <>No hubo clientes ni mascotas que borrar.</>
                : <>No había nada que borrar: de este archivo no quedaba nada en la base.</>}
          {restaurados && <>{' '}{restaurados}</>}
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
            {/* Dos razones distintas, y hay que decir las dos. Para
                historias y citas la cascada es `on delete cascade`: borrar
                la mascota se lleva las consultas. Para los cobros es
                `on delete set null` (003_cobros.sql:18), así que el recibo
                sobrevive —tiene que, ya está emitido— pero queda sin
                paciente. Decir "se las habría llevado" de un cobro es
                falso, y nombrar solo dos de los cinco contadores de 014
                es falso en los otros tres.

                No dice "lo escribió la clínica": el paso 1 de 014 borra solo
                los eventos de ESTA importación, así que un segundo import que
                le agregó baños a una mascota del primero también la conserva,
                y eso no lo escribió la clínica a mano. Lo único que se puede
                afirmar de los cinco contadores es que no vino en este
                archivo. Es la misma frase que Importaciones.jsx:324, y tiene
                que seguir siendo la misma: son la misma situación vista en
                dos momentos. */}
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
              Eso no lo trajo este archivo. Borrarlas se habría llevado las
              consultas, las citas, las vacunas y los baños con ellas, y
              habría dejado los recibos sin paciente. Se quedaron, y sus
              dueños también. Si de verdad querés sacarlas, hay que borrarlas
              una por una desde la lista de mascotas.
            </p>
          </div>
        )}

        <Button variant="secondary" onClick={onReiniciar}>Importar otro archivo</Button>
      </Card>
    );
  }

  if (fase === 'error_deshacer') {
    return (
      <Card>
        <h3 style={{ margin: 0, fontSize: 15 }}>No se pudo deshacer</h3>
        {/* El mensaje de la función va crudo: `deshacer_importacion` ya los
            escribe en español ("La importación N ya se deshizo") y
            reemplazarlo borraría la única pista que sirve. */}
        <p style={{ fontSize: 13, color: 'var(--danger)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{error}</p>
        {/* `res` dice por dónde se llegó, y hay que distinguirlo: solo
            existe si `aplicar` respondió, o sea si la escritura entró
            seguro. Si es null se llegó desde la pantalla de error, y ahí no
            se sabe si entró —puede haberse perdido la respuesta y no la
            escritura—, así que afirmar "sigue cargado" sería el error
            simétrico del que esta fase vino a arreglar: la fase `error`
            afirmaba que no había entrado nada cuando sí. Una sola frase
            para los dos casos tiene que mentir en uno. */}
        {res ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            <strong>El import sigue cargado.</strong> Lo que falló fue sacarlo,
            así que tus clientes y tus mascotas están en la base — no se perdió
            nada. Podés volver a intentar deshacerlo acá, o desde Configuración
            → Datos y backups, donde la importación quedó anotada
            {impId && <> con el número <strong>{impId}</strong></>}.
          </p>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            <strong>No sé si el import entró o no.</strong> Falló la escritura
            y falló también el intento de deshacerla, así que desde acá no se
            puede saber qué quedó en la base. Lo que dice el error de arriba es
            la única pista. Mirá Configuración → Datos y backups
            {impId && <> con el número <strong>{impId}</strong></>}: ahí se ve
            qué entró de verdad, y se puede deshacer desde ahí.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={hacerDeshacer}>Volver a intentar deshacer</Button>
          <Button variant="secondary" onClick={onReiniciar}>Dejarlo así</Button>
        </div>
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
