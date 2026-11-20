// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file slider-multithumb.fixtures.ts
 * @input Plain HTML two-thumb sliders (one script implements the range keyboard model; the DOM lane never runs it), conforming and deliberately violating
 * @output SLIDER_MULTITHUMB_FIXTURES, the thumb selectors, and the expectation → violating-fixture map
 * @position Contract self-test data for slider-multithumb.jsdom.test.ts and slider-multithumb.chromium.spec.ts
 */

import type {SliderMultithumbStateFacts} from './slider-multithumb';

const SUBJECT_ATTRIBUTE = 'data-a11y-subject';
const UPPER_ATTRIBUTE = 'data-a11y-upper';
export const SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;
export const UPPER_SELECTOR = `[${UPPER_ATTRIBUTE}]`;

export interface SliderMultithumbFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: SliderMultithumbStateFacts;
  readonly html: string;
}

// Each key moves the focused thumb inside its own bounds, then the other
// thumb's bound follows the new value. The flags each break one outcome.
const SCRIPT = `<script>
(() => {
  const group = document.querySelector('[role="group"]');
  const lower = document.querySelector('[${SUBJECT_ATTRIBUTE}]');
  const upper = document.querySelector('[${UPPER_ATTRIBUTE}]');
  const num = (el, name) => Number(el.getAttribute(name));
  const step = Number(group.dataset.step), gap = Number(group.dataset.separation);
  const min = Number(group.dataset.min), max = Number(group.dataset.max);
  const follow = () => {
    if (window.__frozenBounds) return;
    lower.setAttribute('aria-valuemax', String(num(upper, 'aria-valuenow') - gap));
    upper.setAttribute('aria-valuemin', String(num(lower, 'aria-valuenow') + gap));
  };
  for (const thumb of [lower, upper]) {
    thumb.addEventListener('keydown', e => {
      if (thumb.getAttribute('aria-disabled') === 'true') return;
      const low = window.__crossing ? min : num(thumb, 'aria-valuemin');
      const high = window.__crossing ? max : num(thumb, 'aria-valuemax');
      const now = num(thumb, 'aria-valuenow');
      const targets = {ArrowUp: now + step, ArrowRight: now + step, ArrowDown: now - step, ArrowLeft: now - step, Home: low, End: high};
      if (!(e.key in targets)) return;
      e.preventDefault();
      thumb.setAttribute('aria-valuenow', String(Math.min(high, Math.max(low, targets[e.key]))));
      follow();
      if (window.__reorder && thumb === lower) group.prepend(upper);
    });
  }
})();
</script>`;

function range({
  min = 0,
  max = 100,
  step = 1,
  lower = 20,
  upper = 80,
  separation = 0,
  disabled = false,
  lowerLabel = 'Minimum price',
  upperLabel = 'Maximum price' as string | null,
  upperRole = 'slider',
  fullBounds = false,
  upperTabIndex = 0,
}: {
  min?: number;
  max?: number;
  step?: number;
  lower?: number;
  upper?: number;
  separation?: number;
  disabled?: boolean;
  lowerLabel?: string;
  upperLabel?: string | null;
  upperRole?: string;
  fullBounds?: boolean;
  upperTabIndex?: number;
} = {}): string {
  const lowerMax = fullBounds ? max : upper - separation;
  const upperMin = fullBounds ? min : lower + separation;
  const off = disabled ? ' aria-disabled="true"' : '';
  const box =
    'style="display:inline-block;width:40px;height:40px;background:#888"';
  return `<button type="button">Before</button><div role="group" aria-label="Price" data-min="${min}" data-max="${max}" data-step="${step}" data-separation="${separation}"><div ${SUBJECT_ATTRIBUTE} role="slider" tabindex="0" aria-label="${lowerLabel}" aria-valuenow="${lower}" aria-valuemin="${min}" aria-valuemax="${lowerMax}"${off} ${box}></div><div ${UPPER_ATTRIBUTE} role="${upperRole}" tabindex="${upperTabIndex}"${upperLabel == null ? '' : ` aria-label="${upperLabel}"`} aria-valuenow="${upper}" aria-valuemin="${upperMin}" aria-valuemax="${max}"${off} ${box}></div></div><button type="button">After</button>${SCRIPT}`;
}

const facts = (
  overrides: Partial<SliderMultithumbStateFacts> = {},
): SliderMultithumbStateFacts => ({
  min: 0,
  max: 100,
  step: 1,
  lower: 20,
  upper: 80,
  separation: 0,
  operable: true,
  focusable: true,
  ...overrides,
});

const flag = (name: string, html: string) =>
  html.replace('<script>', `<script>window.${name} = true;</script><script>`);

export const SLIDER_MULTITHUMB_FIXTURES: readonly SliderMultithumbFixture[] = [
  {
    id: 'conforming-range',
    summary: 'two thumbs at 20 and 80 of 0–100 with no separation',
    facts: facts(),
    html: range(),
  },
  {
    id: 'conforming-separation',
    summary: 'two thumbs at 20 and 60 that keep 10 apart, with step 5',
    facts: facts({step: 5, upper: 60, separation: 10}),
    html: range({step: 5, upper: 60, separation: 10}),
  },
  {
    id: 'conforming-coincident',
    summary: 'two thumbs that share the value 50',
    facts: facts({lower: 50, upper: 50}),
    html: range({lower: 50, upper: 50}),
  },
  {
    id: 'conforming-disabled',
    summary: 'two unavailable thumbs that keep their place in the Tab order',
    facts: facts({operable: false}),
    html: range({disabled: true}),
  },
  {
    id: 'violating-same-name',
    summary: 'two thumbs that share one name',
    facts: facts(),
    html: range({lowerLabel: 'Price', upperLabel: 'Price'}),
  },
  {
    id: 'violating-upper-unnamed',
    summary: 'an upper thumb with no accessible name',
    facts: facts(),
    html: range({upperLabel: null}),
  },
  {
    id: 'violating-upper-role',
    summary: 'an upper thumb exposed as a progressbar',
    facts: facts(),
    html: range({upperRole: 'progressbar'}),
  },
  {
    id: 'violating-full-bounds',
    summary: 'two thumbs that each expose the whole track as their bounds',
    facts: facts(),
    html: range({fullBounds: true}),
  },
  {
    id: 'violating-frozen-bounds',
    summary: "two thumbs whose bounds never follow the other thumb's moves",
    facts: facts(),
    html: flag('__frozenBounds', range()),
  },
  {
    id: 'violating-crossing',
    summary: 'a lower thumb that End sends past the upper thumb',
    facts: facts(),
    html: flag('__crossing', range()),
  },
  {
    id: 'violating-tab-skips-upper',
    summary: 'an upper thumb that is not a Tab stop',
    facts: facts(),
    html: range({upperTabIndex: -1}),
  },
  {
    id: 'violating-reorder',
    summary: 'thumbs that swap DOM order once the lower thumb moves',
    facts: facts(),
    html: flag('__reorder', range()),
  },
];

export function fixture(id: string): SliderMultithumbFixture {
  const found = SLIDER_MULTITHUMB_FIXTURES.find(
    candidate => candidate.id === id,
  );
  if (found == null) {
    throw new Error(`unknown multi-thumb slider fixture "${id}"`);
  }
  return found;
}

export const CONFORMING_FIXTURES: readonly string[] =
  SLIDER_MULTITHUMB_FIXTURES.filter(candidate =>
    candidate.id.startsWith('conforming-'),
  ).map(candidate => candidate.id);

export const SLIDER_MULTITHUMB_MUTATIONS: Readonly<
  Record<string, readonly string[]>
> = {
  'slider-multithumb.thumbs.distinct-names': [
    'violating-same-name',
    'violating-upper-unnamed',
    'violating-upper-role',
  ],
  'slider-multithumb.bounds.follow-other-thumb': ['violating-full-bounds'],
  'slider-multithumb.bounds.update-on-change': ['violating-frozen-bounds'],
  'slider-multithumb.keys.no-crossing': ['violating-crossing'],
  'slider-multithumb.tab-order.constant': [
    'violating-tab-skips-upper',
    'violating-reorder',
  ],
};
