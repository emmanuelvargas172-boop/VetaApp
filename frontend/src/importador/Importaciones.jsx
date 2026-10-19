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
import { textoConservadas, textoDeshecho, textoVaAEscribir } from './textos.js';

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
    listarImportaciones().then(setFilas).catch((e) => setError(e.message));
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
      setAccion((a) => ({ ...a, [id]: { error: e.message } }));
    }
  };

  if (error) {
    return (
      <div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{error}</p>
        {/* Leer el historial es solo un `select`: reintentar no puede escribir
            nada ni duplicar nada, así que el botón no necesita confirmación.
            Sin él, un corte de red al abrir la pestaña deja esta sección
            muerta hasta recargar la página entera. */}
        <Button variant="secondary" size="sm" style={{ marginTop: 6 }}
                onClick={() => { setError(''); setFilas(null); cargar(); }}>
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
      {filas.map((imp) => {
        const est = ESTADOS[imp.estado] ?? { texto: imp.estado, tono: 'neutral' };
        const a = accion[imp.id];
        // La regla es la de 014:65-67 y no una lista propia: deshacer está
        // bloqueado solo para lo que ya se deshizo. Enumerar al revés —'listo'
        // y 'en_curso'— deja afuera a 'fallido', y una fila 'fallido' puede
        // tener datos adentro: marcarFallida decide mirando solo `duenos` y
        // `mascotas` (escribir.js:186), así que un archivo que solo le agregó
        // 74 baños a mascotas que ya existían y perdió la respuesta queda
        // 'fallido' con los 74 escritos. Sin este botón no hay forma de
        // sacarlos.
        const sePuedeDeshacer = imp.estado !== 'deshecho' && imp.estado !== 'deshecho_parcial';
        const conservadas = a && a.conservadas ? textoConservadas(a.conservadas) : [];
        const borrado = a && a.estado ? textoDeshecho(a) : [];

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
              {sePuedeDeshacer && (
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

            {a && a.estado && (
              <div style={{ margin: '8px 0 0', paddingTop: 8, borderTop: '1px solid var(--divider)' }}>
                {/* Los dos casos de "no borré nada" se distinguen, porque la
                    causa solo se puede afirmar en uno. Si quedaron mascotas
                    conservadas, no borró porque tenían algo encima. Si no
                    quedó ninguna, el import no había escrito nada y decir que
                    la clínica escribió encima sería inventar la causa.
                    Afirmar "Borré 0 tutores y 0 mascotas" era peor que las
                    dos: el deshacer funcionó y la frase se lee como que
                    falló. */}
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>
                  {borrado.length > 0
                    ? <>Borré {borrado.join(', ')}.</>
                    : conservadas.length > 0
                      ? <>No borré nada: a todo lo que había entrado por el archivo le quedó algo escrito encima.</>
                      : <>No había nada que borrar: esta importación no había escrito nada.</>}
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
                        contadores de 014:89 es falso en los otros tres. */}
                    <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>
                      Eso lo escribió la clínica, no el archivo. Borrarlas se
                      habría llevado las consultas, las citas, las vacunas y
                      los baños con ellas, y habría dejado los recibos sin
                      paciente. Se quedaron, y sus dueños también.
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
