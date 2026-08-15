import { useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { Button, Badge, UIInput } from './ui';
import { IconSearch, IconPlus, IconX, IconTrash, IconCash } from './icons';
import { fmtCOP, SERVICIOS, METODOS_PAGO } from '../utils/caja';

let contador = 0;
const nuevaLinea = (nombre, precio) => ({ key: ++contador, nombre, precio });

/** Formulario de Nuevo Cobro. Al guardar devuelve el cobro creado por onCreado. */
export default function ModalCobro({ onCerrar, onCreado }) {
  const [mascota, setMascota] = useState(null);
  const [q, setQ] = useState('');
  const [sugerencias, setSugerencias] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [lineas, setLineas] = useState([]);
  const [descuento, setDescuento] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [otro, setOtro] = useState({ nombre: '', precio: '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  // Búsqueda con retardo: no dispara una consulta por cada tecla.
  useEffect(() => {
    if (mascota || q.trim().length < 2) { setSugerencias([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.get(`/mascotas/buscar?q=${encodeURIComponent(q.trim())}`)
        .then((r) => { setSugerencias((r.data || []).slice(0, 8)); setAbierto(true); })
        .catch(() => setSugerencias([]));
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q, mascota]);

  const subtotal = lineas.reduce((a, l) => a + (Number(l.precio) || 0), 0);
  const pctDesc = Math.min(Math.max(Number(descuento) || 0, 0), 100);
  const total = Math.round(subtotal * (1 - pctDesc / 100));

  const agregarOtro = () => {
    const nombre = otro.nombre.trim();
    const precio = Number(otro.precio);
    if (!nombre || !(precio > 0)) return;
    setLineas((ls) => [...ls, nuevaLinea(nombre, precio)]);
    setOtro({ nombre: '', precio: '' });
  };

  const guardar = async () => {
    setError(null);
    if (!mascota) return setError('Selecciona una mascota');
    if (!lineas.length) return setError('Agrega al menos un servicio');
    setGuardando(true);
    try {
      const { data } = await api.post('/cobros', {
        mascota_id: mascota.id,
        servicios: lineas.map(({ nombre, precio }) => ({ nombre, precio: Number(precio) || 0 })),
        descuento: pctDesc,
        metodo_pago: metodo,
      });
      onCreado(data);
    } catch (err) {
      setError(err?.response?.data?.error || 'No se pudo registrar el cobro');
      setGuardando(false);
    }
  };

  return (
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(15, 23, 20, 0.5)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 16, overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="anim-fade-in"
        style={{
          width: '100%', maxWidth: 560, margin: 'auto',
          background: 'var(--surface)', borderRadius: 'var(--r-xl)',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg, 0 20px 50px rgba(0,0,0,.25))',
        }}
      >
        {/* Encabezado */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--divider)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'var(--verde-50)', border: '1px solid var(--verde-200)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--verde-700)',
            }}>
              <IconCash size={17} />
            </div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Nuevo cobro</h2>
          </div>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', padding: 4 }}>
            <IconX size={18} />
          </button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Mascota */}
          <Campo label="Mascota">
            {mascota ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '9px 12px', background: 'var(--verde-50)',
                border: '1px solid var(--verde-200)', borderRadius: 'var(--r-md)',
              }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--verde-700)' }}>
                  {mascota.nombre}
                  {mascota.dueno_nombre && (
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {mascota.dueno_nombre}</span>
                  )}
                </span>
                <button
                  onClick={() => { setMascota(null); setQ(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}
                >
                  <IconX size={15} />
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <UIInput
                  icon={<IconSearch size={15} />}
                  placeholder="Buscar por nombre…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onFocus={() => setAbierto(true)}
                  onBlur={() => setTimeout(() => setAbierto(false), 150)}
                />
                {abierto && sugerencias.length > 0 && (
                  <ul style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5,
                    margin: '4px 0 0', padding: 4, listStyle: 'none',
                    background: 'var(--surface)', border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0,0,0,.12))',
                    maxHeight: 220, overflowY: 'auto',
                  }}>
                    {sugerencias.map((m) => (
                      <li key={m.id}>
                        <button
                          onMouseDown={() => { setMascota(m); setAbierto(false); }}
                          style={{
                            width: '100%', textAlign: 'left', padding: '8px 10px',
                            background: 'none', border: 'none', cursor: 'pointer',
                            borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--text)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--stone-50)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                        >
                          <strong style={{ fontWeight: 600 }}>{m.nombre}</strong>
                          {m.dueno_nombre && <span style={{ color: 'var(--text-faint)' }}> · {m.dueno_nombre}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Campo>

          {/* Servicios rápidos */}
          <Campo label="Servicios">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {SERVICIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setLineas((ls) => [...ls, nuevaLinea(s.nombre, s.precio)])}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 11px', fontSize: 12.5, fontWeight: 600,
                    background: 'var(--surface)', color: 'var(--text)',
                    border: '1px solid var(--border-strong)', borderRadius: 'var(--r-full)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--verde-500)'; e.currentTarget.style.background = 'var(--verde-50)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'var(--surface)'; }}
                >
                  <IconPlus size={13} />
                  {s.nombre}
                  <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>{fmtCOP(s.precio)}</span>
                </button>
              ))}
            </div>

            {/* Otro servicio */}
            <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
              <UIInput
                placeholder="Otro servicio…"
                value={otro.nombre}
                onChange={(e) => setOtro((o) => ({ ...o, nombre: e.target.value }))}
                style={{ flex: 1 }}
              />
              <UIInput
                placeholder="Precio"
                type="number"
                min="0"
                value={otro.precio}
                onChange={(e) => setOtro((o) => ({ ...o, precio: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') agregarOtro(); }}
                style={{ width: 110 }}
              />
              <Button variant="secondary" onClick={agregarOtro} icon={<IconPlus size={14} />} />
            </div>
          </Campo>

          {/* Líneas agregadas */}
          {lineas.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
              {lineas.map((l, i) => (
                <div
                  key={l.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    background: i % 2 ? 'var(--surface-muted)' : 'var(--surface)',
                    borderBottom: i < lineas.length - 1 ? '1px solid var(--divider)' : 'none',
                  }}
                >
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{l.nombre}</span>
                  <input
                    type="number"
                    min="0"
                    value={l.precio}
                    onChange={(e) => setLineas((ls) => ls.map((x) => x.key === l.key ? { ...x, precio: e.target.value } : x))}
                    className="tabular"
                    style={{
                      width: 100, padding: '4px 8px', fontSize: 13, textAlign: 'right',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)', color: 'var(--text)', outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))}
                    title="Quitar"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', padding: 2 }}
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Descuento y método */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            <Campo label="Descuento (%)" style={{ width: 130 }}>
              <UIInput
                type="number" min="0" max="100" placeholder="0"
                value={descuento}
                onChange={(e) => setDescuento(e.target.value)}
              />
            </Campo>
            <Campo label="Método de pago" style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {METODOS_PAGO.map((m) => {
                  const activo = metodo === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setMetodo(m.id)}
                      style={{
                        padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                        borderRadius: 'var(--r-full)', transition: 'all 0.15s',
                        background: activo ? 'var(--verde-600)' : 'var(--surface)',
                        color: activo ? '#fff' : 'var(--text-muted)',
                        border: `1px solid ${activo ? 'var(--verde-700)' : 'var(--border-strong)'}`,
                      }}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </Campo>
          </div>

          {/* Totales */}
          <div style={{
            background: 'var(--verde-50)', border: '1px solid var(--verde-200)',
            borderRadius: 'var(--r-md)', padding: '12px 14px',
          }}>
            <ResumenFila k="Subtotal" v={fmtCOP(subtotal)} />
            {pctDesc > 0 && <ResumenFila k={`Descuento ${pctDesc}%`} v={`− ${fmtCOP(subtotal - total)}`} />}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--verde-200)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--verde-700)' }}>Total</span>
              <span className="tabular" style={{ fontSize: 22, fontWeight: 800, color: 'var(--verde-700)', letterSpacing: '-0.02em' }}>
                {fmtCOP(total)}
              </span>
            </div>
          </div>

          {error && <Badge tone="danger">{error}</Badge>}
        </div>

        {/* Pie */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '14px 20px', borderTop: '1px solid var(--divider)',
        }}>
          <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
          <Button variant="primary" size="lg" onClick={guardar} disabled={guardando}>
            {guardando ? 'Registrando…' : 'Registrar cobro y generar recibo'}
          </Button>
        </div>
      </div>
    </div>
  );
}

const Campo = ({ label, children, style }) => (
  <div style={style}>
    <label style={{
      display: 'block', marginBottom: 7, fontSize: 11, fontWeight: 600,
      color: 'var(--text-faint)', letterSpacing: '0.04em', textTransform: 'uppercase',
    }}>{label}</label>
    {children}
  </div>
);

const ResumenFila = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
    <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{k}</span>
    <span className="tabular" style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}>{v}</span>
  </div>
);
