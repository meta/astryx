// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit tests for the XLE/XLO parser, printers, and validator.
 * Parser/printer tests are registry-free; validator tests use a small
 * synthetic registry so they don't depend on @xds/core docs.
 */

import {describe, it, expect} from 'vitest';
import {parse, parseCompact, parseOutline, detectForm, XLEParseError} from './parse.mjs';
import {toCompact, toOutline} from './print.mjs';
import {validate} from './validate.mjs';
import {expand} from './expand.mjs';
import {parseEnumValues, SPACING_STEPS} from './registry.mjs';

// ─── parser: compact ───────────────────────────────────────────────────────

describe('parseCompact', () => {
  it('parses child and sibling operators', () => {
    const doc = parseCompact('A > B + C');
    expect(doc.roots).toHaveLength(1);
    expect(doc.roots[0].name).toBe('A');
    expect(doc.roots[0].children.map(c => c.name)).toEqual(['B', 'C']);
  });

  it('parses groups with repeat', () => {
    const doc = parseCompact('V > (C + D)*3');
    const group = doc.roots[0].children[0];
    expect(group.kind).toBe('group');
    expect(group.repeat).toBe(3);
    expect(group.children.map(c => c.name)).toEqual(['C', 'D']);
  });

  it('parses node anatomy: id, enum mods, payload, attrs, hint, repeat, selected', () => {
    const doc = parseCompact('Tab#main.lg"Overview"[divider sz=md]{card-callout}!*2');
    const node = doc.roots[0];
    expect(node.id).toBe('main');
    expect(node.enumMods).toEqual(['lg']);
    expect(node.payload).toBe('Overview');
    expect(node.attrs).toEqual([
      expect.objectContaining({kind: 'flag', key: 'divider'}),
      expect.objectContaining({kind: 'kv', key: 'sz', value: 'md'}),
    ]);
    expect(node.hint.name).toBe('card-callout');
    expect(node.selected).toBe(true);
    expect(node.repeat).toBe(2);
  });

  it('parses fused shorthands, objects, lists, and negation', () => {
    const doc = parseCompact('G[c{min:340,fit} g4 dv=[top,bottom] !scroll]');
    const attrs = doc.roots[0].attrs;
    expect(attrs[0]).toEqual(expect.objectContaining({key: 'c', value: {min: 340, fit: true}}));
    expect(attrs[1]).toEqual(expect.objectContaining({key: 'g', value: 4}));
    expect(attrs[2]).toEqual(expect.objectContaining({key: 'dv', value: ['top', 'bottom']}));
    expect(attrs[3]).toEqual(expect.objectContaining({kind: 'neg', key: 'scroll'}));
  });

  it('parses slot attrs with nested sub-expressions', () => {
    const doc = parseCompact('A[@topNav=(TN > TNI"Home" + TNI"Docs") @banner=\'hello\']');
    const [topNav, banner] = doc.roots[0].slots;
    expect(topNav.key).toBe('topNav');
    expect(topNav.value.subexpr[0].name).toBe('TN');
    expect(topNav.value.subexpr[0].children).toHaveLength(2);
    expect(banner.value).toBe('hello');
  });

  it('parses detached overlays after ;;', () => {
    const doc = parseCompact('V > B"Delete"[opens=#confirm] ;; AD#confirm"Sure?"');
    expect(doc.roots).toHaveLength(1);
    expect(doc.overlays).toHaveLength(1);
    expect(doc.overlays[0].id).toBe('confirm');
  });

  it('rejects ^ with a correction toward groups', () => {
    expect(() => parseCompact('A > B ^ C')).toThrow(/group siblings with \(\.\.\.\)/);
  });

  it('rejects brace content that is not a block name, teaching the payload form', () => {
    try {
      parseCompact('C{Total Revenue}');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(XLEParseError);
      expect(e.message).toMatch(/not a block reference/);
      expect(e.message).toMatch(/quoted payload/);
    }
  });

  it('reports unterminated constructs with positions', () => {
    expect(() => parseCompact('V[g6 > C')).toThrow(XLEParseError);
    expect(() => parseCompact('Tx"unclosed')).toThrow(/Unterminated/);
  });
});

// ─── parser: outline ───────────────────────────────────────────────────────

const OUTLINE = `
AppShell
  topNav: TN "Acme"
  Layout > LC !scroll
    V g=6
      Tx.lg "Hello"
      repeat 3:
        C {card-callout}
    Tbar "Actions"
      B "Delete" opens=#confirm

overlays:
  AD#confirm "Sure?"
`;

describe('parseOutline', () => {
  it('parses indentation, slot lines, inline chains, repeats, overlays', () => {
    const doc = parseOutline(OUTLINE);
    const shell = doc.roots[0];
    expect(shell.name).toBe('AppShell');
    expect(shell.slots[0].key).toBe('topNav');
    expect(shell.slots[0].value.subexpr[0].payload).toBe('Acme');

    const layout = shell.children[0];
    expect(layout.name).toBe('Layout');
    const lc = layout.children[0];
    expect(lc.name).toBe('LC');
    expect(lc.attrs[0]).toEqual(expect.objectContaining({kind: 'neg', key: 'scroll'}));

    const v = lc.children[0];
    expect(v.children[0].enumMods).toEqual(['lg']);
    const repeat = v.children[1];
    expect(repeat.kind).toBe('group');
    expect(repeat.repeat).toBe(3);
    expect(repeat.children[0].hint.name).toBe('card-callout');

    // Tbar is a sibling of V (child of LC), not swallowed by the repeat block
    expect(lc.children.map(c => c.name ?? 'group')).toEqual(['V', 'Tbar']);
    expect(doc.overlays).toHaveLength(1);
    expect(doc.overlays[0].id).toBe('confirm');
  });

  it('parses block-form slots', () => {
    const doc = parseOutline('ChL\n  composer:\n    ChC\n  ChML');
    const chl = doc.roots[0];
    expect(chl.slots[0].key).toBe('composer');
    expect(chl.slots[0].value.subexpr[0].name).toBe('ChC');
    expect(chl.children.map(c => c.name)).toEqual(['ChML']);
  });

  it('errors on a slot line with no parent component', () => {
    expect(() => parseOutline('topNav: TN')).toThrow(/no parent component/);
  });
});

// ─── form detection ────────────────────────────────────────────────────────

describe('detectForm', () => {
  it('single line → compact', () => {
    expect(detectForm('A > B + C')).toBe('compact');
  });
  it('multi-line ending in operators → compact', () => {
    expect(detectForm('A > B +\n  C > D')).toBe('compact');
  });
  it('indented multi-line → outline', () => {
    expect(detectForm('A\n  B\n  C')).toBe('outline');
  });
  it('repeat/overlays markers → outline', () => {
    expect(detectForm('V\nrepeat 2:\n  C')).toBe('outline');
  });
});

// ─── printers: round-trips ─────────────────────────────────────────────────

/** Strip positions for structural comparison. */
function shape(doc) {
  return JSON.parse(JSON.stringify(doc, (key, value) =>
    key === 'line' || key === 'col' || key === 'form' || key === 'raw' ? undefined : value));
}

const ROUND_TRIP_CASES = [
  'A > B + C',
  'V[g6] > (C{card-callout}*4) + T[striped]',
  'Ctr[h=100dvh] > C[w=400 p8] > B.primary"Sign in"',
  'A[@topNav=(TN > TNI"Home")] > L > LC[!scroll] > Tx"hi"',
  'V > B"Del"[opens=#confirm] ;; AD#confirm"Sure?"',
  'TL > Tab"Overview"! + Tab"Activity"',
];

describe('print round-trips', () => {
  for (const source of ROUND_TRIP_CASES) {
    it(`compact → compact: ${source}`, () => {
      const doc = parse(source, {form: 'compact'});
      const reparsed = parse(toCompact(doc), {form: 'compact'});
      expect(shape(reparsed)).toEqual(shape(doc));
    });

    it(`compact → outline → parse: ${source}`, () => {
      const doc = parse(source, {form: 'compact'});
      const outline = toOutline(doc);
      const reparsed = parse(outline, {form: 'outline'});
      // Outline flattens repeat-less disambiguation groups — compare the
      // outline printed from both, which is canonical.
      expect(toOutline(reparsed)).toEqual(outline);
    });
  }

  it('outline → compact → parse → outline is stable', () => {
    const doc = parseOutline(OUTLINE);
    const compact = toCompact(doc);
    const reparsed = parseCompact(compact);
    expect(toOutline(reparsed)).toEqual(toOutline(doc));
  });
});

// ─── validator (synthetic registry) ────────────────────────────────────────

function prop(name, type, required = false) {
  return {
    name, type, required,
    enumValues: parseEnumValues(type),
    isBoolean: type === 'boolean',
    isFunction: /^\(/.test(type),
    isNode: /ReactNode/.test(type),
  };
}

function makeTestRegistry() {
  const make = (name, props) => ({
    name, exportName: `XDS${name}`, dirName: name, importPath: `@xds/core/${name}`,
    props: new Map(props.map(p => [p.name, p])),
  });
  const components = new Map([
    ['AppShell', make('AppShell', [prop('contentPadding', 'SpacingStep'), prop('children', 'ReactNode'), prop('topNav', 'ReactNode')])],
    ['Stack', make('Stack', [prop('gap', 'SpacingStep'), prop('hAlign', "'start' | 'center' | 'end' | 'between'"), prop('vAlign', "'start' | 'center' | 'end'")])],
    ['Chip', make('Chip', [prop('variant', "'neutral' | 'success' | 'error'"), prop('label', 'string', true)])],
    ['Box', make('Box', [prop('isScrollable', 'boolean'), prop('children', 'ReactNode')])],
  ]);
  const aliases = new Map([['Sh', 'AppShell'], ['St', 'Stack'], ['Ch', 'Chip'], ['Bx', 'Box']]);
  return {components, aliases, componentNames: [...components.keys()]};
}

const BLOCKS = [{dirName: 'CardCallout', description: '', category: 'components/Card'}];

describe('validate', () => {
  const registry = makeTestRegistry();

  it('binds aliases, full names, and XDS-prefixed names identically', () => {
    for (const name of ['Sh', 'AppShell', 'XDSAppShell']) {
      const doc = parse(`${name}[cp6]`);
      const {errors} = validate(doc, registry, BLOCKS);
      expect(errors).toEqual([]);
      expect(doc.roots[0].bound.props.get('contentPadding')).toBe(6);
    }
  });

  it('rejects unknown components with ranked suggestions', () => {
    const doc = parse('AppShel');
    const {errors} = validate(doc, registry, BLOCKS);
    expect(errors[0].message).toMatch(/Unknown component/);
    expect(errors[0].suggestions).toContain('AppShell');
  });

  it('rejects per-component shorthand misuse and suggests the right prop', () => {
    const doc = parse('Sh[p6]');
    const {errors} = validate(doc, registry, BLOCKS);
    expect(errors[0].message).toMatch(/AppShell has no prop 'padding'/);
    expect(errors[0].suggestions).toContain('contentPadding');
  });

  it('rejects out-of-enum values, listing the legal set', () => {
    const doc = parse('St[g7]');
    const {errors} = validate(doc, registry, BLOCKS);
    expect(errors[0].message).toMatch(/must be one of 0 \| 0\.5/);
  });

  it('resolves axis-neutral j= per component axis', () => {
    const doc = parse('St[j=between]');
    const {errors} = validate(doc, registry, BLOCKS);
    expect(errors).toEqual([]);
    // synthetic Stack has no `justify`, so j= falls back to hAlign
    expect(doc.roots[0].bound.props.get('hAlign')).toBe('between');
  });

  it('resolves dot-modifiers against unique enum values, with typo help', () => {
    const ok = parse('Ch.success"Active"');
    expect(validate(ok, registry, BLOCKS).errors).toEqual([]);
    expect(ok.roots[0].bound.props.get('variant')).toBe('success');

    const bad = parse('Ch.sucess"Active"');
    const {errors} = validate(bad, registry, BLOCKS);
    expect(errors[0].suggestions).toContain('success');
  });

  it('resolves negation flags to boolean props', () => {
    const doc = parse('Bx[!scroll]');
    expect(validate(doc, registry, BLOCKS).errors).toEqual([]);
    expect(doc.roots[0].bound.props.get('isScrollable')).toBe(false);
  });

  it('rejects unknown blocks unless loose', () => {
    const doc = parse('Bx{nope-not-real}');
    expect(validate(doc, registry, BLOCKS).errors[0].message).toMatch(/Unknown block/);

    const loose = parse('Bx{nope-not-real}');
    const result = validate(loose, registry, BLOCKS, {loose: true});
    expect(result.errors).toEqual([]);
    expect(result.warnings[0].message).toMatch(/TODO placeholder/);
  });

  it('resolves block hints case/kebab-insensitively', () => {
    const doc = parse('Bx{card-callout}');
    expect(validate(doc, registry, BLOCKS).errors).toEqual([]);
    expect(doc.roots[0].hint.block.name).toBe('CardCallout');
  });

  it('includes --type block when a known block source is unavailable', () => {
    const doc = parse('Bx{card-callout}');
    expect(validate(doc, registry, BLOCKS).errors).toEqual([]);
    const result = expand(doc, registry, {
      componentName: 'Demo',
      blockModules: new Map(),
    });
    expect(result.code).toContain(
      'astryx template CardCallout --type block',
    );
  });

  it('enforces structural pairings', () => {
    const doc = parse('Bx > Sh');
    const {errors} = validate(doc, registry, BLOCKS);
    expect(errors[0].message).toMatch(/outermost/);
  });
});

// ─── registry helpers ──────────────────────────────────────────────────────

describe('parseEnumValues', () => {
  it('parses quoted string unions', () => {
    expect(parseEnumValues("'a' | 'b' | 'c'")).toEqual(['a', 'b', 'c']);
  });
  it('parses numeric unions and SpacingStep', () => {
    expect(parseEnumValues('1|2|3')).toEqual([1, 2, 3]);
    expect(parseEnumValues('SpacingStep')).toEqual(SPACING_STEPS);
  });
  it('returns null for non-enums', () => {
    expect(parseEnumValues('number | string')).toBeNull();
    expect(parseEnumValues('boolean')).toBeNull();
  });
});

// ─── compact parser depth guard ─────────────────────────────────────────────

describe('parseCompact depth guard', () => {
  it('rejects pathologically deep child chains with a located parse error', () => {
    let err;
    try {
      parseCompact('V > '.repeat(2000) + 'C');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(XLEParseError);
    expect(err.message).toMatch(/nested too deeply/);
    expect(err.line).toBe(1);
    expect(typeof err.col).toBe('number');
  });

  it('rejects deep nesting that crosses group boundaries', () => {
    expect(() =>
      parseCompact('(' + 'V > '.repeat(2000) + 'C' + ')'),
    ).toThrow(XLEParseError);
  });

  it('still parses moderately deep, realistic layouts', () => {
    expect(parseCompact('V > '.repeat(400) + 'C').roots).toHaveLength(1);
  });

  it('does not leave stale depth state after a thrown error', () => {
    try {
      parseCompact('V > '.repeat(2000) + 'C');
    } catch {
      /* expected */
    }
    expect(parse('V > C').roots[0].children.map(c => c.name)).toEqual(['C']);
  });
});
