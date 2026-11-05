// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import manifest from '../index.mjs';
import transform from '../migrate-astryx-theme-selectors-to-data-attrs.mjs';
import {
  V054_THEME_SELECTOR_DYNAMIC_AXES,
  V054_THEME_SELECTOR_TARGETS,
} from '../migrate-astryx-theme-selectors-v0.5.4-data.mjs';

function apply(source, path = 'styles.css') {
  return transform({source, path}, {}) ?? source;
}

describe('migrate-astryx-theme-selectors-to-data-attrs', () => {
  it('carries the complete frozen v0.5.4 runtime inventory', () => {
    expect(Object.keys(V054_THEME_SELECTOR_TARGETS)).toHaveLength(186);
    expect(
      Object.values(V054_THEME_SELECTOR_TARGETS).reduce(
        (count, tokens) => count + Object.keys(tokens).length,
        0,
      ),
    ).toBe(988);
    expect(Object.keys(V054_THEME_SELECTOR_DYNAMIC_AXES).sort()).toEqual([
      'code-block',
      'code-block-header',
      'code-block-title',
      'codeblock',
      'codeblock-header',
      'codeblock-title',
      'grid',
      'metadata-list',
      'outline-item',
    ]);
  });

  it('preserves the old class arm while adding unique reflected attributes', () => {
    const input = `.astryx-button.primary.sm:hover { color: red; }
.astryx-heading.level-2 { margin: 0; }
.astryx-switch.checked { opacity: 1; }`;

    const output = apply(input);
    expect(output).toContain(
      '.astryx-button:is(.primary,[data-variant="primary"]):is(.sm,[data-size="sm"]):hover',
    );
    expect(output).toContain(
      '.astryx-heading:is(.level-2,[data-level="2"])',
    );
    expect(output).toContain(
      '.astryx-switch:is(.checked,[data-checked="checked"])',
    );
  });

  it('preserves nested at-rules, selector lists, combinators, and pseudo-elements', () => {
    const input = `@media (hover: hover) {
  @scope (.app) {
    .astryx-card.muted > .astryx-button.ghost::before,
    .astryx-progressbar.success { color: red; }
  }
}`;

    const output = apply(input);
    expect(output).toContain(
      '.astryx-card:is(.muted,[data-variant="muted"])',
    );
    expect(output).toContain(
      '.astryx-button:is(.ghost,[data-variant="ghost"])::before',
    );
    expect(output).toContain(
      '.astryx-progressbar:is(.success,[data-variant="success"])',
    );
    expect(output).toContain('@media (hover: hover)');
    expect(output).toContain('@scope (.app)');
  });

  it('migrates target/value relationships across functional pseudos', () => {
    const output = apply(`:is(.astryx-button.primary, .astryx-card.muted) {}
.astryx-button:not(.primary) {}
.astryx-button:is(.primary) {}
:is(.astryx-button).primary {}
.wrapper:has(.astryx-button.primary) {}
.astryx-button:is(.wrapper .primary) {}
:is(.astryx-button):not(.primary) {}
:is(.astryx-button):where(.primary) {}
:not(.astryx-button).primary {}
:not(:not(.astryx-button)).primary {}
:nth-child(2n of .astryx-button).primary {}
:is(.astryx-button, .other).primary {}
:where(.astryx-button, .other).primary {}
:is(.astryx-button, .other):not(.primary) {}
:is(.astryx-button, .other):where(.primary) {}
.astryx-button:nth-child(2n of .primary) {}
:is(.astryx-button):nth-child(2n of .primary) {}
.astryx-button:nth-child(2n of :is(.primary)) {}
.astryx-button:nth-last-child(2n of .primary) {}
.astryx-banner-icon:is(.info,[data-status="info"],.astryx-icon.accent) {}`);

    expect(output).toContain(
      '.astryx-button:is(.primary,[data-variant="primary"])',
    );
    expect(output).toContain(
      '.astryx-card:is(.muted,[data-variant="muted"])',
    );
    expect(output).toContain(
      '.astryx-button:not(:is(.primary,[data-variant="primary"]))',
    );
    expect(output).toContain(
      '.astryx-button:is(:is(.primary,[data-variant="primary"]))',
    );
    expect(output).toContain(
      ':is(.astryx-button):is(.primary,[data-variant="primary"])',
    );
    expect(output).toContain(
      '.wrapper:has(.astryx-button:is(.primary,[data-variant="primary"]))',
    );
    expect(output).toContain(
      '.astryx-button:is(.wrapper :is(.primary,[data-variant="primary"]))',
    );
    expect(output).toContain(
      ':is(.astryx-button):not(:is(.primary,[data-variant="primary"]))',
    );
    expect(output).toContain(
      ':is(.astryx-button):where(:is(.primary,[data-variant="primary"]))',
    );
    expect(output).toContain(
      ':not(.astryx-button):is(.primary,:where(.astryx-button)[data-variant="primary"])',
    );
    expect(output).toContain(
      ':not(:not(.astryx-button)):is(.primary,:where(.astryx-button)[data-variant="primary"])',
    );
    expect(output).toContain(
      ':nth-child(2n of .astryx-button):is(.primary,[data-variant="primary"])',
    );
    expect(output).toContain(
      ':is(.astryx-button, .other):is(.primary,:where(.astryx-button)[data-variant="primary"])',
    );
    expect(output).toContain(
      ':where(.astryx-button, .other):is(.primary,:where(.astryx-button)[data-variant="primary"])',
    );
    expect(output).toContain(
      ':is(.astryx-button, .other):not(:is(.primary,:where(.astryx-button)[data-variant="primary"]))',
    );
    expect(output).toContain(
      ':is(.astryx-button, .other):where(:is(.primary,:where(.astryx-button)[data-variant="primary"]))',
    );
    expect(output).toContain(
      '.astryx-button:nth-child(2n of :is(.primary,:where(.astryx-button)[data-variant="primary"]))',
    );
    expect(output).toContain(
      ':is(.astryx-button):nth-child(2n of :is(.primary,:where(.astryx-button)[data-variant="primary"]))',
    );
    expect(output).toContain(
      '.astryx-button:nth-child(2n of :is(:is(.primary,:where(.astryx-button)[data-variant="primary"])))',
    );
    expect(output).toContain(
      '.astryx-button:nth-last-child(2n of :is(.primary,:where(.astryx-button)[data-variant="primary"]))',
    );
    expect(output).toContain(
      '.astryx-banner-icon:is(.info,[data-status="info"],.astryx-icon:is(.accent,[data-color="accent"]))',
    );
    expect(apply(output)).toBe(output);
  });

  it('migrates selector groups in @scope preludes', () => {
    const output = apply(
      '@scope (.astryx-button.primary) to (.astryx-card:not(.muted)) { .child {} }',
    );

    expect(output).toContain(
      '@scope (.astryx-button:is(.primary,[data-variant="primary"]))',
    );
    expect(output).toContain(
      'to (.astryx-card:not(:is(.muted,[data-variant="muted"])))',
    );
  });

  it('inherits parent targets for same-element native CSS nesting', () => {
    const output = apply(`.astryx-button {
  &.primary { color: red; }
  & .primary { color: blue; }
}
:is(.astryx-button, .other) {
  &.primary { color: green; }
}`);

    expect(output).toContain(
      '&:is(.primary,[data-variant="primary"]) { color: red; }',
    );
    expect(output).toContain('& .primary { color: blue; }');
    expect(output).toContain(
      '&:is(.primary,:where(.astryx-button)[data-variant="primary"]) { color: green; }',
    );
    expect(apply(output)).toBe(output);
  });

  it('handles reversed, attribute-separated, and pseudo-separated classes', () => {
    const output = apply(`.primary.astryx-button,
.astryx-button[data-test].primary,
.astryx-button:hover.primary { color: red; }`);

    expect(output).toContain(
      ':is(.primary,[data-variant="primary"]).astryx-button',
    );
    expect(output).toContain(
      '.astryx-button[data-test]:is(.primary,[data-variant="primary"])',
    );
    expect(output).toContain(
      '.astryx-button:hover:is(.primary,[data-variant="primary"])',
    );
  });

  it('migrates escaped fractional class tokens without corrupting the value', () => {
    expect(apply('.astryx-grid.gap-0\\.5 { gap: 2px; }')).toContain(
      '.astryx-grid:is(.gap-0\\.5,[data-gap="0.5"])',
    );
  });

  it('never rewrites comments or declaration string values', () => {
    const input = `/* Old example: .astryx-button.primary */
.example { content: ".astryx-button.primary"; }
.astryx-button.primary { color: red; }`;
    const output = apply(input);

    expect(output).toContain('/* Old example: .astryx-button.primary */');
    expect(output).toContain('content: ".astryx-button.primary"');
    expect(output).toContain(
      '.astryx-button:is(.primary,[data-variant="primary"])',
    );
  });

  it('keeps consumer className matching while adding the prop attribute arm', () => {
    const output = apply(
      '.astryx-button.primary.my-consumer-class { color: red; }',
    );

    expect(output).toContain(
      '.astryx-button:is(.primary,[data-variant="primary"]).my-consumer-class',
    );
    expect(output).toContain('.primary');
    expect(output).not.toContain('TODO(astryx upgrade)');
  });

  it('preserves every old match for a value shared by multiple prop axes', () => {
    const output = apply('.astryx-grid.center { place-content: center; }');

    expect(output).toContain(
      '.astryx-grid:is(.center,[data-align="center"],[data-justify="center"])',
    );
    expect(output).toContain('.center');
    expect(output).not.toContain('TODO(astryx upgrade)');
  });

  it('leaves unknown custom values and unqualified classes unchanged', () => {
    const output = apply(
      '.astryx-button.brand { color: red; }\n.primary { color: blue; }',
    );

    expect(output).toContain('.astryx-button.brand');
    expect(output).toContain('.primary { color: blue; }');
    expect(output).not.toContain('TODO(astryx upgrade)');
  });

  it('ignores JavaScript and TypeScript rather than rewriting quoted strings', () => {
    const source = 'const selector = ".astryx-button.primary";';
    expect(apply(source, 'selectors.ts')).toBe(source);
    expect(apply(source, 'selectors.js')).toBe(source);
  });

  it('leaves repeated target classes unchanged for specificity', () => {
    const input =
      '.astryx-app-shell-sidenav.astryx-app-shell-sidenav { width: 20rem; }';
    expect(apply(input)).toBe(input);
  });

  it.each([
    [
      '.astryx-avatar-group.lg',
      '.astryx-avatar-group:is(.lg,[data-size="lg"])',
    ],
    [
      '.astryx-chat-message-bubble.assistant',
      '.astryx-chat-message-bubble:is(.assistant,[data-sender="assistant"])',
    ],
    [
      '.astryx-toolbar.md',
      '.astryx-toolbar:is(.md,[data-size="md"])',
    ],
    [
      '.astryx-code-block.javascript',
      '.astryx-code-block:is(.javascript,[data-language="javascript"])',
    ],
    [
      '.astryx-grid.columns-3',
      '.astryx-grid:is(.columns-3,[data-columns="3"])',
    ],
    [
      '.astryx-outline-item.level-9',
      '.astryx-outline-item:is(.level-9,[data-level="9"])',
    ],
    [
      '.astryx-metadata-list.columns-5',
      '.astryx-metadata-list:is(.columns-5,[data-columns="5"])',
    ],
    [
      '.astryx-alert-dialog.standard',
      '.astryx-alert-dialog:is(.standard,[data-variant="standard"])',
    ],
    [
      '.astryx-chat-send-button.primary',
      '.astryx-chat-send-button:is(.primary,[data-variant="primary"])',
    ],
    [
      '.astryx-input-clear-icon.secondary',
      '.astryx-input-clear-icon:is(.secondary,[data-color="secondary"])',
    ],
    [
      '.astryx-dropdown-menu-divider.horizontal',
      '.astryx-dropdown-menu-divider:is(.horizontal,[data-orientation="horizontal"])',
    ],
    [
      '.astryx-list-item.spacious',
      '.astryx-list-item:is(.spacious,[data-density="spacious"])',
    ],
    [
      '.astryx-selectable-card.false',
      '.astryx-selectable-card:is(.false,[data-selected="false"])',
    ],
    [
      '.astryx-selector-check.disabled',
      '.astryx-selector-check:is(.disabled,[data-color="disabled"],[data-disabled="disabled"])',
    ],
  ])('covers the exact v0.5.4 callsite mapping %s', (input, expected) => {
    expect(apply(`${input} { color: red; }`)).toContain(expected);
  });

  it('combines static and dynamic candidates from the same v0.5.4 token', () => {
    expect(apply('.astryx-code-block.sm {}')).toContain(
      '.astryx-code-block:is(.sm,[data-size="sm"],[data-language="sm"])',
    );
  });

  it('preserves both possible language values for digit-prefixed legacy tokens', () => {
    expect(apply('.astryx-code-block.language-123 {}')).toContain(
      '.astryx-code-block:is(.language-123,[data-language="language-123"],[data-language="123"])',
    );
  });

  it('does not invent attributes for classes v0.5.4 never emitted', () => {
    const input = `.astryx-toolbar.size {}
.astryx-resize-handle.horizontal {}`;
    expect(apply(input)).toBe(input);
  });

  it.each([
    [
      '.astryx-text.code',
      '.astryx-text:is(.code,[data-type="code"])',
    ],
    [
      '.astryx-layout.fill',
      '.astryx-layout:is(.fill,[data-height="fill"])',
    ],
    [
      '.astryx-side-nav-item.selected',
      '.astryx-side-nav-item:is(.selected,[data-selected="selected"])',
    ],
    [
      '.astryx-radio-list.horizontal',
      '.astryx-radio-list:is(.horizontal,[data-orientation="horizontal"])',
    ],
    [
      '.astryx-top-nav-item.selected',
      '.astryx-top-nav-item:is(.selected,[data-selected="selected"])',
    ],
    [
      '.astryx-segmented-control-item.selected',
      '.astryx-segmented-control-item:is(.selected,[data-selected="selected"])',
    ],
  ])('rewrites the real-world mapping %s', (input, expected) => {
    expect(apply(`${input} { color: red; }`)).toContain(expected);
  });

  it('is byte-idempotent after behavior-preserving migrations', () => {
    const input = `.astryx-button.primary.my-class { color: red; }
.astryx-grid.center { place-content: center; }`;
    const once = apply(input);
    expect(apply(once)).toBe(once);
  });

  it('is a normal, non-optional next-release transform', () => {
    const entry = manifest.find(
      candidate =>
        candidate.name === 'migrate-astryx-theme-selectors-to-data-attrs',
    );
    expect(entry).toBeDefined();
    expect(entry?.optional).not.toBe(true);
  });
});
