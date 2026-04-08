/* Inline SVG icons for the sidebar — no icon libraries */

export const SidebarIcons = {
  mail: (c: string) => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="13" height="11" rx="1.5" />
      <path d="M2 5l6.5 4.5L15 5" />
    </svg>
  ),
  calendar: (c: string) => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="13" height="12" rx="1.5" />
      <path d="M2 7h13" />
      <path d="M5.5 1v3" />
      <path d="M11.5 1v3" />
    </svg>
  ),
  segments: (c: string) => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6.5" cy="6.5" r="4" />
      <circle cx="10.5" cy="10.5" r="4" />
    </svg>
  ),
  brand: (c: string) => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8.5" cy="8.5" r="6.5" />
      <circle cx="6.5" cy="6" r="1" fill={c} stroke="none" />
      <circle cx="10" cy="6" r="1" fill={c} stroke="none" />
      <circle cx="5.5" cy="9" r="1" fill={c} stroke="none" />
      <circle cx="10.5" cy="9.5" r="1.5" />
    </svg>
  ),
  intelligence: (c: string) => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8.5" cy="6" r="4" />
      <path d="M5 14c0-2 1.5-3.5 3.5-3.5S12 12 12 14" />
    </svg>
  ),
  integrations: (c: string) => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="5.5" height="5.5" rx="1" />
      <rect x="9.5" y="2" width="5.5" height="5.5" rx="1" />
      <rect x="2" y="9.5" width="5.5" height="5.5" rx="1" />
      <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1" />
    </svg>
  ),
  home: (c: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  ),
  collapse: (c: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="M14 9l-3 3 3 3" />
    </svg>
  ),
  moon: (c: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  settings: (c: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  campaigns: (c: string) => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="13" height="11" rx="1.5" />
      <path d="M2 6h13" />
      <path d="M5.5 9.5h6" />
      <path d="M5.5 11.5h3" />
    </svg>
  ),
  guide: (c: string) => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h5a2 2 0 0 1 2 2v9.5a1.5 1.5 0 0 0-1.5-1.5H2V3z" />
      <path d="M15 3h-5a2 2 0 0 0-2 2v9.5a1.5 1.5 0 0 1 1.5-1.5H15V3z" />
    </svg>
  ),
  library: (c: string) => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="2" width="3" height="13" rx="0.5" />
      <rect x="7" y="4" width="3" height="11" rx="0.5" />
      <path d="M11.5 6l3 9" />
    </svg>
  ),
  report: (c: string) => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="2" width="11" height="13" rx="1.5" />
      <path d="M6 6h5" />
      <path d="M6 8.5h5" />
      <path d="M6 11h3" />
    </svg>
  ),
  preferences: (c: string) => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="5" x2="14" y2="5" />
      <line x1="3" y1="8.5" x2="14" y2="8.5" />
      <line x1="3" y1="12" x2="14" y2="12" />
      <circle cx="6" cy="5" r="1.5" fill={c} stroke="none" />
      <circle cx="10.5" cy="8.5" r="1.5" fill={c} stroke="none" />
      <circle cx="7.5" cy="12" r="1.5" fill={c} stroke="none" />
    </svg>
  ),
  logout: (c: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
} as const;

export type IconName = keyof typeof SidebarIcons;
