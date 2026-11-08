// Copyright (c) Meta Platforms, Inc. and affiliates.

export const docs = {
  name: 'AccessibilityOverlayFixture',
  displayName: 'Accessibility Overlay Fixture',
  category: 'Test',
  usage: {
    description: 'Base description.',
    bestPractices: [
      {
        guidance: true,
        description: 'Base-only best practice.',
      },
    ],
    accessibility: [
      {
        name: 'Accessible name',
        description: 'Provide an accessible name.',
      },
    ],
    accessibilityThemeCoverage: [
      {
        theme: 'Fixture',
        tables: [
          {
            modes: [
              {mode: 'Light', results: []},
              {mode: 'Dark', results: []},
            ],
          },
        ],
        notMeasured: ['Decorative track — Not part of the contrast audit.'],
      },
    ],
    anatomy: [
      {
        name: 'Track',
        required: true,
        description: 'The rail that shows the current on/off state.',
      },
      {
        name: 'Thumb',
        required: true,
        description: 'The control that moves along the track.',
      },
    ],
  },
  props: [],
};

export const docsZh = {
  name: 'AccessibilityOverlayFixture',
  displayName: 'Accessibility Overlay Fixture',
  category: 'Test',
  usage: {
    description: 'Translated full-doc description.',
  },
  props: [],
};

export const docsDense = {
  usage: {
    description: 'Dense description.',
  },
  props: [],
};
