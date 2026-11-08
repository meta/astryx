// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file viewInputs.test.ts
 * @input Uses vitest, latchViewInputs and latchIsCurrent
 * @output Unit tests for the View-lifecycle change detector
 * @position Colocated test for viewInputs.ts
 */

import {describe, it, expect} from 'vitest';
import {latchViewInputs, latchIsCurrent} from './viewInputs';
import type {ViewInputs} from './viewInputs';
import type {AnySpec} from './types';

function inputs(overrides: Partial<ViewInputs> = {}): ViewInputs {
  return {
    spec: {
      $schema: 'https://vega.github.io/schema/vega/v6.json',
      marks: [],
    } as unknown as AnySpec,
    ...overrides,
  };
}

describe('latchIsCurrent', () => {
  it('holds when the same values arrive as fresh object literals', () => {
    const latch = latchViewInputs(inputs({viewOptions: {renderer: 'canvas'}}));

    expect(
      latchIsCurrent(latch, inputs({viewOptions: {renderer: 'canvas'}})),
    ).toBe(true);
  });

  it('holds for the very objects it latched', () => {
    const current = inputs({parseConfig: {background: 'red'}});

    expect(latchIsCurrent(latchViewInputs(current), current)).toBe(true);
  });

  it('breaks when a value differs', () => {
    const latch = latchViewInputs(inputs({viewOptions: {renderer: 'canvas'}}));

    expect(
      latchIsCurrent(latch, inputs({viewOptions: {renderer: 'svg'}})),
    ).toBe(false);
  });

  it('breaks when a key is added or removed', () => {
    const latch = latchViewInputs(inputs({parseConfig: {background: 'red'}}));

    expect(
      latchIsCurrent(
        latch,
        inputs({parseConfig: {background: 'red', autosize: 'pad'}}),
      ),
    ).toBe(false);
    expect(latchIsCurrent(latch, inputs({parseConfig: {}}))).toBe(false);
  });

  // The reason the latch keeps a copy rather than the previous props: on a
  // mutation both sides are the same object, so a props-to-props comparison
  // has nothing left to notice and the chart silently goes stale.
  describe('mutation through a shared reference', () => {
    it('breaks when a nested object shared across renders is mutated', () => {
      const encoding = {x: {field: 'a', type: 'ordinal'}};
      const latch = latchViewInputs(
        inputs({
          spec: {
            $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
            mark: 'bar',
            encoding,
          } as unknown as AnySpec,
        }),
      );

      encoding.x.field = 'b';

      expect(
        latchIsCurrent(
          latch,
          inputs({
            spec: {
              $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
              mark: 'bar',
              encoding,
            } as unknown as AnySpec,
          }),
        ),
      ).toBe(false);
    });

    it('breaks when the latched spec itself is mutated in place', () => {
      const spec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        mark: 'bar',
      } as unknown as AnySpec;
      const latch = latchViewInputs(inputs({spec}));

      (spec as unknown as {mark: string}).mark = 'line';

      expect(latchIsCurrent(latch, inputs({spec}))).toBe(false);
    });

    it('breaks when an element is pushed onto a shared array', () => {
      const marks: unknown[] = [{type: 'rect'}];
      const latch = latchViewInputs(
        inputs({spec: {$schema: 'x', marks} as unknown as AnySpec}),
      );

      marks.push({type: 'line'});

      expect(
        latchIsCurrent(
          latch,
          inputs({spec: {$schema: 'x', marks} as unknown as AnySpec}),
        ),
      ).toBe(false);
    });
  });

  describe('values compared by reference', () => {
    it('holds for the same function and breaks for an equivalent one', () => {
      const tooltip = () => {};
      const latch = latchViewInputs(inputs({viewOptions: {tooltip}}));

      expect(latchIsCurrent(latch, inputs({viewOptions: {tooltip}}))).toBe(
        true,
      );
      expect(
        latchIsCurrent(latch, inputs({viewOptions: {tooltip: () => {}}})),
      ).toBe(false);
    });

    it('treats a class instance as opaque, mutation included', () => {
      class Loader {
        base = 'a';
      }
      const loader = new Loader();
      const latch = latchViewInputs(inputs({viewOptions: {loader} as never}));

      // Documented limit: behavior lives in methods a copy cannot capture,
      // so only the reference is compared.
      loader.base = 'b';
      expect(
        latchIsCurrent(latch, inputs({viewOptions: {loader} as never})),
      ).toBe(true);
      expect(
        latchIsCurrent(
          latch,
          inputs({viewOptions: {loader: new Loader()} as never}),
        ),
      ).toBe(false);
    });
  });

  it('is stable for a self-referencing spec passed by the same reference', () => {
    const spec: Record<string, unknown> = {$schema: 'x'};
    spec.self = spec;
    const latch = latchViewInputs(inputs({spec: spec as unknown as AnySpec}));

    // A cycle cannot be copied, so the reference is compared. Stable — an
    // "always changed" verdict here loops React during render.
    expect(
      latchIsCurrent(latch, inputs({spec: spec as unknown as AnySpec})),
    ).toBe(true);
  });

  it('breaks once when a self-referencing spec is replaced', () => {
    const first: Record<string, unknown> = {$schema: 'x'};
    first.self = first;
    const second: Record<string, unknown> = {$schema: 'x'};
    second.self = second;
    const latch = latchViewInputs(inputs({spec: first as unknown as AnySpec}));

    expect(
      latchIsCurrent(latch, inputs({spec: second as unknown as AnySpec})),
    ).toBe(false);
    // And the new latch settles on the new reference rather than churning.
    const next = latchViewInputs(inputs({spec: second as unknown as AnySpec}));
    expect(
      latchIsCurrent(next, inputs({spec: second as unknown as AnySpec})),
    ).toBe(true);
  });

  it('still sees a mutation beside a cycle', () => {
    const spec: Record<string, unknown> = {$schema: 'x', mark: 'bar'};
    spec.self = spec;
    const latch = latchViewInputs(inputs({spec: spec as unknown as AnySpec}));

    // The cycle is opaque; everything the copy did reach is still compared.
    spec.mark = 'line';

    expect(
      latchIsCurrent(latch, inputs({spec: spec as unknown as AnySpec})),
    ).toBe(false);
  });

  // A cycle's re-entry edge always points back at an object the copy has
  // already walked, so the cycle itself hides nothing — worth pinning,
  // because the depth boundary below behaves differently.
  it('sees a mutation on an object that also sits on a cycle', () => {
    const nested: Record<string, unknown> = {field: 'a'};
    const spec: Record<string, unknown> = {$schema: 'x', nested};
    nested.parent = spec;
    const latch = latchViewInputs(inputs({spec: spec as unknown as AnySpec}));

    nested.field = 'b';

    expect(
      latchIsCurrent(latch, inputs({spec: spec as unknown as AnySpec})),
    ).toBe(false);
  });

  it('walks the same object twice in sibling positions', () => {
    const shared = {field: 'a'};
    const spec = () =>
      ({$schema: 'x', x: shared, y: shared}) as unknown as AnySpec;
    const latch = latchViewInputs(inputs({spec: spec()}));

    // Sharing is not a cycle: both positions are copied, so a mutation of
    // the shared object is caught.
    expect(latchIsCurrent(latch, inputs({spec: spec()}))).toBe(true);
    shared.field = 'b';
    expect(latchIsCurrent(latch, inputs({spec: spec()}))).toBe(false);
  });

  describe('deeper than the copy walks', () => {
    /** A chain of `depth` nested objects ending in `leaf`. */
    function nest(depth: number, leaf: unknown): Record<string, unknown> {
      let node: Record<string, unknown> = {leaf} as Record<string, unknown>;
      for (let index = 0; index < depth; index++) {
        node = {node};
      }
      return node;
    }

    it('is stable for a too-deep spec passed by the same reference', () => {
      const deep = nest(150, 'a');
      const spec = {$schema: 'x', deep} as unknown as AnySpec;
      const latch = latchViewInputs(inputs({spec}));

      expect(latchIsCurrent(latch, inputs({spec}))).toBe(true);
    });

    it('breaks when the too-deep subtree is replaced by a new object', () => {
      const spec = () =>
        ({$schema: 'x', deep: nest(150, 'a')}) as unknown as AnySpec;
      const latch = latchViewInputs(inputs({spec: spec()}));

      // Beyond the bound the reference is all there is, so an equal-valued
      // rebuild counts as changed — a rebuild, never a stale chart.
      expect(latchIsCurrent(latch, inputs({spec: spec()}))).toBe(false);
    });

    it('does not see a mutation only reachable past the depth bound', () => {
      const deep = nest(150, 'a');
      const spec = {$schema: 'x', deep} as unknown as AnySpec;
      const latch = latchViewInputs(inputs({spec}));

      // Walk to the far end and edit it in place. Past the bound only the
      // reference is compared, and it did not change — the documented
      // limitation, and why a caller replaces the object instead.
      let node = deep;
      while (node.node) {
        node = node.node as Record<string, unknown>;
      }
      node.leaf = 'b';

      expect(latchIsCurrent(latch, inputs({spec}))).toBe(true);
    });

    it('still sees a shallow mutation beside a too-deep subtree', () => {
      const deep = nest(150, 'a');
      const spec: Record<string, unknown> = {
        $schema: 'x',
        mark: 'bar',
        deep,
      };
      const latch = latchViewInputs(inputs({spec: spec as unknown as AnySpec}));

      spec.mark = 'line';

      expect(
        latchIsCurrent(latch, inputs({spec: spec as unknown as AnySpec})),
      ).toBe(false);
    });
  });

  it('distinguishes absent from present optional inputs', () => {
    const latch = latchViewInputs(inputs());

    expect(latchIsCurrent(latch, inputs())).toBe(true);
    expect(latchIsCurrent(latch, inputs({parseOptions: {ast: true}}))).toBe(
      false,
    );
  });
});
