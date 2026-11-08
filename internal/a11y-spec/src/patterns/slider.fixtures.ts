// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file slider.fixtures.ts
 * @input Plain HTML slider thumbs (one script implements the APG keyboard model; the DOM lane never runs it), conforming and deliberately violating
 * @output SLIDER_FIXTURES, the subject selector, and the expectation → violating-fixture map
 * @position Contract self-test data for slider.jsdom.test.ts and slider.chromium.spec.ts
 */

import type {SliderStateFacts} from './slider';

const SUBJECT_ATTRIBUTE = 'data-a11y-subject';
export const SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;

export interface SliderFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: SliderStateFacts;
  readonly html: string;
}

const SCRIPT = `<script>
(() => {
  const thumb = document.querySelector('[${SUBJECT_ATTRIBUTE}]');
  const num = name => Number(thumb.getAttribute(name));
  const rtl = thumb.closest('[dir="rtl"]') != null && !window.__sliderNoRtl;
  // Arrow and Page results snap to the step grid, then clamp; Home and End
  // set the bound itself, which is always an allowed value.
  const set = (raw, snap = true) => {
    const min = num('aria-valuemin'), max = num('aria-valuemax'), step = Number(thumb.dataset.step || 1);
    const snapped = snap ? min + Math.round((raw - min) / step) * step : raw;
    const next = Math.min(max, Math.max(min, Number(snapped.toFixed(10))));
    thumb.setAttribute('aria-valuenow', String(next));
  };
  thumb.addEventListener('keydown', e => {
    if (thumb.getAttribute('aria-disabled') === 'true' && !window.__sliderDisabledMoves) return;
    const now = num('aria-valuenow'), step = Number(thumb.dataset.step || 1);
    let key = e.key;
    if (rtl && (key === 'ArrowLeft' || key === 'ArrowRight')) key = key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    switch (key) {
      case 'ArrowRight': case 'ArrowUp': e.preventDefault(); set(now + step * (window.__sliderUpIsDouble ? 2 : 1)); break;
      case 'ArrowLeft': case 'ArrowDown': e.preventDefault(); set(now - step); break;
      case 'PageUp': e.preventDefault(); if (!window.__sliderNoPage) set(now + step * 10); break;
      case 'PageDown': e.preventDefault(); if (!window.__sliderNoPage) set(now - step * 10); break;
      case 'Home': e.preventDefault(); set(num('aria-valuemin'), false); break;
      case 'End': e.preventDefault(); set(window.__sliderEndShort ? num('aria-valuemax') - step : num('aria-valuemax'), false); break;
    }
  });
})();
</script>`;

function slider({
  min = 0,
  max = 100,
  step = 1,
  value = 40,
  orientation = 'horizontal',
  rtl = false,
  disabled = false,
  valueText = null,
  role = 'slider',
  label = 'Volume',
  omit = [],
  orientationAttr,
}: {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  orientation?: 'horizontal' | 'vertical';
  rtl?: boolean;
  disabled?: boolean;
  valueText?: string | null;
  role?: string;
  label?: string | null;
  omit?: ReadonlyArray<'aria-valuenow' | 'aria-valuemin' | 'aria-valuemax'>;
  orientationAttr?: string | null;
} = {}): string {
  const attr = (name: string, v: string | number) =>
    omit.includes(name as never) ? '' : ` ${name}="${v}"`;
  const orient =
    orientationAttr === null
      ? ''
      : orientationAttr != null
        ? ` aria-orientation="${orientationAttr}"`
        : orientation === 'vertical'
          ? ' aria-orientation="vertical"'
          : '';
  return `<div${rtl ? ' dir="rtl"' : ''}><div ${SUBJECT_ATTRIBUTE} role="${role}" tabindex="0" data-step="${step}"${attr('aria-valuenow', value)}${attr('aria-valuemin', min)}${attr('aria-valuemax', max)}${orient}${label == null ? '' : ` aria-label="${label}"`}${disabled ? ' aria-disabled="true"' : ''}${valueText == null ? '' : ` aria-valuetext="${valueText}"`} style="width:40px;height:40px;background:#888"></div></div>${SCRIPT}`;
}

const facts = (
  overrides: Partial<SliderStateFacts> = {},
): SliderStateFacts => ({
  min: 0,
  max: 100,
  step: 1,
  value: 40,
  orientation: 'horizontal',
  rtl: false,
  operable: true,
  focusable: true,
  valueText: null,
  largeStep: 10,
  ...overrides,
});

const flag = (name: string, html: string) =>
  html.replace('<script>', `<script>window.${name} = true;</script><script>`);

export const SLIDER_FIXTURES: readonly SliderFixture[] = [
  {
    id: 'conforming-horizontal',
    summary: 'a horizontal thumb at 40 of 0–100 with step 1 and Page keys',
    facts: facts(),
    html: slider(),
  },
  {
    id: 'conforming-vertical',
    summary: 'a vertical thumb',
    facts: facts({orientation: 'vertical'}),
    html: slider({orientation: 'vertical'}),
  },
  {
    id: 'conforming-rtl',
    summary:
      'a horizontal thumb on a right-to-left track: ArrowLeft raises the value',
    facts: facts({rtl: true}),
    html: slider({rtl: true}),
  },
  {
    id: 'conforming-formatted',
    summary: 'a thumb that speaks a formatted value',
    facts: facts({valueText: '40 percent'}),
    html: slider({valueText: '40 percent'}),
  },
  {
    id: 'conforming-no-page-keys',
    summary: 'a thumb that ships no Page keys (APG-optional)',
    facts: facts({largeStep: null}),
    html: flag('__sliderNoPage', slider()),
  },
  {
    id: 'conforming-disabled-focusable',
    summary:
      'an unavailable thumb that keeps focus for its message and keeps its value',
    facts: facts({operable: false}),
    html: slider({disabled: true}),
  },
  {
    id: 'conforming-step-three',
    summary: 'a thumb with step 3 whose End reaches the maximum',
    facts: facts({step: 3, value: 48, largeStep: 30}),
    html: slider({step: 3, value: 48}),
  },
  {
    id: 'violating-role',
    summary: 'a thumb exposed as a progressbar',
    facts: facts(),
    html: slider({role: 'progressbar'}),
  },
  {
    id: 'violating-name',
    summary: 'a thumb with no accessible name',
    facts: facts(),
    html: slider({label: null}),
  },
  {
    id: 'violating-no-valuemin',
    summary: 'a thumb with no aria-valuemin',
    facts: facts(),
    html: slider({omit: ['aria-valuemin']}),
  },
  {
    id: 'violating-no-valuemax',
    summary: 'a thumb with no aria-valuemax',
    facts: facts(),
    html: slider({omit: ['aria-valuemax']}),
  },
  {
    id: 'violating-wrong-valuenow',
    summary: 'a thumb whose aria-valuenow disagrees with its value',
    facts: facts(),
    html: slider({value: 41}),
  },
  {
    id: 'violating-valuetext-missing',
    summary: 'a formatted thumb that exposes only the number',
    facts: facts({valueText: '40 percent'}),
    html: slider(),
  },
  {
    id: 'violating-vertical-unmarked',
    summary: 'a vertical thumb with no aria-orientation',
    facts: facts({orientation: 'vertical'}),
    html: slider({orientation: 'vertical', orientationAttr: null}),
  },
  {
    id: 'violating-up-double-step',
    summary: 'a thumb whose Up arrow moves two steps',
    facts: facts(),
    html: flag('__sliderUpIsDouble', slider()),
  },
  {
    id: 'violating-rtl-not-reversed',
    summary:
      'a right-to-left thumb whose horizontal arrows still follow left-to-right',
    facts: facts({rtl: true}),
    html: flag('__sliderNoRtl', slider({rtl: true})),
  },
  {
    id: 'violating-page-inert',
    summary: 'a thumb that claims Page keys but ignores them',
    facts: facts(),
    html: flag('__sliderNoPage', slider()),
  },
  {
    id: 'violating-end-short',
    summary: 'a thumb whose End stops one step short of the maximum',
    facts: facts(),
    html: flag('__sliderEndShort', slider()),
  },
  {
    id: 'violating-disabled-moves',
    summary: 'an unavailable thumb that still changes on the arrow keys',
    facts: facts({operable: false}),
    html: flag('__sliderDisabledMoves', slider({disabled: true})),
  },
];

export function fixture(id: string): SliderFixture {
  const found = SLIDER_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown slider fixture "${id}"`);
  }
  return found;
}

export const CONFORMING_FIXTURES: readonly string[] = SLIDER_FIXTURES.filter(
  candidate => candidate.id.startsWith('conforming-'),
).map(candidate => candidate.id);

export const SLIDER_MUTATIONS: Readonly<Record<string, readonly string[]>> = {
  'slider.thumb.role-and-name': ['violating-role', 'violating-name'],
  'slider.thumb.value-properties': [
    'violating-no-valuemin',
    'violating-no-valuemax',
    'violating-wrong-valuenow',
  ],
  'slider.thumb.value-text': ['violating-valuetext-missing'],
  'slider.thumb.orientation': ['violating-vertical-unmarked'],
  'slider.keys.arrows-step': [
    'violating-up-double-step',
    'violating-rtl-not-reversed',
  ],
  'slider.keys.page': ['violating-page-inert'],
  'slider.keys.home-end': ['violating-end-short'],
  'slider.thumb.unavailable-keeps-value': ['violating-disabled-moves'],
};
