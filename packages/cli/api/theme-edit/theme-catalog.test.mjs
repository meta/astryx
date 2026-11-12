// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The catalog entries `astryx experimental theme` renders for each
 * component come from the component's doc alone: its playground defaults,
 * or, for an older Core whose docs have none, samples made from the doc's
 * props. Checked here on docs written in the shapes older Cores ship.
 */

import {describe, expect, it} from 'vitest';
import {catalogVariants, demoProps, isItemOf} from './_parts.mjs';

/**
 * @param {Record<string, any>} info
 * @returns {import('./_project.mjs').ComponentInfo}
 */
const doc = info => ({
  importPath: '@astryxdesign/core',
  category: '',
  defaults: null,
  wrapper: null,
  opens: false,
  subComponentOf: null,
  props: {},
  targets: [{className: 'x', states: [], values: {}}],
  ...info,
});

/** @param {string} type @param {boolean} [required] @param {any[]} [slots] */
const prop = (type, required = false, slots = []) => ({type, required, slots});

/** A Core whose docs have no playground defaults for these components. */
const OLD = /** @type {import('./_project.mjs').ThemeProject} */ (
  /** @type {any} */ ({
    components: {
      TextInput: doc({
        props: {
          label: prop('string', true),
          value: prop('string'),
          onChange: prop('(value: string) => void', true),
          size: prop("'sm' | 'md' | 'lg'"),
        },
      }),
      NumberInput: doc({
        props: {
          label: prop('string', true),
          value: prop('number | null | undefined', true),
        },
      }),
      ComplexSelector: doc({
        props: {
          label: prop('string', true),
          children: prop(
            '(value: string, close: () => void) => ReactNode',
            true,
          ),
        },
      }),
      ButtonGroup: doc({
        defaults: {label: 'Actions'},
        props: {
          label: prop('string', true),
          children: prop('ReactNode', true, [
            {__element: 'Button', props: {label: 'Action'}},
          ]),
        },
      }),
      TabList: doc({
        defaults: {value: 'tab-1'},
        props: {
          value: prop('string', true),
          children: prop('ReactNode', true, [
            {__element: 'Tab', props: {label: 'Tab', value: 'tab'}},
          ]),
        },
      }),
      Tab: doc({
        subComponentOf: 'TabList',
        props: {label: prop('string', true), value: prop('string', true)},
      }),
      Heading: doc({
        subComponentOf: 'Text',
        props: {
          level: prop('1 | 2 | 3 | 4 | 5 | 6', true),
          children: prop('ReactNode', true),
        },
        targets: [
          {
            className: 'astryx-heading',
            states: [],
            values: {level: [], color: ['primary', 'secondary']},
          },
        ],
      }),
      Text: doc({props: {children: prop('ReactNode', true)}}),
      Switch: doc({
        defaults: {label: 'On', value: true},
        props: {
          label: prop('string', true),
          value: prop('boolean', true),
          isDisabled: prop('boolean'),
        },
        targets: [
          {
            className: 'astryx-switch',
            states: ['checked', 'disabled'],
            values: {},
          },
        ],
      }),
      Dialog: doc({
        opens: true,
        defaults: {isOpen: true, isInline: true, width: 400},
        props: {variant: prop("'standard' | 'fullscreen'")},
        targets: [
          {
            className: 'astryx-dialog',
            states: [],
            values: {variant: ['standard', 'fullscreen']},
          },
        ],
      }),
      Popover: doc({
        opens: true,
        defaults: {content: 'Details'},
      }),
    },
  })
);

describe('a doc with no playground defaults', () => {
  it('renders with a sample for each required prop it can fill', () => {
    expect(demoProps(OLD, 'TextInput')).toEqual({label: 'TextInput'});
    expect(demoProps(OLD, 'NumberInput')).toEqual({
      label: 'NumberInput',
      value: 1,
    });
    // A required render function has no sample: the doc alone cannot show it.
    expect(demoProps(OLD, 'ComplexSelector')).toBeNull();
    expect(catalogVariants(OLD, 'TextInput', 12).length).toBeGreaterThan(0);
  });

  it('gives a group three of the items its doc suggests, the first selected', () => {
    const group = demoProps(OLD, 'ButtonGroup');
    expect(group?.label).toBe('Actions');
    expect(
      /** @type {any[]} */ (group?.children ?? []).map(c => [
        c.__element,
        c.props.label,
      ]),
    ).toEqual([
      ['Button', 'Action 1'],
      ['Button', 'Action 2'],
      ['Button', 'Action 3'],
    ]);
    const tabs = /** @type {any} */ (demoProps(OLD, 'TabList'));
    expect(tabs.value).toBe('tab-1');
    expect(tabs.children.map((/** @type {any} */ c) => c.props.value)).toEqual([
      'tab-1',
      'tab-2',
      'tab-3',
    ]);
  });

  it('keeps a part its parent lists as an item for the parent, and renders any other part', () => {
    expect(isItemOf(OLD, 'Tab')).toBe(true);
    expect(demoProps(OLD, 'Tab')).toBeNull();
    expect(catalogVariants(OLD, 'Tab', 12)).toEqual([]);
    expect(isItemOf(OLD, 'Heading')).toBe(false);
    const heading = catalogVariants(OLD, 'Heading', 12);
    expect(heading[0].props).toEqual({level: 1, children: 'Heading'});
    expect(heading.map(v => v.label)).toContain('level 6');
  });
});

describe('states and overlays', () => {
  it('labels a flipped switch with the state it shows', () => {
    const off = catalogVariants(OLD, 'Switch', 12).find(v => v.label === 'off');
    expect(off?.props).toMatchObject({value: false, label: 'Off'});
  });

  it('renders an overlay open; on a page people see, once, never in a variant that sizes the window', () => {
    expect(
      catalogVariants(OLD, 'Dialog', 12).map(v => v.props.variant ?? ''),
    ).toEqual(['', 'standard', 'fullscreen']);
    expect(catalogVariants(OLD, 'Dialog', 12, {shown: true})).toEqual([
      {label: '', props: {isOpen: true, isInline: true, width: 400}},
    ]);
    expect(catalogVariants(OLD, 'Popover', 12, {shown: true})).toEqual([
      {label: '', props: {content: 'Details', isOpen: true}},
    ]);
  });
});
