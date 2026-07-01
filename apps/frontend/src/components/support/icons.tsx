// Inline SVG icon set for the support feature. No new icon library —
// existing repos are using inline SVGs everywhere, this matches.

import React from 'react';

const PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function WifiIcon(props: React.SVGProps<SVGSVGElement>): React.ReactElement {
  return (
    <svg {...PROPS} {...props}>
      <path d="M5 12.55a11 11 0 0 1 14 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}

export function CameraIcon(props: React.SVGProps<SVGSVGElement>): React.ReactElement {
  return (
    <svg {...PROPS} {...props}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function MicIcon(props: React.SVGProps<SVGSVGElement>): React.ReactElement {
  return (
    <svg {...PROPS} {...props}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

export function DeviceIcon(props: React.SVGProps<SVGSVGElement>): React.ReactElement {
  return (
    <svg {...PROPS} {...props}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

export function PowerIcon(props: React.SVGProps<SVGSVGElement>): React.ReactElement {
  return (
    <svg {...PROPS} {...props}>
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  );
}

export function OtherIcon(props: React.SVGProps<SVGSVGElement>): React.ReactElement {
  return (
    <svg {...PROPS} {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export function getIssueIcon(key: string): React.ReactElement {
  // The hardcoded map below matches the 6 default categories. Admin-
  // defined categories (e.g. "stipend-issue") fall through to the
  // generic icon. Adding a new default just means adding a case here.
  switch (key) {
    case 'internet':   return <WifiIcon />;
    case 'camera':     return <CameraIcon />;
    case 'microphone': return <MicIcon />;
    case 'device':     return <DeviceIcon />;
    case 'power':      return <PowerIcon />;
    default:          return <OtherIcon />;
  }
}
