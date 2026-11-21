// Copyright (c) Meta Platforms, Inc. and affiliates.

import {getIconRegistry} from '@astryxdesign/core/Icon';
import {describe, expect, it} from 'vitest';
import {
  coerceDefault,
  coerceEnumOption,
  parsePropType,
} from '../components/component-detail/parsePropType';
import {isSupportedProp} from '../app/playground/propertyEditor/isSupportedProp';

describe('component detail prop controls', () => {
  it('treats InputStatus as an editable status object control', () => {
    expect(parsePropType('InputStatus', 'status')).toEqual({
      kind: 'input-status',
      options: ['error', 'warning', 'success'],
      allowEmpty: true,
    });
  });

  it('treats inline status object types as editable status object controls', () => {
    expect(
      parsePropType(
        "{ type: 'error' | 'warning' | 'success', message: string }",
        'status',
      ),
    ).toEqual({
      kind: 'input-status',
      options: ['error', 'warning', 'success'],
      allowEmpty: true,
    });
  });

  it('preserves narrower inline status option unions', () => {
    expect(
      parsePropType(
        "{ type: 'error' | 'warning'; message?: string }",
        'status',
      ),
    ).toEqual({
      kind: 'input-status',
      options: ['error', 'warning'],
      allowEmpty: true,
    });
  });

  it('does not confuse delivery status unions for input status objects', () => {
    expect(
      parsePropType(
        "'sending' | 'sent' | 'delivered' | 'read' | 'error'",
        'status',
      ),
    ).toEqual({
      kind: 'enum',
      options: ['sending', 'sent', 'delivered', 'read', 'error'],
      allowEmpty: false,
    });
  });

  it('keeps input status props as status controls even if slot elements are present', () => {
    expect(
      parsePropType('XDSInputStatus', 'status', [
        {
          __element: 'XDSFieldStatus',
          props: {type: 'error', message: 'Error'},
        },
      ]),
    ).toEqual({
      kind: 'input-status',
      options: ['error', 'warning', 'success'],
      allowEmpty: true,
    });
  });

  it('expands mixed string-literal and boolean unions into enum options', () => {
    const control = parsePropType("'auto' | boolean", 'hasHoverIndication');

    expect(control).toMatchObject({
      kind: 'enum',
      options: ['auto', 'true', 'false'],
      allowEmpty: false,
    });
    if (control.kind === 'enum') {
      expect(coerceEnumOption(control, 'auto')).toBe('auto');
      expect(coerceEnumOption(control, 'true')).toBe(true);
      expect(coerceEnumOption(control, 'false')).toBe(false);
      expect(coerceDefault('true', control)).toBe(true);
      expect(coerceDefault('false', control)).toBe(false);
      expect(coerceDefault("'auto'", control)).toBe('auto');
    }
  });

  it('gives a SyntaxThemeDefinition prop the syntax theme preset control', () => {
    expect(parsePropType('SyntaxThemeDefinition', 'theme')).toEqual({
      kind: 'syntax-theme',
    });
  });

  it('derives IconType options from the canonical icon registry', () => {
    const control = parsePropType('IconType', 'labelIcon');

    expect(control).toMatchObject({
      kind: 'enum',
      allowEmpty: true,
    });
    if (control.kind === 'enum') {
      expect(control.options).toEqual(Object.keys(getIconRegistry()));
    }
  });

  /**
   * Inlining a union into a doc's `type` changes what control the playground
   * renders for it (#1645). For most props that is an improvement — an
   * unknown type becomes a real enum picker. For two it would be a
   * regression, and those two are deliberately left naming their type. These
   * assertions pin both halves of that bargain so a later "let's finish the
   * job and inline the last few" cannot quietly break the preview.
   */
  describe('inlining a union does not degrade the playground control (#1645)', () => {
    it('leaves SpacingStep exactly as it was — same enum, before and after', () => {
      const inlined = '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10';
      const expected = {
        kind: 'enum',
        options: ['0', '0.5', '1', '1.5', '2', '3', '4', '5', '6', '8', '10'],
        allowEmpty: false,
      };
      // SpacingStep is special-cased in parsePropType, so both spellings must
      // land on the identical descriptor — the docs change is a no-op here.
      expect(parsePropType('SpacingStep', 'gap')).toEqual(expected);
      expect(parsePropType(inlined, 'gap')).toEqual(expected);
      expect(parsePropType(inlined, 'gap')).toEqual(
        parsePropType('SpacingStep', 'gap'),
      );
    });

    it('upgrades GridAlignment, TextSize and TextType from unknown to enum', () => {
      // Named, these are opaque: no control at all. Inlined, they become
      // pickers — the whole point of the change.
      expect(parsePropType('GridAlignment', 'align')).toEqual({
        kind: 'unknown',
      });
      expect(
        parsePropType("'start' | 'center' | 'end' | 'stretch'", 'align'),
      ).toEqual({
        kind: 'enum',
        options: ['start', 'center', 'end', 'stretch'],
        allowEmpty: false,
      });

      expect(parsePropType('TextSize', 'size')).toEqual({kind: 'unknown'});
      expect(
        parsePropType(
          "'4xs' | '3xs' | '2xs' | 'xsm' | 'sm' | 'base' | 'lg' | 'xl' | " +
            "'2xl' | '3xl' | '4xl'",
          'size',
        ),
      ).toMatchObject({kind: 'enum', allowEmpty: false});

      expect(parsePropType('TextType', 'type')).toEqual({kind: 'unknown'});
      const textType = parsePropType(
        "'body' | 'large' | 'label' | 'supporting' | 'code' | 'display-1' | " +
          "'display-2' | 'display-3' | 'inherit'",
        'type',
      );
      expect(textType).toMatchObject({kind: 'enum', allowEmpty: false});
      if (textType.kind === 'enum') {
        // 'inherit' is one of the latent doc bugs this change fixed.
        expect(textType.options).toContain('inherit');
      }
    });

    it('hides AppShell.mobileNav, and the gate is the exact type string', () => {
      // Production never asks parsePropType about this prop without its
      // slotElements (PropertyEditor passes all three arguments), so assert on
      // the gate the editor actually uses rather than on a call shape it never
      // makes.
      const slotElements = [{__element: 'MobileNav', props: {}}];
      const prop = (type: string) => ({
        name: 'mobileNav',
        type,
        description: '',
        slotElements,
      });

      expect(isSupportedProp(prop('ReactNode'))).toBe(false);

      // Widening to the true union drops the UNSUPPORTED_PROP_TYPES
      // exact-string match. The prop survives that only because slotElements
      // independently resolves it to a non-editable `element` control — a
      // second gate, not the one the doc leans on. Keep the bare `ReactNode`
      // so the hide never depends on that coincidence.
      const widened =
        "false | {hasToggle?: boolean, breakpoint?: 'sm' | 'md' | 'lg' | 'none'} | ReactNode";
      expect(parsePropType(widened, 'mobileNav', slotElements)).toMatchObject({
        kind: 'element',
      });
      expect(isSupportedProp(prop(widened))).toBe(false);
    });

    it('keeps Lightbox.media naming its type, because the real shape yields a string control', () => {
      // Named, it stays unknown and uneditable, so the preview keeps receiving
      // a real object.
      expect(parsePropType('LightboxMedia | LightboxMedia[]', 'media')).toEqual(
        {kind: 'unknown'},
      );
      // Spelled out, the shape carries LightboxMedia's real `caption?:
      // ReactNode` (Lightbox.tsx). That trips NODE_TYPE_RE, the prop becomes an
      // *editable string*, and the editor hands the preview raw text where a
      // media object belongs. Assert that exact bad outcome — a bare "not an
      // enum" would pass for `unknown` too, and so could never catch it.
      expect(
        parsePropType(
          "{src: string, alt: string, caption?: ReactNode, type?: 'image' | 'video'}",
          'media',
        ),
      ).toEqual({kind: 'string'});
    });
  });
});
