// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file toolbar.fixtures.ts
 * @input Plain HTML toolbars between two page buttons, conforming and deliberately violating
 * @output TOOLBAR_FIXTURES, their subject and relation selectors, and the expectation → violating-fixture map
 * @position Contract self-test data for toolbar.jsdom.test.ts and toolbar.chromium.spec.ts
 */

import type {ToolbarStateFacts} from './toolbar';

export const SUBJECT_SELECTOR = '#toolbar';

/**
 * How the fixture toolbar behaves. One script reads these from the toolbar's
 * data attributes, so a violating fixture changes exactly one behavior.
 */
interface Behavior {
  /** Controls the next arrow advances by. */
  readonly nextStep?: 1 | 2;
  /** Whether the previous arrow moves at all. */
  readonly previous?: boolean;
  readonly wrap?: boolean;
  readonly homeEnd?: boolean;
  /**
   * Which arrows move: the toolbar's own axis and direction, the horizontal
   * pair whatever the orientation, or Right as next whatever the direction.
   */
  readonly keys?: 'axis' | 'horizontal-only' | 'ignore-direction';
  /**
   * Tab stops: one roving stop on the first enabled control, every control
   * tabbable, or the one stop left on the first control even when disabled.
   */
  readonly stops?: 'roving' | 'every-control' | 'first-even-if-disabled';
}

/**
 * The smallest toolbar behavior: a roving tab stop over enabled controls, the
 * next/previous arrows on the toolbar's axis (mirrored under RTL), optional
 * wrap and Home/End. jsdom does not run it; the jsdom lane reads DOM
 * attributes only.
 */
const SCRIPT = `<script>(() => {
  const bar = document.getElementById('toolbar');
  const d = bar.dataset;
  const all = () => [...bar.querySelectorAll('[data-control]')];
  const enabled = () => all().filter(c => c.getAttribute('aria-disabled') !== 'true');
  const stamp = target => all().forEach(c => { c.tabIndex = c === target ? 0 : -1; });
  if (d.stops === 'every-control') all().forEach(c => { c.tabIndex = 0; });
  else stamp(d.stops === 'first-even-if-disabled' ? all()[0] : enabled()[0]);
  bar.addEventListener('focusin', event => {
    if (d.stops === 'roving' && enabled().includes(event.target)) stamp(event.target);
  });
  bar.addEventListener('keydown', event => {
    const list = enabled();
    const n = list.length;
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    const vertical = bar.getAttribute('data-axis') === 'vertical';
    const rtl = getComputedStyle(bar).direction === 'rtl';
    let nextKey = 'ArrowRight';
    let previousKey = 'ArrowLeft';
    if (d.keys === 'axis' && vertical) { nextKey = 'ArrowDown'; previousKey = 'ArrowUp'; }
    else if (d.keys === 'axis' && rtl) { nextKey = 'ArrowLeft'; previousKey = 'ArrowRight'; }
    const go = k => { event.preventDefault(); list[k].focus(); };
    if (event.key === nextKey) {
      const k = i + Number(d.nextStep);
      return go(k < n ? k : d.wrap === 'true' ? 0 : n - 1);
    }
    if (event.key === previousKey) {
      if (d.previous !== 'true') return;
      return go(i > 0 ? i - 1 : d.wrap === 'true' ? n - 1 : 0);
    }
    if (event.key === 'Home' && d.homeEnd === 'true') return go(0);
    if (event.key === 'End' && d.homeEnd === 'true') return go(n - 1);
  });
})();</script>`;

interface Control {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

const FORMATTING: readonly Control[] = [
  {id: 'bold', label: 'Bold'},
  {id: 'italic', label: 'Italic'},
  {id: 'underline', label: 'Underline'},
  {id: 'settings', label: 'Settings'},
];

const WITH_DISABLED_FIRST: readonly Control[] = [
  {id: 'undo', label: 'Undo', disabled: true},
  {id: 'bold', label: 'Bold'},
  {id: 'italic', label: 'Italic'},
  {id: 'settings', label: 'Settings'},
];

function controlHtml(control: Control): string {
  return `<button type="button" id="${control.id}" data-control${control.disabled ? ' aria-disabled="true"' : ''}>${control.label}</button>`;
}

function toolbarHtml({
  controls = FORMATTING,
  behavior = {},
  role = 'toolbar',
  label = 'Text formatting',
  orientation = 'horizontal',
  orientationAttribute = orientation === 'vertical' ? 'vertical' : null,
  dir = 'ltr',
  outside = null,
}: {
  controls?: readonly Control[];
  behavior?: Behavior;
  role?: string;
  label?: string | null;
  orientation?: ToolbarStateFacts['orientation'];
  /** The aria-orientation the toolbar carries; null for none. */
  orientationAttribute?: string | null;
  dir?: ToolbarStateFacts['direction'];
  /** A control rendered after the toolbar instead of inside it. */
  outside?: Control | null;
}): string {
  const b: Required<Behavior> = {
    nextStep: 1,
    previous: true,
    wrap: true,
    homeEnd: true,
    keys: 'axis',
    stops: 'roving',
    ...behavior,
  };
  const data = `data-axis="${orientation}" data-next-step="${b.nextStep}" data-previous="${b.previous}" data-wrap="${b.wrap}" data-home-end="${b.homeEnd}" data-keys="${b.keys}" data-stops="${b.stops}"`;
  const attributes = [
    `id="toolbar"`,
    `role="${role}"`,
    label == null ? null : `aria-label="${label}"`,
    orientationAttribute == null
      ? null
      : `aria-orientation="${orientationAttribute}"`,
    data,
  ]
    .filter(attribute => attribute != null)
    .join(' ');
  const flow = orientation === 'vertical' ? 'column' : 'row';
  return `<div dir="${dir}"><button type="button" id="before">Before toolbar</button><div ${attributes} style="display:flex;flex-direction:${flow}">${controls.map(controlHtml).join('')}</div>${outside == null ? '' : controlHtml(outside)}<button type="button" id="after">After toolbar</button></div>${SCRIPT}`;
}

export interface ToolbarFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: ToolbarStateFacts;
  /** Relation name → selector inside the fixture. */
  readonly relations: Readonly<Record<string, string>>;
  readonly html: string;
}

const RELATIONS = {
  before: '#before',
  after: '#after',
  'first-control': '#bold',
  'second-control': '#italic',
  'last-control': '#settings',
} as const;

const facts = (
  overrides: Partial<ToolbarStateFacts> = {},
): ToolbarStateFacts => ({
  orientation: 'horizontal',
  direction: 'ltr',
  wraps: true,
  homeEnd: true,
  ...overrides,
});

function toolbar(
  id: string,
  summary: string,
  {
    facts: stateFacts = facts(),
    relations = RELATIONS,
    ...options
  }: Parameters<typeof toolbarHtml>[0] & {
    facts?: ToolbarStateFacts;
    relations?: Readonly<Record<string, string>>;
  } = {},
): ToolbarFixture {
  return {
    id,
    summary,
    facts: stateFacts,
    relations,
    html: toolbarHtml({
      orientation: stateFacts.orientation,
      dir: stateFacts.direction,
      ...options,
    }),
  };
}

const RTL = facts({direction: 'rtl'});
const VERTICAL = facts({orientation: 'vertical'});

export const TOOLBAR_FIXTURES: readonly ToolbarFixture[] = [
  toolbar(
    'conforming-horizontal',
    'a named horizontal toolbar of four controls with one roving Tab stop, wrapping arrows and Home/End',
  ),
  toolbar(
    'conforming-rtl',
    'the same toolbar under right-to-left, where ArrowLeft moves to the next control',
    {facts: RTL},
  ),
  toolbar(
    'conforming-vertical',
    'a vertical toolbar carrying aria-orientation="vertical", moved through with Down and Up',
    {facts: VERTICAL},
  ),
  toolbar(
    'conforming-first-disabled',
    'a toolbar whose first control is disabled, so Tab enters on the second',
    {controls: WITH_DISABLED_FIRST},
  ),
  toolbar(
    'conforming-no-wrap-no-home-end',
    'a toolbar whose arrows stop at either end and which ships no Home and End, and claims neither',
    {
      behavior: {wrap: false, homeEnd: false},
      facts: facts({wraps: false, homeEnd: false}),
    },
  ),
  toolbar(
    'conforming-explicit-horizontal',
    'a horizontal toolbar that states aria-orientation="horizontal"',
    {orientationAttribute: 'horizontal'},
  ),
  toolbar('violating-unnamed', 'a toolbar with no accessible name', {
    label: null,
  }),
  toolbar(
    'violating-group-role',
    'the controls grouped as a plain group instead of a toolbar',
    {role: 'group'},
  ),
  toolbar(
    'violating-vertical-without-orientation',
    'a vertical toolbar that does not carry aria-orientation',
    {facts: VERTICAL, orientationAttribute: null},
  ),
  toolbar(
    'violating-horizontal-claims-vertical',
    'a horizontal toolbar that claims aria-orientation="vertical"',
    {orientationAttribute: 'vertical'},
  ),
  toolbar(
    'violating-control-outside',
    'the last control rendered after the toolbar instead of inside it',
    {
      controls: FORMATTING.slice(0, 3),
      outside: {id: 'settings', label: 'Settings'},
    },
  ),
  toolbar(
    'violating-every-control-tabbable',
    'every control is its own Tab stop, so Tab walks through the toolbar',
    {behavior: {stops: 'every-control'}},
  ),
  toolbar(
    'violating-enters-on-disabled',
    'the Tab stop sits on the disabled first control',
    {
      controls: WITH_DISABLED_FIRST,
      behavior: {stops: 'first-even-if-disabled'},
    },
  ),
  toolbar(
    'violating-next-skips',
    'the next arrow jumps two controls instead of one',
    {behavior: {nextStep: 2}},
  ),
  toolbar(
    'violating-rtl-not-mirrored',
    'a right-to-left toolbar whose ArrowRight still moves to the next control',
    {facts: RTL, behavior: {keys: 'ignore-direction'}},
  ),
  toolbar(
    'violating-vertical-uses-horizontal-arrows',
    'a vertical toolbar moved only by Left and Right',
    {facts: VERTICAL, behavior: {keys: 'horizontal-only'}},
  ),
  toolbar('violating-previous-ignored', 'the previous arrow does nothing', {
    behavior: {previous: false},
  }),
  toolbar(
    'violating-claims-wrap',
    'a toolbar that claims wrapping but stops at either end',
    {behavior: {wrap: false}},
  ),
  toolbar(
    'violating-home-end-ignored',
    'a toolbar that claims Home and End but ignores them',
    {behavior: {homeEnd: false}},
  ),
];

export function fixture(id: string): ToolbarFixture {
  const found = TOOLBAR_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown toolbar fixture "${id}"`);
  }
  return found;
}

export const CONFORMING_FIXTURES: readonly string[] = TOOLBAR_FIXTURES.filter(
  candidate => candidate.id.startsWith('conforming-'),
).map(candidate => candidate.id);

export const TOOLBAR_MUTATIONS: Readonly<Record<string, readonly string[]>> = {
  'toolbar.container.role-and-name': [
    'violating-unnamed',
    'violating-group-role',
  ],
  'toolbar.container.orientation': [
    'violating-vertical-without-orientation',
    'violating-horizontal-claims-vertical',
  ],
  'toolbar.controls.inside-toolbar': ['violating-control-outside'],
  'toolbar.focus.single-tab-stop': [
    'violating-every-control-tabbable',
    'violating-enters-on-disabled',
  ],
  'toolbar.keys.next-arrow': [
    'violating-next-skips',
    'violating-rtl-not-mirrored',
    'violating-vertical-uses-horizontal-arrows',
  ],
  'toolbar.keys.previous-arrow': [
    'violating-previous-ignored',
    'violating-rtl-not-mirrored',
    'violating-vertical-uses-horizontal-arrows',
  ],
  'toolbar.keys.arrows-wrap': ['violating-claims-wrap'],
  'toolbar.keys.home-and-end': ['violating-home-end-ignored'],
};
