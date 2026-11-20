// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Citation} from '@astryxdesign/core/Citation';
import {Icon} from '@astryxdesign/core/Icon';

const meta: Meta<typeof Citation> = {
  title: 'Core/Citation',
  component: Citation,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['label', 'number'],
      description: 'Display style — label chip or numbered badge',
    },
    number: {
      control: 'number',
      description: 'Citation display number',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Citation>;

export const Label: Story = {
  args: {
    source: {title: 'React Documentation', url: 'https://react.dev'},
    number: 1,
    variant: 'label',
  },
};

export const Number: Story = {
  args: {
    source: {title: 'TypeScript Handbook', url: 'https://typescriptlang.org'},
    number: 2,
    variant: 'number',
  },
};

export const WithIcon: Story = {
  args: {
    source: {
      title: 'GitHub',
      url: 'https://github.com',
      icon: 'https://github.githubassets.com/favicons/favicon.svg',
    },
    number: 3,
    variant: 'label',
  },
};

// An image URL can also be passed via the idiomatic `src` field (mirrors
// Avatar/Thumbnail). Behaves identically to a string `icon`.
export const WithImageSrc: Story = {
  args: {
    source: {
      title: 'GitHub',
      url: 'https://github.com',
      src: 'https://github.githubassets.com/favicons/favicon.svg',
    },
    number: 3,
    variant: 'label',
  },
};

// A real icon: pass an Astryx <Icon> (or any React node) to `icon` instead of
// an image URL. Rendered as-is inside the icon circle.
export const WithNodeIcon: Story = {
  args: {
    source: {
      title: 'Documentation',
      url: 'https://example.com',
      icon: <Icon icon="externalLink" size="sm" />,
    },
    number: 3,
    variant: 'label',
  },
};

export const NoLink: Story = {
  args: {
    source: {title: 'Internal reference'},
    number: 4,
    variant: 'label',
  },
};

// Citations inside a sentence: a label chip, with and without an icon, sits
// centred on the line; a number stays a superscript.
export const InASentence: Story = {
  render: () => (
    <p style={{maxWidth: 520, margin: 0}}>
      Hooks let a function component hold state{' '}
      <Citation
        source={{title: 'React Documentation', url: 'https://react.dev'}}
        number={1}
      />{' '}
      and subscribe to outside data{' '}
      <Citation
        source={{
          title: 'Documentation',
          url: 'https://example.com',
          icon: <Icon icon="externalLink" size="sm" />,
        }}
        number={2}
      />
      , as the guide explains
      <Citation
        source={{
          title: 'TypeScript Handbook',
          url: 'https://typescriptlang.org',
        }}
        number={3}
        variant="number"
      />
      .
    </p>
  ),
};

export const Variants: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
      <Citation
        source={{title: 'React Docs', url: 'https://react.dev'}}
        number={1}
        variant="label"
      />
      <Citation
        source={{title: 'TypeScript', url: 'https://typescriptlang.org'}}
        number={2}
        variant="number"
      />
      <Citation
        source={{
          title: 'GitHub',
          url: 'https://github.com',
          icon: 'https://github.githubassets.com/favicons/favicon.svg',
        }}
        number={3}
        variant="label"
      />
      <Citation
        source={{
          title:
            'A very long source title that should be truncated with ellipsis',
        }}
        number={4}
        variant="label"
      />
    </div>
  ),
};
