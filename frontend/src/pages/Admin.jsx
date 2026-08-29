import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../lib/AuthContext';
import { Card, Badge, KPI, Button, Topbar, Page, UIInput, EmptyState } from '../components/ui';
import {
  IconSearch, IconUser, IconCheckCircle, IconLock, IconShield,
  IconLogout, IconRefresh, IconAlert, VetaAppLogo,
} from '../components/icons';

const fmtFecha = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Días que faltan para que venza la prueba. Negativo = ya venció. */
const diasRestantes = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
};

const th = {
  textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600,
  color: 'var(--text-faint)', letterSpacing: '0.04em', textTransform: 'uppercase',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};
const td = {
  padding: '12px 14px', fontSize: 13, color: 'var(--text)',
  borderBottom: '1px solid var(--divider)', verticalAlign: 'middle',
};

// Mismos valores que el check de perfiles.plan en 004_planes.sql.
const PLANES = [
  { id: 'fichas',      label: 'Esencial' },
  { id: 'completo',    label: 'Avanzado' },
  { id: 'facturacion', label: 'Facturación' },
];

/** Selector de plan. Escribe vía RPC admin_set_plan (la BD valida es_admin). */
function CeldaPlan({ fila, onCambiar }) {
  const [estado, setEstado] = useState('idle'); // idle | guardando | error

  const cambiar = async (nuevo) => {
    if (nuevo === fila.plan) return;
    setEstado('guardando');
    try {
      await onCambiar(fila.id, nuevo);
      setEstado('idle');
    } catch {
      setEstado('error');
    }
  };

  return (
    <select
      value={fila.plan || 'completo'}
      disabled={estado === 'guardando'}
      onChange={(e) => cambiar(e.target.value)}
      style={{
        padding: '6px 9px', fontSize: 12.5, background: 'var(--surface)',
        border: `1px solid ${estado === 'error' ? 'var(--danger)' : 'var(--border)'}`,
        borderRadius: 'var(--r-md)', color: 'var(--text)', cursor: 'pointer',
      }}
    >
      {PLANES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  );
}

/** Notas del admin: se guardan al salir del campo, solo si cambiaron. */
function CeldaNotas({ fila, onGuardar }) {
  const [valor, setValor] = useState(fila.notas_admin || '');
  const [estado, setEstado] = useState('idle'); // idle | guardando | ok | error

  useEffect(() => { setValor(fila.notas_admin || ''); }, [fila.notas_admin]);

  const guardar = async () => {
    if (valor === (fila.notas_admin || '')) return;
    setEstado('guardando');
    try {
      await onGuardar(fila.id, valor);
      setEstado('ok');
      setTimeout(() => setEstado('idle'), 1600);
    } catch {
      setEstado('error');
    }
  };

  const borde = { idle: 'var(--border)', guardando: 'var(--verde-300)', ok: 'var(--success)', error: 'var(--danger)' }[estado];

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={valor}
        onChange={(e) => { setValor(e.target.value); if (estado !== 'idle') setEstado('idle'); }}
        onBlur={guardar}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        placeholder="Pagó hasta el 15 de mayo…"
        style={{
          width: '100%', minWidth: 180, padding: '6px 9px', fontSize: 12.5,
          background: 'var(--surface)', border: `1px solid ${borde}`,
          borderRadius: 'var(--r-md)', color: 'var(--text)', outline: 'none',
          transition: 'border-color 0.15s',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--verde-500)'; }}
      />
      {estado === 'ok' && (
        <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>
          guardado
        </span>
      )}
    </div>
  );
}

export default function Admin() {
  const { user, signOut } = useAuth();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [ocupada, setOcupada] = useState(null); // id de la fila en curso

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/veterinarias');
      setFilas(data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar la lista');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const veterinarias = useMemo(() => filas.filter((f) => f.rol === 'veterinaria'), [filas]);
  const activas = veterinarias.filter((f) => f.estado_suscripcion === 'activo').length;
  const enPrueba = veterinarias.filter(
    (f) => f.estado_suscripcion === 'prueba' && (diasRestantes(f.prueba_hasta) ?? 1) > 0
  ).length;
  // Una prueba vencida cuenta como inactiva: la base ya no la deja entrar.
  const inactivas = veterinarias.length - activas - enPrueba;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) =>
      [f.nombre, f.email, f.clinica_nombre].some((v) => (v || '').toLowerCase().includes(q))
    );
  }, [filas, busqueda]);

  const cambiarEstado = async (fila) => {
    const nuevo = fila.estado_suscripcion === 'activo' ? 'inactivo' : 'activo';
    setOcupada(fila.id);
    setError(null);
    try {
      const { data } = await api.patch(`/admin/veterinarias/${fila.id}/estado`, { estado: nuevo });
      setFilas((prev) => prev.map((f) => (f.id === fila.id ? { ...f, estado_suscripcion: data.estado_suscripcion } : f)));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar el estado');
    } finally {
      setOcupada(null);
    }
  };

  const extenderPrueba = async (fila, dias) => {
    setOcupada(fila.id);
    setError(null);
    try {
      const { data } = await api.patch(`/admin/veterinarias/${fila.id}/prueba`, { dias });
      setFilas((prev) => prev.map((f) => (f.id === fila.id
        ? { ...f, estado_suscripcion: data.estado_suscripcion, prueba_hasta: data.prueba_hasta }
        : f)));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo extender la prueba');
    } finally {
      setOcupada(null);
    }
  };

  const cambiarPlan = async (id, plan) => {
    setError(null);
    try {
      const { data } = await api.patch(`/admin/veterinarias/${id}/plan`, { plan });
      setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, plan: data.plan } : f)));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar el plan');
      throw err;
    }
  };

  const guardarNotas = async (id, notas) => {
    const { data } = await api.patch(`/admin/veterinarias/${id}/notas`, { notas });
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, notas_admin: data.notas_admin } : f)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, padding: '10px 28px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <VetaAppLogo size={26} />
          <Badge tone="verde" size="sm">Super admin</Badge>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{user?.email}</span>
          <Button variant="secondary" size="sm" icon={<IconLogout size={14} />} onClick={signOut}>
            <span style={{ marginLeft: 6 }}>Cerrar sesión</span>
          </Button>
        </div>
      </div>

      <Topbar
        title="Panel de Administración — VetaApp"
        subtitle="Control de acceso de las veterinarias registradas"
        actions={
          <Button variant="secondary" icon={<IconRefresh size={15} />} onClick={cargar} disabled={cargando}>
            <span style={{ marginLeft: 6 }}>Actualizar</span>
          </Button>
        }
      />

      <Page>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
          <KPI label="Total veterinarias" value={veterinarias.length} icon={<IconUser size={15} />} />
          <KPI label="Activas"   value={activas}   icon={<IconCheckCircle size={15} />} />
          <KPI label="En prueba" value={enPrueba}  icon={<IconRefresh size={15} />} />
          <KPI label="Inactivas" value={inactivas} icon={<IconLock size={15} />} />
        </div>

        {error && (
          <Card padding={12} style={{ marginBottom: 14, borderColor: 'var(--danger-ring)', background: 'var(--danger-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)', fontSize: 13 }}>
              <IconAlert size={16} />{error}
            </div>
          </Card>
        )}

        <Card padding={0}>
          <div style={{ padding: 14, borderBottom: '1px solid var(--divider)' }}>
            <UIInput
              icon={<IconSearch size={15} />}
              placeholder="Buscar por nombre, clínica o correo…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ maxWidth: 340 }}
            />
          </div>

          {cargando ? (
            <p style={{ padding: 28, textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>Cargando…</p>
          ) : visibles.length === 0 ? (
            <EmptyState
              icon={<IconUser size={22} />}
              title={busqueda ? 'Sin resultados' : 'Todavía no hay veterinarias'}
              subtitle={busqueda ? 'Prueba con otro nombre o correo.' : 'Aparecerán aquí apenas se registren.'}
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead>
                  <tr>
                    <th style={th}>Veterinaria</th>
                    <th style={th}>Registro</th>
                    <th style={th}>Estado</th>
                    <th style={th}>Plan</th>
                    <th style={th}>Notas</th>
                    <th style={{ ...th, textAlign: 'right' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f) => {
                    const admin = f.rol === 'admin';
                    const activa = f.estado_suscripcion === 'activo';
                    const prueba = f.estado_suscripcion === 'prueba';
                    const dias = diasRestantes(f.prueba_hasta);
                    const pruebaViva = prueba && (dias ?? 1) > 0;
                    return (
                      <tr key={f.id}>
                        <td style={td}>
                          <div style={{ fontWeight: 600, letterSpacing: '-0.01em' }}>
                            {f.clinica_nombre || f.nombre || 'Sin nombre'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{f.email}</div>
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                          {fmtFecha(f.fecha_registro)}
                        </td>
                        <td style={td}>
                          {admin ? (
                            <Badge tone="info" dot><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconShield size={11} />Admin</span></Badge>
                          ) : activa ? (
                            <Badge tone="success" dot>Activo</Badge>
                          ) : pruebaViva ? (
                            <Badge tone="info" dot>
                              Prueba · {dias === 1 ? 'último día' : `${dias} días`}
                            </Badge>
                          ) : prueba ? (
                            <Badge tone="danger" dot>Prueba vencida</Badge>
                          ) : (
                            <Badge tone="danger" dot>Inactivo</Badge>
                          )}
                        </td>
                        <td style={td}>
                          {admin ? (
                            <span style={{ fontSize: 12.5, color: 'var(--text-disabled)' }}>—</span>
                          ) : (
                            <CeldaPlan fila={f} onCambiar={cambiarPlan} />
                          )}
                        </td>
                        <td style={{ ...td, minWidth: 200 }}>
                          {admin ? (
                            <span style={{ fontSize: 12.5, color: 'var(--text-disabled)' }}>—</span>
                          ) : (
                            <CeldaNotas fila={f} onGuardar={guardarNotas} />
                          )}
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          {admin ? (
                            <span style={{ fontSize: 12, color: 'var(--text-disabled)' }}>Tu cuenta</span>
                          ) : (
                            <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                              {prueba && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => extenderPrueba(f, 14)}
                                  disabled={ocupada === f.id}
                                  title="Le da 14 días más de prueba (desde hoy si ya venció)"
                                >
                                  +14 días
                                </Button>
                              )}
                              <Button
                                variant={activa ? 'danger' : 'primary'}
                                size="sm"
                                onClick={() => cambiarEstado(f)}
                                disabled={ocupada === f.id}
                              >
                                {ocupada === f.id ? '…' : activa ? 'Desactivar' : 'Activar'}
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Page>
    </div>
  );
}
