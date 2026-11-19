// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file window-splitter.fixtures.ts
 * @input Plain HTML splitters between two panes (one script implements the APG keyboard model; the DOM lane never runs it), conforming and deliberately violating
 * @output WINDOW_SPLITTER_FIXTURES, the subject and pane selectors, and the expectation → violating-fixture map
 * @position Contract self-test data for window-splitter.jsdom.test.ts and window-splitter.chromium.spec.ts
 */

import type {WindowSplitterStateFacts} from './window-splitter';

const SUBJECT_ATTRIBUTE = 'data-a11y-subject';
export const SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;
export const RELATION_SELECTORS = {pane: '#primary-pane'} as const;

export interface WindowSplitterFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: WindowSplitterStateFacts;
  readonly html: string;
}

const SCRIPT = `<script>
(() => {
  const bar = document.querySelector('[${SUBJECT_ATTRIBUTE}]');
  const num = name => Number(bar.getAttribute(name));
  let previous = num('aria-valuenow');
  const set = raw => {
    const min = num('aria-valuemin');
    const max = bar.hasAttribute('aria-valuemax') ? num('aria-valuemax') : Infinity;
    bar.setAttribute('aria-valuenow', String(Math.min(max, Math.max(min, raw))));
  };
  bar.addEventListener('keydown', e => {
    if (bar.getAttribute('aria-disabled') === 'true' && !window.__splitterDisabledMoves) return;
    const now = num('aria-valuenow');
    const step = Number(bar.dataset.step || 10);
    const grow = bar.dataset.increaseKey || 'ArrowRight';
    const shrink = {ArrowRight: 'ArrowLeft', ArrowLeft: 'ArrowRight', ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp'}[grow];
    if (e.key === grow) { e.preventDefault(); set(now + step * (window.__splitterDoubleStep ? 2 : 1)); return; }
    if (e.key === shrink) { e.preventDefault(); set(now - step); return; }
    if (e.key === 'Home') { e.preventDefault(); set(num('aria-valuemin')); return; }
    if (e.key === 'End') { e.preventDefault(); if (bar.hasAttribute('aria-valuemax')) set(window.__splitterEndShort ? num('aria-valuemax') - step : num('aria-valuemax')); return; }
    if (e.key === 'Enter' && bar.dataset.collapsible === 'true') {
      e.preventDefault();
      if (bar.hasAttribute('aria-valuetext')) {
        bar.removeAttribute('aria-valuetext');
        set(window.__splitterRestoresMinimum ? num('aria-valuemin') : previous);
      } else {
        previous = now;
        bar.setAttribute('aria-valuetext', 'Collapsed');
        set(num('aria-valuemin'));
      }
    }
  });
})();
</script>`;

function splitter({
  now = 200,
  min = 100,
  max = 400 as number | null,
  orientationAttr = 'vertical' as string | null,
  increaseKey = 'ArrowRight',
  step = 10,
  disabled = false,
  collapsible = false,
  role = 'separator',
  label = 'Resize sidebar' as string | null,
  controls = 'primary-pane' as string | null,
  omitNow = false,
  omitMin = false,
}: {
  now?: number;
  min?: number;
  max?: number | null;
  orientationAttr?: string | null;
  increaseKey?: string;
  step?: number;
  disabled?: boolean;
  collapsible?: boolean;
  role?: string;
  label?: string | null;
  controls?: string | null;
  omitNow?: boolean;
  omitMin?: boolean;
} = {}): string {
  return `<div style="display:flex;width:600px;height:200px"><div id="primary-pane" style="width:${now}px;background:#eee">Primary</div><div ${SUBJECT_ATTRIBUTE} role="${role}" tabindex="${disabled ? -1 : 0}" data-step="${step}" data-increase-key="${increaseKey}" data-collapsible="${collapsible}"${omitNow ? '' : ` aria-valuenow="${now}"`} ${omitMin ? '' : ` aria-valuemin="${min}"`}${max == null ? '' : ` aria-valuemax="${max}"`}${orientationAttr == null ? '' : ` aria-orientation="${orientationAttr}"`}${label == null ? '' : ` aria-label="${label}"`}${controls == null ? '' : ` aria-controls="${controls}"`}${disabled ? ' aria-disabled="true"' : ''} style="width:8px;background:#888"></div><div style="flex:1">Secondary</div></div>${SCRIPT}`;
}

const facts = (
  overrides: Partial<WindowSplitterStateFacts> = {},
): WindowSplitterStateFacts => ({
  valueNow: 200,
  valueMin: 100,
  valueMax: 400,
  orientation: 'vertical',
  increaseKey: 'ArrowRight',
  step: 10,
  operable: true,
  collapsible: false,
  ...overrides,
});

const flag = (name: string, html: string) =>
  html.replace('<script>', `<script>window.${name} = true;</script><script>`);

export const WINDOW_SPLITTER_FIXTURES: readonly WindowSplitterFixture[] = [
  {
    id: 'conforming-vertical-bar',
    summary: 'a vertical bar between left and right panes at 200 of 100–400',
    facts: facts(),
    html: splitter(),
  },
  {
    id: 'conforming-horizontal-bar',
    summary:
      'a horizontal bar between top and bottom panes: ArrowDown grows the top pane',
    facts: facts({orientation: 'horizontal', increaseKey: 'ArrowDown'}),
    html: splitter({orientationAttr: 'horizontal', increaseKey: 'ArrowDown'}),
  },
  {
    id: 'conforming-reversed',
    summary: 'a vertical bar on the start side of its pane: ArrowLeft grows it',
    facts: facts({increaseKey: 'ArrowLeft'}),
    html: splitter({increaseKey: 'ArrowLeft'}),
  },
  {
    id: 'conforming-collapsible',
    summary:
      'a collapsible pane: Enter collapses, Enter restores the previous position',
    facts: facts({collapsible: true}),
    html: splitter({collapsible: true}),
  },
  {
    id: 'conforming-disabled',
    summary: 'an unavailable splitter that keeps its position',
    facts: facts({operable: false}),
    html: splitter({disabled: true}),
  },
  {
    id: 'violating-role',
    summary: 'a splitter exposed as a generic div',
    facts: facts(),
    html: splitter({role: 'presentation'}),
  },
  {
    id: 'violating-name',
    summary: 'a splitter with no accessible name',
    facts: facts(),
    html: splitter({label: null}),
  },
  {
    id: 'violating-no-valuenow',
    summary: 'a splitter with no aria-valuenow',
    facts: facts(),
    html: splitter({omitNow: true}),
  },
  {
    id: 'violating-no-valuemin',
    summary: 'a splitter with no aria-valuemin',
    facts: facts(),
    html: splitter({omitMin: true}),
  },
  {
    id: 'violating-now-above-max',
    summary: 'a splitter announcing 200 of 100–150',
    facts: facts(),
    html: splitter({max: 150}),
  },
  {
    id: 'violating-no-valuemax',
    summary: 'a splitter with no aria-valuemax',
    facts: facts(),
    html: splitter({max: null}),
  },
  {
    id: 'violating-orientation',
    summary: 'a left/right bar that claims the default horizontal orientation',
    facts: facts(),
    html: splitter({orientationAttr: null}),
  },
  {
    id: 'violating-no-controls',
    summary: 'a splitter that names no pane',
    facts: facts(),
    html: splitter({controls: null}),
  },
  {
    id: 'violating-controls-dangling',
    summary:
      'a splitter whose aria-controls names an element that is not the pane',
    facts: facts(),
    html: splitter({controls: 'nowhere'}),
  },
  {
    id: 'violating-double-step',
    summary: 'a splitter whose grow arrow moves two steps',
    facts: facts(),
    html: flag('__splitterDoubleStep', splitter()),
  },
  {
    id: 'violating-restores-minimum',
    summary:
      'a collapsible pane whose second Enter reopens at the minimum, not the previous position',
    facts: facts({collapsible: true}),
    html: flag('__splitterRestoresMinimum', splitter({collapsible: true})),
  },
  {
    id: 'violating-end-short',
    summary: 'a splitter whose End stops short of the maximum',
    facts: facts(),
    html: flag('__splitterEndShort', splitter()),
  },
  {
    id: 'violating-disabled-moves',
    summary: 'an unavailable splitter that still moves on the arrow keys',
    facts: facts({operable: false}),
    html: flag('__splitterDisabledMoves', splitter({disabled: true})),
  },
];

export function fixture(id: string): WindowSplitterFixture {
  const found = WINDOW_SPLITTER_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown window-splitter fixture "${id}"`);
  }
  return found;
}

export const CONFORMING_FIXTURES: readonly string[] =
  WINDOW_SPLITTER_FIXTURES.filter(candidate =>
    candidate.id.startsWith('conforming-'),
  ).map(candidate => candidate.id);

export const WINDOW_SPLITTER_MUTATIONS: Readonly<
  Record<string, readonly string[]>
> = {
  'windowsplitter.separator.role-and-name': [
    'violating-role',
    'violating-name',
  ],
  'windowsplitter.separator.position-and-minimum': [
    'violating-no-valuenow',
    'violating-no-valuemin',
  ],
  'windowsplitter.separator.maximum': [
    'violating-no-valuemax',
    'violating-now-above-max',
  ],
  'windowsplitter.separator.orientation': ['violating-orientation'],
  'windowsplitter.separator.controls-pane': [
    'violating-no-controls',
    'violating-controls-dangling',
  ],
  'windowsplitter.keys.arrows-move': ['violating-double-step'],
  'windowsplitter.keys.enter-collapses-and-restores': [
    'violating-restores-minimum',
  ],
  'windowsplitter.keys.home-end': ['violating-end-short'],
  'windowsplitter.separator.unavailable-keeps-position': [
    'violating-disabled-moves',
  ],
};
