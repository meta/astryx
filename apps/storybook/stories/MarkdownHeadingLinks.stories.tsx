// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Markdown} from '@astryxdesign/core/Markdown';
import {createMarkdownHeadingLinks} from '@astryxdesign/core/Markdown/plugins';
import {expect, userEvent, within} from 'storybook/test';

const styles = stylex.create({
  geometryReference: {
    position: 'absolute',
    visibility: 'hidden',
    pointerEvents: 'none',
  },
});

const meta: Meta<typeof Markdown> = {
  title: 'Core/Markdown',
  component: Markdown,
};

export default meta;
type Story = StoryObj<typeof Markdown>;

const SOURCE = [
  '# Linkable headings',
  '',
  'Hover a heading area or move keyboard focus to reveal the `#` copy button. On touch it stays visible. Activating it copies the full permalink without changing the current hash, scroll position, or page.',
  '',
  '> ## Nested heading',
  '',
  '## Read the [guide](https://example.com/guide)',
  '',
  '### Third-level heading',
  '',
  '#### Fourth-level heading',
  '',
  '##### Fifth-level heading',
  '',
  '###### Sixth-level heading',
  '',
  '## A narrow heading whose trailing control stays with its final text line',
  '',
  '## Ｈｅｌｌｏ Привет 你好 😄 １２３',
  '',
  '## Repeat',
  '',
  '## Repeat',
  '',
  '## Repeat-1',
].join('\n');

const ltrPlugins = [
  createMarkdownHeadingLinks({headingIdPrefix: 'heading-links-ltr'}),
];
const rtlPlugins = [
  createMarkdownHeadingLinks({headingIdPrefix: 'heading-links-rtl'}),
];
const compactPlugins = [
  createMarkdownHeadingLinks({headingIdPrefix: 'heading-links-compact'}),
];

export const HeadingLinks: Story = {
  name: 'Heading links',
  parameters: {
    docs: {
      description: {
        story:
          'The opt-in first-party module gives every built-in h1–h6 an inline trailing # copy button. It is hidden at fine-pointer rest, reveals when the heading row is hovered or receives keyboard focus, and follows useContainerReveal touch behavior. Activating it copies the canonical permalink without navigation, hash mutation, or scrolling; the fixed-space # becomes a check for ~1.5 seconds. The coarse target keeps the 24px AA floor while its painted control remains centered on the heading line box. Nested headings share the depth-first allocator, authored heading links remain valid, Unicode ids remain readable, and a caller-owned namespace keeps multiple documents distinct.',
      },
    },
  },
  render: () => (
    <>
      <Markdown id="heading-links-ltr" plugins={ltrPlugins}>
        {SOURCE}
      </Markdown>
      <section dir="rtl" aria-label="Right-to-left heading links">
        <Markdown id="heading-links-rtl" plugins={rtlPlugins}>
          {'# عنوان قابل للربط\n\n## تفاصيل'}
        </Markdown>
      </section>
      <section aria-label="Compact heading links">
        <Markdown
          id="heading-links-compact"
          density="compact"
          plugins={compactPlugins}>
          {[
            '# Compact first-level heading',
            '## Compact second-level heading',
            '### Compact third-level heading',
            '#### Compact fourth-level heading',
            '##### Compact fifth-level heading',
            '###### Compact sixth-level heading',
            '###### Compact sixth-level heading',
          ].join('\n\n')}
        </Markdown>
      </section>
      <div aria-hidden="true" {...stylex.props(styles.geometryReference)}>
        <Markdown id="heading-links-reference">{SOURCE}</Markdown>
      </div>
    </>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    const ltr = canvasElement.querySelector<HTMLElement>('#heading-links-ltr');
    if (ltr == null) {
      throw new Error('missing namespaced Markdown root');
    }

    const firstHeading = within(ltr).getByRole('heading', {
      name: 'Linkable headings',
    });
    await expect(firstHeading).toHaveAttribute(
      'id',
      'heading-links-ltr--linkable-headings',
    );
    const firstPermalink = within(ltr).getByRole('button', {
      name: 'Copy link to Linkable headings',
    });
    await expect(firstPermalink).toHaveAttribute('type', 'button');
    await expect(firstPermalink).not.toHaveAttribute('href');
    await expect(firstHeading.parentElement).toContainElement(firstPermalink);
    await expect(firstHeading).not.toContainElement(firstPermalink);

    for (const [level, name] of [
      [1, 'Linkable headings'],
      [2, 'Read the guide'],
      [3, 'Third-level heading'],
      [4, 'Fourth-level heading'],
      [5, 'Fifth-level heading'],
      [6, 'Sixth-level heading'],
    ] as const) {
      const heading = within(ltr).getByRole('heading', {level, name});
      const button = within(heading.parentElement as HTMLElement).getByRole(
        'button',
      );
      await expect(button).toHaveAccessibleName(`Copy link to ${name}`);
    }

    await expect(
      within(ltr).getByRole('heading', {name: 'Nested heading'}),
    ).toHaveAttribute('id', 'heading-links-ltr--nested-heading');
    await expect(
      within(ltr).getByRole('heading', {name: 'Read the guide'}),
    ).toContainElement(within(ltr).getByRole('link', {name: 'guide'}));
    await expect(ltr.querySelector('a a')).toBeNull();
    await expect(
      within(ltr).getByRole('heading', {name: /Ｈｅｌｌｏ Привет 你好/}),
    ).toHaveAttribute('id', 'heading-links-ltr--hello-привет-你好-123');
    await expect(
      Array.from(ltr.querySelectorAll('h1,h2'))
        .slice(-3)
        .map(node => node.id),
    ).toEqual([
      'heading-links-ltr--repeat',
      'heading-links-ltr--repeat-1',
      'heading-links-ltr--repeat-1-1',
    ]);

    await userEvent.tab();
    await expect(firstPermalink).toHaveFocus();
    await expect(
      canvas.getByRole('button', {name: 'Copy link to عنوان قابل للربط'}),
    ).toHaveAttribute('type', 'button');
    firstPermalink.blur();
    ltr.dataset.headingLinksPlayComplete = 'true';
  },
};
