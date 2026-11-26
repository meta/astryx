// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Text contrast guard, by role, for every official theme.
 *
 * Text must meet WCAG 2.2 AA for its role (success criteria 1.4.3 Contrast
 * (Minimum) and 1.4.11 Non-text Contrast): 4.5:1 for body text, 3:1 for
 * large text and non-text UI. Every role checked here is body-size text, so
 * each needs 4.5:1. For each first-party theme, in both colour schemes, it
 * checks:
 * - primary text, secondary text and links on the page, the surface, a
 *   popover, the muted fill and every card fill (with the card variant's own
 *   token overrides), and on the surfaces that repaint inside a card: a
 *   nested default card, a transparent card, a text field, inline code, an
 *   open menu, a selected segment, an input group addon, a step number, a
 *   banner and a striped table row (whose cell color the table root fixes);
 * - secondary text on a selected row, a dropzone and a numbered citation on
 *   the page, and on a selected row and a numbered citation inside every
 *   card;
 * - selected-item and numbered-citation text on the accent tint, with the
 *   theme's own rules for those parts;
 * - status text on its pale status fill (a field status, a banner);
 * - category text (Token, Badge) on its own category fill, over the page, a
 *   surface and a card;
 * - code text and the code block's language label on the code background
 *   and, for a code block that paints no background, on the page.
 *
 * @input The first-party theme objects, through scripts/lib/theme-contrast.
 * @output Fails when a text role reads below its WCAG AA ratio on a ground.
 * @position Repo-level guard, sibling of the other scripts/check-*.
 */

import {parseStyleKey} from '../packages/core/src/utils/parseStyleKey';
import {JSDOM} from 'jsdom';
import {describe, expect, it} from 'vitest';
import {
  FIRST_PARTY_THEMES,
  MODES,
  layeredContrast,
  resolveColor,
  themeTokens,
} from './lib/theme-contrast.mjs';

/** WCAG 2.2 AA minimum contrast by role (SC 1.4.3 and 1.4.11). */
const WCAG_AA = {bodyText: 4.5, largeText: 3, nonText: 3};

/** Body text roles drawn on the page, surfaces and cards, links included. */
const TEXT_ROLES = [
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-accent',
];

/** Card variants and the fill token Core's Card paints for each. */
const CARD_FILLS = {
  default: '--color-background-card',
  muted: '--color-background-muted',
  blue: '--color-background-blue',
  cyan: '--color-background-cyan',
  gray: '--color-background-gray',
  green: '--color-background-green',
  orange: '--color-background-orange',
  pink: '--color-background-pink',
  purple: '--color-background-purple',
  red: '--color-background-red',
  teal: '--color-background-teal',
  yellow: '--color-background-yellow',
};

const CATEGORIES = [
  'blue',
  'cyan',
  'gray',
  'green',
  'orange',
  'pink',
  'purple',
  'red',
  'teal',
  'yellow',
];

/** Page-level surfaces text sits on, each over the page. */
const PAGE_SURFACES = [
  '--color-background-surface',
  '--color-background-popover',
  '--color-background-muted',
];

/** A theme's rule block for a part, by its key. */
function rule(theme, part, key = 'base') {
  return theme.components?.[part]?.[key] ?? {};
}

const {document} = new JSDOM('').window;

/** An element as Core marks a part's rule key: its selector's attributes. */
function partElement(part, key) {
  const element = document.createElement('div');
  element.className = `astryx-${part}`;
  for (const [, name, value] of parseStyleKey(key).matchAll(
    /\[([^=\]]+)="([^"]*)"\]/g,
  ))
    element.setAttribute(name, value);
  return element;
}

/** The selector Core gives a part's rule key. */
function ruleSelector(part, key) {
  return `.astryx-${part}${parseStyleKey(key)}`;
}

/**
 * The nested selector blocks of a part's rule that match the part inside a
 * card of a variant, itself inside an optional ancestor part, merged. The
 * selectors are matched on elements, as the browser matches them.
 */
function insideCard(theme, part, key, variant, ancestors = []) {
  const root = document.createElement('div');
  let parent = root;
  for (const ancestor of ancestors) {
    const outer = partElement(...ancestor);
    parent.append(outer);
    parent = outer;
  }
  const card = partElement('card', `variant:${variant}`);
  parent.append(card);
  const element = partElement(part, key);
  card.append(element);
  return Object.assign(
    {},
    ...Object.entries(rule(theme, part, key))
      .filter(([nested]) => {
        if (!nested.startsWith(':')) return false;
        try {
          return element.matches(`${ruleSelector(part, key)}${nested}`);
        } catch {
          return false;
        }
      })
      .map(([, value]) => value),
  );
}

/** The tokens a theme's card rule sets for a variant, over its base rule. */
function cardOverrides(theme, variant) {
  return {...rule(theme, 'card'), ...rule(theme, 'card', `variant:${variant}`)};
}

/**
 * Surfaces that repaint inside a card: the fill Core paints for each (none
 * for a transparent card) and the rules of its own that apply there.
 */
const NESTED = {
  'nested card': {
    fill: '--color-background-card',
    own: theme => cardOverrides(theme, 'default'),
  },
  'transparent card': {
    fill: null,
    own: theme => cardOverrides(theme, 'transparent'),
  },
  'text field': {
    fill: '--color-background-surface',
    own: theme => rule(theme, 'text-input'),
  },
  'inline code': {
    fill: '--color-background-muted',
    own: theme => rule(theme, 'code'),
  },
  'open menu': {
    fill: '--color-background-popover',
    own: theme => rule(theme, 'dropdown-menu'),
  },
  'selected segment': {
    fill: '--color-background-surface',
    own: theme => rule(theme, 'segmented-control-item', 'selected'),
  },
  'input group addon': {
    fill: '--color-background-muted',
    own: theme => rule(theme, 'input-group-text'),
  },
  'step number': {
    fill: '--color-background-surface',
    own: theme => rule(theme, 'step-indicator', 'progress:not-started'),
  },
  'striped table row': {
    fill: '--color-background-muted',
    own: theme => ({
      ...rule(theme, 'table-row'),
      ...rule(theme, 'table-row', 'striped'),
      ...(rule(theme, 'table-row', 'striped')[STRIPED_ROW] ?? {}),
    }),
    color: 'the table root sets the cell text color',
  },
  banner: {
    fill: '--color-background-card',
    own: theme => rule(theme, 'banner-content'),
  },
};

/** Core's selector for a striped table's painted rows. */
const STRIPED_ROW = ':nth-child(even of :not([data-expansion-panel]))';

/**
 * The parts with a fill of their own that a card can sit inside, as chains
 * from the outermost: a dialog, or a dialog inside another coloured card.
 */
const CARD_ANCESTORS = [
  [['section', 'variant:section']],
  [['dialog', 'base']],
  [['card', 'variant:default']],
  [['layout-content', 'base']],
  [
    ['card', 'variant:blue'],
    ['dialog', 'base'],
  ],
  [
    ['card', 'variant:pink'],
    ['popover', 'base'],
  ],
];

/** Parts drawn on the accent tint, with their own rule's key. */
const ON_ACCENT_TINT = {
  'selected item': ['item', 'selected'],
  'selected tree item': ['tree-list-item', 'selected'],
  'numbered citation': ['citation', 'variant:number'],
  dropzone: ['file-input', 'mode:dropzone'],
};

function rows() {
  const out = [];
  /** @param {object} row */
  const push = row => {
    const {text, layers, modeIndex} = row;
    out.push({
      ...row,
      ratio:
        text && layers.every(Boolean)
          ? layeredContrast(text, layers, modeIndex)
          : null,
    });
  };
  for (const [themeName, theme] of Object.entries(FIRST_PARTY_THEMES)) {
    const page = themeTokens(theme);
    for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
      const mode = MODES[modeIndex];
      const at = (tokens, name) =>
        resolveColor(tokens[name], tokens, modeIndex);
      const body = at(page, '--color-background-body');
      const base = {theme: themeName, mode, modeIndex, needs: WCAG_AA.bodyText};
      /** Every text role on one ground. */
      const roles = (where, tokens, layers) => {
        for (const role of TEXT_ROLES)
          push({...base, where, role, text: at(tokens, role), layers});
      };
      roles('page', page, [body]);
      for (const surface of PAGE_SURFACES)
        roles(surface.replace('--color-background-', ''), page, [
          at(page, surface),
          body,
        ]);
      for (const [variant, fill] of Object.entries(CARD_FILLS)) {
        const card = themeTokens(theme, cardOverrides(theme, variant));
        const cardFill = at(card, fill);
        if (cardFill == null) continue;
        // A card sits on the page or on a surface: each is a ground.
        for (const [on, ground] of [
          ['', body],
          [' on a surface', at(page, '--color-background-surface')],
        ]) {
          const cardLayers = [cardFill, ground];
          const inCard = `a ${variant} card${on}`;
          roles(`${variant} card${on}`, card, cardLayers);
          for (const [name, {fill: inner, own, color}] of Object.entries(
            NESTED,
          )) {
            const nested = themeTokens(theme, {
              ...cardOverrides(theme, variant),
              ...own(theme),
            });
            const layers = inner
              ? [at(nested, inner), ...cardLayers]
              : cardLayers;
            roles(`${name} in ${inCard}`, nested, layers);
            // Text whose color an ancestor fixes (a table sets it on its
            // root) reads the card's ink, unless the part sets `color` again.
            if (color) {
              const set = own(theme).color;
              push({
                ...base,
                where: `${name} in ${inCard} (${color})`,
                role: 'color',
                text: set
                  ? resolveColor(set, nested, modeIndex)
                  : at(card, '--color-text-primary'),
                layers,
              });
            }
          }
          // Selected rows and a numbered citation inside the card: the
          // accent tint over the card fill, with the part's rule for inside
          // this card. (A dropzone paints its own field fill; while a file
          // is dragged over it, Core replaces that fill with the tint and
          // gives themes no rule for the state.)
          for (const [where, [part, key]] of Object.entries(ON_ACCENT_TINT)) {
            if (part === 'file-input') continue;
            const tokens = themeTokens(theme, {
              ...cardOverrides(theme, variant),
              ...rule(theme, part),
              ...rule(theme, part, key),
              ...insideCard(theme, part, key, variant),
            });
            const layers = [at(tokens, '--color-accent-muted'), ...cardLayers];
            for (const role of [
              '--color-text-primary',
              '--color-text-secondary',
            ])
              push({
                ...base,
                where: `${where} in ${inCard}`,
                role,
                text: at(tokens, role),
                layers,
              });
          }
        }
        // The card inside a part with a fill of its own: the row still
        // draws on the card's fill.
        for (const ancestor of CARD_ANCESTORS) {
          const cardLayers = [cardFill, at(page, '--color-background-surface')];
          for (const [where, [part, key]] of Object.entries(ON_ACCENT_TINT)) {
            if (part === 'file-input') continue;
            const tokens = themeTokens(theme, {
              ...cardOverrides(theme, variant),
              ...rule(theme, part),
              ...rule(theme, part, key),
              ...insideCard(theme, part, key, variant, ancestor),
            });
            const layers = [at(tokens, '--color-accent-muted'), ...cardLayers];
            for (const role of [
              '--color-text-primary',
              '--color-text-secondary',
            ])
              push({
                ...base,
                where: `${where} in a ${variant} card inside ${ancestor.map(a => a.join(' ')).join(' > ')}`,
                role,
                text: at(tokens, role),
                layers,
              });
          }
        }
      }
      for (const [where, [part, key]] of Object.entries(ON_ACCENT_TINT)) {
        const tokens = themeTokens(theme, {
          ...rule(theme, part),
          ...rule(theme, part, key),
        });
        const layers = [at(tokens, '--color-accent-muted'), body];
        for (const role of ['--color-text-primary', '--color-text-secondary'])
          push({...base, where, role, text: at(tokens, role), layers});
      }
      // Status text on its pale status fill (a field status, a banner).
      for (const status of ['success', 'warning', 'error', 'info'])
        push({
          ...base,
          where: `${status} tint`,
          role: `--color-on-${status}-muted`,
          text: at(page, `--color-on-${status}-muted`),
          layers: [at(page, `--color-${status}-muted`), body],
        });
      for (const color of CATEGORIES) {
        const token = themeTokens(theme, {
          ...rule(theme, 'token'),
          ...rule(theme, 'token', `color:${color}`),
        });
        // A token or badge sits on the page, a surface or a card; a
        // translucent category fill reads differently on each.
        for (const [ground, under] of [
          ['', []],
          [' on a surface', [at(page, '--color-background-surface')]],
          [' on a card', [at(page, '--color-background-card')]],
        ])
          push({
            ...base,
            where: `${color} token${ground}`,
            role: `--color-text-${color}`,
            text: at(token, `--color-text-${color}`),
            layers: [at(token, `--color-background-${color}`), ...under, body],
          });
      }
      // Code text: every syntax colour that draws text (not a diff tint or
      // marker), on the code background and, for a code block that paints
      // no background, on the page.
      const codeBackground = at(page, '--color-syntax-background');
      for (const name of Object.keys(page).filter(k =>
        /^--color-syntax-(?!background$|added|removed|diff)/.test(k),
      ))
        for (const [where, layers] of [
          ['code background', [codeBackground, body]],
          ['page (a code block with no background)', [body]],
        ])
          push({...base, where, role: name, text: at(page, name), layers});
      push({
        ...base,
        where: 'code background',
        role: 'code block language label (--color-text-secondary)',
        text: at(page, '--color-text-secondary'),
        layers: [codeBackground, body],
      });
    }
  }
  return out;
}

describe('text contrast by role on every official theme', () => {
  const all = rows();
  const label = row => `${row.theme}/${row.mode} ${row.role} on ${row.where}`;

  it('resolves every text role and ground in every first-party theme and mode', () => {
    expect(all.filter(row => row.ratio == null).map(label)).toEqual([]);
  });

  it('meets WCAG AA for its role on every ground', () => {
    const failures = all
      .filter(row => row.ratio != null && row.ratio < row.needs)
      .map(
        row =>
          `${label(row)} ${row.ratio.toFixed(2)}:1, needs ${row.needs}:1 (${row.text} on ${row.layers[0]})`,
      );
    expect(failures).toEqual([]);
  });
});
