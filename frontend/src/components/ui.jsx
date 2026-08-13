import { useState, useMemo } from 'react';

export const Button = ({ variant = 'primary', size = 'md', icon, iconRight, children, onClick, style, title, disabled }) => {
  const variants = {
    primary: { background: 'var(--verde-600)', color: '#fff', border: '1px solid var(--verde-700)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), var(--shadow-sm)' },
    secondary: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-xs)' },
    ghost: { background: 'transparent', color: 'var(--text-muted)', border: '1px solid transparent' },
    danger: { background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger-ring)' },
    wa: { background: '#25D366', color: '#fff', border: '1px solid #1ebe59', boxShadow: 'var(--shadow-sm)' },
  };
  const sizes = {
    sm: { padding: '5px 10px', fontSize: 12, height: 28, gap: 5 },
    md: { padding: '7px 13px', fontSize: 13, height: 34, gap: 7 },
    lg: { padding: '10px 18px', fontSize: 14, height: 40, gap: 8 },
  };
  const hoverBg = { primary: 'var(--verde-700)', secondary: 'var(--stone-50)', ghost: 'var(--stone-100)', danger: 'var(--danger-ring)', wa: '#1ebe59' };
  const normalBg = { primary: 'var(--verde-600)', secondary: 'var(--surface)', ghost: 'transparent', danger: 'var(--danger-soft)', wa: '#25D366' };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--r-md)',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
        letterSpacing: '-0.005em',
        transition: 'all 0.15s ease',
        ...sizes[size], ...variants[variant], ...style,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = hoverBg[variant]; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = normalBg[variant]; }}
    >
      {icon}{children}{iconRight}
    </button>
  );
};

export const Card = ({ children, style, padding = 16, hover = false, onClick, className = '' }) => (
  <div
    className={className}
    onClick={onClick}
    style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-xl)',
      boxShadow: 'var(--shadow-xs)',
      padding,
      transition: 'all 0.18s ease',
      cursor: onClick ? 'pointer' : undefined,
      ...style,
    }}
    onMouseEnter={hover ? (e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.transform = 'translateY(-1px)'; } : undefined}
    onMouseLeave={hover ? (e) => { e.currentTarget.style.boxShadow = 'var(--shadow-xs)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; } : undefined}
  >
    {children}
  </div>
);

export const Badge = ({ tone = 'neutral', children, dot = false, size = 'md' }) => {
  const tones = {
    neutral: { bg: 'var(--stone-100)',    fg: 'var(--stone-700)', ring: 'var(--stone-200)' },
    success: { bg: 'var(--success-soft)', fg: 'var(--success)',   ring: 'var(--success-ring)' },
    info:    { bg: 'var(--info-soft)',    fg: 'var(--info)',      ring: 'var(--info-ring)' },
    warn:    { bg: 'var(--warn-soft)',    fg: 'var(--warn)',      ring: 'var(--warn-ring)' },
    danger:  { bg: 'var(--danger-soft)', fg: 'var(--danger)',    ring: 'var(--danger-ring)' },
    verde:   { bg: 'var(--verde-50)',     fg: 'var(--verde-700)', ring: 'var(--verde-200)' },
  };
  const t = tones[tone] || tones.neutral;
  const sizes = {
    sm: { fontSize: 10, padding: '2px 6px', dot: 5 },
    md: { fontSize: 11, padding: '3px 8px', dot: 6 },
  };
  const s = sizes[size];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: t.bg, color: t.fg,
      border: `1px solid ${t.ring}`,
      borderRadius: 'var(--r-full)',
      fontSize: s.fontSize, fontWeight: 600,
      padding: s.padding,
      lineHeight: 1.2,
      whiteSpace: 'nowrap',
    }}>
      {dot && <span style={{ width: s.dot, height: s.dot, borderRadius: '50%', background: t.fg }}/>}
      {children}
    </span>
  );
};

export const SectionHeader = ({ title, subtitle, action }) => (
  <div style={{
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: '14px 18px', borderBottom: '1px solid var(--divider)',
  }}>
    <div>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>{title}</h3>
      {subtitle && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const Sparkline = ({ data = [], width = 110, height = 28, color = 'var(--verde-500)', fill = true, animate = true }) => {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1 || 1);
  const points = data.map((v, i) => [i * stepX, height - ((v - min) / range) * (height - 4) - 2]);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;
  const id = useMemo(() => 'spark-' + Math.random().toString(36).slice(2, 8), []);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {fill && <path d={areaPath} fill={`url(#${id})`}/>}
      <path d={path} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"
            style={animate ? { strokeDasharray: 200, strokeDashoffset: 0, animation: 'drawLine 1s ease-out both' } : {}}/>
      <circle cx={points[points.length-1][0]} cy={points[points.length-1][1]} r="2.5" fill={color}/>
    </svg>
  );
};

export const BarChart = ({ data = [], height = 120, accent = 'var(--verde-500)', faded = 'var(--stone-200)', labels = [], highlight = -1 }) => {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height, padding: '8px 0' }}>
      {data.map((v, i) => {
        const isHi = i === highlight;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%' }}>
            <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
              <div style={{
                width: '100%',
                height: `${(v / max) * 100}%`,
                background: isHi ? accent : faded,
                borderRadius: '4px 4px 2px 2px',
                transformOrigin: 'bottom',
                animation: `growBar 0.6s ${i * 0.05}s cubic-bezier(0.34, 1.3, 0.64, 1) both`,
              }}/>
              {isHi && (
                <div style={{
                  position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--stone-900)', color: '#fff',
                  fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap',
                }}>{v}</div>
              )}
            </div>
            {labels[i] && <span style={{ fontSize: 10, fontWeight: 500, color: isHi ? 'var(--text)' : 'var(--text-faint)' }}>{labels[i]}</span>}
          </div>
        );
      })}
    </div>
  );
};

export const Donut = ({ segments = [], size = 120, thickness = 14, center }) => {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((a, s) => a + s.value, 0);
  let offset = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--stone-100)" strokeWidth={thickness}/>
        {segments.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * circumference;
          const seg = (
            <circle key={i} cx={size/2} cy={size/2} r={radius} fill="none"
              stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset} strokeLinecap="butt"
              style={{ transition: 'stroke-dasharray 0.8s ease-out' }}
            />
          );
          offset += dash;
          return seg;
        })}
      </svg>
      {center && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {center}
        </div>
      )}
    </div>
  );
};

export const ProgressRing = ({ value = 0, max = 100, size = 56, thickness = 6, color = 'var(--verde-500)', label }) => {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (value / max) * circumference;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--stone-100)" strokeWidth={thickness}/>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={thickness}
                strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`}
                style={{ transition: 'stroke-dasharray 0.8s ease-out' }}/>
      </svg>
      {label && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>
          {label}
        </div>
      )}
    </div>
  );
};

export const UIInput = ({ icon, placeholder, value, onChange, style, ...rest }) => (
  <div style={{ position: 'relative', ...style }}>
    {icon && (
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-disabled)', pointerEvents: 'none', display: 'flex' }}>{icon}</span>
    )}
    <input
      value={value} onChange={onChange} placeholder={placeholder}
      style={{
        width: '100%', padding: icon ? '8px 12px 8px 36px' : '8px 12px',
        fontSize: 13, height: 36,
        background: 'var(--surface)', border: '1px solid var(--border-strong)',
        borderRadius: 'var(--r-md)', color: 'var(--text)', outline: 'none', transition: 'all 0.15s',
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--verde-500)'; e.currentTarget.style.boxShadow = 'var(--shadow-focus)'; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = 'none'; }}
      {...rest}
    />
  </div>
);

export const KPI = ({ label, value, delta, deltaTone = 'success', spark = [], sparkColor = 'var(--verde-500)', icon, suffix }) => (
  <Card padding={0} style={{ overflow: 'hidden' }}>
    <div style={{ padding: '14px 16px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
        {icon && (
          <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--stone-50)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>{icon}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <span className="tabular" style={{ fontSize: 30, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.025em', lineHeight: 1 }}>{value}</span>
        {suffix && <span style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 500 }}>{suffix}</span>}
      </div>
      {delta && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Badge tone={deltaTone} size="sm">{delta}</Badge>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>vs. ayer</span>
        </div>
      )}
    </div>
    {spark.length > 0 && (
      <div style={{ padding: '0 4px 4px' }}>
        <Sparkline data={spark} width={300} height={36} color={sparkColor}/>
      </div>
    )}
  </Card>
);

export const Topbar = ({ title, subtitle, breadcrumb, actions }) => (
  <header style={{
    padding: '20px 28px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16,
  }}>
    <div style={{ minWidth: 0 }}>
      {breadcrumb && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--text-faint)', marginBottom: 4 }}>
          {breadcrumb.map((b, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ fontSize: 10 }}>›</span>}
              <span style={{ color: i === breadcrumb.length - 1 ? 'var(--text-muted)' : 'var(--text-faint)', fontWeight: i === breadcrumb.length - 1 ? 600 : 500 }}>{b}</span>
            </span>
          ))}
        </div>
      )}
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{title}</h1>
      {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-faint)' }}>{subtitle}</p>}
    </div>
    {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>}
  </header>
);

export const Page = ({ children, padded = true }) => (
  <div className="scroll-thin" style={{
    flex: 1, overflow: 'auto', background: 'var(--bg)',
    padding: padded ? '20px 28px 32px' : 0,
  }}>{children}</div>
);

export const EmptyState = ({ icon, title, subtitle, action }) => (
  <div style={{ padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
    <div style={{
      width: 56, height: 56, borderRadius: 16,
      background: 'var(--stone-50)', border: '1px solid var(--border)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-disabled)', marginBottom: 14,
    }}>{icon}</div>
    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</p>
    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-faint)', maxWidth: 280 }}>{subtitle}</p>
    {action && <div style={{ marginTop: 18 }}>{action}</div>}
  </div>
);

export const iconBtnStyle = {
  width: 28, height: 28, borderRadius: 6, border: 'none',
  background: 'transparent', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.15s',
};
