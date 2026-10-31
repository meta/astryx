// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonGroup.test.tsx
 * @input Uses vitest, @testing-library/react, @babel/core + @stylexjs/babel-plugin,
 *   ButtonGroup and Button components
 * @output Unit tests for ButtonGroup, incl. the compiled-CSS contract for the
 *   trailing radius (#2508)
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
import {Toolbar} from '../Toolbar';

describe('ButtonGroup', () => {
  it('renders a group with aria-label for 2 members', () => {
    render(
      <ButtonGroup label="Actions">
        <Button label="Copy" />
        <Button label="Cut" />
      </ButtonGroup>,
    );

    const group = screen.getByRole('group');
    expect(group).toBeInTheDocument();
    expect(group).toHaveAttribute('aria-label', 'Actions');
    expect(group).not.toHaveAttribute('aria-orientation');
  });

  it('renders a toolbar with aria-orientation for 3 or more members', () => {
    render(
      <ButtonGroup label="Actions">
        <Button label="Copy" />
        <Button label="Cut" />
        <Button label="Paste" />
      </ButtonGroup>,
    );

    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toBeInTheDocument();
    expect(toolbar).toHaveAttribute('aria-label', 'Actions');
    expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
  });

  it('honors explicit role override', () => {
    const {rerender} = render(
      <ButtonGroup label="Actions" role="group">
        <Button label="Copy" />
        <Button label="Cut" />
        <Button label="Paste" />
      </ButtonGroup>,
    );

    expect(screen.getByRole('group')).toBeInTheDocument();
    expect(screen.getByRole('group')).not.toHaveAttribute('aria-orientation');

    rerender(
      <ButtonGroup label="Actions" role="toolbar">
        <Button label="Copy" />
        <Button label="Cut" />
      </ButtonGroup>,
    );

    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'aria-orientation',
      'horizontal',
    );
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
  // HOW THESE TESTS CATCH THE BUG
  // jsdom applies no StyleX CSS, so a DOM-only test cannot prove which rule
  // wins — and a test that hand-copies the selector is a tautology (revert
  // groupStyles to `:last-child` and it still passes). So the predicate is NOT
  // hand-copied here: `compileButtonRules()` runs the REAL StyleX babel plugin
  // over Button.tsx (same config as scripts/build-css.mjs) and reads the
  // trailing-radius rule's selector straight out of the emitted CSS, then
  // matches it against the real rendered DOM. Revert groupStyles to
  // `:last-child` and these go red.
  // ===========================================================================
  describe('trailing radius (#2508)', () => {
    /** The group members, in DOM order (excludes invisible layer siblings). */
    const items = (group: HTMLElement): Element[] =>
      Array.from(
        group.querySelectorAll(':scope > *:not([popover]):not(template)'),
      );

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
      /** The full compiled selector, e.g. `.xp0wexf:not(:has(~ [data-...]))`. */
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

    /** Does the compiled CSS actually round `el`'s trailing corners? */
    const hasRoundedTrailingCorners = (
      el: Element,
      orientation: Orientation = 'horizontal',
    ): boolean =>
      trailingRoundingSelectors(el, orientation).every(selector =>
        el.matches(selector),
      );

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
          expect(selector).not.toContain(':last-child');
          // `[popover]` must survive compilation *verbatim*. StyleX only
          // statically evaluates a selector key from a same-file const; from a
          // .stylex.ts file it compiles to a mangled selector like `[x13pbwiz]`
          // that matches nothing in the DOM.
          expect(selector).toContain('[popover]');
          expect(selector).toContain('template');
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

        expect(hasRoundedTrailingCorners(more, orientation)).toBe(true);
        expect(hasRoundedTrailingCorners(save, orientation)).toBe(false);
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

        expect(hasRoundedTrailingCorners(trigger, orientation)).toBe(true);
        expect(hasRoundedTrailingCorners(allow, orientation)).toBe(false);
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

      expect(hasRoundedTrailingCorners(link)).toBe(true);
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

      const group = screen.getByRole('toolbar');
      const [first, middle, last] = items(group);

      expect([first, middle, last].map(el => el.textContent)).toEqual([
        'First',
        'Middle',
        'Last',
      ]);

      // Middle has a tooltip layer after it, but a *marked* sibling follows too,
      // so it must NOT take the trailing radius.
      expect(hasRoundedTrailingCorners(first)).toBe(false);
      expect(hasRoundedTrailingCorners(middle)).toBe(false);
      expect(hasRoundedTrailingCorners(last)).toBe(true);
    });

    it('rounds both edges of a lone tooltip’d member', () => {
      render(
        <ButtonGroup label="Actions">
          <Button label="Only" tooltip="The only one" />
        </ButtonGroup>,
      );

      const only = screen.getByRole('button', {name: 'Only'});

      // Leading edge is unaffected: a member's button always precedes its layer.
      expect(only.matches(':first-child')).toBe(true);
      expect(hasRoundedTrailingCorners(only)).toBe(true);
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

      const save = screen.getByRole('button', {name: 'Save'});

      // Tooltip wraps element children in a `display: contents` <div>, so the
      // inner Button is a DESCENDANT of the wrapper, not a DOM sibling of Save.
      expect(hasRoundedTrailingCorners(save)).toBe(false);
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

      const save = screen.getByRole('button', {name: 'Save'});

      // Button has no `hoverCard` prop, so wrapping is the ONLY way to put a
      // HoverCard on a group button — this composition has no alternative.
      expect(hasRoundedTrailingCorners(save)).toBe(false);
    });

    it('does not round the preceding button when a raw <button> follows', () => {
      render(
        <ButtonGroup label="Actions">
          <Button label="Save" />
          <button type="button">Custom</button>
        </ButtonGroup>,
      );

      const save = screen.getByRole('button', {name: 'Save'});

      expect(hasRoundedTrailingCorners(save)).toBe(false);
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
          <Button label="Paste" />
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

    it('keeps all members in natural Tab order without roving tabindex for 2 members', async () => {
      const user = userEvent.setup();
      render(
        bracketed(
          <ButtonGroup label="Actions">
            <Button label="Save" />
            <Button label="More" />
          </ButtonGroup>,
        ),
      );

      await user.tab();
      expect(screen.getByRole('button', {name: 'before'})).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', {name: 'Save'})).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', {name: 'More'})).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', {name: 'after'})).toHaveFocus();
    });

    it('repairs the tab stop when the member holding it unmounts (4 -> 3 members)', async () => {
      const user = userEvent.setup();
      const {rerender} = render(
        bracketed(
          <ButtonGroup label="Actions">
            <Button label="Copy" />
            <Button label="Cut" />
            <Button label="Paste" />
            <Button label="Delete" />
          </ButtonGroup>,
        ),
      );
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
      expect(tabIndexOf('Copy')).toBe('0');
      expect(tabIndexOf('Cut')).toBe('-1');
      expect(tabIndexOf('Paste')).toBe('-1');
      expect(tabIndexOf('Delete')).toBe('-1');

      await user.tab();
      expect(screen.getByRole('button', {name: 'before'})).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', {name: 'Copy'})).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', {name: 'after'})).toHaveFocus();

      rerender(
        bracketed(
          <ButtonGroup label="Actions">
            <Button label="Cut" />
            <Button label="Paste" />
            <Button label="Delete" />
          </ButtonGroup>,
        ),
      );

      expect(screen.getByRole('toolbar')).toBeInTheDocument();
      expect(tabIndexOf('Cut')).toBe('0');
      expect(tabIndexOf('Paste')).toBe('-1');
      expect(tabIndexOf('Delete')).toBe('-1');

      await user.tab({shift: true});
      expect(screen.getByRole('button', {name: 'Cut'})).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', {name: 'after'})).toHaveFocus();
    });

    it('repairs the tab stop when the member holding it becomes disabled', () => {
      const {rerender} = render(
        <ButtonGroup label="Actions">
          <Button label="Copy" />
          <Button label="Cut" />
          <Button label="Paste" />
        </ButtonGroup>,
      );
      expect(tabIndexOf('Copy')).toBe('0');

      rerender(
        <ButtonGroup label="Actions">
          <Button label="Copy" isDisabled />
          <Button label="Cut" />
          <Button label="Paste" />
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
            <Button label="Share" />
          </ButtonGroup>,
        ),
      );

      expect(
        screen.getByRole('link', {name: 'Docs'}).getAttribute('tabindex'),
      ).toBe('0');
      expect(tabIndexOf('Print')).toBe('-1');
      expect(tabIndexOf('Share')).toBe('-1');

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
        <ButtonGroup label="Approve action" role="toolbar">
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

    it('preserves internal DropdownMenu tabindex attributes and keyboard navigation when group drops from 3 to 2 members', async () => {
      const user = userEvent.setup();
      const {rerender} = render(
        <ButtonGroup label="Actions">
          <Button key="first" label="First" />
          <Button key="second" label="Second" />
          <DropdownMenu
            key="menu"
            button={{label: 'Options', isIconOnly: true}}
            items={[{label: 'Option 1'}, {label: 'Option 2'}]}
          />
        </ButtonGroup>,
      );

      expect(screen.getByRole('toolbar')).toBeInTheDocument();
      expect(tabIndexOf('First')).toBe('0');
      expect(tabIndexOf('Second')).toBe('-1');
      expect(screen.getByRole('button', {name: /Options/})).toHaveAttribute(
        'tabindex',
        '-1',
      );

      rerender(
        <ButtonGroup label="Actions">
          <Button key="first" label="First" />
          <DropdownMenu
            key="menu"
            button={{label: 'Options', isIconOnly: true}}
            items={[{label: 'Option 1'}, {label: 'Option 2'}]}
          />
        </ButtonGroup>,
      );

      expect(screen.getByRole('group')).toBeInTheDocument();
      expect(tabIndexOf('First')).toBeNull();
      const trigger = screen.getByRole('button', {name: /Options/});
      expect(trigger.getAttribute('tabindex')).toBeNull();

      await user.click(trigger);

      const item1 = screen.getByRole('menuitem', {
        name: 'Option 1',
        hidden: true,
      });
      const item2 = screen.getByRole('menuitem', {
        name: 'Option 2',
        hidden: true,
      });
      expect(item1.getAttribute('tabindex')).toBeDefined();
      expect(item1.getAttribute('tabindex')).not.toBeNull();

      item1.focus();
      expect(item1).toHaveFocus();
      fireEvent.keyDown(item1, {key: 'ArrowDown'});
      expect(item2).toHaveFocus();
    });

    it('resolves to toolbar with single Tab stop when 3 buttons are wrapped in a Fragment', async () => {
      const user = userEvent.setup();
      render(
        bracketed(
          <ButtonGroup label="Fragment group">
            <>
              <Button label="Frag 1" />
              <Button label="Frag 2" />
              <Button label="Frag 3" />
            </>
          </ButtonGroup>,
        ),
      );

      const toolbar = screen.getByRole('toolbar');
      expect(toolbar).toBeInTheDocument();
      expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
      expect(tabIndexOf('Frag 1')).toBe('0');
      expect(tabIndexOf('Frag 2')).toBe('-1');
      expect(tabIndexOf('Frag 3')).toBe('-1');

      await user.tab();
      expect(screen.getByRole('button', {name: 'before'})).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', {name: 'Frag 1'})).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', {name: 'after'})).toHaveFocus();
    });

    it('resolves to toolbar with single Tab stop when a wrapper component renders 3 buttons', async () => {
      const user = userEvent.setup();
      function CustomWrapper() {
        return (
          <>
            <Button label="Wrap 1" />
            <Button label="Wrap 2" />
            <Button label="Wrap 3" />
          </>
        );
      }

      render(
        bracketed(
          <ButtonGroup label="Wrapper group">
            <CustomWrapper />
          </ButtonGroup>,
        ),
      );

      const toolbar = screen.getByRole('toolbar');
      expect(toolbar).toBeInTheDocument();
      expect(tabIndexOf('Wrap 1')).toBe('0');
      expect(tabIndexOf('Wrap 2')).toBe('-1');
      expect(tabIndexOf('Wrap 3')).toBe('-1');

      await user.tab();
      expect(screen.getByRole('button', {name: 'before'})).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', {name: 'Wrap 1'})).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', {name: 'after'})).toHaveFocus();
    });

    it('preserves role="group" and single Tab stop when nested inside a Toolbar', async () => {
      const user = userEvent.setup();
      render(
        bracketed(
          <Toolbar
            label="Main Toolbar"
            startContent={
              <>
                <Button label="Tool 1" />
                <ButtonGroup label="Nested group">
                  <Button label="Nested 1" />
                  <Button label="Nested 2" />
                  <Button label="Nested 3" />
                </ButtonGroup>
                <Button label="Tool 2" />
              </>
            }
          />,
        ),
      );

      const group = screen.getByRole('group', {name: 'Nested group'});
      expect(group).toBeInTheDocument();
      expect(group).not.toHaveAttribute('aria-orientation');

      const toolbar = screen.getByRole('toolbar', {name: 'Main Toolbar'});
      expect(toolbar).toBeInTheDocument();

      expect(tabIndexOf('Tool 1')).toBe('0');
      expect(tabIndexOf('Nested 1')).toBe('-1');
      expect(tabIndexOf('Nested 2')).toBe('-1');
      expect(tabIndexOf('Nested 3')).toBe('-1');
      expect(tabIndexOf('Tool 2')).toBe('-1');

      await user.tab();
      expect(screen.getByRole('button', {name: 'before'})).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', {name: 'Tool 1'})).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', {name: 'after'})).toHaveFocus();

      screen.getByRole('button', {name: 'Tool 1'}).focus();
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('button', {name: 'Nested 1'})).toHaveFocus();
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('button', {name: 'Nested 2'})).toHaveFocus();
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('button', {name: 'Nested 3'})).toHaveFocus();
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('button', {name: 'Tool 2'})).toHaveFocus();
    });

    it('honors explicit role override outside toolbar and avoids nested toolbar conflict inside Toolbar', () => {
      const {rerender} = render(
        <ButtonGroup label="Explicit toolbar" role="toolbar">
          <Button label="A" />
          <Button label="B" />
        </ButtonGroup>,
      );
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
      expect(tabIndexOf('A')).toBe('0');
      expect(tabIndexOf('B')).toBe('-1');

      rerender(
        <ButtonGroup label="Explicit group" role="group">
          <Button label="A" />
          <Button label="B" />
          <Button label="C" />
        </ButtonGroup>,
      );
      expect(screen.getByRole('group')).toBeInTheDocument();
      expect(tabIndexOf('A')).toBeNull();
      expect(tabIndexOf('B')).toBeNull();
      expect(tabIndexOf('C')).toBeNull();

      rerender(
        <Toolbar
          label="Outer Toolbar"
          startContent={
            <ButtonGroup label="Explicit inside toolbar" role="toolbar">
              <Button label="A" />
              <Button label="B" />
              <Button label="C" />
            </ButtonGroup>
          }
        />,
      );
      expect(
        screen.getByRole('group', {name: 'Explicit inside toolbar'}),
      ).toBeInTheDocument();
    });

    it('handles dynamic member transitions (4 -> 3 -> 2 -> 3)', async () => {
      const user = userEvent.setup();
      const {rerender} = render(
        bracketed(
          <ButtonGroup label="Dynamic actions">
            <Button label="A" />
            <Button label="B" />
            <Button label="C" />
            <Button label="D" />
          </ButtonGroup>,
        ),
      );

      expect(screen.getByRole('toolbar')).toBeInTheDocument();
      expect(tabIndexOf('A')).toBe('0');
      expect(tabIndexOf('B')).toBe('-1');
      expect(tabIndexOf('C')).toBe('-1');
      expect(tabIndexOf('D')).toBe('-1');

      rerender(
        bracketed(
          <ButtonGroup label="Dynamic actions">
            <Button label="A" />
            <Button label="B" />
            <Button label="C" />
          </ButtonGroup>,
        ),
      );
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
      expect(tabIndexOf('A')).toBe('0');
      expect(tabIndexOf('B')).toBe('-1');
      expect(tabIndexOf('C')).toBe('-1');

      rerender(
        bracketed(
          <ButtonGroup label="Dynamic actions">
            <Button label="A" />
            <Button label="B" />
          </ButtonGroup>,
        ),
      );
      expect(screen.getByRole('group')).toBeInTheDocument();
      expect(tabIndexOf('A')).toBeNull();
      expect(tabIndexOf('B')).toBeNull();

      await user.tab();
      expect(screen.getByRole('button', {name: 'before'})).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', {name: 'A'})).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', {name: 'B'})).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', {name: 'after'})).toHaveFocus();

      rerender(
        bracketed(
          <ButtonGroup label="Dynamic actions">
            <Button label="A" />
            <Button label="B" />
            <Button label="C" />
          </ButtonGroup>,
        ),
      );
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
      expect(tabIndexOf('A')).toBe('0');
      expect(tabIndexOf('B')).toBe('-1');
      expect(tabIndexOf('C')).toBe('-1');
    });
  });
});
