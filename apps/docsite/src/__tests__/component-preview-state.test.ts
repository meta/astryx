// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it, vi} from 'vitest';
import {
  buildAppShellMobilePreviewContext,
  buildInitialState,
  buildRuntimePreviewState,
  getOverlayPreviewControl,
  getMissingRequiredProps,
  hasInteractivePlayground,
  isOverlayPreviewClosed,
  pickPrimaryProps,
} from '../components/component-detail/interactiveState';
import type {PropDoc} from '../generated/componentRegistry';

vi.mock('@astryxdesign/core', () => ({}));
vi.mock('@astryxdesign/core/theme/syntax', () => ({allSyntaxPresets: []}));
vi.mock('../generated/themeRegistry', () => ({themeObjectsFull: {}}));

function prop(
  partial: Partial<PropDoc> & Pick<PropDoc, 'name' | 'type'>,
): PropDoc {
  return {
    description: '',
    ...partial,
  };
}

describe('component detail preview state', () => {
  it('generates safe runtime defaults for typeahead-like required props', async () => {
    const knobs = pickPrimaryProps('BaseTypeahead', [
      prop({name: 'searchSource', type: 'SearchSource<T>', required: true}),
      prop({name: 'value', type: 'T | null', required: true}),
      prop({
        name: 'onChange',
        type: '(item: T | null) => void',
        required: true,
      }),
    ]);

    const state = buildInitialState(knobs);

    expect(state.value).toBeNull();
    expect(state.onChange).toEqual(expect.any(Function));
    expect(state.searchSource).toMatchObject({
      search: expect.any(Function),
      bootstrap: expect.any(Function),
      cancel: expect.any(Function),
    });
    await expect(
      Promise.resolve(
        (state.searchSource as {search: (query: string) => unknown}).search(
          'proj',
        ),
      ),
    ).resolves.toEqual([{id: 'projects', label: 'Projects'}]);
    expect(getMissingRequiredProps(knobs, state)).toEqual([]);
  });

  it('keeps generated required fallbacks when playground defaults open an inline preview', () => {
    const knobs = pickPrimaryProps('CommandPalette', [
      prop({name: 'isOpen', type: 'boolean', required: true}),
      prop({
        name: 'onOpenChange',
        type: '(isOpen: boolean) => void',
        required: true,
      }),
      prop({name: 'searchSource', type: 'SearchSource<T>', required: true}),
      prop({name: 'isInline', type: 'boolean'}),
    ]);

    const state = buildInitialState(knobs, {
      defaults: {
        isOpen: true,
        isInline: true,
        onOpenChange: undefined,
      },
    });

    expect(state.isOpen).toBe(true);
    expect(state.isInline).toBe(true);
    expect(state.onOpenChange).toEqual(expect.any(Function));
    expect(state.searchSource).toMatchObject({
      search: expect.any(Function),
      bootstrap: expect.any(Function),
      cancel: expect.any(Function),
    });
    expect(getMissingRequiredProps(knobs, state)).toEqual([]);
  });

  it('reports required props that cannot be generated safely', () => {
    const knobs = pickPrimaryProps('CustomWidget', [
      prop({name: 'config', type: 'CustomConfig', required: true}),
    ]);
    const state = buildInitialState(knobs);

    expect(state.config).toBeUndefined();
    expect(getMissingRequiredProps(knobs, state)).toEqual(['config']);
  });

  it('seeds OverflowList children from playground defaults so the preview is not empty', () => {
    const knobs = pickPrimaryProps('OverflowList', [
      prop({name: 'children', type: 'ReactNode', required: true}),
      prop({
        name: 'overflowRenderer',
        type: '(overflowItems: OverflowItem[]) => ReactNode',
      }),
    ]);

    const state = buildInitialState(knobs, {
      defaults: {
        children: [
          {
            __element: 'Button',
            props: {label: 'Overview', variant: 'secondary'},
          },
          {
            __element: 'Button',
            props: {label: 'Activity', variant: 'secondary'},
          },
          {
            __element: 'Button',
            props: {label: 'Settings', variant: 'secondary'},
          },
        ],
      },
    });

    expect(Array.isArray(state.children)).toBe(true);
    expect((state.children as unknown[]).length).toBe(3);
    expect(getMissingRequiredProps(knobs, state)).toEqual([]);
  });

  it('seeds DropdownMenu items from playground defaults so the preview is not empty', () => {
    const knobs = pickPrimaryProps('DropdownMenu', [
      prop({name: 'button', type: 'DropdownMenuButtonProps'}),
      prop({name: 'items', type: 'DropdownMenuOption[]', required: true}),
    ]);

    const state = buildInitialState(knobs, {
      defaults: {
        button: {label: 'Actions'},
        items: [{label: 'Edit'}, {label: 'Duplicate'}, {label: 'Delete'}],
      },
    });

    expect(Array.isArray(state.items)).toBe(true);
    expect((state.items as unknown[]).length).toBe(3);
    expect(getMissingRequiredProps(knobs, state)).toEqual([]);
  });

  it('seeds DropdownMenuItem label and description from playground defaults', () => {
    const knobs = pickPrimaryProps('DropdownMenuItem', [
      prop({name: 'icon', type: 'IconType'}),
      prop({name: 'label', type: 'ReactNode'}),
      prop({name: 'description', type: 'ReactNode'}),
    ]);

    const state = buildInitialState(knobs, {
      defaults: {label: 'Edit', description: 'Modify this item'},
    });

    expect(state.label).toBe('Edit');
    expect(state.description).toBe('Modify this item');
    expect(getMissingRequiredProps(knobs, state)).toEqual([]);
  });

  it('seeds Grid children from playground defaults so the preview is not empty (#5892)', () => {
    const knobs = pickPrimaryProps('Grid', [
      prop({name: 'columns', type: 'number | {minWidth: number}'}),
      prop({name: 'gap', type: '0 | 0.5 | 1 | 1.5 | 2'}),
      prop({name: 'children', type: 'ReactNode'}),
    ]);

    const state = buildInitialState(knobs, {
      defaults: {
        columns: 3,
        gap: 2,
        children: [
          {__element: 'Card', props: {padding: 4}, children: 'Item 1'},
          {__element: 'Card', props: {padding: 4}, children: 'Item 2'},
          {__element: 'Card', props: {padding: 4}, children: 'Item 3'},
        ],
      },
    });

    expect(state.columns).toBe(3);
    expect(Array.isArray(state.children)).toBe(true);
    expect((state.children as unknown[]).length).toBe(3);
    expect(getMissingRequiredProps(knobs, state)).toEqual([]);
  });

  it.each([
    ['Stack', {direction: 'horizontal'}],
    ['HStack', {}],
    ['VStack', {}],
  ])(
    'seeds %s children from playground defaults so the preview is not empty (#5894, #5898, #5900)',
    (name, extraDefaults) => {
      const knobs = pickPrimaryProps(name, [
        prop({name: 'gap', type: '0 | 0.5 | 1 | 1.5 | 2'}),
        prop({name: 'children', type: 'ReactNode'}),
      ]);

      const state = buildInitialState(knobs, {
        defaults: {
          gap: 2,
          ...extraDefaults,
          children: [
            {__element: 'Card', props: {padding: 3}, children: 'Item 1'},
            {__element: 'Card', props: {padding: 3}, children: 'Item 2'},
            {__element: 'Card', props: {padding: 3}, children: 'Item 3'},
          ],
        },
      });

      expect(Array.isArray(state.children)).toBe(true);
      expect((state.children as unknown[]).length).toBe(3);
      expect(getMissingRequiredProps(knobs, state)).toEqual([]);
    },
  );

  it("satisfies Icon's required, non-generatable icon prop via playground defaults", () => {
    const knobs = pickPrimaryProps('Icon', [
      prop({
        name: 'icon',
        type: 'IconName | ComponentType<SVGProps>',
        required: true,
      }),
    ]);

    // Without a playground default the required icon prop cannot be generated.
    expect(getMissingRequiredProps(knobs, buildInitialState(knobs))).toEqual([
      'icon',
    ]);

    // The doc's playground default seeds a valid semantic name.
    const state = buildInitialState(knobs, {defaults: {icon: 'search'}});
    expect(state.icon).toBe('search');
    expect(getMissingRequiredProps(knobs, state)).toEqual([]);
  });

  it("satisfies Citation's required, non-generatable source prop via playground defaults", () => {
    const knobs = pickPrimaryProps('Citation', [
      prop({name: 'source', type: 'CitationSource', required: true}),
      prop({name: 'number', type: 'number', required: true}),
    ]);

    // Without a playground default the custom-object `source` prop cannot be
    // generated, so the properties tab shows the missing-props placeholder
    // instead of an interactive preview.
    expect(getMissingRequiredProps(knobs, buildInitialState(knobs))).toEqual([
      'source',
    ]);

    // The doc's playground default seeds a renderable source object.
    const state = buildInitialState(knobs, {
      defaults: {
        source: {title: 'Astryx Design', url: 'https://example.com'},
        number: 1,
      },
    });
    expect(state.source).toMatchObject({title: 'Astryx Design'});
    expect(getMissingRequiredProps(knobs, state)).toEqual([]);
  });

  it('gives PowerSearch a renderable controlled filter fixture', () => {
    const knobs = pickPrimaryProps('PowerSearch', [
      prop({name: 'config', type: 'PowerSearchConfig', required: true}),
      prop({
        name: 'filters',
        type: 'ReadonlyArray<PowerSearchFilter>',
        required: true,
      }),
      prop({
        name: 'onChange',
        type: "(filters: ReadonlyArray<PowerSearchFilter>, changeType: 'add' | 'edit' | 'remove', index: number) => void",
        required: true,
      }),
    ]);
    const initialFilters = [
      {
        field: 'status',
        operator: 'is',
        value: {type: 'enum', value: 'open'},
      },
    ];
    const state = buildInitialState(knobs, {
      defaults: {
        config: {
          name: 'IssueSearch',
          fields: [
            {
              key: 'status',
              label: 'Status',
              defaultOperator: 'is',
              operators: [
                {
                  key: 'is',
                  label: 'is',
                  value: {
                    type: 'enum',
                    values: [
                      {value: 'open', label: 'Open'},
                      {value: 'closed', label: 'Closed'},
                    ],
                  },
                },
              ],
            },
          ],
        },
        filters: initialFilters,
      },
    });

    expect(getMissingRequiredProps(knobs, state)).toEqual([]);
    expect(state.filters).toEqual(initialFilters);

    const onPropChange = vi.fn();
    const runtimeState = buildRuntimePreviewState(state, onPropChange, {
      knobs,
    });
    const changedFilters = [
      ...initialFilters,
      {
        field: 'status',
        operator: 'is',
        value: {type: 'enum', value: 'closed'},
      },
    ];
    (runtimeState.onChange as (filters: unknown) => void)(changedFilters);
    expect(onPropChange).toHaveBeenCalledWith('filters', changedFilters);
  });

  it('gives Timestamp a valid date value via playground defaults', () => {
    const knobs = pickPrimaryProps('Timestamp', [
      prop({name: 'value', type: 'string | number', required: true}),
    ]);

    // Without a playground default, the required string `value` falls back to
    // the prop's own name ("value"), which `new Date("value").toISOString()`
    // rejects with "Invalid time value" — crashing the preview on load.
    const fallback = buildInitialState(knobs).value;
    expect(fallback).toBe('value');
    expect(() => new Date(fallback as string).toISOString()).toThrow(
      'Invalid time value',
    );

    // The doc's playground default seeds a valid date the component can render.
    const state = buildInitialState(knobs, {
      defaults: {value: '2026-02-19T17:00:00Z'},
    });
    expect(state.value).toBe('2026-02-19T17:00:00Z');
    expect(() => new Date(state.value as string).toISOString()).not.toThrow();
    expect(getMissingRequiredProps(knobs, state)).toEqual([]);
  });

  it('gives Skeleton concrete preview dimensions via playground defaults', () => {
    const knobs = pickPrimaryProps('Skeleton', [
      prop({name: 'width', type: 'number | string', default: "'100%'"}),
      prop({name: 'height', type: 'number | string', default: "'100%'"}),
    ]);

    // Doc defaults alone would render at 100% (collapses in the centered preview).
    expect(buildInitialState(knobs).width).toBe('100%');

    // Playground defaults override with visible pixel dimensions.
    const state = buildInitialState(knobs, {
      defaults: {width: 200, height: 24},
    });
    expect(state.width).toBe(200);
    expect(state.height).toBe(24);
  });

  it('wires controlled open previews back to their isOpen prop', () => {
    const onPropChange = vi.fn();
    const runtimeState = buildRuntimePreviewState(
      {
        children: 'Preview content',
        isOpen: true,
      },
      onPropChange,
      {canControlOpenState: true},
    );

    expect(runtimeState.onOpenChange).toEqual(expect.any(Function));

    (runtimeState.onOpenChange as (isOpen: boolean) => void)(false);

    expect(onPropChange).toHaveBeenCalledWith('isOpen', false);
  });

  it('bridges a controlled value/onChange pair so the preview updates', () => {
    const knobs = pickPrimaryProps('Pagination', [
      prop({name: 'page', type: 'number', required: true}),
      prop({
        name: 'onChange',
        type: '(page: number) => void',
        required: true,
      }),
      prop({name: 'totalItems', type: 'number'}),
      prop({name: 'pageSize', type: 'number', default: '10'}),
      prop({
        name: 'onPageSizeChange',
        type: '(pageSize: number) => void',
      }),
    ]);

    const onPropChange = vi.fn();
    const runtimeState = buildRuntimePreviewState(
      {page: 1, totalItems: 100, pageSize: 10},
      onPropChange,
      {knobs},
    );

    // onChange's first param is `page`, which is a value prop → wired.
    expect(runtimeState.onChange).toEqual(expect.any(Function));
    (runtimeState.onChange as (page: number) => void)(3);
    expect(onPropChange).toHaveBeenCalledWith('page', 3);

    // onPageSizeChange's first param is `pageSize`, also a value prop → wired.
    expect(runtimeState.onPageSizeChange).toEqual(expect.any(Function));
    (runtimeState.onPageSizeChange as (pageSize: number) => void)(25);
    expect(onPropChange).toHaveBeenCalledWith('pageSize', 25);
  });

  it('bridges a generic value/onChange pair', () => {
    const knobs = pickPrimaryProps('Slider', [
      prop({name: 'value', type: 'number', required: true}),
      prop({
        name: 'onChange',
        type: '(value: number) => void',
        required: true,
      }),
    ]);

    const onPropChange = vi.fn();
    const runtimeState = buildRuntimePreviewState({value: 10}, onPropChange, {
      knobs,
    });

    (runtimeState.onChange as (value: number) => void)(42);
    expect(onPropChange).toHaveBeenCalledWith('value', 42);
  });

  it('bridges Selector onChange even though its optional value prop is not seeded (#5909 follow-up)', () => {
    const knobs = pickPrimaryProps('Selector', [
      prop({name: 'label', type: 'string', required: true}),
      prop({name: 'options', type: 'SelectorOption[]', required: true}),
      prop({name: 'value', type: 'string'}),
      prop({name: 'onChange', type: '(value: string) => void'}),
    ]);

    const state = buildInitialState(knobs, {
      defaults: {
        label: 'Fruit',
        options: [
          {value: 'apple', label: 'Apple'},
          {value: 'orange', label: 'Orange'},
        ],
      },
    });
    expect(state.value).toBeUndefined();
    expect(getMissingRequiredProps(knobs, state)).toEqual([]);

    const onPropChange = vi.fn();
    const runtimeState = buildRuntimePreviewState(state, onPropChange, {knobs});

    (runtimeState.onChange as (value: string) => void)('orange');
    expect(onPropChange).toHaveBeenCalledWith('value', 'orange');
  });

  it('bridges a Tokenizer removal back to its controlled value', () => {
    const knobs = pickPrimaryProps('Tokenizer', [
      prop({name: 'label', type: 'string', required: true}),
      prop({name: 'value', type: 'T[]', required: true}),
      prop({
        name: 'onChange',
        type: '(items: T[], change: TokenizerChange<T>) => void',
        required: true,
      }),
    ]);

    const seeded = [
      {id: '1', label: 'Design'},
      {id: '2', label: 'Engineering'},
    ];
    const onPropChange = vi.fn();
    const runtimeState = buildRuntimePreviewState(
      {label: 'Tags', value: seeded},
      onPropChange,
      {knobs},
    );

    // onChange's first param is `items`, which is not a prop — it falls back
    // to the controlled `value`, so removing a token updates the preview.
    expect(runtimeState.onChange).toEqual(expect.any(Function));
    (runtimeState.onChange as (items: unknown[], change: unknown) => void)(
      [seeded[1]],
      {item: seeded[0], type: 'remove'},
    );
    expect(onPropChange).toHaveBeenCalledWith('value', [seeded[1]]);
  });

  it('bridges a Switch toggle back to its controlled value', () => {
    const knobs = pickPrimaryProps('Switch', [
      prop({name: 'value', type: 'boolean', required: true}),
      prop({
        name: 'onChange',
        type: '(checked: boolean, e: ChangeEvent<HTMLInputElement>) => void',
      }),
    ]);

    const onPropChange = vi.fn();
    const runtimeState = buildRuntimePreviewState(
      {value: false},
      onPropChange,
      {
        knobs,
      },
    );

    (runtimeState.onChange as (checked: boolean) => void)(true);
    expect(onPropChange).toHaveBeenCalledWith('value', true);
  });

  it('does not invent a value target for non-onChange handlers', () => {
    const knobs = pickPrimaryProps('OverflowList', [
      prop({name: 'value', type: 'string'}),
      prop({
        name: 'onOverflowChange',
        type: '(overflowItems: OverflowItem[]) => void',
      }),
    ]);

    const state = {value: 'a'};
    const onPropChange = vi.fn();
    const runtimeState = buildRuntimePreviewState(state, onPropChange, {knobs});

    // `overflowItems` is not a prop, and a named on*Change handler reports
    // something other than the controlled value — leave it alone.
    expect(runtimeState).toBe(state);
  });

  it('leaves callbacks alone when no matching value prop exists in state', () => {
    const knobs = pickPrimaryProps('Button', [
      prop({name: 'label', type: 'string'}),
      prop({name: 'onClick', type: '(e: MouseEvent) => void'}),
    ]);

    const state = {label: 'Click me'};
    const onPropChange = vi.fn();
    const runtimeState = buildRuntimePreviewState(state, onPropChange, {knobs});

    // No `e` value prop in state → callback not bridged; state returned as-is.
    expect(runtimeState).toBe(state);
    expect(runtimeState.onClick).toBeUndefined();
  });

  it('only bridges isOpen when the preview opts into controlling open state', () => {
    const knobs = pickPrimaryProps('Popover', [
      prop({name: 'isOpen', type: 'boolean', required: true}),
      prop({
        name: 'onOpenChange',
        type: '(isOpen: boolean) => void',
        required: true,
      }),
    ]);

    const onPropChange = vi.fn();

    const withoutOptIn = buildRuntimePreviewState(
      {isOpen: true},
      onPropChange,
      {
        knobs,
      },
    );
    expect(withoutOptIn.onOpenChange).toBeUndefined();

    const withOptIn = buildRuntimePreviewState({isOpen: true}, onPropChange, {
      knobs,
      canControlOpenState: true,
    });
    (withOptIn.onOpenChange as (isOpen: boolean) => void)(false);
    expect(onPropChange).toHaveBeenCalledWith('isOpen', false);
  });

  it('keeps an explicit isOpen: false playground default in preview state', () => {
    const knobs = pickPrimaryProps('MobileNav', [
      prop({name: 'isOpen', type: 'boolean'}),
      prop({name: 'onOpenChange', type: '(isOpen: boolean) => void'}),
      prop({name: 'children', type: 'ReactNode', required: true}),
    ]);

    const state = buildInitialState(knobs, {
      overlay: true,
      defaults: {isOpen: false, children: 'nav items'},
    });

    // isOpen must be present (not undefined) so buildRuntimePreviewState can
    // bridge onOpenChange back into playground state for the open trigger.
    expect(state.isOpen).toBe(false);

    const onPropChange = vi.fn();
    const runtimeState = buildRuntimePreviewState(state, onPropChange, {
      knobs,
      canControlOpenState: true,
    });
    (runtimeState.onOpenChange as (isOpen: boolean) => void)(true);
    expect(onPropChange).toHaveBeenCalledWith('isOpen', true);
  });

  it('bridges a required onOpenChange knob for overlay previews via the knob path', () => {
    // Lightbox shape: isOpen/onOpenChange/media are all REQUIRED — the
    // MobileNav test above covers the optional-props variant of this bridge.
    const knobs = pickPrimaryProps('Lightbox', [
      prop({name: 'isOpen', type: 'boolean', required: true}),
      prop({
        name: 'onOpenChange',
        type: '(isOpen: boolean) => void',
        required: true,
      }),
      prop({
        name: 'media',
        type: 'LightboxMedia | LightboxMedia[]',
        required: true,
      }),
    ]);

    const playground = {
      overlay: true,
      defaults: {
        isOpen: false,
        media: {src: 'https://example.com/scene.png', alt: 'Scene'},
      },
    };
    const state = buildInitialState(knobs, playground);

    // The explicit isOpen: false survives (not eaten by required fallbacks),
    // media is satisfied from defaults, and the stage starts closed.
    expect(state.isOpen).toBe(false);
    expect(state.media).toMatchObject({alt: 'Scene'});
    expect(getMissingRequiredProps(knobs, state)).toEqual([]);
    expect(isOverlayPreviewClosed(playground, state)).toBe(true);

    // The Open-preview trigger and the component's own Esc/backdrop close both
    // round-trip through the bridged onOpenChange.
    const onPropChange = vi.fn();
    const runtimeState = buildRuntimePreviewState(state, onPropChange, {
      knobs,
      canControlOpenState: true,
    });
    (runtimeState.onOpenChange as (isOpen: boolean) => void)(true);
    expect(onPropChange).toHaveBeenCalledWith('isOpen', true);
    expect(isOverlayPreviewClosed(playground, {...state, isOpen: true})).toBe(
      false,
    );
  });

  it('bridges gallery onIndexChange only when index is seeded in state', () => {
    const knobs = pickPrimaryProps('Lightbox', [
      prop({name: 'isOpen', type: 'boolean', required: true}),
      prop({
        name: 'onOpenChange',
        type: '(isOpen: boolean) => void',
        required: true,
      }),
      prop({
        name: 'media',
        type: 'LightboxMedia | LightboxMedia[]',
        required: true,
      }),
      prop({name: 'index', type: 'number'}),
      prop({name: 'onIndexChange', type: '(index: number) => void'}),
    ]);
    const media = [
      {src: 'https://example.com/one.png', alt: 'One'},
      {src: 'https://example.com/two.png', alt: 'Two'},
    ];
    const onPropChange = vi.fn();

    // Without an index default, `index` is absent from state, so the gallery
    // callback is not bridged — prev/next inside the open preview cannot
    // update playground state.
    const state = buildInitialState(knobs, {
      overlay: true,
      defaults: {isOpen: false, media},
    });
    expect(state.index).toBeUndefined();
    const runtimeState = buildRuntimePreviewState(state, onPropChange, {
      knobs,
      canControlOpenState: true,
    });
    expect(runtimeState.onIndexChange).toBeUndefined();

    // Seeding index in defaults opts the gallery into the bridge.
    const seeded = buildInitialState(knobs, {
      overlay: true,
      defaults: {isOpen: false, index: 0, media},
    });
    const seededRuntime = buildRuntimePreviewState(seeded, onPropChange, {
      knobs,
      canControlOpenState: true,
    });
    (seededRuntime.onIndexChange as (index: number) => void)(1);
    expect(onPropChange).toHaveBeenCalledWith('index', 1);
  });

  it('flags closed overlay previews only for overlay-mode playgrounds', () => {
    expect(isOverlayPreviewClosed({overlay: true}, {isOpen: false})).toBe(true);
    expect(isOverlayPreviewClosed({overlay: true}, {})).toBe(true);
    expect(isOverlayPreviewClosed({overlay: true}, {isOpen: true})).toBe(false);
    expect(isOverlayPreviewClosed({}, {isOpen: false})).toBe(false);
    expect(isOverlayPreviewClosed(null, {isOpen: false})).toBe(false);
    expect(isOverlayPreviewClosed(undefined, {})).toBe(false);
  });

  it('supports overlays controlled by a non-boolean state prop', () => {
    const playground = {
      overlay: true,
      overlayControl: {stateProp: 'activeSheet', openValue: 'details'},
    };

    expect(getOverlayPreviewControl(playground)).toEqual({
      stateProp: 'activeSheet',
      openValue: 'details',
    });
    expect(isOverlayPreviewClosed(playground, {activeSheet: null})).toBe(true);
    expect(isOverlayPreviewClosed(playground, {activeSheet: 'details'})).toBe(
      false,
    );
  });

  it('ignores overlay controls unless overlay mode is enabled', () => {
    const playground = {
      overlayControl: {stateProp: 'activeSheet', openValue: 'details'},
    };

    expect(getOverlayPreviewControl(playground)).toBeNull();
    expect(isOverlayPreviewClosed(playground, {activeSheet: null})).toBe(false);
  });
});

// ── Simplified layout for provider/utility pages (#2733) ───────────────────
// Utility entries like LinkProvider are non-visual providers: auto-generated
// playground knobs render an empty stage with an unsatisfiable required
// `component` prop. They must get the hook-style static layout instead,
// while Utility docs that curate a playground (Theme) keep the interactive
// Properties tab.
describe('hasInteractivePlayground', () => {
  it('gives regular components an interactive playground', () => {
    expect(
      hasInteractivePlayground({
        category: 'Action',
        params: null,
        playground: null,
      }),
    ).toBe(true);
    expect(
      hasInteractivePlayground({
        category: null,
        params: null,
        playground: null,
      }),
    ).toBe(true);
  });

  it('never gives hooks a playground', () => {
    expect(
      hasInteractivePlayground({
        category: 'Utility',
        params: [{name: 'query', type: 'string', description: ''}],
        playground: null,
      }),
    ).toBe(false);
  });

  it('gives playground-less Utility entries the static layout', () => {
    // LinkProvider, LayerProvider, VisuallyHidden shape
    expect(
      hasInteractivePlayground({
        category: 'Utility',
        params: null,
        playground: null,
      }),
    ).toBe(false);
  });

  it('keeps the playground for Utility docs that curate one', () => {
    // Theme, MediaTheme, SyntaxTheme shape
    expect(
      hasInteractivePlayground({
        category: 'Utility',
        params: null,
        playground: {defaults: {mode: 'light'}},
      }),
    ).toBe(true);
  });

  it('uses the standard playground for components from canary packages', () => {
    expect(
      hasInteractivePlayground({
        category: 'Data Input',
        params: null,
        playground: null,
      }),
    ).toBe(true);
  });
});

// ── Simulated mobile AppShell context (#4983) ───────────────────────────────
// MobileNavToggle reads AppShell mobile context and renders null when the
// context says the viewport is not mobile (the default outside AppShell), so
// its Properties preview was an empty stage. `playground.appShellMobile`
// wraps the preview in a provider built from this value.
describe('buildAppShellMobilePreviewContext', () => {
  it('simulates an enabled mobile AppShell so context-gated components render', () => {
    const value = buildAppShellMobilePreviewContext(false, () => {});
    expect(value.isMobile).toBe(true);
    expect(value.isMobileNavEnabled).toBe(true);
    expect(value.isMobileNavOpen).toBe(false);
    expect(value.hasAutoToggle).toBe(true);
  });

  it('wires toggle/open/close back to the provided open-state setter', () => {
    const onOpenChange = vi.fn();

    const closed = buildAppShellMobilePreviewContext(false, onOpenChange);
    closed.toggleMobileNav();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    closed.openMobileNav();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    closed.closeMobileNav();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    const open = buildAppShellMobilePreviewContext(true, onOpenChange);
    expect(open.isMobileNavOpen).toBe(true);
    open.toggleMobileNav();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
