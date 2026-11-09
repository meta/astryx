// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file defaultIcons.tsx
 * @input Uses React JSX for inline SVGs
 * @output Exports defaultIcons registry with lightweight SVG fallbacks
 * @position Fallback icons used when no theme provides an icon registry
 *
 * These are intentionally minimal inline SVGs (~1.4KB total) that provide
 * basic visual completeness without any external icon library dependency.
 * Themes should override these with higher-quality icons from a proper
 * icon library (heroicons, lucide, Material Symbols, etc.).
 *
 * All icons:
 * - Use a 24x24 viewBox
 * - Use currentColor for stroke/fill (inherits from parent)
 * - Are aria-hidden (decorative by default)
 * - Use stroke-based rendering with 1.5px stroke width (matching heroicons outline style)
 * - Status icons (checkCircle, xCircle, warning, info) use solid fills for better color visibility
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Icon/globalIconRegistry.tsx (IconName type if names change)
 * - /packages/core/src/Icon/Icon.doc.mjs (fallback icon documentation)
 */

import type {ReactNode} from 'react';
import type {IconName, NamespacedIconName} from './globalIconRegistry';

const svgProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: '1em',
  height: '1em',
  'aria-hidden': true as const,
};

/**
 * Props for solid/filled SVG icons.
 * Status icons (checkCircle, xCircle, warning, info) use solid fills for better
 * color visibility at small sizes, matching the heroicons solid style
 * used by themes.
 */
const solidSvgProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  width: '1em',
  height: '1em',
  'aria-hidden': true as const,
};

export const defaultIcons: Record<IconName, ReactNode> &
  Partial<Record<NamespacedIconName, ReactNode>> = {
  /** ✕ — two diagonal lines */
  close: (
    <svg {...svgProps}>
      <path d="M6 6l12 12M6 18L18 6" />
    </svg>
  ),

  /** ▾ — downward chevron */
  chevronDown: (
    <svg {...svgProps}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),

  /** ⌄ — compact NumberInput stepper chevron */
  'numberInput:stepperDown': (
    <svg {...svgProps}>
      <path d="M7.5 9.75l4.5 4.5 4.5-4.5" />
    </svg>
  ),

  /** ‹ — left chevron */
  chevronLeft: (
    <svg {...svgProps}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  ),

  /** › — right chevron */
  chevronRight: (
    <svg {...svgProps}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),

  /** « — double left chevron (first / jump to start) */
  chevronsLeft: (
    <svg {...svgProps}>
      <path d="M18 6l-6 6 6 6M11 6l-6 6 6 6" />
    </svg>
  ),

  /** » — double right chevron (last / jump to end) */
  chevronsRight: (
    <svg {...svgProps}>
      <path d="M6 6l6 6-6 6M13 6l6 6-6 6" />
    </svg>
  ),

  /** ✓ — checkmark */
  check: (
    <svg {...svgProps}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  ),

  /** ✓ in circle — success state (solid fill for status visibility) */
  success: (
    <svg {...solidSvgProps}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 3a9 9 0 100 18 9 9 0 000-18zm4.06 6.56a.75.75 0 00-1.12-1l-3.94 4.4-1.94-1.94a.75.75 0 00-1.06 1.06l2.5 2.5a.75.75 0 001.09-.03l4.47-5z"
      />
    </svg>
  ),

  /** ✕ in circle — error state (solid fill for status visibility) */
  error: (
    <svg {...solidSvgProps}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 3a9 9 0 100 18 9 9 0 000-18zm-2.47 5.47a.75.75 0 00-1.06 1.06L10.94 12l-2.47 2.47a.75.75 0 101.06 1.06L12 13.06l2.47 2.47a.75.75 0 101.06-1.06L13.06 12l2.47-2.47a.75.75 0 00-1.06-1.06L12 10.94l-2.47-2.47z"
      />
    </svg>
  ),

  /** △ with ! — warning (solid fill for status visibility) */
  warning: (
    <svg {...solidSvgProps}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.29 3.86L2.07 19.05A2 2 0 003.78 22h16.44a2 2 0 001.71-2.95L13.71 3.86a2 2 0 00-3.42 0zM12 9a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0112 9zm0 9a1 1 0 100-2 1 1 0 000 2z"
      />
    </svg>
  ),

  /** ⓘ — information (solid fill for status visibility) */
  info: (
    <svg {...solidSvgProps}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 4a1 1 0 100 2 1 1 0 000-2zm-.75 3.75a.75.75 0 011.5 0v5.5a.75.75 0 01-1.5 0v-5.5z"
      />
    </svg>
  ),

  /** 📅 — calendar */
  calendar: (
    <svg {...svgProps}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),

  /** 🕐 — clock */
  clock: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),

  /** ↗ — external link arrow */
  externalLink: (
    <svg {...svgProps}>
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14L21 3" />
    </svg>
  ),

  /** ☰ — hamburger menu (three horizontal lines) */
  menu: (
    <svg {...svgProps} strokeWidth={2}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),

  /** ⋯ — three horizontal dots (more/overflow) */
  moreHorizontal: (
    <svg {...solidSvgProps}>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  ),

  /** 🔍 — magnifying glass (search) */
  search: (
    <svg {...svgProps}>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  ),

  /** ⇧ — upload into a tray */
  upload: (
    <svg {...svgProps}>
      <path d="M12 16V4m0 0L7 9m5-5l5 5M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
    </svg>
  ),

  /** ↑ — arrow up (sort ascending) */
  arrowUp: (
    <svg {...svgProps}>
      <path d="M12 19V5m0 0l-7 7m7-7l7 7" />
    </svg>
  ),

  /** ↓ — arrow down (sort descending) */
  arrowDown: (
    <svg {...svgProps}>
      <path d="M12 5v14m0 0l7-7m-7 7l-7-7" />
    </svg>
  ),

  /** ↕ — arrows up-down (unsorted / sortable indicator) */
  arrowsUpDown: (
    <svg {...svgProps}>
      <path d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
    </svg>
  ),

  /** 🔽 — funnel (filter indicator) */
  funnel: (
    <svg {...svgProps}>
      <path d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
    </svg>
  ),

  /** 👁‍🗨 — eye with slash (hidden column) */
  eyeSlash: (
    <svg {...svgProps}>
      <path d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  ),

  /** ☐☐ — view columns (column settings) */
  viewColumns: (
    <svg {...svgProps}>
      <path d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  ),

  /** clipboard — copy to clipboard */
  copy: (
    <svg {...svgProps}>
      <path d="M8 4v12a2 2 0 002 2h8a2 2 0 002-2V7.242a2 2 0 00-.602-1.43L16.083 2.57A2 2 0 0014.685 2H10a2 2 0 00-2 2z" />
      <path d="M16 18v2a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h2" />
    </svg>
  ),

  /** ✓✓ — double checkmark (delivered/read) */
  checkDouble: (
    <svg {...svgProps}>
      <path d="M2 13l4 4L14 7" />
      <path d="M9 13l4 4L21 7" />
    </svg>
  ),

  wrench: (
    <svg {...svgProps}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),

  /** ■ — stop (rounded square, solid fill for media control) */
  stop: (
    <svg {...solidSvgProps}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ),

  /** 🎤 — microphone (voice input / dictation) */
  microphone: (
    <svg {...svgProps}>
      <path d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z" />
      <path d="M19 10v1a7 7 0 01-14 0v-1" />
      <path d="M12 18v4m-4 0h8" />
    </svg>
  ),
};
