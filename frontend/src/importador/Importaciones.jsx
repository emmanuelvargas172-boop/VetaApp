// ============================================================
// VetaApp · importador/Importaciones.jsx
// Qué se importó, cuándo, y poder deshacerlo después.
//
// ---------- PARA QUÉ SIRVE, EN CONCRETO ----------
//   · Deshacer al otro día. El botón del paso 4 vive mientras la pestaña
//     esté abierta; cuando la clínica se da cuenta mañana de que importó
//     la hoja vieja, esto es lo único que hay.
//   · Leer el resumen de hace seis meses. "¿Por qué Nube no tiene fecha
//     de nacimiento?" tiene respuesta acá: estaba mal en el archivo. Sin
//     esta pantalla la respuesta es "la app se la comió".
//   · Ver las que quedaron en 'en_curso': escribieron y no alcanzaron a
//     responder. Es el único lugar donde eso se nota.
// ============================================================

import { useEffect, useState } from 'react';
import { Badge, Button } from '../components/ui.jsx';
import { listarImportaciones, deshacer } from './escribir.js';
import { textoConservadas, textoDeshecho, textoVaAEscribir, textoRestaurados } from './textos.js';

export const ESTADOS = {
  en_curso:         { texto: 'Sin terminar',    tono: 'warn' },
  listo:            { texto: 'Importada',       tono: 'success' },
  deshecho:         { texto: 'Deshecha',        tono: 'neutral' },
  // No dice lo mismo que 'deshecho' a propósito: hay que poder ver de un
  // vistazo cuál dejó mascotas atrás, porque esas siguen en la base.
  deshecho_parcial: { texto: 'Deshecha en parte', tono: 'warn' },
  fallido:          { texto: 'Falló',           tono: 'danger' },
};

const FECHA = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };

/**
 * ¿Se le puede ofrecer el botón de Deshacer a esta fila?
 *
 * La regla es la de 014:65-67 y no una lista propia: deshacer está bloqueado
 * solo para lo que ya se deshizo. Enumerar al revés —'listo' y 'en_curso'—
 * deja afuera a 'fallido', y una fila 'fallido' puede tener datos adentro:
 * marcarFallida decide mirando solo `duenos` y `mascotas` (escribir.js:186),
 * así que un archivo que solo le agregó 74 baños a mascotas que ya existían y
 * perdió la respuesta queda 'fallido' con los 74 escritos. Sin este botón no
 * hay forma de sacarlos.
 *
 * Un estado desconocido también lleva botón: la autoridad es la función de
 * Postgres, que revienta con un mensaje en español si no se puede, y ese
 * mensaje se muestra. Esconder el botón por las dudas esconde datos.
 */
export function sePuedeDeshacer(estado) {
  return estado !== 'deshecho' && estado !== 'deshecho_parcial';
}

/**
 * El `resumen` del paso 3, en una línea.
 *
 * Es lo que la clínica vio y confirmó, no lo que Postgres escribió. Suena
 * peor y es mejor: seis meses después la pregunta es "qué decía el archivo
 * que subí", y eso es exactamente lo que guarda esta columna.
 *
 * Sale de `textoVaAEscribir` y no de un bucle propio, aunque el nombre esté
 * en futuro y acá se esté leyendo el pasado. Dos razones. Una: es el mismo
 * objeto —el `resumen` del paso 3— y repetir las seis llaves acá sería un
 * segundo lugar que se desincroniza con el primero. Dos: esa función ya tiene
 * resueltos los dos problemas que un bucle nuevo volvería a tener, el plural
 * ("1 tutores") y el nombre honesto del contador de tratamientos, que no
 * distingue baño de desparasitación y por eso no puede decir solo "baños".
 */
export function lineaResumen(imp) {
  const r = imp?.resumen ?? {};
  // El error vive en el mismo jsonb (escribir.js:207). En esa fila es el
  // único dato que importa, así que reemplaza a los números.
  if (r.error) return `Falló: ${r.error}`;

  const partes = textoVaAEscribir(r);

  // Sin resumen no se inventan ceros: "0 tutores · 0 mascotas" afirma que
  // no entró nada, y en una fila de 'en_curso' eso es justo lo que no se
  // sabe. `textoVaAEscribir` no escribe los ceros, así que un resumen vacío
  // llega acá como lista vacía y no hace falta mirar las llaves de nuevo.
  if (partes.length === 0) return 'No quedó registro de qué traía el archivo';
  return partes.join(' · ');
}

export default function Importaciones() {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');
  // Por id: 'deshaciendo' | { conservadas: [], estado } | { error }
  const [accion, setAccion] = useState({});

  const cargar = () => {
    // El `||` no es decoración: un `message` vacío dejaría `error` falsy y la
    // pantalla trabada en "Cargando…" sin forma de salir.
    //
    // Y el `setError('')` del éxito tampoco: el aviso de arriba de la lista
    // afirma que lo que se ve es de ANTES del error. Sin limpiarlo, una
    // relectura que sí funcionó deja el aviso puesto diciendo que la lista
    // está vieja cuando se acaba de releer — y el caso normal es justo ese,
    // porque el `cargar()` de después de un deshacer exitoso pasa por acá.
    listarImportaciones()
      .then((f) => { setFilas(f); setError(''); })
      .catch((e) => setError(e?.message || 'No se pudo leer el historial de importaciones'));
  };

  useEffect(cargar, []);

  const hacerDeshacer = async (id) => {
    // Es la única acción destructiva de todo el importador y la única que
    // pide confirmar. No es ceremonia: borra clientes, y el botón está en
    // una lista donde el de al lado es de otra importación.
    const ok = window.confirm(
      'Voy a borrar los clientes y las mascotas que entraron por este archivo. ' +
      'Las que tengan algo escrito después —una consulta, una cita, una vacuna, ' +
      'un baño o un cobro— NO las borro. ¿Sigo?',
    );
    if (!ok) return;

    setAccion((a) => ({ ...a, [id]: 'deshaciendo' }));
    try {
      const d = await deshacer(id);
      setAccion((a) => ({ ...a, [id]: d }));
      cargar(); // el estado de la fila cambió en la base
    } catch (e) {
      setAccion((a) => ({ ...a, [id]: { error: e?.message || 'No se pudo deshacer' } }));
    }
  };

  // Un reintento solo relee: no escribe nada y no puede duplicar nada, así que
  // no pide confirmación.
  //
  // Y NO limpia `filas` a propósito. Vaciarlas haría pasar la pantalla por
  // "Cargando…" y, si el reintento vuelve a fallar, por la pantalla de error
  // entera — que se llevaría el panel con las mascotas que NO se borraron,
  // que es justo lo que este manejo de error existe para no perder. Dejando
  // las filas, un segundo fallo solo vuelve a poner el aviso arriba.
  const reintentar = () => { setError(''); cargar(); };

  // El error tapa la pantalla SOLO si no hay nada que tapar. Con filas ya
  // cargadas va como aviso arriba (más abajo): el `cargar()` que corre después
  // de un deshacer exitoso puede fallar por un corte de red, y si eso
  // reemplazara el componente se llevaría la lista de las mascotas que NO se
  // borraron, que es la salida más importante de todo el importador y no queda
  // guardada en ninguna otra parte de la pantalla.
  if (error && (!filas || filas.length === 0)) {
    return (
      <div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{error}</p>
        <Button variant="secondary" size="sm" style={{ marginTop: 6 }} onClick={reintentar}>
          Volver a intentar
        </Button>
      </div>
    );
  }
  if (!filas) return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Cargando…</p>;
  if (filas.length === 0) {
    return (
      <p style={{ fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Todavía no importaste ningún archivo. Cuando lo hagas, acá va a quedar
        qué entró y de qué archivo salió, y vas a poder deshacerlo.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {/* La lista que se ve es la de antes del error, y hay que decirlo: si una
          fila se acabó de deshacer, su etiqueta todavía dice "Importada"
          aunque en la base ya diga "Deshecha". */}
      {error && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)', lineHeight: 1.5 }}>
          {error} — lo que ves es el historial de antes de ese error.{' '}
          <button
            onClick={reintentar}
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Volver a intentar
          </button>
        </p>
      )}
      {filas.map((imp) => {
        const est = ESTADOS[imp.estado] ?? { texto: imp.estado, tono: 'neutral' };
        const a = accion[imp.id];
        // El resultado del deshacer, de las dos fuentes posibles. `accion` es
        // el de este rato; `resumen.deshecho` es el que 014:171-175 dejó
        // guardado, y es el único que queda después de recargar la página. Sin
        // leerlo, una fila "Deshecha en parte" vuelve del reload con la
        // etiqueta amarilla y sin decir qué conservó — y esa fila existe
        // precisamente porque dejó mascotas en la base. Es el caso de uso
        // número uno de esta pantalla.
        //
        // Los cinco contadores están en las dos fuentes. Lo único que el
        // guardado NO trae es `estado` —la fila ya lo tiene en su propia
        // columna—, y de ahí dos cosas: el panel se condiciona a `desh` y no a
        // `desh.estado`, y `a.estado` sirve justo para distinguir una fuente de
        // la otra acá arriba.
        const desh = (a && a.estado) ? a : (imp.resumen?.deshecho ?? null);
        const conservadas = desh?.conservadas ? textoConservadas(desh.conservadas) : [];
        const borrado = desh ? textoDeshecho(desh) : [];
        const restaurados = textoRestaurados(desh);

        // Si el deshacer de ESTE rato salió bien, el botón se va aunque la
        // fila que está en pantalla todavía diga 'listo'. No es cosmético: el
        // `cargar()` de después puede haber fallado, y entonces la fila es la
        // de antes del deshacer. Volver a apretar el botón llama a 014, que
        // contesta "ya se deshizo", y ese error pisa `accion[id]` — con lo que
        // `desh` cae en el `resumen` viejo, que no tiene la clave `deshecho`,
        // y desaparece la lista de las mascotas que NO se borraron.
        const yaSeDeshizo = Boolean(a && a.estado);

        return (
          <div key={imp.id} style={{
            padding: '10px 12px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>
                  {imp.archivo}
                  {imp.hoja && <span style={{ fontWeight: 500, color: 'var(--text-faint)' }}> · {imp.hoja}</span>}
                </p>
                <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {new Date(imp.creado_en).toLocaleString('es-CO', FECHA)} · {lineaResumen(imp)}
                </p>
              </div>
              <Badge tone={est.tono} size="sm">{est.texto}</Badge>
              {sePuedeDeshacer(imp.estado) && !yaSeDeshizo && (
                <Button
                  variant="secondary" size="sm"
                  disabled={a === 'deshaciendo'}
                  onClick={() => hacerDeshacer(imp.id)}
                >
                  {a === 'deshaciendo' ? 'Deshaciendo…' : 'Deshacer'}
                </Button>
              )}
            </div>

            {/* Una fila sin terminar se explica, no se deja ahí con una
                etiqueta amarilla. Es el caso más confuso que puede ver la
                clínica: no sabe si sus clientes entraron o no. */}
            {imp.estado === 'en_curso' && (
              <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Esta importación se cortó sin confirmar que terminó. Puede que los
                clientes hayan entrado y puede que no: miralo en tu lista de
                clientes. Si están duplicados, dale a Deshacer.
              </p>
            )}

            {a?.error && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--danger)' }}>{a.error}</p>
            )}

            {desh && (
              <div style={{ margin: '8px 0 0', paddingTop: 8, borderTop: '1px solid var(--divider)' }}>
                {/* Cuatro ramos, y el orden importa. La lista de ceros no va
                    en ninguno: "Borré 0 tutores y 0 mascotas" se lee como que
                    el deshacer falló, justo cuando funcionó.

                    De los tres ramos sin nada borrado, solo el de las
                    conservadas puede decir POR QUÉ: ahí los contadores de 014
                    muestran qué tenía encima cada mascota. Los otros dos no
                    tienen con qué. Los contadores miden lo que existía al
                    momento de deshacer, y que una mascota no se haya borrado
                    ni conservado significa solo que no estaba — puede ser que
                    el import nunca la creó o que la clínica la borró a mano
                    después. Acá eso pesa más que en el paso 4: allá pasan
                    segundos entre escribir y deshacer, acá pueden pasar seis
                    meses, y la frase queda debajo de una línea que dice
                    "53 tutores · 54 mascotas".

                    El ramo de `restaurados` existe porque sin él los dos
                    textos se contradicen: un import que solo completó datos no
                    borra ni conserva nada, caía en el último ramo, y la
                    pantalla decía "de este archivo no quedaba nada en la base"
                    y enseguida "Devolví 2 datos a como estaban" — o sea que sí
                    quedaba, y eran de este archivo.

                    Y el ramo de las conservadas dice "lo que QUEDABA de este
                    archivo", no "lo que había entrado": por lo mismo de arriba,
                    los contadores no ven lo que ya no está. Un import que creó
                    dos mascotas, una con una consulta encima y la otra borrada
                    a mano, cae en este ramo — y de la borrada a mano no es
                    cierto que le quedó algo escrito encima. */}
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>
                  {borrado.length > 0
                    ? <>Borré {borrado.join(', ')}.</>
                    : conservadas.length > 0
                      ? <>No borré nada: a todo lo que quedaba de este archivo le quedó algo escrito encima.</>
                      : restaurados
                        ? <>No hubo clientes ni mascotas que borrar.</>
                        : <>No había nada que borrar: de este archivo no quedaba nada en la base.</>}
                  {restaurados && <>{' '}{restaurados}</>}
                </p>
                {/* La frase que explica por qué no borró todo. Sin esto, la
                    clínica cree que Deshacer falló; lo que pasó es que NO
                    borró el trabajo clínico que ella escribió después. */}
                {conservadas.length > 0 && (
                  <>
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 600 }}>
                      {conservadas.length === 1
                        ? 'A una mascota no la borré:'
                        : `A ${conservadas.length} mascotas no las borré:`}
                    </p>
                    <ul style={{ margin: '2px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      {conservadas.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                    {/* Dos razones distintas, y hay que decir las dos. Para
                        historias y citas la cascada es `on delete cascade`:
                        borrar la mascota se lleva las consultas. Para los
                        cobros es `on delete set null` (003_cobros.sql:18), así
                        que el recibo sobrevive —tiene que, ya está emitido—
                        pero queda sin paciente. Decir "se las habría llevado"
                        de un cobro es falso, y nombrar solo dos de los cinco
                        contadores de 014:89 es falso en los otros tres.
                        No dice "lo escribió la clínica": el paso 1 de 014 borra
                        solo los eventos de ESTA importación, así que un segundo
                        import que le agregó baños a una mascota del primero
                        también la conserva, y eso no lo escribió la clínica. Lo
                        único que se puede afirmar de los cinco contadores es
                        que no vinieron en este archivo. */}
                    <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>
                      Eso no lo trajo este archivo. Borrarlas se habría llevado
                      las consultas, las citas, las vacunas y los baños con
                      ellas, y habría dejado los recibos sin paciente. Se
                      quedaron, y sus dueños también.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
