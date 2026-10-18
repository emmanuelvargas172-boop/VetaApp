// ============================================================
// VetaApp · importador/paso1Archivo.jsx
// El archivo y la hoja.
//
// Dos cosas pueden frenar acá, y son las únicas dos de todo el importador
// que frenan:
//   · la suscripción no está activa → RLS no la deja escribir
//   · el archivo no se puede leer   → no hay nada que mapear
//
// Todo lo demás (fechas raras, teléfonos imposibles, razas desconocidas)
// avisa y sigue. Cincuenta y tres clientes sin fecha de nacimiento siguen
// siendo cincuenta y tres clientes.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext';
import { leerLibro, hojas } from './leerXlsx.js';

// Solo Excel. Ver el comentario de cabecera de leerXlsx.js: el CSV pierde
// los tipos de celda, y sin tipos la cédula se lee con un cero de más, el
// costo diez veces más caro y la fecha en d/m/Y o m/d/Y según el idioma de
// la cuenta de Google. Ofrecer .csv acá y rechazarlo adentro sería un error
// que provoca la propia pantalla.
const ACEPTA = '.xlsx,.xls';

export default function Paso1Archivo({ onListo }) {
  const { bloqueado, enPrueba, diasPrueba, recargarPerfil } = useAuth();
  const [verificando, setVerificando] = useState(true);
  const [error, setError] = useState('');
  const [libro, setLibro] = useState(null);
  const [archivo, setArchivo] = useState('');
  const [lista, setLista] = useState([]);
  const [hoja, setHoja] = useState('');
  const ref = useRef();

  // Se relee el perfil al entrar. Ver el comentario largo de la tarea 11:
  // `bloqueado` sale del perfil que se leyó al abrir la app, y una pestaña
  // vieja con la prueba ya vencida a medianoche pasa igual. En cualquier
  // otra pantalla eso es inofensivo. Acá el error de Postgres aparecería en
  // el paso 4, después de cinco minutos de mapeo.
  // `recargarPerfil` es estable (useCallback en AuthContext) así que este
  // efecto corre una sola vez al montar.
  useEffect(() => {
    let vivo = true;
    recargarPerfil().finally(() => { if (vivo) setVerificando(false); });
    return () => { vivo = false; };
  }, [recargarPerfil]);

  const elegir = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // para que elegir el mismo archivo otra vez dispare el evento
    if (!f) return;
    setError(''); setLibro(null); setLista([]); setHoja('');
    try {
      const bytes = await f.arrayBuffer();
      const lib = leerLibro(bytes);
      const hs = hojas(lib);
      const conDatos = hs.filter((h) => h.filas > 0);
      if (conDatos.length === 0) {
        setError('El archivo se abrió pero no tiene ninguna fila con datos debajo del encabezado.');
        return;
      }
      setLibro(lib); setArchivo(f.name); setLista(hs);
      // Con una sola hoja con datos no se pregunta nada: se elige sola.
      setHoja(conDatos.length === 1 ? conDatos[0].nombre : '');
    } catch (err) {
      setError(err.message);
    }
  };

  if (verificando) return <Card>Un momento…</Card>;

  if (bloqueado) {
    return (
      <Card>
        <h3 style={{ margin: 0, fontSize: 15 }}>Tu plan está vencido</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Importar escribe en tu base, y con el plan vencido la base no deja
          escribir. Renová y volvé acá: el archivo no se pierde, lo subís de
          nuevo y seguís.
        </p>
        <Link to="/app/configuracion?tab=plan"><Button>Ver mi plan</Button></Link>
      </Card>
    );
  }

  return (
    <Card>
      <h3 style={{ margin: 0, fontSize: 15 }}>1 · El archivo</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Excel (<code>.xlsx</code> o <code>.xls</code>). Si lo tenés en Google
        Sheets: <strong>Archivo → Descargar → Microsoft Excel</strong>. No
        sirve el <code>.csv</code> porque pierde el tipo de cada celda, y con
        eso se arruinan las cédulas, los costos y las fechas.
        <br />
        El archivo no se sube a ninguna parte: se lee acá en tu computador y
        lo único que viaja son los clientes que confirmes en el paso 4.
      </p>

      {/* Se dice que el archivo no se sube porque es verdad y porque es lo
          que la clínica necesita oír: esa hoja tiene las cédulas y las
          direcciones de casa de sus clientes. */}

      {enPrueba && diasPrueba !== null && diasPrueba <= 3 && (
        <p style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
          Te quedan {diasPrueba} día{diasPrueba === 1 ? '' : 's'} de prueba.
          Lo que importes ahora queda guardado.
        </p>
      )}

      <input ref={ref} type="file" accept={ACEPTA} onChange={elegir} style={{ display: 'none' }} />
      <Button onClick={() => ref.current?.click()}>
        {libro ? 'Elegir otro archivo' : 'Elegir archivo'}
      </Button>
      {archivo && <span style={{ marginLeft: 10, fontSize: 13 }}>{archivo}</span>}

      {error && (
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--danger)', lineHeight: 1.5 }}>{error}</p>
      )}

      {lista.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>
            {lista.length === 1 ? 'La hoja' : 'Elegí la hoja'}
          </p>
          {/* El número es de filas CON DATOS. La hoja de La Huella venía
              estirada hasta la 155 con 101 vacías: decir "155 filas" es
              mentir, y con ese número al lado la clínica elige la hoja
              equivocada confiando en él. */}
          <div style={{ display: 'grid', gap: 6 }}>
            {lista.map((h) => (
              <label key={h.nombre} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', fontSize: 13,
                border: `1px solid ${hoja === h.nombre ? 'var(--verde-500)' : 'var(--border)'}`,
                borderRadius: 'var(--r-md)',
                opacity: h.filas === 0 ? 0.5 : 1,
                cursor: h.filas === 0 ? 'default' : 'pointer',
              }}>
                <input
                  type="radio" name="hoja" value={h.nombre}
                  checked={hoja === h.nombre} disabled={h.filas === 0}
                  onChange={() => setHoja(h.nombre)}
                />
                <span style={{ flex: 1, fontWeight: 600 }}>{h.nombre}</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {h.filas === 0 ? 'sin datos' : `${h.filas} fila${h.filas === 1 ? '' : 's'} con datos`}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
        <Link to="/app/configuracion?tab=datos"><Button variant="secondary">Cancelar</Button></Link>
        <Button disabled={!hoja} onClick={() => onListo({ libro, archivo, hoja })}>
          Siguiente
        </Button>
      </div>
    </Card>
  );
}
