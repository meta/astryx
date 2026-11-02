// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonGroup.test.tsx
 * @input Uses vitest, @testing-library/react, @babel/core + @stylexjs/babel-plugin,
 *   ButtonGroup and Button components
 * @output Unit tests for ButtonGroup, incl. the compiled-CSS contract for the
 *   trailing radius (#2508): compiled selector shape and membership; corners
 *   in ButtonGroupCorners.interaction.browser.spec.ts
 * @position Testing; validates ButtonGroup component implementation
 *
 * SYNC: When ButtonGroup component changes, update tests to match new behavior
 */

import {describe, it, expect} from 'vitest';
import type {ReactNode} from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {transformSync} from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {ButtonGroup} from './ButtonGroup';
import {Button} from '../Button';
import {IconButton} from '../IconButton';
import {DropdownMenu} from '../DropdownMenu';
import {Tooltip} from '../Tooltip';
import {HoverCard} from '../HoverCard';

describe('ButtonGroup', () => {
  it('renders a group with aria-label', () => {
    render(
      <ButtonGroup label="Actions">
        <Button label="Copy" />
        <Button label="Cut" />
        <Button label="Paste" />
      </ButtonGroup>,
    );

    const group = screen.getByRole('group');
    expect(group).toBeInTheDocument();
    expect(group).toHaveAttribute('aria-label', 'Actions');
  });

  it('renders all child buttons', () => {
    render(
      <ButtonGroup label="Actions">
        <Button label="Copy" />
        <Button label="Cut" />
        <Button label="Paste" />
      </ButtonGroup>,
    );

    expect(screen.getByRole('button', {name: 'Copy'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Cut'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Paste'})).toBeInTheDocument();
  });

  it('works with IconButton children', () => {
    render(
      <ButtonGroup label="Text formatting">
        <IconButton
          label="Bold"
          icon={<span data-testid="bold-icon">B</span>}
        />
        <IconButton
          label="Italic"
          icon={<span data-testid="italic-icon">I</span>}
        />
      </ButtonGroup>,
    );

    expect(screen.getByRole('button', {name: 'Bold'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Italic'})).toBeInTheDocument();
  });

  it('applies data-testid', () => {
    render(
      <ButtonGroup label="Actions" data-testid="my-group">
        <Button label="Copy" />
      </ButtonGroup>,
    );

    expect(screen.getByTestId('my-group')).toBeInTheDocument();
  });

  it('forwards ref to the root element', () => {
    let refValue: HTMLDivElement | null = null;
    render(
      <ButtonGroup
        label="Actions"
        ref={el => {
          refValue = el;
        }}>
        <Button label="Copy" />
      </ButtonGroup>,
    );

    expect(refValue).toBeInstanceOf(HTMLDivElement);
    expect(refValue).toBe(screen.getByRole('group'));
  });

  it('reflects orientation via data-orientation, not aria-orientation', () => {
    // aria-orientation is not a valid ARIA attribute on role="group"; the
    // orientation is exposed through data-orientation instead.
    const {rerender} = render(
      <ButtonGroup label="Actions">
        <Button label="Copy" />
      </ButtonGroup>,
    );

    let group = screen.getByRole('group');
    expect(group).not.toHaveAttribute('aria-orientation');
    expect(group).toHaveAttribute('data-orientation', 'horizontal');

    rerender(
      <ButtonGroup label="Actions" orientation="vertical">
        <Button label="Copy" />
      </ButtonGroup>,
    );

    group = screen.getByRole('group');
    expect(group).not.toHaveAttribute('aria-orientation');
    expect(group).toHaveAttribute('data-orientation', 'vertical');
  });

  it('renders with vertical orientation', () => {
    render(
      <ButtonGroup label="Actions" orientation="vertical">
        <Button label="Copy" />
        <Button label="Cut" />
      </ButtonGroup>,
    );

    const group = screen.getByRole('group');
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Copy'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Cut'})).toBeInTheDocument();
  });

  it('renders with different sizes', () => {
    const {rerender} = render(
      <ButtonGroup label="Actions" size="sm">
        <Button label="Copy" />
      </ButtonGroup>,
    );
    expect(screen.getByRole('button', {name: 'Copy'})).toBeInTheDocument();

    rerender(
      <ButtonGroup label="Actions" size="lg">
        <Button label="Copy" />
      </ButtonGroup>,
    );
    expect(screen.getByRole('button', {name: 'Copy'})).toBeInTheDocument();
  });

  it('disables all buttons when isDisabled is true', () => {
    render(
      <ButtonGroup label="Actions" isDisabled>
        <Button label="Copy" />
        <Button label="Cut" />
      </ButtonGroup>,
    );

    expect(screen.getByRole('group')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', {name: 'Copy'})).toBeDisabled();
    expect(screen.getByRole('button', {name: 'Cut'})).toBeDisabled();
  });

  it('does not set aria-disabled when not disabled', () => {
    render(
      <ButtonGroup label="Actions">
        <Button label="Copy" />
      </ButtonGroup>,
    );

    expect(screen.getByRole('group')).not.toHaveAttribute('aria-disabled');
  });

  it('renders a single button without errors', () => {
    render(
      <ButtonGroup label="Actions">
        <Button label="Copy" />
      </ButtonGroup>,
    );

    expect(screen.getByRole('button', {name: 'Copy'})).toBeInTheDocument();
  });

  it('renders mixed Button and IconButton children', () => {
    render(
      <ButtonGroup label="Edit actions">
        <Button label="Edit" />
        <IconButton label="More options" icon={<span>▼</span>} />
      </ButtonGroup>,
    );

    expect(screen.getByRole('button', {name: 'Edit'})).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'More options'}),
    ).toBeInTheDocument();
  });

  // ===========================================================================
  // Trailing radius (issue #2508)
  //
  // The trailing end cap cannot be keyed off `:last-child`: members render an
  // invisible layer infrastructure AFTER their button (tooltip'd Button,
  // DropdownMenu), and useLayer renders a marker plus the layer inline when the
  // host is safe, so they steal the slot. See IS_LAST_ITEM in Button.tsx.
  //
  // WHAT THESE TESTS CHECK, AND WHERE THE CORNERS ARE CHECKED
  // The trailing predicate is `:nth-last-child(1 of S)` (S = not a layer
  // piece), which jsdom evaluates slowly and wrongly, so jsdom never receives
  // it (internal/test-utils/src/setup.ts). Here, `compileButtonRules()` runs
  // the REAL StyleX babel plugin over Button.tsx and asserts the compiled
  // trailing selector's shape (layer-skipping, never `:last-child`), and the
  // DOM tests assert MEMBERSHIP: which element is the group's last member,
  // with the layer pieces after it. Which corners actually round is checked in
  // a real browser by ButtonGroupCorners.interaction.browser.spec.ts
  // (ButtonGroup FR3).
  // ===========================================================================
  describe('trailing radius (#2508)', () => {
    /** The group members, in DOM order (excludes invisible layer siblings). */
    const items = (group: HTMLElement): Element[] =>
      Array.from(
        group.querySelectorAll(
          ':scope > *:not([popover]):not(template):not(dialog)',
        ),
      );

    /** The element is the group's last member (layer pieces may follow it). */
    const isLastMember = (group: HTMLElement, el: Element): boolean =>
      items(group).at(-1) === el;

    // -- Compiled CSS, read from the source -----------------------------------

    /** One atomic StyleX rule, parsed out of the plugin's emitted CSS. */
    type CompiledRule = {
      /** Atomic class name, e.g. `xp0wexf`. */
      className: string;
      /** Selector text after the class, e.g. `:first-child`. '' if unconditional. */
      condition: string;
      /** CSS property, e.g. `border-start-end-radius`. */
      property: string;
      /** CSS value, e.g. `var(--radius-element)`. */
      value: string;
      /** The full compiled selector, e.g. `.xp0wexf:nth-last-child(1 of …)`. */
      selector: string;
    };

    /**
     * Compiles Button.tsx with the real StyleX babel plugin and returns its
     * atomic rules. This is the CSS the browser actually gets — the whole point
     * is that the trailing-radius predicate comes from the SOURCE, never from a
     * string retyped in this file.
     */
    function compileButtonRules(): CompiledRule[] {
      const repoRoot = path.resolve(__dirname, '../../../..');
      const buttonSrc = path.resolve(__dirname, '../Button/Button.tsx');
      // Babel looks bare preset names up from the cwd, the repo root, which
      // does not declare them. Resolve them from this package, which does.
      const require = createRequire(__filename);

      const result = transformSync(readFileSync(buttonSrc, 'utf8'), {
        babelrc: false,
        configFile: false,
        filename: buttonSrc,
        presets: [
          [
            require.resolve('@babel/preset-typescript'),
            {isTSX: true, allExtensions: true},
          ],
          [require.resolve('@babel/preset-react'), {runtime: 'automatic'}],
        ],
        plugins: [
          [
            stylexBabelPlugin,
            {
              dev: false,
              runtimeInjection: false,
              genConditionalClasses: true,
              treeshakeCompensation: true,
              unstable_moduleResolution: {type: 'commonJS', rootDir: repoRoot},
            },
          ],
        ],
      });

      const rules =
        (result?.metadata as {stylex?: [string, {ltr: string}, number][]})
          ?.stylex ?? [];

      return rules.flatMap(([, {ltr}]) => {
        // Plain atomic rules only: `.cls<condition>{prop:value}`. @media-wrapped
        // rules are irrelevant to the radius contract.
        const parsed = /^\.([\w-]+)([^{]*)\{([\w-]+):(.+)\}$/.exec(ltr);
        if (!parsed) {
          return [];
        }
        const [, className, condition, property, value] = parsed;
        return [
          {
            className,
            condition,
            property,
            value,
            selector: `.${className}${condition}`,
          },
        ];
      });
    }

    const COMPILED = compileButtonRules();

    /** A rounded (non-zero) corner is exactly this value in the compiled CSS. */
    const ROUNDED = 'var(--radius-element)';

    /** The two corners on the group's trailing edge — pure geometry. */
    const TRAILING_CORNERS = {
      horizontal: ['border-end-end-radius', 'border-start-end-radius'],
      vertical: ['border-end-end-radius', 'border-end-start-radius'],
    } as const;

    /** The two corners on the group's leading edge — pure geometry. */
    const LEADING_CORNERS = {
      horizontal: ['border-end-start-radius', 'border-start-start-radius'],
      vertical: ['border-start-end-radius', 'border-start-start-radius'],
    } as const;

    type Orientation = keyof typeof TRAILING_CORNERS;

    /**
     * The compiled rules that ROUND `corners` and are actually applied to `el`
     * (its class list carries them). StyleX emits the `default: 0` class and the
     * conditional class on every member, so this returns the same rules for any
     * member of the group — which rule *wins* is decided by the selector, and
     * that is what the tests below assert against the DOM.
     */
    const roundingRules = (
      el: Element,
      corners: ReadonlyArray<string>,
    ): CompiledRule[] =>
      COMPILED.filter(
        rule =>
          corners.includes(rule.property) &&
          rule.value === ROUNDED &&
          el.classList.contains(rule.className),
      );

    /** The compiled selectors that round `el`'s trailing corners. */
    const trailingRoundingSelectors = (
      el: Element,
      orientation: Orientation,
    ): string[] => {
      const rules = roundingRules(el, TRAILING_CORNERS[orientation]);
      // Guard against a vacuous pass: both trailing corners must be accounted
      // for, or the assertions below would be quantifying over an empty set.
      expect(rules.map(rule => rule.property).sort()).toEqual([
        ...TRAILING_CORNERS[orientation],
      ]);
      return rules.map(rule => rule.selector);
    };

    /** `el` carries both trailing-corner rounding rules (StyleX classes). */
    const carriesTrailingRule = (
      el: Element,
      orientation: Orientation = 'horizontal',
    ): boolean => trailingRoundingSelectors(el, orientation).length === 2;

    // -- The compiled CSS contract --------------------------------------------

    it.each(['horizontal', 'vertical'] as const)(
      'keys the trailing radius off layer-skipping, not :last-child (%s)',
      orientation => {
        render(
          <ButtonGroup label="Actions" orientation={orientation}>
            <Button label="Save" />
          </ButtonGroup>,
        );

        const save = screen.getByRole('button', {name: 'Save'});
        const selectors = trailingRoundingSelectors(save, orientation);

        for (const selector of selectors) {
          // `:last-child` is the bug: an inline layer element steals the slot.
          expect(selector).not.toMatch(/:last-child/);
          // The last sibling that is not a layer piece, written so WebKit
          // does not re-evaluate it per sibling on every insertion (#9281).
          expect(selector).toContain(':nth-last-child(1 of ');
          expect(selector).not.toContain(':has(');
          // `[popover]` must survive compilation *verbatim*. StyleX only
          // statically evaluates a selector key from a same-file const; from a
          // .stylex.ts file it compiles to a mangled selector like `[x13pbwiz]`
          // that matches nothing in the DOM.
          expect(selector).toContain('[popover]');
          expect(selector).toContain('template');
          expect(selector).toContain('dialog');
        }
      },
    );

    it.each(['horizontal', 'vertical'] as const)(
      'still rounds the leading corners off :first-child (%s)',
      orientation => {
        render(
          <ButtonGroup label="Actions" orientation={orientation}>
            <Button label="Save" />
            <Button label="More" tooltip="More options" />
          </ButtonGroup>,
        );

        const save = screen.getByRole('button', {name: 'Save'});
        const more = screen.getByRole('button', {name: 'More'});
        const rules = roundingRules(save, LEADING_CORNERS[orientation]);

        expect(rules.map(rule => rule.property).sort()).toEqual([
          ...LEADING_CORNERS[orientation],
        ]);
        for (const {condition, selector} of rules) {
          // The leading edge is genuinely safe on :first-child — a member's
          // button always precedes its own layer.
          expect(condition).toBe(':first-child');
          expect(save.matches(selector)).toBe(true);
          expect(more.matches(selector)).toBe(false);
        }
      },
    );

    // -- The compiled CSS, matched against the real DOM ------------------------

    it.each(['horizontal', 'vertical'] as const)(
      'rounds a tooltip’d trailing Button, whose layer follows it in the DOM (%s)',
      orientation => {
        render(
          <ButtonGroup label="Actions" orientation={orientation}>
            <Button label="Save" />
            <Button label="More" tooltip="More options" />
          </ButtonGroup>,
        );

        const group = screen.getByRole('group');
        const save = screen.getByRole('button', {name: 'Save'});
        const more = screen.getByRole('button', {name: 'More'});

        // Precondition: the tooltip layer really is an inline DOM sibling that
        // follows the button — this is exactly what broke `:last-child`.
        expect(more).not.toBe(group.lastElementChild);
        expect(items(group).at(-1)).toBe(more);

        expect(carriesTrailingRule(more, orientation)).toBe(true);
        expect(isLastMember(group, more)).toBe(true);
        expect(isLastMember(group, save)).toBe(false);
      },
    );

    it.each(['horizontal', 'vertical'] as const)(
      'rounds a trailing DropdownMenu trigger, whose popover follows it (%s)',
      orientation => {
        render(
          <ButtonGroup label="Approve action" orientation={orientation}>
            <Button label="Allow once" variant="primary" />
            <DropdownMenu
              button={{label: 'Allow options', variant: 'primary'}}
              items={[{label: 'Always allow'}]}
            />
          </ButtonGroup>,
        );

        const group = screen.getByRole('group');
        const allow = screen.getByRole('button', {name: 'Allow once'});
        const trigger = screen.getByRole('button', {name: 'Allow options'});

        // The popover surface is an inline sibling after the trigger.
        expect(trigger).not.toBe(group.lastElementChild);
        expect(items(group).at(-1)).toBe(trigger);

        expect(carriesTrailingRule(trigger, orientation)).toBe(true);
        expect(isLastMember(group, trigger)).toBe(true);
        expect(isLastMember(group, allow)).toBe(false);
      },
    );

    it('rounds a trailing link (<a>) member with a tooltip', () => {
      render(
        <ButtonGroup label="Actions">
          <Button label="Save" />
          <Button label="Docs" href="https://example.com" tooltip="Open docs" />
        </ButtonGroup>,
      );

      const group = screen.getByRole('group');
      const link = screen.getByRole('link', {name: 'Docs'});

      expect(link.tagName).toBe('A');
      expect(link).not.toBe(group.lastElementChild);
      expect(items(group).at(-1)).toBe(link);

      expect(carriesTrailingRule(link)).toBe(true);
      expect(isLastMember(group, link)).toBe(true);
    });

    it('rounds only the last member (first/middle/last)', () => {
      render(
        <ButtonGroup label="Actions">
          <Button label="First" />
          <Button label="Middle" tooltip="Middle tip" />
          <DropdownMenu
            button={{label: 'Last'}}
            items={[{label: 'An option'}]}
          />
        </ButtonGroup>,
      );

      const group = screen.getByRole('group');
      const [first, middle, last] = items(group);

      expect([first, middle, last].map(el => el.textContent)).toEqual([
        'First',
        'Middle',
        'Last',
      ]);

      // Middle has a tooltip layer after it, but a *marked* sibling follows too,
      // so it must NOT take the trailing radius.
      expect(isLastMember(group, first)).toBe(false);
      expect(isLastMember(group, middle)).toBe(false);
      expect(isLastMember(group, last)).toBe(true);
    });

    it('rounds both edges of a lone tooltip’d member', () => {
      render(
        <ButtonGroup label="Actions">
          <Button label="Only" tooltip="The only one" />
        </ButtonGroup>,
      );

      const group = screen.getByRole('group');
      const only = screen.getByRole('button', {name: 'Only'});

      // Leading edge is unaffected: a member's button always precedes its layer.
      expect(only.matches(':first-child')).toBe(true);
      expect(only).not.toBe(group.lastElementChild);
      expect(isLastMember(group, only)).toBe(true);
    });

    // -- Members the group does not recognise ---------------------------------
    //
    // The trailing predicate must stay CONSERVATIVE: a sibling the group does
    // not understand is still a member. Otherwise the button BEFORE it wrongly
    // takes the trailing radius and renders as a rounded notch mid-group —
    // worse than the bug being fixed, because it is silent and visual.

    it('does not round the preceding button when a Tooltip-wrapped member follows', () => {
      render(
        <ButtonGroup label="Actions">
          <Button label="Save" />
          <Tooltip content="Rich tip">
            <Button label="More" />
          </Tooltip>
        </ButtonGroup>,
      );

      const group = screen.getByRole('group');
      const save = screen.getByRole('button', {name: 'Save'});

      // Tooltip wraps element children in a `display: contents` <div>, so the
      // inner Button is a DESCENDANT of the wrapper, not a DOM sibling of Save.
      expect(isLastMember(group, save)).toBe(false);
    });

    it('does not round the preceding button when a HoverCard-wrapped member follows', () => {
      render(
        <ButtonGroup label="Actions">
          <Button label="Save" />
          <HoverCard content="Preview">
            <Button label="More" />
          </HoverCard>
        </ButtonGroup>,
      );

      const group = screen.getByRole('group');
      const save = screen.getByRole('button', {name: 'Save'});

      // Button has no `hoverCard` prop, so wrapping is the ONLY way to put a
      // HoverCard on a group button — this composition has no alternative.
      expect(isLastMember(group, save)).toBe(false);
    });

    it('does not round the preceding button when a raw <button> follows', () => {
      render(
        <ButtonGroup label="Actions">
          <Button label="Save" />
          <button type="button">Custom</button>
        </ButtonGroup>,
      );

      const group = screen.getByRole('group');
      const save = screen.getByRole('button', {name: 'Save'});

      expect(isLastMember(group, save)).toBe(false);
    });
  });

  describe('elevation', () => {
    it('renders a distinct class on the group for each elevation level', () => {
      const classFor = (elevation: 'none' | 'low' | 'med' | 'high') => {
        const {container} = render(
          <ButtonGroup label="Actions" elevation={elevation}>
            <Button label="One" />
            <Button label="Two" />
          </ButtonGroup>,
        );
        return container.querySelector('[role="group"]')!.className;
      };
      const classes = new Set([
        classFor('none'),
        classFor('low'),
        classFor('med'),
        classFor('high'),
      ]);
      expect(classes.size).toBe(4);
    });

    it('defaults to flat (elevation none)', () => {
      const {container: def} = render(
        <ButtonGroup label="Actions">
          <Button label="One" />
        </ButtonGroup>,
      );
      const {container: none} = render(
        <ButtonGroup label="Actions" elevation="none">
          <Button label="One" />
        </ButtonGroup>,
      );
      expect(def.querySelector('[role="group"]')!.className).toBe(
        none.querySelector('[role="group"]')!.className,
      );
    });

    it('exposes the elevation to a theme as a data attribute', () => {
      render(
        <ButtonGroup label="Actions" elevation="high">
          <Button label="One" />
        </ButtonGroup>,
      );

      expect(screen.getByRole('group')).toHaveAttribute(
        'data-elevation',
        'high',
      );
    });

    it('reports flat on a member, since the group owns the surface', () => {
      render(
        <ButtonGroup label="Actions" elevation="high">
          <Button label="One" elevation="high" />
        </ButtonGroup>,
      );

      expect(screen.getByRole('button', {name: 'One'})).toHaveAttribute(
        'data-elevation',
        'none',
      );
    });
  });

  // ===========================================================================
  // Keyboard navigation
  //
  // The group wires useListFocus, so arrow keys move focus between members.
  // The last two tests cover the boundary: a member can own a layer, whose
  // keys belong to that layer, and the group itself can sit inside a layer,
  // whose keys are still the group's own. Both must hold at once.
  // ===========================================================================
  describe('keyboard navigation', () => {
    const clipboard = (
      <ButtonGroup label="Actions">
        <Button label="Copy" />
        <Button label="Cut" />
        <Button label="Paste" />
      </ButtonGroup>
    );

    it('moves focus between members with the arrow keys, wrapping at the end', async () => {
      const user = userEvent.setup();
      render(clipboard);

      screen.getByRole('button', {name: 'Copy'}).focus();

      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('button', {name: 'Cut'})).toHaveFocus();

      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect(screen.getByRole('button', {name: 'Copy'})).toHaveFocus();

      await user.keyboard('{ArrowLeft}');
      expect(screen.getByRole('button', {name: 'Paste'})).toHaveFocus();
    });

    it('jumps to the first and last member with Home and End', async () => {
      const user = userEvent.setup();
      render(clipboard);

      screen.getByRole('button', {name: 'Cut'}).focus();

      await user.keyboard('{End}');
      expect(screen.getByRole('button', {name: 'Paste'})).toHaveFocus();

      await user.keyboard('{Home}');
      expect(screen.getByRole('button', {name: 'Copy'})).toHaveFocus();
    });

    it('uses the vertical arrows when the group is vertical', async () => {
      const user = userEvent.setup();
      render(
        <ButtonGroup label="Actions" orientation="vertical">
          <Button label="Copy" />
          <Button label="Cut" />
        </ButtonGroup>,
      );

      screen.getByRole('button', {name: 'Copy'}).focus();

      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('button', {name: 'Cut'})).toHaveFocus();

      await user.keyboard('{ArrowUp}');
      expect(screen.getByRole('button', {name: 'Copy'})).toHaveFocus();
    });

    it('follows visual direction in RTL', async () => {
      const user = userEvent.setup();
      // dir sits on the group because jsdom resolves computed direction from
      // the element's own attribute, not from an ancestor.
      render(
        <ButtonGroup label="Actions" dir="rtl">
          <Button label="Copy" />
          <Button label="Cut" />
          <Button label="Paste" />
        </ButtonGroup>,
      );
      screen.getByRole('button', {name: 'Copy'}).focus();

      await user.keyboard('{ArrowLeft}');
      expect(screen.getByRole('button', {name: 'Cut'})).toHaveFocus();

      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('button', {name: 'Copy'})).toHaveFocus();
    });

    it('skips a disabled member', async () => {
      const user = userEvent.setup();
      render(
        <ButtonGroup label="Actions">
          <Button label="Copy" />
          <Button label="Cut" isDisabled />
          <Button label="Paste" />
        </ButtonGroup>,
      );

      screen.getByRole('button', {name: 'Copy'}).focus();

      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('button', {name: 'Paste'})).toHaveFocus();
    });

    it('leaves arrow keys to a member\u2019s open menu', async () => {
      const user = userEvent.setup();
      render(
        <ButtonGroup label="Approve action">
          <Button label="Allow once" />
          <DropdownMenu
            hasChevron={false}
            button={{label: 'Allow options', isIconOnly: true}}
            items={[{label: 'Allow for 30 minutes'}, {label: 'Always allow'}]}
          />
        </ButtonGroup>,
      );

      await user.click(screen.getByRole('button', {name: /Allow options/}));
      const item = screen.getByRole('menuitem', {
        name: 'Allow for 30 minutes',
        hidden: true,
      });
      item.focus();

      // Assert positively: the menu item keeps focus. `.not.toHaveFocus()` on
      // the group's buttons would also pass if the group had thrown focus
      // somewhere else entirely.
      fireEvent.keyDown(item, {key: 'ArrowRight'});
      expect(item).toHaveFocus();

      fireEvent.keyDown(item, {key: 'ArrowLeft'});
      expect(item).toHaveFocus();

      // End belongs to the menu's own list focus, so it lands on the last menu
      // item rather than the group's last button.
      fireEvent.keyDown(item, {key: 'End'});
      expect(
        screen.getByRole('menuitem', {name: 'Always allow', hidden: true}),
      ).toHaveFocus();
    });

    it('leaves a link member in the arrow order', async () => {
      const user = userEvent.setup();
      render(
        <ButtonGroup label="Docs actions">
          <Button label="Save" />
          <Button label="Docs" href="https://example.com" />
          <Button label="Print" />
        </ButtonGroup>,
      );

      screen.getByRole('button', {name: 'Save'}).focus();

      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('link', {name: 'Docs'})).toHaveFocus();

      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('button', {name: 'Print'})).toHaveFocus();
    });

    it('still moves between its own members when the group sits inside a popover', async () => {
      const user = userEvent.setup();
      // A group rendered inside a Popover, ContextMenu, HoverCard or Toast has
      // a `[popover]` ancestor, because that is how useLayer mounts a layer.
      // A bare `popover` div is the same DOM fact without the layer harness.
      render(
        <div popover="manual">
          <ButtonGroup label="Actions">
            <Button label="Copy" />
            <Button label="Cut" />
            <Button label="Paste" />
          </ButtonGroup>
        </div>,
      );

      // A closed popover is display:none in jsdom, so its contents read as
      // inaccessible; focus and key handling still work on them.
      const button = (name: string) =>
        screen.getByRole('button', {name, hidden: true});

      button('Copy').focus();

      await user.keyboard('{ArrowRight}');
      expect(button('Cut')).toHaveFocus();

      await user.keyboard('{End}');
      expect(button('Paste')).toHaveFocus();

      await user.keyboard('{Home}');
      expect(button('Copy')).toHaveFocus();
    });
  });

  // ===========================================================================
  // Roving tabindex
  //
  // The group is a single tab stop: exactly one enabled member carries
  // tabindex="0", the rest carry -1, and the stop moves with arrow navigation.
  // Entering and leaving is asserted through the real tab order as well as the
  // attribute, because the attribute alone says nothing about a member the
  // itemSelector missed — such a member stays natively tabbable and quietly
  // adds a second stop.
  // ===========================================================================
  describe('roving tabindex', () => {
    const tabIndexOf = (name: string) =>
      screen.getByRole('button', {name}).getAttribute('tabindex');

    const bracketed = (group: ReactNode) => (
      <>
        <button type="button">before</button>
        {group}
        <button type="button">after</button>
      </>
    );

    const clipboard = (
      <ButtonGroup label="Actions">
        <Button label="Copy" />
        <Button label="Cut" />
        <Button label="Paste" />
      </ButtonGroup>
    );

    it('gives the group one tab stop, on the first member', () => {
      render(clipboard);

      expect(tabIndexOf('Copy')).toBe('0');
      expect(tabIndexOf('Cut')).toBe('-1');
      expect(tabIndexOf('Paste')).toBe('-1');
    });

    it('takes one Tab to enter and one to leave', async () => {
      const user = userEvent.setup();
      render(bracketed(clipboard));

      await user.tab();
      expect(screen.getByRole('button', {name: 'before'})).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', {name: 'Copy'})).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', {name: 'after'})).toHaveFocus();
    });

    it('moves the tab stop with arrow navigation', async () => {
      const user = userEvent.setup();
      render(clipboard);

      screen.getByRole('button', {name: 'Copy'}).focus();
      await user.keyboard('{ArrowRight}');

      expect(tabIndexOf('Copy')).toBe('-1');
      expect(tabIndexOf('Cut')).toBe('0');
    });

    it('never parks the tab stop on a disabled member', () => {
      render(
        <ButtonGroup label="Actions">
          <Button label="Copy" isDisabled />
          <Button label="Cut" />
          <Button label="Paste" />
        </ButtonGroup>,
      );

      expect(tabIndexOf('Copy')).toBe('-1');
      expect(tabIndexOf('Cut')).toBe('0');
    });

    it('repairs the tab stop when the member holding it unmounts', () => {
      const {rerender} = render(
        <ButtonGroup label="Actions">
          <Button label="Copy" />
          <Button label="Cut" />
        </ButtonGroup>,
      );
      expect(tabIndexOf('Copy')).toBe('0');

      rerender(
        <ButtonGroup label="Actions">
          <Button label="Cut" />
        </ButtonGroup>,
      );

      expect(tabIndexOf('Cut')).toBe('0');
    });

    it('repairs the tab stop when the member holding it becomes disabled', () => {
      const {rerender} = render(
        <ButtonGroup label="Actions">
          <Button label="Copy" />
          <Button label="Cut" />
        </ButtonGroup>,
      );
      expect(tabIndexOf('Copy')).toBe('0');

      rerender(
        <ButtonGroup label="Actions">
          <Button label="Copy" isDisabled />
          <Button label="Cut" />
        </ButtonGroup>,
      );

      expect(tabIndexOf('Copy')).toBe('-1');
      expect(tabIndexOf('Cut')).toBe('0');
    });

    it('counts a link member as the tab stop', async () => {
      const user = userEvent.setup();
      render(
        bracketed(
          <ButtonGroup label="Docs actions">
            <Button label="Docs" href="https://example.com" />
            <Button label="Print" />
          </ButtonGroup>,
        ),
      );

      expect(
        screen.getByRole('link', {name: 'Docs'}).getAttribute('tabindex'),
      ).toBe('0');
      expect(tabIndexOf('Print')).toBe('-1');

      await user.tab();
      await user.tab();
      expect(screen.getByRole('link', {name: 'Docs'})).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', {name: 'after'})).toHaveFocus();
    });

    it('contributes no tab stop when the whole group is disabled', async () => {
      const user = userEvent.setup();
      render(
        bracketed(
          <ButtonGroup label="Actions" isDisabled>
            <Button label="Copy" />
            <Button label="Cut" />
          </ButtonGroup>,
        ),
      );

      await user.tab();
      expect(screen.getByRole('button', {name: 'before'})).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', {name: 'after'})).toHaveFocus();
    });

    it('leaves the tab stop on its own members when a member owns an open menu', async () => {
      const user = userEvent.setup();
      render(
        <ButtonGroup label="Approve action">
          <Button label="Allow once" />
          <DropdownMenu
            hasChevron={false}
            button={{label: 'Allow options', isIconOnly: true}}
            items={[{label: 'Allow for 30 minutes'}, {label: 'Always allow'}]}
          />
        </ButtonGroup>,
      );

      const trigger = screen.getByRole('button', {name: /Allow options/});
      expect(tabIndexOf('Allow once')).toBe('0');
      expect(trigger.getAttribute('tabindex')).toBe('-1');

      await user.click(trigger);

      // The menu's own items are a different list level (the boundary), so the
      // group must not stamp them or hand them its tab stop.
      const item = screen.getByRole('menuitem', {
        name: 'Allow for 30 minutes',
        hidden: true,
      });
      expect(item.getAttribute('tabindex')).not.toBe('0');
      expect(tabIndexOf('Allow once')).toBe('0');
    });
  });
});
