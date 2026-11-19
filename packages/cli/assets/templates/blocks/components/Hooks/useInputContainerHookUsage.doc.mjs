// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useInputContainer',
  name: 'useInputContainer — Search Field Wrapper',
  displayName: 'useInputContainer — Search Field Wrapper',
  description:
    'A custom search field wrapper with a leading search icon, padding and a trailing Clear button. useInputContainer puts focus in the input when the icon or the padding is clicked, while a click on Clear empties the field without the wrapper taking it over.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Icon', 'InputClearButton'],
  icons: {MagnifyingGlassIcon: 'search'},
};
