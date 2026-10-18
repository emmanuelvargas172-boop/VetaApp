// ============================================================
// VetaApp · importador/paso3Revisar.jsx
// La pantalla que hace que esto sea seguro.
//
// Números concretos de lo que va a pasar, antes de tocar nada. Las
// preguntas que la máquina no puede contestar sola. Y las filas que se
// van a quedar afuera, a la vista.
//
// ---------- LO QUE FRENA ----------
// Dos cosas, las dos preguntas sin contestar: una duda de tutor, una raza
// sin especie. Nada más frena. Las fechas raras, los teléfonos imposibles
// y los costos con texto avisan y siguen: un importador que se niega a
// importar 53 clientes porque les falta la fecha de nacimiento no sirve.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { Button, Card } from '../components/ui.jsx';
import { nuevoEstado } from './nucleo/normalizar.js';
import { leerFilas, formatoDeFechasRoto } from './nucleo/filas.js';
import { agrupar } from './nucleo/agrupar.js';
import { armarPlan } from './nucleo/plan.js';
import { traerExistentes } from './escribir.js';

/**
 * De la grilla del paso 2 al plan, en una función pura.
 *
 * El `estado` se crea ACÁ y no afuera. En el script de terminal era una
 * variable de módulo y daba igual porque el proceso termina; en el
 * navegador, mover un desplegable vuelve a correr esto, y un estado de
 * afuera acumularía los mismos avisos una vez por render.
 */
export function calcular({ columnas, existentes, decisiones, hoy }) {
  const estado = nuevoEstado();
  const filas = leerFilas(estado, {
    grilla: columnas.grilla,
    mapa: columnas.mapa,
    hoja: columnas.hoja,
  });
  const agrupado = agrupar(estado, filas);
  const plan = armarPlan(estado, agrupado, existentes, decisiones, hoy);
  return { estado, plan };
}

const Fila = ({ etiqueta, valor, detalle }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '5px 0' }}>
    <span style={{ width: 150, fontSize: 13, color: 'var(--text-muted)' }}>{etiqueta}</span>
    <span style={{ fontSize: 14, fontWeight: 700 }}>{valor}</span>
    {detalle && <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{detalle}</span>}
  </div>
);

export default function Paso3Revisar({ columnas, onAtras, onListo }) {
  const [existentes, setExistentes] = useState(null);
  const [errorBase, setErrorBase] = useState('');
  const [decisiones, setDecisiones] = useState({ dudas: {}, especies: {} });
  const [verDescartes, setVerDescartes] = useState(false);

  // Lo que ya tiene la cuenta. Sin esto el paso 3 muestra "54 tutores
  // nuevos" en una base que ya los tiene y la clínica confirma un
  // duplicado completo de su propia base.
  useEffect(() => {
    let vivo = true;
    traerExistentes()
      .then((e) => { if (vivo) setExistentes(e); })
      .catch((err) => { if (vivo) setErrorBase(err.message); });
    return () => { vivo = false; };
  }, []);

  // `hoy` fijo por montaje y no `new Date()` en cada render: la edad que
  // se calcula tiene que ser la misma en el paso 3 y en el paso 4, y una
  // importación hecha a las 23:59 no puede cambiar de edad a mitad.
  const hoy = useMemo(() => new Date(), []);

  const calculado = useMemo(() => {
    if (!existentes) return null;
    return calcular({ columnas, existentes, decisiones, hoy });
  }, [columnas, existentes, decisiones, hoy]);

  if (errorBase) {
    return (
      <Card>
        <h3 style={{ margin: 0, fontSize: 15 }}>No pude leer lo que ya tenés</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {errorBase}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Sin eso no puedo decirte cuáles de estos clientes ya están cargados,
          y no voy a importar a ciegas. Revisá la conexión y volvé a entrar.
        </p>
        <Button variant="secondary" onClick={onAtras}>Atrás</Button>
      </Card>
    );
  }

  if (!calculado) return <Card>Comparando con lo que ya tenés…</Card>;

  const { estado, plan } = calculado;
  const r = plan.resumen;
  const descartes = estado.avisos.filter((a) => a.clase === 'descarte');
  const avisos = estado.avisos.filter((a) => a.clase !== 'descarte');
  // Los ejemplos del banner rojo salen de filtrar por el texto porque el
  // aviso no trae un campo que diga "esto es una fecha ilegible" —`aviso()`
  // solo distingue 'dato' de 'descarte' (normalizar.js:34)—. Los tres avisos
  // que suben `fechasRotas` empiezan con "fecha" (normalizar.js:51, :62,
  // :68) y son justo los que hay que mostrar acá: los otros avisos de fecha
  // (nació el día del registro, evento anterior al nacimiento) son datos
  // raros sueltos, no un formato que no se entiende.
  //
  // El acople es a propósito y está acotado a cinco líneas, pero es un
  // acople: si alguien reescribe esos tres textos sin pasar por acá, el
  // banner rojo aparece con la lista vacía y nadie se entera. Si llega un
  // cuarto formato de fecha, lo barato es agregarle una `clase` al aviso.
  const ejemplosDeFecha = avisos.filter((a) => a.texto.startsWith('fecha')).slice(0, 5);
  const faltaDecidir = r.dudas > 0 || r.especies_sin_resolver > 0;
  const nada = r.tutores_nuevos === 0 && r.mascotas_nuevas === 0
    && r.tutores_a_completar === 0 && r.mascotas_a_completar === 0
    && r.tratamientos === 0 && r.vacunas === 0;

  return (
    <Card>
      <h3 style={{ margin: 0, fontSize: 15 }}>3 · Qué va a pasar</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Todavía no escribí nada. Esto es lo que voy a hacer si confirmás.
      </p>

      {/* Los nombres son de la clínica, no del archivo. Si estos 54
          nombres no son sus clientes, acá se nota — y es lo único que
          protege de subir la base de otra veterinaria por error. */}

      <div style={{ padding: '6px 0', borderTop: '1px solid var(--divider)', borderBottom: '1px solid var(--divider)' }}>
        <Fila
          etiqueta="Voy a crear"
          valor={`${r.tutores_nuevos} tutores · ${r.mascotas_nuevas} mascotas`}
        />
        <Fila
          etiqueta="Les voy a agregar"
          valor={`${r.tratamientos} baños y desparasitaciones · ${r.vacunas} vacunas`}
          detalle={r.eventos_repetidos > 0 ? `${r.eventos_repetidos} ya estaban, esos no los repito` : ''}
        />
        {(r.tutores_a_completar > 0 || r.mascotas_a_completar > 0) && (
          <Fila
            etiqueta="Ya existen"
            valor={`${r.tutores_a_completar} tutores · ${r.mascotas_a_completar} mascotas`}
            detalle="les completo lo que tengan en blanco, no les piso nada"
          />
        )}
        {r.dudas > 0 && (
          <Fila etiqueta="Tengo dudas" valor={`${r.dudas} caso${r.dudas === 1 ? '' : 's'}`} detalle="decidilas abajo" />
        )}
        {descartes.length > 0 && (
          <Fila etiqueta="No voy a importar" valor={`${descartes.length} fila${descartes.length === 1 ? '' : 's'}`} detalle="mirá por qué" />
        )}
      </div>

      {/* Diez fechas vistas y más de la mitad ilegibles no es un dato suelto
          malo: es la columna equivocada en el paso 2, o una columna que
          guarda texto en vez de fechas. Importar 54 clientes con todas las
          fechas en blanco es peor que no importar, así que esto va arriba y
          en rojo.

          NO se menciona el CSV. La tarea 11 dejó el paso 1 aceptando solo
          .xlsx/.xls y leerLibro() rechaza por bytes cualquier otra cosa (ver
          la cabecera de leerXlsx.js): un CSV no puede estar acá. Acusarlo de
          ser un CSV sería mandar a la clínica a arreglar algo que ya está
          bien, y es el peor error posible de este módulo —el que provoca la
          propia app. */}
      {formatoDeFechasRoto(estado) && (
        <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--r-md)' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>
            No entiendo las fechas de esta hoja
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            De {estado.fechasVistas} fechas no pude leer {estado.fechasRotas}. Dos
            cosas lo explican casi siempre: en el paso 2 quedó elegida otra
            columna como fecha de nacimiento, o esa columna guarda texto en vez
            de fechas de verdad. Volvé al paso 2 y mirá el ejemplo que aparece
            al lado del nombre de la columna.
            {' '}Podés seguir igual, pero las mascotas van a entrar sin fecha de
            nacimiento.
          </p>
          {/* Cinco ejemplos y no la lista entera. Con cinco se ve el patrón
              —"ah, están todas al revés"— y con cincuenta no se ve nada: la
              pantalla se convierte en un muro y el consejo de volver al paso 2
              queda arriba, fuera de la vista. */}
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {ejemplosDeFecha.map((a, i) => (
              <li key={i}>Fila {a.fila}: {a.texto}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── Las dudas ─── */}
      {plan.dudas.map((d) => (
        <div key={d.id} style={{ marginTop: 14, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            <strong>{d.existente.nombre}</strong> ya existe
            {d.existente.telefono ? ` con el teléfono ${d.existente.telefono}` : ' sin teléfono'}
            {d.existente.cedula ? `, cédula ${d.existente.cedula}` : ''}.
            <br />
            El archivo trae <strong>{d.archivo.nombre}</strong>
            {d.archivo.tel1 ? ` con el teléfono ${d.archivo.tel1}` : ' sin teléfono'}
            {d.archivo.cedula ? `, cédula ${d.archivo.cedula}` : ''}
            {d.archivo.mascotas.length > 0 && <> — mascota{d.archivo.mascotas.length === 1 ? '' : 's'}: {d.archivo.mascotas.join(', ')}</>}.
          </p>
          <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 13 }}>
            {/* Ninguna de las dos viene marcada, y es a propósito: mientras
                `decisiones.dudas[d.id]` sea undefined, armarPlan cuenta este
                caso como sin contestar (plan.js:270) y el botón de confirmar
                no existe. Pintar una opción marcada de entrada diría que ya
                está decidido cuando no lo está, y además dejaría la pantalla
                sin salida: en React, clickear un radio que ya está checked no
                dispara onChange, así que la única forma de avanzar sería
                clickear la otra opción y volver. Once veces, en la base de La
                Huella.

                Si algún día hay que ahorrar clicks acá, el lugar es el
                useState inicial de `decisiones` —sembrarlo con una respuesta
                de verdad—, nunca el `checked` de la vista. Porque lo que se
                escribe sale de `decisiones`, no de lo que se ve marcado. */}
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio" name={d.id}
                checked={decisiones.dudas[d.id] === 'distinta'}
                onChange={() => setDecisiones((s) => ({ ...s, dudas: { ...s.dudas, [d.id]: 'distinta' } }))}
              />
              Son dos personas distintas
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio" name={d.id}
                checked={decisiones.dudas[d.id] === 'misma'}
                onChange={() => setDecisiones((s) => ({ ...s, dudas: { ...s.dudas, [d.id]: 'misma' } }))}
              />
              Es la misma
            </label>
          </div>
        </div>
      ))}

      {/* ─── Las especies ─── */}
      {plan.especies.map((e) => (
        <div key={e.clave} style={{ marginTop: 14, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            No sé qué es <strong>"{e.raza}"</strong> ({e.cuantas} mascota{e.cuantas === 1 ? '' : 's'}:{' '}
            {e.mascotas.slice(0, 6).join(', ')}{e.mascotas.length > 6 ? '…' : ''}). ¿Perro o gato?
          </p>
          {/* Igual que las dudas: ninguna viene marcada. Mientras
              `decisiones.especies[e.clave]` sea undefined, plan.js:356 deja
              la raza en la lista de preguntas y el botón no existe — un
              "Perro" marcado de entrada sería una pantalla que dice decidido
              lo que no está, y sin salida por el onChange que no dispara. */}
          <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 13 }}>
            {['perro', 'gato'].map((esp) => (
              <label key={esp} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="radio" name={`esp-${e.clave}`}
                  checked={decisiones.especies[e.clave] === esp}
                  onChange={() => setDecisiones((s) => ({ ...s, especies: { ...s.especies, [e.clave]: esp } }))}
                />
                {esp === 'perro' ? 'Perro' : 'Gato'}
              </label>
            ))}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
            La raza se guarda igual, tal como la escribieron. Solo me falta la especie.
          </p>
        </div>
      ))}

      {/* ─── Las filas que se quedan afuera ─── */}
      {descartes.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => setVerDescartes((v) => !v)}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 600, color: 'var(--verde-600)', cursor: 'pointer' }}
          >
            {verDescartes ? 'Ocultar' : 'Ver'} las {descartes.length} filas que no voy a importar
          </button>
          {verDescartes && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {descartes.map((a, i) => (
                <li key={i}>Fila {a.fila} de {a.hoja}: {a.texto}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ─── Los avisos ─── */}
      {avisos.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>
            {avisos.length} cosa{avisos.length === 1 ? '' : 's'} que decidí yo
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, maxHeight: 240, overflowY: 'auto' }}>
            {avisos.map((a, i) => (
              <li key={i}>Fila {a.fila}: {a.texto}</li>
            ))}
          </ul>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
            Nada de esto frena la importación. Son datos que la hoja trae raros
            y que se corrigen desde la ficha cuando el tutor vuelva.
          </p>
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button variant="secondary" onClick={onAtras}>Atrás</Button>
        {/* El botón no existe mientras falte una respuesta. No es que esté
            apagado: no hay nada que confirmar hasta que la pantalla sepa
            qué hacer con esos casos. */}
        {!faltaDecidir && !nada && (
          <Button onClick={() => onListo({ envio: plan.envio, resumen: r, decisiones })}>
            Confirmar e importar
          </Button>
        )}
        {faltaDecidir && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Contestá {r.dudas > 0 ? `las ${r.dudas} dudas` : ''}
            {r.dudas > 0 && r.especies_sin_resolver > 0 ? ' y ' : ''}
            {r.especies_sin_resolver > 0 ? `las ${r.especies_sin_resolver} razas` : ''} de arriba.
          </span>
        )}
        {!faltaDecidir && nada && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No hay nada nuevo que importar: todo esto ya está cargado.
          </span>
        )}
      </div>
    </Card>
  );
}
