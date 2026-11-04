// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file modalBackdrop.test.tsx
 * @input Dialog, Drawer, MobileNav and BottomSheet rendered open, and the
 *   StyleX rules vitest injects into the document (`runtimeInjection`)
 * @output Every modal `::backdrop` paints the theme's `--color-overlay` and
 *   none blurs the page, under any pointer. In forced colors, Dialog draws an
 *   edge, and Drawer and MobileNav keep their anchored-side border.
 * @position Cross-component regression test for the shared modal backdrop.
 *   jsdom has no top layer and drops `backdrop-filter`, so this test pins the
 *   declarations as StyleX hands them to the style sheet. Real browsers prove
 *   the computed colours in ModalBackdrop.a11y.browser.spec.ts.
 * SYNC: When a component gains a modal ::backdrop, add it here.
 */

import {render} from '@testing-library/react';
import type {ReactElement} from 'react';
import {beforeAll, describe, expect, it} from 'vitest';
import type {BottomSheet as BottomSheetComponent} from '../BottomSheet/BottomSheet';
import type {Dialog as DialogComponent} from '../Dialog/Dialog';
import type {Drawer as DrawerComponent} from '../Drawer/Drawer';
import type {MobileNav as MobileNavComponent} from '../MobileNav/MobileNav';

let BottomSheet: typeof BottomSheetComponent;
let Dialog: typeof DialogComponent;
let Drawer: typeof DrawerComponent;
let MobileNav: typeof MobileNavComponent;

// StyleX injects a component's rules when its module loads: record them
// first, then load the modals.
beforeAll(async () => {
  const insertRule = CSSStyleSheet.prototype.insertRule;
  CSSStyleSheet.prototype.insertRule = function (
    this: CSSStyleSheet,
    rule: string,
    index?: number,
  ) {
    rawRules.push(rule);
    return insertRule.call(this, rule, index);
  };
  ({BottomSheet} = await import('../BottomSheet/BottomSheet'));
  ({Dialog} = await import('../Dialog/Dialog'));
  ({Drawer} = await import('../Drawer/Drawer'));
  ({MobileNav} = await import('../MobileNav/MobileNav'));
});

// jsdom does not implement showModal/close on <dialog>.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal =
    HTMLDialogElement.prototype.showModal ||
    function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  HTMLDialogElement.prototype.close =
    HTMLDialogElement.prototype.close ||
    function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
});

/** Every rule StyleX inserted, as the raw text it handed to `insertRule`. */
const rawRules: string[] = [];

/**
 * The declarations that the element's StyleX classes make on its `::backdrop`,
 * by property. With `pseudo: ''`, they are the declarations on the element.
 * `where` selects the rules outside any at-rule, or inside one media query
 * alone: `(pointer: coarse)` or `(forced-colors: active)`. StyleX minifies
 * values, so the test compares them without spaces.
 */
function backdropDeclarations(
  el: Element,
  where: 'default' | 'touch' | 'forcedColors',
  pseudo = '::backdrop',
): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const className of el.className.split(/\s+/).filter(Boolean)) {
    for (const raw of rawRules) {
      let rule = raw;
      const atRules: string[] = [];
      for (let match; (match = /^(@[^{]+)\{(.*)\}$/s.exec(rule));) {
        atRules.push(match[1].trim());
        rule = match[2];
      }
      const isTouch =
        atRules.length === 1 && atRules[0] === '@media (pointer: coarse)';
      const isForcedColors =
        atRules.length === 1 && atRules[0] === '@media (forced-colors: active)';
      const matchesWhere =
        where === 'default'
          ? atRules.length === 0
          : where === 'touch'
            ? isTouch
            : isForcedColors;
      if (!matchesWhere) {
        continue;
      }
      // StyleX raises a pseudo-element rule's specificity with repeated
      // classes and `:not(#\#)`: `.x1abc.x1abc:not(#\#)…::backdrop{…}`.
      const match = new RegExp(
        `^(?:\\.${className})+(?::not\\(#\\\\#\\))*${pseudo}\\{([^}]*)\\}$`,
      ).exec(rule);
      if (match == null) {
        continue;
      }
      for (const declaration of match[1].split(';')) {
        const colon = declaration.indexOf(':');
        if (colon > 0) {
          declarations.set(
            declaration.slice(0, colon).trim(),
            declaration.slice(colon + 1).replace(/\s+/g, ''),
          );
        }
      }
    }
  }
  return declarations;
}

const modals: ReadonlyArray<[string, () => ReactElement]> = [
  [
    'Dialog',
    () => (
      <Dialog isOpen onOpenChange={() => {}} aria-label="Title">
        Content
      </Dialog>
    ),
  ],
  [
    'Drawer',
    () => (
      <Drawer isOpen onOpenChange={() => {}} label="Details">
        Content
      </Drawer>
    ),
  ],
  [
    'MobileNav',
    () => (
      <MobileNav isOpen onOpenChange={() => {}}>
        Navigation
      </MobileNav>
    ),
  ],
  [
    'BottomSheet',
    () => (
      <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
        Content
      </BottomSheet>
    ),
  ],
];

/** The modal's visible surface: the dialog, or MobileNav's drawer panel. */
function surfaceOf(name: string, dialog: Element): Element {
  // MobileNav's dialog is a transparent full-viewport container; its drawer
  // panel (the focus target, tabIndex -1) is what the person sees.
  return name === 'MobileNav'
    ? (dialog.querySelector('[tabindex="-1"]') ?? dialog)
    : dialog;
}

describe('modal backdrop', () => {
  it.each(modals)(
    '%s keeps the theme’s overlay colour under every pointer',
    (_name, element) => {
      render(element());
      const dialog = document.querySelector('dialog');
      expect(dialog).not.toBeNull();
      expect(
        backdropDeclarations(dialog!, 'default').get('background-color'),
      ).toBe('var(--color-overlay)');
      // No colour change under a finger.
      expect(
        backdropDeclarations(dialog!, 'touch').has('background-color'),
      ).toBe(false);
    },
  );

  it.each(modals)(
    '%s does not blur the page under any pointer',
    (_name, element) => {
      render(element());
      const dialog = document.querySelector('dialog');
      expect(dialog).not.toBeNull();
      expect(
        backdropDeclarations(dialog!, 'default').has('backdrop-filter'),
      ).toBe(false);
      expect(
        backdropDeclarations(dialog!, 'touch').has('backdrop-filter'),
      ).toBe(false);
    },
  );

  it('Dialog draws a border in forced colors, where no blur sets it apart', () => {
    const [, element] = modals.find(([name]) => name === 'Dialog')!;
    render(element());
    const dialog = document.querySelector('dialog');
    expect(dialog).not.toBeNull();
    const edge = backdropDeclarations(dialog!, 'forcedColors', '');
    expect(edge.get('border-width')).toBe('1px');
    expect(edge.get('border-style')).toBe('solid');
    expect(edge.get('border-color')).toBe('CanvasText');
    // Not an outline: the focus ring owns the outline longhands. An `outline`
    // shorthand loses to them in the prebuilt style sheet. Where StyleX
    // applies styles in order, the shorthand erases the ring.
    for (const where of ['default', 'touch', 'forcedColors'] as const) {
      expect(backdropDeclarations(dialog!, where, '').has('outline')).toBe(
        false,
      );
    }
  });

  it('a full-screen Dialog covers the page and draws no edge in forced colors', () => {
    render(
      <Dialog
        isOpen
        onOpenChange={() => {}}
        aria-label="Title"
        variant="fullscreen">
        Body
      </Dialog>,
    );
    const dialog = document.querySelector('dialog');
    expect(dialog).not.toBeNull();
    expect(
      backdropDeclarations(dialog!, 'forcedColors', '').has('border-width'),
    ).toBe(false);
    expect(
      backdropDeclarations(dialog!, 'default', '').get('border-width'),
    ).toMatch(/^0(px)?$/);
  });

  it.each(modals.filter(([name]) => name === 'Drawer' || name === 'MobileNav'))(
    '%s keeps its anchored-side border as the forced-colors edge, with no outline added',
    (name, element) => {
      render(element());
      const dialog = document.querySelector('dialog');
      expect(dialog).not.toBeNull();
      const surface = surfaceOf(name, dialog!);
      // The panel's side facing the page has a solid border, which forced
      // colors paint CanvasText: one 1px edge already, so no outline.
      const declarations = [
        ...backdropDeclarations(surface, 'default', '').entries(),
      ];
      expect(
        declarations.some(
          ([property, value]) =>
            /^border-inline-(start|end)-style$/.test(property) &&
            value === 'solid',
        ),
        JSON.stringify(declarations),
      ).toBe(true);
      expect(
        backdropDeclarations(surface, 'forcedColors', '').has('outline'),
      ).toBe(false);
    },
  );
});
