// Copyright (c) Meta Platforms, Inc. and affiliates.

export const FONT_OPTIONS = [
  {
    value:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    label: 'System (Default)',
  },
  {value: '"Inter", -apple-system, sans-serif', label: 'Inter'},
  {value: '"Roboto", -apple-system, sans-serif', label: 'Roboto'},
  {value: '"DM Sans", -apple-system, sans-serif', label: 'DM Sans'},
  {value: '"Figtree", -apple-system, sans-serif', label: 'Figtree'},
  {value: '"Poppins", -apple-system, sans-serif', label: 'Poppins'},
  {
    value: '"IBM Plex Sans", -apple-system, sans-serif',
    label: 'IBM Plex Sans',
  },
  {
    value: '"Source Sans 3", -apple-system, sans-serif',
    label: 'Source Sans',
  },
  {value: '"Noto Sans", -apple-system, sans-serif', label: 'Noto Sans'},
  {value: 'Georgia, "Times New Roman", serif', label: 'Georgia (Serif)'},
];

export const RATIO_OPTIONS = [
  {value: 1.067, label: '1.067 — Minor Second'},
  {value: 1.125, label: '1.125 — Major Second'},
  {value: 1.2, label: '1.200 — Minor Third'},
  {value: 1.25, label: '1.250 — Major Third'},
  {value: 1.333, label: '1.333 — Perfect Fourth'},
  {value: 1.414, label: '1.414 — Augmented Fourth'},
  {value: 1.5, label: '1.500 — Perfect Fifth'},
  {value: 1.618, label: '1.618 — Golden Ratio'},
];

// Every preset keeps `radius === spacing` so nested corners stay concentric by
// default: the radius scale steps by `base` per rung (inner ×1, element ×2,
// container ×3) and one spacing step sits between rungs, so
// `outer-radius − spacing-1 = inner-radius` only holds when the bases match. #958
export const UNIFIED_PRESETS = {
  compact: {
    typeBase: 12,
    typeRatio: 1.125,
    spacing: 2,
    radius: 2,
    sizeMd: 28,
  },
  default: {
    typeBase: 14,
    typeRatio: 1.2,
    spacing: 4,
    radius: 4,
    sizeMd: 32,
  },
  comfortable: {
    typeBase: 16,
    typeRatio: 1.25,
    spacing: 6,
    radius: 6,
    sizeMd: 40,
  },
  gigantic: {
    typeBase: 18,
    typeRatio: 1.414,
    spacing: 8,
    radius: 8,
    sizeMd: 48,
  },
} as const;

const RADIUS_OPTIONS = [
  {value: 'var(--radius-none)', token: '--radius-none', label: 'None'},
  {value: 'var(--radius-inner)', token: '--radius-inner', label: 'Inner'},
  {value: 'var(--radius-element)', token: '--radius-element', label: 'Element'},
  {
    value: 'var(--radius-container)',
    token: '--radius-container',
    label: 'Container',
  },
  {value: 'var(--radius-page)', token: '--radius-page', label: 'Page'},
  {value: 'var(--radius-full)', token: '--radius-full', label: 'Full'},
];

const SPACING_OPTIONS = [
  {value: 'var(--spacing-0-5)', token: '--spacing-0-5', label: '0.5'},
  {value: 'var(--spacing-1)', token: '--spacing-1', label: '1'},
  {value: 'var(--spacing-2)', token: '--spacing-2', label: '2'},
  {value: 'var(--spacing-3)', token: '--spacing-3', label: '3'},
  {value: 'var(--spacing-4)', token: '--spacing-4', label: '4'},
  {value: 'var(--spacing-6)', token: '--spacing-6', label: '6'},
  {value: 'var(--spacing-8)', token: '--spacing-8', label: '8'},
];

export function resolveOptionLabel(
  option: {label: string; token?: string},
  tokens: Record<string, string>,
): string {
  if (!option.token) {
    return option.label;
  }
  const resolved = tokens[option.token];
  if (resolved) {
    return `${option.label} — ${resolved}`;
  }
  return option.label;
}

interface ComponentVar {
  name: string;
  default: string;
  description: string;
  options: Array<{value: string; label: string}>;
}

export const COMPONENT_VARS: Record<
  string,
  {label: string; vars: ComponentVar[]}
> = {
  button: {
    label: 'Button',
    vars: [
      {
        name: '--button-radius',
        default: 'var(--radius-element)',
        description: 'Border radius',
        options: RADIUS_OPTIONS,
      },
    ],
  },
  card: {
    label: 'Card',
    vars: [
      {
        name: '--card-radius',
        default: 'var(--radius-container)',
        description: 'Border radius',
        options: RADIUS_OPTIONS,
      },
      {
        name: '--card-padding',
        default: 'var(--spacing-4)',
        description: 'Padding',
        options: SPACING_OPTIONS,
      },
    ],
  },
  field: {
    label: 'Field / Input',
    vars: [
      {
        name: '--input-radius',
        default: 'var(--radius-element)',
        description: 'Border radius',
        options: RADIUS_OPTIONS,
      },
    ],
  },
  banner: {
    label: 'Banner',
    vars: [
      {
        name: '--banner-radius',
        default: 'var(--radius-container)',
        description: 'Border radius',
        options: RADIUS_OPTIONS,
      },
    ],
  },
  'segmented-control': {
    label: 'Segmented Control',
    vars: [
      {
        name: '--segmented-control-radius',
        default: 'var(--radius-element)',
        description: 'Border radius',
        options: RADIUS_OPTIONS,
      },
      {
        name: '--segmented-control-padding',
        default: 'var(--spacing-0-5)',
        description: 'Padding',
        options: SPACING_OPTIONS,
      },
    ],
  },
  dialog: {
    label: 'Dialog',
    vars: [
      {
        name: '--dialog-radius',
        default: 'var(--radius-container)',
        description: 'Border radius',
        options: RADIUS_OPTIONS,
      },
      {
        name: '--dialog-padding',
        default: 'var(--spacing-4)',
        description: 'Padding',
        options: SPACING_OPTIONS,
      },
    ],
  },
  'dropdown-menu': {
    label: 'Dropdown Menu',
    vars: [
      {
        name: '--dropdown-radius',
        default: 'var(--radius-element)',
        description: 'Border radius',
        options: RADIUS_OPTIONS,
      },
      {
        name: '--dropdown-padding',
        default: 'var(--spacing-1)',
        description: 'Inner padding',
        options: SPACING_OPTIONS,
      },
    ],
  },
  section: {
    label: 'Section',
    vars: [
      {
        name: '--section-padding',
        default: 'var(--spacing-4)',
        description: 'Padding',
        options: SPACING_OPTIONS,
      },
    ],
  },
  popover: {
    label: 'Popover',
    vars: [
      {
        name: '--popover-radius',
        default: 'var(--radius-element)',
        description: 'Border radius',
        options: RADIUS_OPTIONS,
      },
    ],
  },
  hovercard: {
    label: 'Hover Card',
    vars: [
      {
        name: '--hovercard-radius',
        default: 'var(--radius-container)',
        description: 'Border radius',
        options: RADIUS_OPTIONS,
      },
    ],
  },
  'chat-composer': {
    label: 'Chat Composer',
    vars: [
      {
        name: '--composer-radius',
        default: 'var(--radius-page)',
        description: 'Border radius',
        options: RADIUS_OPTIONS,
      },
      {
        name: '--composer-padding',
        default: 'var(--spacing-3)',
        description: 'Padding',
        options: SPACING_OPTIONS,
      },
    ],
  },
};

// Maps component CSS var names to defineTheme() components entries.
// Most use the derivedVarRegistry keys (which match Astryx component selector keys).
// Some components set internal --_ vars via StyleX on a child element,
// so we target the child class directly with the internal var name.
export const COMPONENT_VAR_TO_OVERRIDE: Record<
  string,
  {component: string; cssProperty: string}[]
> = {
  '--button-radius': [{component: 'button', cssProperty: 'borderRadius'}],
  '--card-radius': [{component: 'card', cssProperty: 'borderRadius'}],
  '--card-padding': [{component: 'card', cssProperty: 'padding'}],
  '--input-radius': [
    {component: 'text-input', cssProperty: '--_field-radius'},
    {component: 'text-area', cssProperty: '--_field-radius'},
    {component: 'selector', cssProperty: '--_field-radius'},
  ],
  '--banner-radius': [{component: 'banner', cssProperty: 'borderRadius'}],
  '--segmented-control-radius': [
    {component: 'segmented-control', cssProperty: 'borderRadius'},
  ],
  '--segmented-control-padding': [
    {component: 'segmented-control', cssProperty: 'padding'},
  ],
  '--dialog-radius': [{component: 'dialog', cssProperty: 'borderRadius'}],
  '--dialog-padding': [{component: 'dialog', cssProperty: 'padding'}],
  '--dropdown-radius': [
    {component: 'dropdown-menu', cssProperty: 'borderRadius'},
  ],
  '--dropdown-padding': [{component: 'dropdown-menu', cssProperty: 'padding'}],
  '--section-padding': [{component: 'section', cssProperty: 'padding'}],
  '--popover-radius': [{component: 'popover', cssProperty: 'borderRadius'}],
  '--hovercard-radius': [
    {component: 'hover-card', cssProperty: 'borderRadius'},
  ],
  '--composer-radius': [
    {component: 'chat-composer', cssProperty: '--_chat-composer-radius'},
  ],
  '--composer-padding': [
    {component: 'chat-composer', cssProperty: '--_chat-composer-padding'},
  ],
};

export const COMPONENT_VAR_NAMES = new Set(
  Object.keys(COMPONENT_VAR_TO_OVERRIDE),
);

export const ALL_COMPONENT_NAMES = [
  'alert-dialog',
  'app-shell',
  'avatar',
  'badge',
  'banner',
  'button',
  'calendar',
  'card',
  'chat-composer',
  'chat-message',
  'chat-message-bubble',
  'checkbox-indicator',
  'clickable-card',
  'code-block',
  'collapsible',
  'dialog',
  'divider',
  'dropdown-menu',
  'empty-state',
  'field',
  'heading',
  'hover-card',
  'icon',
  'link',
  'list',
  'markdown',
  'popover',
  'progress-bar',
  'radio-indicator',
  'section',
  'segmented-control',
  'selector',
  'side-nav',
  'skeleton',
  'slider',
  'spinner',
  'switch',
  'tab',
  'tab-list',
  'table',
  'text',
  'text-input',
  'text-area',
  'toast',
  'token',
  'tooltip',
  'top-nav',
] as const;

export const COLOR_CATEGORIES = {
  'Core Semantic': [
    '--color-accent',
    '--color-accent-muted',
    '--color-on-accent',
    '--color-neutral',
    '--color-overlay',
    '--color-overlay-hover',
    '--color-overlay-pressed',
  ],
  Text: [
    '--color-text-primary',
    '--color-text-secondary',
    '--color-text-disabled',
    '--color-text-accent',
    '--color-on-dark',
    '--color-on-light',
  ],
  Icon: [
    '--color-icon-primary',
    '--color-icon-secondary',
    '--color-icon-disabled',
  ],
  'Surface Variants': [
    '--color-background-surface',
    '--color-background-body',
    '--color-background-muted',
    '--color-background-card',
    '--color-background-popover',
    '--color-background-inverted',
    '--color-background-error-inverted',
  ],
  'Category Colors': [
    '--color-background-blue',
    '--color-background-cyan',
    '--color-background-gray',
    '--color-background-green',
    '--color-background-orange',
    '--color-background-pink',
    '--color-background-purple',
    '--color-background-red',
    '--color-background-teal',
    '--color-background-yellow',
  ],
  'Status/Sentiment': [
    '--color-success',
    '--color-success-muted',
    '--color-error',
    '--color-error-muted',
    '--color-warning',
    '--color-warning-muted',
  ],
  Divider: ['--color-border', '--color-border-emphasized'],
  Effects: ['--color-skeleton', '--color-shadow', '--color-tint-hover'],
} as const;

export const TYPOGRAPHY_CATEGORIES: Record<
  string,
  string[] | {description: string; tokens: string[]}
> = {
  'Font Families': [
    '--font-family-body',
    '--font-family-heading',
    '--font-family-code',
  ],
  'Heading 1': {
    description: 'Primary page title',
    tokens: [
      '--text-heading-1-size',
      '--text-heading-1-weight',
      '--text-heading-1-leading',
    ],
  },
  'Heading 2': {
    description: 'Section title',
    tokens: [
      '--text-heading-2-size',
      '--text-heading-2-weight',
      '--text-heading-2-leading',
    ],
  },
  'Heading 3': {
    description: 'Subsection title',
    tokens: [
      '--text-heading-3-size',
      '--text-heading-3-weight',
      '--text-heading-3-leading',
    ],
  },
  'Body Text': {
    description: 'Default paragraph text',
    tokens: ['--text-body-size', '--text-body-weight', '--text-body-leading'],
  },
  'Label Text': {
    description: 'Form labels, UI labels',
    tokens: [
      '--text-label-size',
      '--text-label-weight',
      '--text-label-leading',
    ],
  },
  'Supporting Text': {
    description: 'Captions, helper text',
    tokens: [
      '--text-supporting-size',
      '--text-supporting-weight',
      '--text-supporting-leading',
    ],
  },
} as const;

export const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Figtree:wght@400;500;600;700&family=Fustat:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Manufacturing+Consent&family=Montserrat:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&family=Playwrite+US+Trad:wght@100..400&family=Poppins:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Source+Sans+3:wght@400;500;600;700&family=UnifrakturMaguntia&display=swap';
