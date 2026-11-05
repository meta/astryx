// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useIndicatorFocusRing',
  displayName: 'useIndicatorFocusRing',
  keywords: [
    'focus ring',
    'focus',
    'focus-visible',
    'outline',
    'indicator',
    'checkbox',
    'radio',
    'visually hidden input',
    'keyboard',
    'accessibility',
    'a11y',
    'wcag',
  ],
  params: [
    {
      name: 'containerRef',
      type: 'RefObject<HTMLElement | null>',
      description:
        'Ref to an element wrapping only the indicator, so its single element child is unambiguously the thing to ring.',
      required: true,
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Skip the ring; a disabled control is not focusable.',
      default: 'false',
    },
  ],
  returns: [
    {
      name: 'focusProps',
      type: '{onFocus: (event: FocusEvent<HTMLElement>) => void; onBlur: () => void}',
      description: 'Spread onto the element that owns the focusable input.',
    },
  ],
  usage: {
    description:
      "Draws the standard focus ring on the indicator of a control whose real input is visually hidden; a checkbox or radio focuses an opacity-0 input, so the ring has to appear on the picture beside it. The ring is painted imperatively on the indicator's own element, which is the only element whose border-radius can shape it, and only on :focus-visible, so pointer clicks stay quiet. Owning it here means a theme-supplied indicator cannot ship a control with no visible focus (WCAG 2.4.7) by ignoring a prop.",
    bestPractices: [
      {
        guidance: true,
        description:
          "Wrap only the indicator in the ref'd element; a wrapper holding label text would ring the whole row.",
      },
      {
        guidance: true,
        description:
          'Spread focusProps on the element that contains the hidden input, not on the input itself.',
      },
      {
        guidance: false,
        description:
          'Ask a themeable indicator to draw its own focus ring; a replacement that ignores the prop leaves the control with no visible focus.',
      },
    ],
  },
  relatedComponents: ['CheckboxInput', 'RadioList', 'Selector'],
  relatedHooks: ['useFocusTrap'],
  importPath: '@astryxdesign/core/hooks',
  category: 'focus',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Draws the standard focus ring on the indicator of a control whose input is visually hidden (checkbox / radio). Painted imperatively on the indicator element (only element whose border-radius shapes the outline), on :focus-visible only.',
  paramDescriptions: {
    containerRef:
      'ref to element wrapping ONLY the indicator; its single element child gets the ring.',
    isDisabled: 'skip the ring; disabled control is not focusable.',
  },
  returnDescriptions: {
    focusProps:
      'onFocus / onBlur to spread onto the element owning the focusable input.',
  },
  usage: {
    description:
      'Owner draws the ring so a theme-supplied indicator cannot ship a control w/ no visible focus (WCAG 2.4.7).',
    bestPractices: [
      {
        guidance: true,
        description:
          "Wrap only the indicator in the ref'd element; a wrapper w/ label text rings the whole row.",
      },
      {
        guidance: true,
        description:
          'Spread focusProps on the element containing the hidden input, not the input.',
      },
      {
        guidance: false,
        description:
          'Delegate the ring to a themeable indicator; a replacement that ignores it loses visible focus.',
      },
    ],
  },
};
