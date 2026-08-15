const mkIcon = (paths) => ({ size = 18, stroke = 1.75, color = 'currentColor', className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className}>
    {paths}
  </svg>
);

export const IconDashboard = mkIcon(<>
  <rect x="3" y="3" width="7" height="9" rx="1.5"/>
  <rect x="14" y="3" width="7" height="5" rx="1.5"/>
  <rect x="14" y="12" width="7" height="9" rx="1.5"/>
  <rect x="3" y="16" width="7" height="5" rx="1.5"/>
</>);
export const IconPaw = mkIcon(<>
  <circle cx="7" cy="9" r="2"/>
  <circle cx="12" cy="6" r="2"/>
  <circle cx="17" cy="9" r="2"/>
  <circle cx="5" cy="14" r="1.5"/>
  <circle cx="19" cy="14" r="1.5"/>
  <path d="M8 18a4 4 0 0 1 8 0c0 2-1.5 3-4 3s-4-1-4-3z"/>
</>);
export const IconFile = mkIcon(<>
  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>
  <path d="M14 3v5h5"/>
  <line x1="9" y1="13" x2="15" y2="13"/>
  <line x1="9" y1="17" x2="13" y2="17"/>
</>);
export const IconCalendar = mkIcon(<>
  <rect x="3" y="5" width="18" height="16" rx="2"/>
  <line x1="3" y1="10" x2="21" y2="10"/>
  <line x1="8" y1="3" x2="8" y2="7"/>
  <line x1="16" y1="3" x2="16" y2="7"/>
</>);
export const IconCalDays = mkIcon(<>
  <rect x="3" y="5" width="18" height="16" rx="2"/>
  <line x1="3" y1="10" x2="21" y2="10"/>
  <line x1="8" y1="3" x2="8" y2="7"/>
  <line x1="16" y1="3" x2="16" y2="7"/>
  <circle cx="8" cy="15" r="0.8" fill="currentColor"/>
  <circle cx="12" cy="15" r="0.8" fill="currentColor"/>
  <circle cx="16" cy="15" r="0.8" fill="currentColor"/>
</>);
export const IconBell = mkIcon(<>
  <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8z"/>
  <path d="M10 21a2 2 0 0 0 4 0"/>
</>);
export const IconSettings = mkIcon(<>
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
</>);
export const IconSearch = mkIcon(<>
  <circle cx="11" cy="11" r="7"/>
  <line x1="21" y1="21" x2="16.5" y2="16.5"/>
</>);
export const IconPlus = mkIcon(<>
  <line x1="12" y1="5" x2="12" y2="19"/>
  <line x1="5" y1="12" x2="19" y2="12"/>
</>);
export const IconArrowRight = mkIcon(<>
  <line x1="5" y1="12" x2="19" y2="12"/>
  <polyline points="12 5 19 12 12 19"/>
</>);
export const IconArrowLeft = mkIcon(<>
  <line x1="19" y1="12" x2="5" y2="12"/>
  <polyline points="12 19 5 12 12 5"/>
</>);
export const IconChevronRight = mkIcon(<polyline points="9 6 15 12 9 18"/>);
export const IconChevronLeft = mkIcon(<polyline points="15 6 9 12 15 18"/>);
export const IconChevronDown = mkIcon(<polyline points="6 9 12 15 18 9"/>);
export const IconChevronUp = mkIcon(<polyline points="18 15 12 9 6 15"/>);
export const IconClock = mkIcon(<>
  <circle cx="12" cy="12" r="9"/>
  <polyline points="12 7 12 12 15.5 14"/>
</>);
export const IconCheck = mkIcon(<polyline points="20 6 9 17 4 12"/>);
export const IconCheckCircle = mkIcon(<>
  <circle cx="12" cy="12" r="9"/>
  <polyline points="9 12 11 14 15 10"/>
</>);
export const IconAlert = mkIcon(<>
  <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
  <line x1="12" y1="9" x2="12" y2="13"/>
  <line x1="12" y1="17" x2="12.01" y2="17"/>
</>);
export const IconX = mkIcon(<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>);
export const IconEdit = mkIcon(<>
  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
</>);
export const IconTrash = mkIcon(<>
  <polyline points="3 6 5 6 21 6"/>
  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
  <line x1="10" y1="11" x2="10" y2="17"/>
  <line x1="14" y1="11" x2="14" y2="17"/>
</>);
export const IconPhone = mkIcon(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>);
export const IconMsg = mkIcon(<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>);
export const IconWhatsApp = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.5 14.4c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.7.2-.2.3-.8.9-1 1.1-.2.2-.4.2-.7 0-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.4-1.8-1.6-2.1-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.2 3 .1.2 2 3 4.8 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.2-.3-.2-.6-.4z"/>
    <path d="M20.5 3.5C18.2 1.2 15.2 0 12 0 5.4 0 0 5.4 0 12c0 2.1.6 4.2 1.6 6L0 24l6.2-1.6c1.7.9 3.7 1.4 5.8 1.4h0c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.3zM12 21.8c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-3.7 1 1-3.6-.2-.4C2.4 15.6 1.8 13.8 1.8 12 1.8 6.4 6.4 1.8 12 1.8c2.7 0 5.3 1.1 7.2 3 1.9 1.9 3 4.5 3 7.2 0 5.6-4.6 10.2-10.2 10.2z"/>
  </svg>
);
export const IconWeight = mkIcon(<>
  <circle cx="12" cy="7" r="2"/>
  <path d="M5 21h14l-1.5-12a2 2 0 0 0-2-1.7H8.5a2 2 0 0 0-2 1.7L5 21z"/>
</>);
export const IconActivity = mkIcon(<polyline points="3 12 7 12 10 4 14 20 17 12 21 12"/>);
export const IconSyringe = mkIcon(<>
  <path d="m18 2 4 4"/>
  <path d="m17 7 3-3"/>
  <path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5"/>
  <path d="m9 11 4 4"/>
  <path d="m5 19-3 3"/>
  <path d="m14 4 6 6"/>
</>);
export const IconFilter = mkIcon(<polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/>);
export const IconTrending = mkIcon(<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>);
export const IconUser = mkIcon(<><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></>);
export const IconMapPin = mkIcon(<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>);
export const IconMore = mkIcon(<><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/></>);
export const IconCommand = mkIcon(<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>);
export const IconBox = mkIcon(<>
  <path d="M21 8.5v7l-9 4.5-9-4.5v-7L12 4l9 4.5z"/>
  <polyline points="3 8.5 12 13 21 8.5"/>
  <line x1="12" y1="13" x2="12" y2="20"/>
</>);
export const IconLock = mkIcon(<>
  <rect x="4" y="10" width="16" height="11" rx="2.5"/>
  <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
  <circle cx="12" cy="15.5" r="1.3" fill="currentColor" stroke="none"/>
</>);
export const IconShield = mkIcon(<>
  <path d="M12 3l7 3v5.5c0 4.4-2.9 8.3-7 9.5-4.1-1.2-7-5.1-7-9.5V6l7-3z"/>
  <polyline points="9 12 11 14 15 10"/>
</>);
export const IconLogout = mkIcon(<>
  <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/>
  <polyline points="9 8 5 12 9 16"/>
  <line x1="5" y1="12" x2="15" y2="12"/>
</>);
export const IconRefresh = mkIcon(<>
  <path d="M20 12a8 8 0 1 1-2.3-5.6"/>
  <polyline points="20 3 20 8 15 8"/>
</>);
export const IconCash = mkIcon(<>
  <rect x="2" y="6" width="20" height="12" rx="2"/>
  <circle cx="12" cy="12" r="2.5"/>
  <path d="M6 12h.01M18 12h.01"/>
</>);
export const IconReceipt = mkIcon(<>
  <path d="M5 3v18l2.5-1.6L10 21l2-1.6L14 21l2.5-1.6L19 21V3z"/>
  <line x1="9" y1="8" x2="15" y2="8"/>
  <line x1="9" y1="12" x2="15" y2="12"/>
</>);
export const IconPrint = mkIcon(<>
  <polyline points="7 8 7 3 17 3 17 8"/>
  <path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/>
  <rect x="7" y="14" width="10" height="7" rx="1"/>
</>);
export const IconChart = mkIcon(<>
  <line x1="3" y1="21" x2="21" y2="21"/>
  <rect x="5" y="11" width="4" height="7" rx="1"/>
  <rect x="11" y="6" width="4" height="12" rx="1"/>
  <rect x="17" y="14" width="4" height="4" rx="1"/>
</>);
export const IconArrowUp = mkIcon(<><line x1="12" y1="20" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/></>);
export const IconArrowDown = mkIcon(<><line x1="12" y1="4" x2="12" y2="19"/><polyline points="6 13 12 19 18 13"/></>);

export const SpeciesDog = ({ size = 24, color = 'var(--sp-perro)' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <path d="M7 9 C 5 6, 5 3, 8 3 C 11 4, 12 7, 12 10 Z" fill={color} opacity="0.85"/>
    <path d="M25 9 C 27 6, 27 3, 24 3 C 21 4, 20 7, 20 10 Z" fill={color} opacity="0.85"/>
    <ellipse cx="16" cy="17" rx="9" ry="8.5" fill={color}/>
    <ellipse cx="16" cy="21" rx="5" ry="4" fill={color} opacity="0.55"/>
    <circle cx="13" cy="15" r="1.3" fill="#fff"/>
    <circle cx="19" cy="15" r="1.3" fill="#fff"/>
    <ellipse cx="16" cy="19.5" rx="1.4" ry="1" fill="#1C1917"/>
  </svg>
);

export const SpeciesCat = ({ size = 24, color = 'var(--sp-gato)' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <path d="M6 14 L 8 4 L 13 11 Z" fill={color}/>
    <path d="M26 14 L 24 4 L 19 11 Z" fill={color}/>
    <path d="M7.5 11 L 8.5 6 L 11.5 10 Z" fill={color} opacity="0.5"/>
    <path d="M24.5 11 L 23.5 6 L 20.5 10 Z" fill={color} opacity="0.5"/>
    <ellipse cx="16" cy="17" rx="9" ry="8" fill={color}/>
    <ellipse cx="12.5" cy="15.5" rx="1" ry="1.6" fill="#fff"/>
    <ellipse cx="19.5" cy="15.5" rx="1" ry="1.6" fill="#fff"/>
    <path d="M14.5 19 L 17.5 19 L 16 20.5 Z" fill="#1C1917"/>
    <line x1="8" y1="19" x2="12" y2="19.5" stroke={color} strokeOpacity="0.4" strokeWidth="0.6" strokeLinecap="round"/>
    <line x1="24" y1="19" x2="20" y2="19.5" stroke={color} strokeOpacity="0.4" strokeWidth="0.6" strokeLinecap="round"/>
  </svg>
);

export const SpeciesBird = ({ size = 24, color = 'var(--sp-ave)' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <ellipse cx="14" cy="17" rx="8" ry="9" fill={color}/>
    <path d="M10 14 Q 8 19, 12 22 Q 15 20, 14 16 Z" fill={color} opacity="0.6"/>
    <circle cx="20" cy="11" r="5" fill={color}/>
    <circle cx="21" cy="10" r="1.1" fill="#fff"/>
    <circle cx="21" cy="10" r="0.5" fill="#1C1917"/>
    <path d="M24 11 L 28 12 L 24 13 Z" fill="#EA580C"/>
    <line x1="13" y1="25" x2="13" y2="28" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const SpeciesRabbit = ({ size = 24, color = 'var(--sp-conejo)' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <ellipse cx="11" cy="7" rx="2" ry="6" fill={color}/>
    <ellipse cx="21" cy="7" rx="2" ry="6" fill={color}/>
    <ellipse cx="11" cy="7" rx="0.8" ry="4" fill="#FBCFE8"/>
    <ellipse cx="21" cy="7" rx="0.8" ry="4" fill="#FBCFE8"/>
    <ellipse cx="16" cy="18" rx="8" ry="7.5" fill={color}/>
    <circle cx="13" cy="17" r="1.2" fill="#fff"/>
    <circle cx="19" cy="17" r="1.2" fill="#fff"/>
    <circle cx="13" cy="17" r="0.5" fill="#1C1917"/>
    <circle cx="19" cy="17" r="0.5" fill="#1C1917"/>
    <path d="M16 20 L 16 21 M 14.5 22.5 L 16 21 L 17.5 22.5" stroke="#1C1917" strokeWidth="0.8" strokeLinecap="round" fill="none"/>
  </svg>
);

export const SpeciesReptile = ({ size = 24, color = 'var(--sp-reptil)' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <path d="M3 20 Q 8 14, 14 17 Q 20 20, 24 14 Q 27 12, 29 14" stroke={color} strokeWidth="5" strokeLinecap="round" fill="none"/>
    <ellipse cx="27" cy="13.5" rx="3.5" ry="3" fill={color}/>
    <circle cx="28" cy="12.5" r="0.8" fill="#fff"/>
    <circle cx="28" cy="12.5" r="0.4" fill="#1C1917"/>
    <path d="M30 14 L 31 15 M 30 14 L 31 13" stroke="#DC2626" strokeWidth="0.6" strokeLinecap="round"/>
  </svg>
);

export const SpeciesOther = ({ size = 24, color = 'var(--sp-otro)' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <ellipse cx="16" cy="22" rx="6.5" ry="5" fill={color}/>
    <ellipse cx="10" cy="13" rx="2.2" ry="3" fill={color}/>
    <ellipse cx="22" cy="13" rx="2.2" ry="3" fill={color}/>
    <ellipse cx="6" cy="18" rx="1.8" ry="2.4" fill={color}/>
    <ellipse cx="26" cy="18" rx="1.8" ry="2.4" fill={color}/>
  </svg>
);

export const SPECIES_ICONS = {
  perro:  { Icon: SpeciesDog,     label: 'Perro',  color: 'var(--sp-perro)',  soft: 'rgba(37,99,235,0.10)'  },
  gato:   { Icon: SpeciesCat,     label: 'Gato',   color: 'var(--sp-gato)',   soft: 'rgba(124,58,237,0.10)' },
  ave:    { Icon: SpeciesBird,    label: 'Ave',    color: 'var(--sp-ave)',    soft: 'rgba(234,179,8,0.12)'  },
  conejo: { Icon: SpeciesRabbit,  label: 'Conejo', color: 'var(--sp-conejo)', soft: 'rgba(236,72,153,0.10)' },
  reptil: { Icon: SpeciesReptile, label: 'Reptil', color: 'var(--sp-reptil)', soft: 'rgba(22,163,74,0.10)'  },
  otro:   { Icon: SpeciesOther,   label: 'Otro',   color: 'var(--sp-otro)',   soft: 'rgba(120,113,108,0.10)'},
};

const EMOJI_MAP = { perro: '🐶', gato: '🐱', ave: '🐦', conejo: '🐰', reptil: '🦎', otro: '🐾' };

export const SpeciesAvatar = ({ especie = 'otro', size = 40, ring = false }) => {
  const cfg = SPECIES_ICONS[especie] || SPECIES_ICONS.otro;
  const emoji = EMOJI_MAP[especie] || '🐾';
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      borderRadius: size >= 56 ? 16 : 12,
      background: cfg.soft,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.55,
      border: ring ? `1.5px solid ${cfg.color}` : 'none',
    }}>
      {emoji}
    </div>
  );
};

export const VetaAppLogo = ({ size = 32, mono = false }) => {
  const c = mono ? 'currentColor' : 'var(--verde-700)';
  const c2 = mono ? 'currentColor' : 'var(--verde-400)';
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <ellipse cx="10" cy="10" rx="3" ry="4" fill={c}/>
      <ellipse cx="17" cy="6.5" rx="2.8" ry="4" fill={c}/>
      <ellipse cx="24" cy="6.5" rx="2.8" ry="4" fill={c}/>
      <ellipse cx="30" cy="10" rx="3" ry="4" fill={c}/>
      <path d="M11 22 Q 9 15, 20 15 Q 31 15, 29 22 Q 28 30, 20 32 Q 12 30, 11 22 Z" fill={c}/>
      <path d="M13 23 L 16 23 L 17.5 19 L 19 26 L 21 21 L 22.5 24 L 27 24"
            stroke={c2} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.95"/>
    </svg>
  );
};
