// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {generateThemeCSS} from '@astryxdesign/core/theme';
import {neutralPalettes} from './neutralPalettes';
import {neutralTheme} from './neutralTheme';

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string): number => {
    const channels = [0, 2, 4].map(offset =>
      Number.parseInt(hex.slice(offset + 1, offset + 3), 16),
    );
    return channels.reduce((sum, channel, index) => {
      const srgb = channel / 255;
      const linear =
        srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
      return sum + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

const lightDark = (light: string, dark: string) =>
  `light-dark(${light}, ${dark})`;

describe('neutral theme palette mappings', () => {
  it('keeps semantic and categorical tokens aligned with reviewed stops', () => {
    const mappings = {
      '--color-background-surface': lightDark(
        neutralPalettes.neutral.light[100],
        neutralPalettes.neutral.dark[15],
      ),
      '--color-background-body': lightDark(
        neutralPalettes.neutral.light[95],
        neutralPalettes.neutral.dark[10],
      ),
      '--color-text-primary': lightDark(
        neutralPalettes.neutral.light[0],
        neutralPalettes.neutral.dark[100],
      ),
      '--color-text-secondary': lightDark(
        neutralPalettes.neutral.light[30],
        neutralPalettes.neutral.dark[65],
      ),
      '--color-text-disabled': lightDark(
        neutralPalettes.neutral.light[60],
        neutralPalettes.neutral.dark[35],
      ),
      '--color-text-accent': lightDark(
        neutralPalettes.neutral.light[10],
        neutralPalettes.neutral.dark[95],
      ),
      '--color-icon-primary': lightDark(
        neutralPalettes.neutral.light[0],
        neutralPalettes.neutral.dark[100],
      ),
      '--color-icon-secondary': lightDark(
        neutralPalettes.neutral.light[45],
        neutralPalettes.neutral.dark[65],
      ),
      '--color-icon-disabled': lightDark(
        neutralPalettes.neutral.light[60],
        neutralPalettes.neutral.dark[35],
      ),
      '--color-icon-accent': lightDark(
        neutralPalettes.neutral.light[10],
        neutralPalettes.neutral.dark[95],
      ),
      '--color-accent': lightDark(
        neutralPalettes.neutral.light[10],
        neutralPalettes.neutral.dark[95],
      ),
      '--color-info': lightDark('#0074e2', '#6d9cfe'),
      '--color-info-muted': lightDark(
        neutralPalettes.blue.light[85],
        `${neutralPalettes.blue.dark[75]}3D`,
      ),
      '--color-on-info': lightDark(
        neutralPalettes.neutral.light[100],
        neutralPalettes.neutral.dark[5],
      ),
      // Strong status fills: Neutral's released Badge fill colours.
      '--color-success': lightDark('#198100', '#64af4c'),
      '--color-warning': '#ffce2f',
      '--color-error': lightDark('#c9303a', '#ff705d'),
      '--color-text-info': lightDark(
        neutralPalettes.blue.light[45],
        neutralPalettes.blue.dark[80],
      ),
      '--color-text-success': lightDark(
        neutralPalettes.green.light[45],
        neutralPalettes.green.light[75],
      ),
      '--color-text-warning': lightDark(
        neutralPalettes.yellow.light[45],
        neutralPalettes.yellow.light[80],
      ),
      '--color-text-error': lightDark(
        neutralPalettes.red.light[45],
        neutralPalettes.red.dark[80],
      ),
      '--color-on-info-muted': lightDark(
        neutralPalettes.blue.light[25],
        neutralPalettes.blue.dark[80],
      ),
      '--color-on-success-muted': lightDark(
        neutralPalettes.green.light[25],
        neutralPalettes.green.light[75],
      ),
      '--color-on-warning-muted': lightDark(
        neutralPalettes.yellow.light[25],
        neutralPalettes.yellow.light[80],
      ),
      '--color-on-error-muted': lightDark(
        neutralPalettes.red.light[25],
        neutralPalettes.red.dark[80],
      ),
      '--color-background-red': lightDark(
        neutralPalettes.red.light[85],
        neutralPalettes.red.dark[25],
      ),
      '--color-border-red': lightDark(
        neutralPalettes.red.light[80],
        neutralPalettes.red.light[65],
      ),
      '--color-icon-red': lightDark(
        neutralPalettes.red.light[25],
        neutralPalettes.red.dark[75],
      ),
      '--color-text-red': lightDark(
        neutralPalettes.red.light[25],
        neutralPalettes.red.dark[80],
      ),
      '--color-background-orange': lightDark(
        neutralPalettes.orange.light[85],
        neutralPalettes.orange.dark[25],
      ),
      '--color-border-orange': lightDark(
        neutralPalettes.orange.light[85],
        neutralPalettes.orange.dark[65],
      ),
      '--color-icon-orange': lightDark(
        neutralPalettes.orange.light[25],
        neutralPalettes.orange.light[75],
      ),
      '--color-text-orange': lightDark(
        neutralPalettes.orange.light[25],
        neutralPalettes.orange.dark[80],
      ),
      '--color-background-yellow': lightDark(
        neutralPalettes.yellow.dark[90],
        neutralPalettes.yellow.dark[25],
      ),
      '--color-border-yellow': lightDark(
        neutralPalettes.yellow.dark[80],
        neutralPalettes.yellow.light[65],
      ),
      '--color-icon-yellow': lightDark(
        neutralPalettes.yellow.light[25],
        neutralPalettes.yellow.light[75],
      ),
      '--color-text-yellow': lightDark(
        neutralPalettes.yellow.light[25],
        neutralPalettes.yellow.light[80],
      ),
      '--color-background-green': lightDark(
        neutralPalettes.green.dark[85],
        neutralPalettes.green.dark[25],
      ),
      '--color-border-green': lightDark(
        neutralPalettes.green.dark[80],
        neutralPalettes.green.light[65],
      ),
      '--color-icon-green': lightDark(
        neutralPalettes.green.light[25],
        neutralPalettes.green.light[75],
      ),
      '--color-text-green': lightDark(
        neutralPalettes.green.light[25],
        neutralPalettes.green.light[75],
      ),
      '--color-background-teal': lightDark(
        neutralPalettes.teal.light[85],
        neutralPalettes.teal.dark[25],
      ),
      '--color-border-teal': lightDark(
        neutralPalettes.teal.light[80],
        neutralPalettes.teal.dark[65],
      ),
      '--color-icon-teal': lightDark(
        neutralPalettes.teal.light[25],
        neutralPalettes.teal.dark[75],
      ),
      '--color-text-teal': lightDark(
        neutralPalettes.teal.light[25],
        neutralPalettes.teal.light[80],
      ),
      '--color-background-cyan': lightDark(
        neutralPalettes.cyan.dark[85],
        neutralPalettes.cyan.dark[25],
      ),
      '--color-border-cyan': lightDark(
        neutralPalettes.cyan.dark[80],
        neutralPalettes.cyan.dark[65],
      ),
      '--color-icon-cyan': lightDark(
        neutralPalettes.cyan.light[25],
        neutralPalettes.cyan.dark[75],
      ),
      '--color-text-cyan': lightDark(
        neutralPalettes.cyan.light[25],
        neutralPalettes.cyan.dark[80],
      ),
      '--color-background-blue': lightDark(
        neutralPalettes.blue.light[85],
        neutralPalettes.blue.dark[25],
      ),
      '--color-border-blue': lightDark(
        neutralPalettes.blue.light[80],
        neutralPalettes.blue.dark[65],
      ),
      '--color-icon-blue': lightDark(
        neutralPalettes.blue.light[25],
        neutralPalettes.blue.dark[75],
      ),
      '--color-text-blue': lightDark(
        neutralPalettes.blue.light[25],
        neutralPalettes.blue.dark[80],
      ),
      '--color-background-purple': lightDark(
        neutralPalettes.purple.light[90],
        neutralPalettes.purple.dark[25],
      ),
      '--color-border-purple': lightDark(
        neutralPalettes.purple.light[85],
        neutralPalettes.purple.light[70],
      ),
      '--color-icon-purple': lightDark(
        neutralPalettes.purple.light[25],
        neutralPalettes.purple.light[75],
      ),
      '--color-text-purple': lightDark(
        neutralPalettes.purple.light[25],
        neutralPalettes.purple.dark[80],
      ),
      '--color-background-pink': lightDark(
        neutralPalettes.pink.light[85],
        neutralPalettes.pink.dark[25],
      ),
      '--color-border-pink': lightDark(
        neutralPalettes.pink.light[85],
        neutralPalettes.pink.light[70],
      ),
      '--color-icon-pink': lightDark(
        neutralPalettes.pink.light[25],
        neutralPalettes.pink.dark[75],
      ),
      '--color-text-pink': lightDark(
        neutralPalettes.pink.light[25],
        neutralPalettes.pink.dark[80],
      ),
      '--color-background-gray': lightDark(
        neutralPalettes.neutral.light[90],
        neutralPalettes.neutral.dark[20],
      ),
      '--color-text-gray': lightDark(
        neutralPalettes.neutral.light[10],
        neutralPalettes.neutral.dark[85],
      ),
      '--color-icon-gray': lightDark(
        neutralPalettes.neutral.light[30],
        neutralPalettes.neutral.dark[65],
      ),
    };

    expect(neutralTheme.tokens).toMatchObject(mappings);
  });

  it('keeps dark categorical text readable on its background', () => {
    const pairs = [
      [neutralPalettes.red.dark[80], neutralPalettes.red.dark[25]],
      [neutralPalettes.orange.dark[80], neutralPalettes.orange.dark[25]],
      [neutralPalettes.yellow.light[80], neutralPalettes.yellow.dark[25]],
      [neutralPalettes.green.light[75], neutralPalettes.green.dark[25]],
      [neutralPalettes.teal.light[80], neutralPalettes.teal.dark[25]],
      [neutralPalettes.cyan.dark[80], neutralPalettes.cyan.dark[25]],
      [neutralPalettes.blue.dark[80], neutralPalettes.blue.dark[25]],
      [neutralPalettes.purple.dark[80], neutralPalettes.purple.dark[25]],
      [neutralPalettes.pink.dark[80], neutralPalettes.pink.dark[25]],
      [neutralPalettes.neutral.dark[85], neutralPalettes.neutral.dark[20]],
    ] as const;

    for (const [foreground, background] of pairs) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// A wash of `color` at `alpha` (0-255) over `background`, as the browser
// composites `--color-neutral`, the hover tint.
function composite(color: string, alpha: number, background: string): string {
  const channel = (hex: string, offset: number) =>
    Number.parseInt(hex.slice(offset + 1, offset + 3), 16);
  return `#${[0, 2, 4]
    .map(offset =>
      Math.round(
        (channel(color, offset) * alpha +
          channel(background, offset) * (255 - alpha)) /
          255,
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

describe('neutral selected fill', () => {
  // `--color-accent-muted` fills a selected row, a range, a highlighted line
  // and a pressed preset. It must stand apart from every surface it sits on,
  // and from the hover tint on that surface, in both modes.
  const [, lightFill, darkFill] =
    /^light-dark\((#[0-9a-f]{6}), (#[0-9a-f]{6})\)$/i.exec(
      String(neutralTheme.tokens?.['--color-accent-muted']),
    ) ?? [];
  const modes = [
    {
      name: 'light',
      fill: lightFill,
      surface: neutralPalettes.neutral.light[100],
      body: neutralPalettes.neutral.light[95],
      tint: neutralPalettes.neutral.light[0],
      alpha: 0x0f,
    },
    {
      name: 'dark',
      fill: darkFill,
      surface: neutralPalettes.neutral.dark[15],
      body: neutralPalettes.neutral.dark[10],
      tint: neutralPalettes.neutral.dark[100],
      alpha: 0x1a,
    },
  ];

  it.each(modes)(
    'stands apart from the surface, the body and their hover tints in $name mode',
    ({fill, surface, body, tint, alpha}) => {
      for (const background of [
        surface,
        body,
        composite(tint, alpha, surface),
        composite(tint, alpha, body),
      ]) {
        expect(contrastRatio(fill, background)).toBeGreaterThanOrEqual(1.15);
      }
    },
  );

  // The text that sits on the fill keeps normal-text AA: a selected row's
  // secondary text (scoped up on selected rows) and the muted syntax colours
  // on a highlighted code line.
  const pair = (value: unknown): [string, string] => {
    const match = /^light-dark\((#[0-9a-f]{6}), (#[0-9a-f]{6})\)$/i.exec(
      String(value),
    );
    if (match == null) {
      throw new Error(`not a light-dark pair: ${String(value)}`);
    }
    return [match[1], match[2]];
  };
  const foregrounds = {
    'item selected --color-text-secondary': pair(
      neutralTheme.components?.item?.selected?.['--color-text-secondary'],
    ),
    'tree-list-item selected --color-text-secondary': pair(
      neutralTheme.components?.['tree-list-item']?.selected?.[
        '--color-text-secondary'
      ],
    ),
    'citation variant:number --color-text-secondary': pair(
      neutralTheme.components?.citation?.['variant:number']?.[
        '--color-text-secondary'
      ],
    ),
    'file-input mode:dropzone --color-text-secondary': pair(
      neutralTheme.components?.['file-input']?.['mode:dropzone']?.[
        '--color-text-secondary'
      ],
    ),
    '--color-syntax-comment': pair(
      neutralTheme.tokens['--color-syntax-comment'],
    ),
    '--color-syntax-operator': pair(
      neutralTheme.tokens['--color-syntax-operator'],
    ),
    '--color-syntax-punctuation': pair(
      neutralTheme.tokens['--color-syntax-punctuation'],
    ),
  };
  // Every token colour reads on a highlighted line, not only the muted ones.
  it.each(
    [
      'keyword',
      'string',
      'comment',
      'number',
      'function',
      'type',
      'variable',
      'operator',
      'constant',
      'tag',
      'attribute',
      'property',
      'punctuation',
    ].map(token => `--color-syntax-${token}`),
  )('%s reads at 4.5:1 on a highlighted line in both modes', token => {
    const [light, dark] = pair(neutralTheme.tokens[token]);
    expect(contrastRatio(light, lightFill)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark, darkFill)).toBeGreaterThanOrEqual(4.5);
  });

  // A selected row also shows the hover overlay over its fill
  // (`--color-overlay-hover`: black at 0x0D in light, white at 0x0D in dark).
  it.each([
    'item selected --color-text-secondary',
    'tree-list-item selected --color-text-secondary',
  ] as const)('%s reads at 4.5:1 on the hovered fill', name => {
    const [light, dark] = foregrounds[name];
    const lightHovered = composite(
      neutralPalettes.neutral.light[0],
      0x0d,
      lightFill,
    );
    const darkHovered = composite(
      neutralPalettes.neutral.dark[100],
      0x0d,
      darkFill,
    );
    expect(contrastRatio(light, lightHovered)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark, darkHovered)).toBeGreaterThanOrEqual(4.5);
  });

  it('scopes the lifted secondary text to selected rows, numbered citations and dropzones in the generated CSS', () => {
    const css = generateThemeCSS(neutralTheme).component;
    for (const target of ['item', 'tree-list-item']) {
      expect(css).toMatch(
        new RegExp(
          `\\.astryx-${target}\\[data-selected="selected"\\][^{]*\\{[^}]*--color-text-secondary`,
        ),
      );
    }
    expect(css).toMatch(
      /\.astryx-citation\[data-variant="number"\][^{]*\{[^}]*--color-text-secondary/,
    );
    expect(css).toMatch(
      /\.astryx-file-input\[data-mode="dropzone"\][^{]*\{[^}]*--color-text-secondary/,
    );
  });
  it.each(Object.entries(foregrounds))(
    '%s reads at 4.5:1 on the fill in both modes',
    (_, [light, dark]) => {
      expect(contrastRatio(light, lightFill)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark, darkFill)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('neutral syntax contrast', () => {
  it('keeps light CodeBlock comments and operators at normal-text AA', () => {
    const background = neutralPalettes.neutral.light[100];
    for (const token of ['comment', 'operator'] as const) {
      expect(neutralTheme.tokens[`--color-syntax-${token}`]).toBe(
        lightDark(
          neutralPalettes.neutral.light[35],
          neutralPalettes.neutral.dark[75],
        ),
      );
      expect(
        contrastRatio(neutralPalettes.neutral.light[35], background),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('neutral semantic status roles', () => {
  it('keeps public plain-surface and on-muted roles on reviewed palette stops', () => {
    expect(neutralTheme.tokens).toMatchObject({
      '--color-text-info': lightDark(
        neutralPalettes.blue.light[45],
        neutralPalettes.blue.dark[80],
      ),
      '--color-text-success': lightDark(
        neutralPalettes.green.light[45],
        neutralPalettes.green.light[75],
      ),
      '--color-text-warning': lightDark(
        neutralPalettes.yellow.light[45],
        neutralPalettes.yellow.light[80],
      ),
      '--color-text-error': lightDark(
        neutralPalettes.red.light[45],
        neutralPalettes.red.dark[80],
      ),
      '--color-on-info-muted': lightDark(
        neutralPalettes.blue.light[25],
        neutralPalettes.blue.dark[80],
      ),
      '--color-on-success-muted': lightDark(
        neutralPalettes.green.light[25],
        neutralPalettes.green.light[75],
      ),
      '--color-on-warning-muted': lightDark(
        neutralPalettes.yellow.light[25],
        neutralPalettes.yellow.light[80],
      ),
      '--color-on-error-muted': lightDark(
        neutralPalettes.red.light[25],
        neutralPalettes.red.dark[80],
      ),
    });
    expect(neutralTheme.localTokens).not.toHaveProperty(
      '--astryx-theme-neutral-color-status-emphasized-info',
    );
  });

  it('keeps only the released accent local token, unused by Neutral itself', () => {
    expect(neutralTheme.localTokens).toEqual({
      '--astryx-theme-neutral-color-status-fill-accent': lightDark(
        '#0074e2',
        '#6d9cfe',
      ),
    });
    const css = JSON.stringify({
      tokens: neutralTheme.tokens,
      components: neutralTheme.components,
    });
    expect(css).not.toContain('--astryx-theme-neutral-');
  });

  it('uses public semantic roles on plain and pale surfaces while preserving fill roles', () => {
    expect(neutralTheme.tokens).toMatchObject({
      '--color-info': lightDark('#0074e2', '#6d9cfe'),
      // Strong status fills: Neutral's released Badge fill colours.
      '--color-success': lightDark('#198100', '#64af4c'),
      '--color-warning': '#ffce2f',
      '--color-error': lightDark('#c9303a', '#ff705d'),
    });
    expect(neutralTheme.components).not.toHaveProperty('icon');
    expect(neutralTheme.components).not.toHaveProperty('text-input');
    expect(neutralTheme.components).not.toHaveProperty('text-area-counter');
    expect(neutralTheme.components?.badge).not.toHaveProperty('variant:info');
    // Status and accent variants read the portable roles, not overrides.
    expect(neutralTheme.components).not.toHaveProperty('status-dot');
    expect(neutralTheme.components).not.toHaveProperty('step-indicator');
    expect(neutralTheme.components).not.toHaveProperty('avatar-status-dot');
    expect(neutralTheme.components?.['progress-bar']).not.toHaveProperty(
      'variant:accent',
    );
    expect(
      neutralTheme.components?.button?.['variant:destructive'],
    ).toMatchObject({
      backgroundColor: 'var(--color-error-muted)',
      color: 'var(--color-on-error-muted)',
    });
  });

  it('keeps plain-surface status roles at their required contrast on the page background in light mode', () => {
    const surface = neutralPalettes.neutral.light[95];
    for (const foreground of [
      neutralPalettes.blue.light[45],
      neutralPalettes.green.light[45],
      neutralPalettes.yellow.light[45],
      neutralPalettes.red.light[45],
    ]) {
      expect(contrastRatio(foreground, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('does not adopt the unapproved table row-status target', () => {
    expect(neutralTheme.components).not.toHaveProperty('table-row-status');
  });
});

describe('neutral Banner and destructive Button', () => {
  it('paint with the portable roles and no Neutral-only overrides', () => {
    expect(neutralTheme.components).not.toHaveProperty('banner');
    expect(neutralTheme.tokens['--color-background-blue']).toBe(
      lightDark(neutralPalettes.blue.light[85], neutralPalettes.blue.dark[25]),
    );
    expect(neutralTheme.components?.button?.['variant:destructive']).toEqual({
      backgroundColor: 'var(--color-error-muted)',
      color: 'var(--color-on-error-muted)',
    });
  });
});

describe('neutral theme component overrides', () => {
  it('keeps the roomier segmented-control inset height-neutral', () => {
    expect(neutralTheme.components?.['segmented-control']).toEqual({
      base: {padding: 'var(--spacing-1)'},
    });
    expect(neutralTheme.components?.['segmented-control-item']).toEqual({
      base: {
        '--color-text-secondary': lightDark(
          neutralPalettes.neutral.light[30],
          neutralPalettes.neutral.dark[80],
        ),
      },
      'size:sm': {height: 'calc(var(--size-element-sm) - 8px)'},
      'size:md': {height: 'calc(var(--size-element-md) - 8px)'},
      'size:lg': {height: 'calc(var(--size-element-lg) - 8px)'},
      selected: {boxShadow: 'none'},
    });
  });
});

describe('neutral touch + narrow type pin', () => {
  it('floors body to 16px and holds Display 1 at its desktop size', () => {
    const rule = neutralTheme.__adaptationRules?.[0];

    expect(neutralTheme.__adaptations.rules).toHaveLength(1);
    expect(rule?.when).toEqual({pointer: 'coarse', width: {below: 'lg'}});
    expect(rule?.query).toBe('(width < 1024px) and (pointer: coarse)');
    // Pinned ladder: base 16 (was 14), ratio 1.2 -> 1.1736, Display 1 pinned.
    expect(rule?.tokens['--font-size-base']).toBe('1rem');
    expect(rule?.tokens['--font-size-lg']).toBe('1.1875rem');
    expect(rule?.tokens['--font-size-5xl']).toBe('2.625rem');
    // Desktop scale is untouched.
    expect(neutralTheme.tokens['--font-size-base']).toBe('0.875rem');
    expect(neutralTheme.tokens['--font-size-5xl']).toBe('2.625rem');
    expect(generateThemeCSS(neutralTheme).component).toContain(
      '@media (width < 1024px) and (pointer: coarse)',
    );
  });
});
