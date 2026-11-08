// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Indicator',
  displayName: 'Indicator',
  group: 'Indicator',
  category: 'Form Controls',
  isHiddenFromOverview: true,
  keywords: [
    'indicator',
    'checkbox',
    'radio',
    'control',
    'selection',
    'mark',
    'tick',
    'themeable',
    'swap',
  ],
  description:
    'Decorative control visuals: the mark on a chosen option, the box a checkbox draws, the circle a radio draws. Rendered by Selector, CheckboxInput, RadioList, and menu selection rows. Replace one by name through defineTheme({indicators}) and every component drawing it follows.',
  components: [
    {
      name: 'CheckboxIndicator',
      displayName: 'Checkbox Indicator',
      description:
        'The checkbox visual: a square box with a checkmark or an indeterminate bar. Decorative (aria-hidden); the owning control keeps the input, role, accessible name, focus, and keyboard behavior.',
      props: [
        {
          name: 'state',
          type: "'unchecked' | 'checked' | 'indeterminate'",
          description:
            'Which state to draw. An indicator draws in EVERY state: the unchecked box is an empty box, not nothing.',
          required: true,
        },
        {
          name: 'size',
          type: "'sm' | 'md'",
          description: 'Control size: 20px or 24px.',
          default: "'md'",
        },
        {
          name: 'isDisabled',
          type: 'boolean',
          description:
            'Whether the owning control is disabled. Purely visual; the owner keeps the real disabled semantics.',
          default: 'false',
        },
        {
          name: 'children',
          type: 'ReactNode',
          description:
            'Rendered inside the chrome INSTEAD of the state mark when the shallow `isRenderable(children)` check accepts the value. The helper excludes `null`, `undefined`, booleans, and the empty string; React elements and containers take the replacement path even when their descendants render nothing. CheckboxInput passes its loading Spinner through as `children={isBusy && <Spinner/>}`, so replacements should use the same helper rather than a nullish check.',
        },
      ],
    },
    {
      name: 'CheckIndicator',
      displayName: 'Check Indicator',
      description:
        'The mark on a chosen option: a checkmark by default, and nothing at all when unchosen, so a listbox shows no empty box beside every row. This is the indicator to replace to change what "chosen" looks like: mapping it to RadioIndicator gives every single-selection mark radio visuals, including an empty circle on unchosen rows. Unlike the checkbox and radio visuals it renders no chrome of its own (it IS the glyph), so a host\'s theme target lands on the same element as astryx-icon.',
      props: [
        {
          name: 'state',
          type: "'unchecked' | 'checked'",
          description:
            'Which state to draw. The default renders nothing when unchecked; a replacement may draw in both states.',
          required: true,
        },
        {
          name: 'size',
          type: "'sm' | 'md'",
          description: 'Control size, matching the other indicators.',
          default: "'md'",
        },
        {
          name: 'isDisabled',
          type: 'boolean',
          description:
            'Whether the owning row is disabled. Purely visual; the owner keeps the real disabled semantics.',
          default: 'false',
        },
        {
          name: 'children',
          type: 'ReactNode',
          description:
            'Rendered INSTEAD of the mark, in every state: a host showing a pending Spinner passes it through whether or not the row is chosen.',
        },
      ],
      playground: {
        defaults: {state: 'checked'},
      },
    },
    {
      name: 'RadioIndicator',
      displayName: 'Radio Indicator',
      description:
        'The radio visual: a circle with a filled inner dot when selected. Draws in both states; an unselected radio is an empty circle, which is what lets it stand in for a checkmark in a selection slot.',
      props: [
        {
          name: 'state',
          type: "'unchecked' | 'checked'",
          description:
            'Which state to draw. Radio belongs to the singleSelection family, which has no partial state.',
          required: true,
        },
        {
          name: 'size',
          type: "'sm' | 'md'",
          description: 'Control size: 20px or 24px.',
          default: "'md'",
        },
        {
          name: 'isDisabled',
          type: 'boolean',
          description:
            'Whether the owning control is disabled. Purely visual; the owner keeps the real disabled semantics.',
          default: 'false',
        },
        {
          name: 'children',
          type: 'ReactNode',
          description: 'Rendered inside the chrome INSTEAD of the state mark.',
        },
      ],
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-checkbox-indicator',
        visualProps: ['size'],
        states: ['checked', 'disabled'],
      },
      {className: 'astryx-checkbox-indicator-check', visualProps: ['size']},
      {className: 'astryx-checkbox-indicator-dash', visualProps: ['size']},
      {
        className: 'astryx-radio-indicator',
        visualProps: ['size'],
        states: ['checked', 'disabled'],
      },
      {className: 'astryx-radio-indicator-dot', visualProps: ['size']},
    ],
  },
  examples: [
    {
      label: 'Restyle an indicator (the common path)',
      code: `// Indicators render the same stable class targets wherever they appear, so
// one component override reaches the form control, the menu row, and any
// selection slot themed to use it. No indicator-specific API needed.
defineTheme({
  name: 'brand',
  components: {
    'checkbox-indicator': {
      base: {borderRadius: 'var(--radius-full)', borderWidth: '2px'},
      checked: {
        backgroundColor: 'var(--color-accent)',
        borderColor: 'var(--color-accent)',
      },
      'checked+disabled': {backgroundColor: 'var(--color-background-muted)'},
    },
    'radio-indicator': {base: {borderWidth: '2px'}},
    'radio-indicator-dot': {base: {borderRadius: '2px'}},
  },
});`,
    },
    {
      label: 'Replace an indicator with your own component',
      code: `// When the shape itself is wrong, hand the theme a component. It receives
// {state, size, isDisabled, children} and nothing else.
//
// Use theme tokens, never raw values — run \`astryx docs tokens\` for the
// full set. Color: --color-accent, --color-on-accent, --color-border,
// --color-border-emphasized, --color-background-surface,
// --color-background-muted. Radius: --radius-inner, --radius-full.
// Border width: --border-width.
import {isRenderable} from '@astryxdesign/core/utils';

function BrandCheckbox({state, size = 'md', isDisabled, children}) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size === 'sm' ? 20 : 24,
        height: size === 'sm' ? 20 : 24,
        borderRadius: 'var(--radius-inner)',
        border: 'var(--border-width) solid var(--color-border-emphasized)',
        color: 'var(--color-accent)',
        opacity: isDisabled ? 0.5 : 1,
      }}>
      {/* children first: the owner passes a loading Spinner through it.
          isRenderable, NOT \`children ??\` — a host writes
          children={isBusy && <Spinner/>}, and \`false\` is neither null nor
          caught by ??, so a nullish check takes the children branch, renders
          nothing in it, and deletes your mark on every chosen row. */}
      {isRenderable(children)
        ? children
        : state === 'checked' && <StarGlyph />}
    </span>
  );
}

defineTheme({name: 'brand', indicators: {checkbox: BrandCheckbox}});`,
    },
    {
      label: 'Use radio visuals for single selection',
      code: `// Replacement is by NAME, so one entry reaches every component that draws
// that indicator. Here every option in a Selector listbox draws a radio —
// including the unselected ones, which a check mark cannot do.
import {RadioIndicator} from '@astryxdesign/core/Indicator';

defineTheme({name: 'brand', indicators: {check: RadioIndicator}});`,
    },
  ],
  usage: {
    description:
      'Indicators are the componentized selection visuals shared by CheckboxInput, RadioList, and menu selection rows. They are decorative: the owning component keeps the input, role, accessible name, focus, and keyboard behavior, while the indicator turns state into a picture. That split is what makes them themeable: restyle one through its class targets, or replace the component outright.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Reach for the canonical `components['checkbox-indicator']` override first. Replacing the component is the heavier path, for when the shape itself is wrong.",
      },
      {
        guidance: true,
        description:
          'Match the shipped replacement-content branch with `isRenderable(children)`, not `children != null` or `children ?? mark`. The helper is deliberately shallow: it excludes nullish values, booleans, and the empty string, while React elements and containers take the replacement path even when their descendants render nothing. The owning control passes `children={isBusy && <Spinner/>}`, so a nullish check deletes the state mark whenever that value is `false` (#4893).',
      },
      {
        guidance: true,
        description:
          'A replacement must set aria-hidden. The owning control provides the role and accessible name; a visible indicator would be announced twice.',
      },
      {
        guidance: true,
        description:
          'Use theme tokens for every color, radius, and border width in a replacement. Run `astryx docs tokens` for the set.',
      },
      {
        guidance: true,
        description:
          "Render a single root ELEMENT, and let it keep the border-radius you want the focus ring to follow. A control whose real input is visually hidden cannot show focus on that input, so the owner paints the standard ring onto the indicator element itself at focus time (useIndicatorFocusRing), and `outline` then picks up that element's radius. A replacement needs no cooperation and can forget nothing: the ring is never missing (WCAG 2.4.7), it is only the wrong shape if the root has no radius of its own. Do not draw a focus ring yourself; the owner already did.",
      },
      {
        guidance: false,
        description:
          "Thread hover or pressed state in as props. Interaction state reaches an indicator through the owner's CSS ancestor marker, so hovering the row tints the control with no props involved.",
      },
      {
        guidance: false,
        description:
          "Assume you are only mounted when selected. The host renders its indicator unconditionally and passes `state`, in every state; that is what lets a replacement draw where the default draws nothing (a radio's empty circle on an unchosen row). Drawing nothing in a state is a decision the indicator makes, not one the host makes for it.",
      },
    ],
    anatomy: [
      {
        name: 'Chrome (checkbox, radio)',
        required: true,
        description:
          'The persistent box or circle rendered by CheckboxIndicator and RadioIndicator in every state. CheckIndicator is the state mark itself and intentionally owns no chrome.',
      },
      {
        name: 'State mark',
        required: false,
        description:
          'The checkmark, indeterminate bar, or radio dot shown inside the chrome for the current state.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Decorative selection visuals: the mark on a chosen option, the checkbox box, the radio circle. Rendered by Selector/CheckboxInput/RadioList/menu rows. Replace one by name via defineTheme({indicators}) and every component drawing it follows.',
  usage: {
    description:
      'Componentized selection visuals shared by CheckboxInput, RadioList, and menu rows. Decorative: the owner keeps input/role/name/focus/keyboard; the indicator turns state into a picture. That split makes them themeable: restyle via class targets or replace the component.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Prefer the canonical `components['checkbox-indicator']` override first. Replacing the component is the heavier path, for when the shape itself is wrong.",
      },
      {
        guidance: true,
        description:
          'Match the shipped replacement-content branch with `isRenderable(children)`, not `children != null` or `children ?? mark`. The helper is shallow: it excludes nullish values, booleans, and the empty string, while React elements and containers take the replacement path even when their descendants render nothing. The owner passes `children={isBusy && <Spinner/>}`, so a nullish check deletes the state mark whenever the value is `false` (#4893).',
      },
      {
        guidance: true,
        description:
          'A replacement must set aria-hidden. The owner supplies role and accessible name; a visible indicator would be announced twice.',
      },
      {
        guidance: true,
        description:
          'Use theme tokens for every color, radius, and border width in a replacement. Run `astryx docs tokens` for the set.',
      },
      {
        guidance: true,
        description:
          'Render a single root ELEMENT with the border-radius the focus ring should follow. The owner paints the standard ring onto the indicator at focus time (useIndicatorFocusRing) and outline picks up its radius; the ring is never missing (WCAG 2.4.7), only mis-shaped if the root lacks a radius. Do not draw a focus ring yourself.',
      },
      {
        guidance: false,
        description:
          "Thread hover or pressed state in as props. Interaction state reaches an indicator through the owner's CSS ancestor marker.",
      },
      {
        guidance: false,
        description:
          "Assume you are only mounted when selected. The host renders the indicator unconditionally and passes `state` in every state; that is what lets a replacement draw where the default draws nothing (a radio's empty circle on an unchosen row).",
      },
    ],
  },
  components: [
    {
      name: 'CheckboxIndicator',
      displayName: 'Checkbox Indicator',
      description:
        'Checkbox visual: a square box with a checkmark or indeterminate bar. Decorative (aria-hidden); the owner keeps input/role/name/focus/keyboard.',
      propDescriptions: {
        state:
          'which state to draw. An indicator draws in EVERY state: unchecked is an empty box, not nothing.',
        size: 'control size: 20px or 24px.',
        isDisabled:
          'whether the owner is disabled. Purely visual; the owner keeps the real disabled semantics.',
        children:
          'rendered inside the chrome INSTEAD of the state mark. CheckboxInput passes its loading Spinner through while a change action is pending, so a replacement must render children when present or the busy visual is lost.',
      },
    },
    {
      name: 'CheckIndicator',
      displayName: 'Check Indicator',
      description:
        'The mark on a chosen option: a checkmark by default, nothing when unchosen. Map to RadioIndicator for radio visuals on single-selection marks. Renders no chrome of its own (it IS the glyph), so a theme target lands on the same element as astryx-icon.',
      propDescriptions: {
        state:
          'which state to draw. The default renders nothing when unchecked; a replacement may draw in both states.',
        size: 'control size, matching the other indicators.',
        isDisabled:
          'whether the owning row is disabled. Purely visual; the owner keeps the real disabled semantics.',
        children:
          'rendered INSTEAD of the mark, in every state; a host showing a pending Spinner passes it through whether or not the row is chosen.',
      },
    },
    {
      name: 'RadioIndicator',
      displayName: 'Radio Indicator',
      description:
        'Radio visual: a circle with a filled inner dot when selected. Draws in both states; an unselected radio is an empty circle, which is what lets it stand in for a checkmark in a selection slot.',
      propDescriptions: {
        state:
          'which state to draw. Radio belongs to the singleSelection family, which has no partial state.',
        size: 'control size: 20px or 24px.',
        isDisabled:
          'whether the owner is disabled. Purely visual; the owner keeps the real disabled semantics.',
        children: 'rendered inside the chrome INSTEAD of the state mark.',
      },
    },
  ],
};
