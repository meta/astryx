// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.forcedColorsEdge.test.tsx
 * @input Button inside a ButtonGroup, and the CSS rules StyleX injects
 * @output Proof that a grouped `destructive` Button's forced-colors edge is
 *   `CanvasText` on every side it draws, never `ButtonText`
 * @position Unit evidence for Button AR7. Published CSS orders longhands after
 *   shorthands, so a `ButtonText` longhand would win over the variant's
 *   `CanvasText` shorthand there even when the Storybook build hides it.
 */

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Button} from './Button';
import {ButtonGroup} from '../ButtonGroup';

function collectCssText(): string {
  let out = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        out += rule.cssText + '\n';
      }
    } catch {
      // A cross-origin sheet has no readable rules.
    }
  }
  return (
    out +
    Array.from(document.querySelectorAll('style'))
      .map(s => s.textContent || '')
      .join('\n')
  );
}

/** Each `border-*-color` declaration in the forced-colors rules of `el`. */
function forcedBorderColors(el: Element): string[] {
  const css = collectCssText();
  const media = Array.from(
    css.matchAll(/@media \(forced-colors: active\)\s*\{([\s\S]*?\})\s*\}/g),
    m => m[1],
  ).join('\n');
  return Array.from(el.classList).flatMap(cls =>
    Array.from(
      media.matchAll(
        new RegExp(`\\.${cls}(?![0-9a-z_-])[^{]*\\{([^}]*)\\}`, 'gi'),
      ),
      m => m[1],
    )
      .join(';')
      .split(';')
      .map(d => d.replace(/\s+/g, ''))
      .filter(d => /^border(-[a-z]+)*-color:/.test(d)),
  );
}

describe.each(['horizontal', 'vertical'] as const)(
  'a destructive Button in a %s ButtonGroup, in forced colors',
  orientation => {
    it('draws its edge in CanvasText, never ButtonText', () => {
      render(
        <ButtonGroup orientation={orientation} label="Actions">
          <Button label="Keep" />
          <Button label="Delete" variant="destructive" />
        </ButtonGroup>,
      );
      const colors = forcedBorderColors(
        screen.getByRole('button', {name: 'Delete'}),
      );
      expect(colors.length).toBeGreaterThan(0);
      expect(colors.filter(d => /ButtonText/i.test(d))).toEqual([]);
      expect(colors.some(d => /CanvasText/i.test(d))).toBe(true);
    });
  },
);

it('keeps ButtonText on a grouped primary Button', () => {
  render(
    <ButtonGroup label="Actions">
      <Button label="Save" variant="primary" />
      <Button label="Publish" variant="primary" />
    </ButtonGroup>,
  );
  const colors = forcedBorderColors(
    screen.getByRole('button', {name: 'Publish'}),
  );
  expect(colors.some(d => /ButtonText/i.test(d))).toBe(true);
  expect(colors.filter(d => /CanvasText/i.test(d))).toEqual([]);
});
