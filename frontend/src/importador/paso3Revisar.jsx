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
// `n` y no un plural pegado a mano: ver el comentario de textos.js:10. Los
// tres contadores de abajo decían "1 tutores · 1 mascotas" con un archivo de
// una fila, en la única pantalla que la clínica lee ANTES de confirmar.
import { n } from './textos.js';

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
      {/* Con respuestas pendientes los números están incompletos, y siempre
          hacia abajo: el tutor que quedó en una duda sin contestar no entra,
          y con él se quedan afuera sus mascotas (plan.js:453) y los eventos
          de esas mascotas (plan.js:555). Si no se dijera, la clínica leería
          como definitivo un número que va a subir solo en cuanto conteste. */}
      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Todavía no escribí nada. Esto es lo que voy a hacer si confirmás.
        {faltaDecidir && (
          <> <strong>Me faltan respuestas abajo</strong>, así que estos números
          todavía no están completos: suben cuando contestes.</>
        )}
      </p>

      <div style={{ padding: '6px 0', borderTop: '1px solid var(--divider)', borderBottom: '1px solid var(--divider)' }}>
        <Fila
          etiqueta="Voy a crear"
          valor={`${n(r.tutores_nuevos, 'tutor', 'tutores')} · ${n(r.mascotas_nuevas, 'mascota', 'mascotas')}`}
        />
        <Fila
          etiqueta="Les voy a agregar"
          valor={`${n(r.tratamientos, 'baño o desparasitación', 'baños y desparasitaciones')} · ${n(r.vacunas, 'vacuna', 'vacunas')}`}
          detalle={r.eventos_repetidos > 0 ? `${r.eventos_repetidos} ya estaban, esos no los repito` : ''}
        />
        {(r.tutores_a_completar > 0 || r.mascotas_a_completar > 0) && (
          <Fila
            etiqueta="Ya existen"
            valor={`${n(r.tutores_a_completar, 'tutor', 'tutores')} · ${n(r.mascotas_a_completar, 'mascota', 'mascotas')}`}
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

      {/* ─── Los nombres ─── */}
      {/* El único control real contra subir la base de otra veterinaria.
          Los números no sirven para eso: "53 tutores · 54 mascotas" se ve
          igual de bien con los clientes de cualquier clínica. Y en una
          cuenta nueva —que es justo donde pasa el error— no hay ni una
          duda que muestre un nombre, porque no hay nada con qué comparar.
          Los nombres sí: la clínica reconoce a sus propios clientes de un
          vistazo y no necesita que nadie le explique qué mirar.

          Salen de `envio.crear_tutores`, que es exactamente lo que se va a
          escribir, y no de la grilla del archivo. Si lo que se muestra
          saliera del archivo y lo que se escribe del envío, un día podrían
          dejar de ser lo mismo —y el día que eso pase, esta pantalla deja
          de servir para lo único para lo que existe. */}
      {plan.envio.crear_tutores.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>
            ¿Son tus clientes?
          </p>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
            {plan.envio.crear_tutores.slice(0, 8).map((t) => t.nombre).join(' · ')}
            {plan.envio.crear_tutores.length > 8
              ? ` · y ${plan.envio.crear_tutores.length - 8} más`
              : ''}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
            Si estos nombres no te suenan, el archivo es de otra veterinaria:
            volvé atrás y no confirmes.
          </p>
        </div>
      )}

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
            cosas lo explican casi siempre: en el paso 2 quedó elegida la
            columna equivocada para alguna de las fechas, o esa columna guarda
            texto en vez de fechas de verdad. Cada línea de abajo dice de qué
            campo es la fecha que no entendí.
            {' '}Podés seguir igual, pero las fechas que no pude leer entran en
            blanco.
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
                caso como sin contestar (plan.js:345-361) y el botón de confirmar
                no existe. Pintar una opción marcada de entrada diría que ya
                está decidido cuando no lo está, y además dejaría la pantalla
                sin salida: en React, clickear un radio que ya está checked no
                dispara onChange, así que la única forma de avanzar sería
                clickear la otra opción y volver.

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
          {/* La raza en blanco cae acá con `clave` y `raza` vacías
              (clasificar() devuelve raza:null con la celda vacía,
              normalizar.js:166, y armarPlan agrupa por esa clave vacía,
              plan.js:460-472). Sin este caso aparte la pantalla decía, literal,
              `No sé qué es ""`.

              Va con su propio texto y no con el de una raza desconocida
              porque no es la misma pregunta: un "Sabueso" son mascotas que
              sí son todas lo mismo, y las que no tienen raza no tienen por
              qué serlo. Una sola respuesta las va a tapar a todas, así que
              eso se dice en voz alta en vez de esconderlo. Agrupar distinto
              sería cambiar armarPlan, que ya está cerrado. */}
          {e.clave === '' ? (
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
              La hoja no dice la raza de {e.cuantas} mascota{e.cuantas === 1 ? '' : 's'}
              {' '}({e.mascotas.slice(0, 6).join(', ')}{e.mascotas.length > 6 ? '…' : ''}),
              y la especie no la adivino. ¿Perro o gato?
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
              No sé qué es <strong>"{e.raza}"</strong> ({e.cuantas} mascota{e.cuantas === 1 ? '' : 's'}:{' '}
              {e.mascotas.slice(0, 6).join(', ')}{e.mascotas.length > 6 ? '…' : ''}). ¿Perro o gato?
            </p>
          )}
          {/* Igual que las dudas: ninguna viene marcada. Mientras
              `decisiones.especies[e.clave]` sea undefined, plan.js:458-472 deja
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
            {e.clave === ''
              ? `Lo que elijas vale para las ${e.cuantas}. Si hay de las dos, elegí la mayoría y corregí las otras desde la ficha.`
              : 'La raza se guarda igual, tal como la escribieron. Solo me falta la especie.'}
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
            Contestá{' '}
            {r.dudas > 0 ? `${r.dudas === 1 ? 'la duda' : `las ${r.dudas} dudas`}` : ''}
            {r.dudas > 0 && r.especies_sin_resolver > 0 ? ' y ' : ''}
            {r.especies_sin_resolver > 0
              ? `${r.especies_sin_resolver === 1 ? 'la pregunta de la raza' : `las ${r.especies_sin_resolver} preguntas de las razas`}`
              : ''} de arriba.
          </span>
        )}
        {/* Los seis contadores en cero no quieren decir una sola cosa. Si
            hubo eventos repetidos, el archivo ya estaba importado y "ya
            está cargado" es verdad. Si lo que hubo fueron descartes, no se
            importó nada y decirle que ya está cargado es mentirle justo
            cuando está buscando por qué no pasó nada. */}
        {!faltaDecidir && nada && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {r.eventos_repetidos > 0
              ? 'No hay nada nuevo que importar: todo esto ya está cargado.'
              : descartes.length > 0
                ? `No puedo importar nada: ninguna de las ${descartes.length} filas de esta hoja trae los nombres. Miralas arriba, y si el problema es el mapeo, volvé al paso 2.`
                : 'Esta hoja no trae ninguna fila que pueda importar.'}
          </span>
        )}
      </div>
    </Card>
  );
}
