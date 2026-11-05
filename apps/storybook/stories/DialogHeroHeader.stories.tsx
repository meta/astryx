// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DialogHeroHeader.stories.tsx
 * @input DialogHeroHeader and its Dialog, Layout, Heading, and media composition
 * @output Inline visual states, an interactive modal example, and a media
 *   bleed geometry guard across Dialog paddings and RTL
 * @position Storybook coverage for the experimental hero header; the geometry
 *   story's play function is required CI via story-play-guard.js
 */

import {
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type CSSProperties,
} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {DialogHeroHeader} from '@astryxdesign/lab';
import {Dialog} from '@astryxdesign/core/Dialog';
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  HStack,
} from '@astryxdesign/core/Layout';
import {Button} from '@astryxdesign/core/Button';
import {Heading} from '@astryxdesign/core/Heading';
import {Icon} from '@astryxdesign/core/Icon';
import {Text} from '@astryxdesign/core/Text';
import DialogHeroHeaderShowcase from '../../../packages/lab/blocks/DialogHeroHeaderShowcase';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  heroSvg: {
    display: 'block',
  },
});

// Self-contained stand-in for a hero image / illustration. A real app would
// pass an <img>, <video>, or illustration component sized to fill the slot.
function HeroMedia({mode = 'dark'}: {mode?: 'dark' | 'light'}) {
  const gradientId = useId();
  const [from, to, accent] =
    mode === 'dark'
      ? ['#1c2340', '#3b2d5e', '#8ba7ff']
      : ['#e8ecfb', '#f6e9f2', '#5b74d6'];
  return (
    <svg
      viewBox="0 0 400 160"
      width="100%"
      height="160"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      {...stylex.props(styles.heroSvg)}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="400" height="160" fill={`url(#${gradientId})`} />
      <circle cx="330" cy="40" r="52" fill={accent} opacity="0.35" />
      <circle cx="70" cy="140" r="70" fill={accent} opacity="0.25" />
      <circle cx="200" cy="80" r="34" fill={accent} opacity="0.55" />
    </svg>
  );
}

const meta: Meta<typeof DialogHeroHeader> = {
  title: 'Lab/DialogHeroHeader',
  component: DialogHeroHeader,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DialogHeroHeader>;

/** The same block is discoverable through the Lab integration and canary docsite. */
export const Showcase: Story = {
  render: () => <DialogHeroHeaderShowcase />,
};

/**
 * The hero header drops into Layout's header slot exactly like DialogHeader.
 * The media bleeds to the dialog's edges; the close button overlays its
 * top-trailing corner. `mediaMode="dark"` composes MediaTheme so the close
 * button stays legible over the dark artwork.
 */
export const Basic: Story = {
  render: () => (
    <Dialog isOpen isInline onOpenChange={() => {}}>
      <Layout
        header={
          <DialogHeroHeader
            title="Welcome aboard"
            media={<HeroMedia mode="dark" />}
            mediaMode="dark"
            onOpenChange={() => {}}
          />
        }
        content={
          <LayoutContent>
            <Text type="body">
              Set up your workspace in three quick steps. You can change any of
              this later in Settings.
            </Text>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label="Skip" variant="secondary" />
              <Button label="Get started" variant="primary" />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  ),
};

/**
 * Light media inverts the overlay treatment: `mediaMode="light"` gives the
 * close button dark, contrast-safe tokens.
 */
export const LightMedia: Story = {
  render: () => (
    <Dialog isOpen isInline onOpenChange={() => {}}>
      <Layout
        header={
          <DialogHeroHeader
            title="New in this release"
            media={<HeroMedia mode="light" />}
            mediaMode="light"
            onOpenChange={() => {}}
          />
        }
        content={
          <LayoutContent>
            <Text type="body">
              Charts now support streaming data, and the command palette learned
              fuzzy matching.
            </Text>
          </LayoutContent>
        }
      />
    </Dialog>
  ),
};

/**
 * `startContent` renders inline before the title; `maxLines` truncates long
 * auto-wrapped titles with an ellipsis.
 */
export const StartContentAndTruncation: Story = {
  render: () => (
    <Dialog isOpen isInline onOpenChange={() => {}}>
      <Layout
        header={
          <DialogHeroHeader
            title="A launch announcement with a title long enough to need truncation in a narrow dialog"
            media={<HeroMedia mode="dark" />}
            mediaMode="dark"
            startContent={<Icon icon="info" size="sm" />}
            maxLines={1}
            onOpenChange={() => {}}
          />
        }
        content={
          <LayoutContent>
            <Text type="body">
              The full title stays available to screen readers and in the
              truncation tooltip.
            </Text>
          </LayoutContent>
        }
      />
    </Dialog>
  ),
};

/**
 * When the artwork carries the message, hide the title row visually with
 * `isTitleHidden`. The title still names the dialog for screen readers.
 * Passing a Heading element instead of a string customizes the treatment.
 */
export const HiddenTitleAndCustomHeading: Story = {
  render: () => (
    <HStack gap={4} wrap="wrap">
      <Dialog isOpen isInline onOpenChange={() => {}} width={320}>
        <Layout
          header={
            <DialogHeroHeader
              title="Spring theme refresh"
              media={<HeroMedia mode="light" />}
              mediaMode="light"
              isTitleHidden
              onOpenChange={() => {}}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">
                The media speaks for itself; the hidden title still names the
                dialog.
              </Text>
            </LayoutContent>
          }
        />
      </Dialog>
      <Dialog isOpen isInline onOpenChange={() => {}} width={320}>
        <Layout
          header={
            <DialogHeroHeader
              title={
                <Heading level={2} type="display-3">
                  Big moment
                </Heading>
              }
              media={<HeroMedia mode="dark" />}
              mediaMode="dark"
              onOpenChange={() => {}}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">
                A caller-provided Heading element renders as-is for custom
                treatments.
              </Text>
            </LayoutContent>
          }
        />
      </Dialog>
    </HStack>
  ),
};

/**
 * Full modal behavior: the title receives focus on open and names the dialog
 * via aria-labelledby; Escape and the overlaid close button both close.
 */
export const Modal: Story = {
  render: function ModalExample() {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button
          label="Open hero dialog"
          variant="secondary"
          onClick={() => setIsOpen(true)}
        />
        <Dialog isOpen={isOpen} onOpenChange={setIsOpen}>
          <Layout
            header={
              <DialogHeroHeader
                title="Welcome aboard"
                media={<HeroMedia mode="dark" />}
                mediaMode="dark"
                onOpenChange={setIsOpen}
              />
            }
            content={
              <LayoutContent>
                <Text type="body">
                  Set up your workspace in three quick steps.
                </Text>
              </LayoutContent>
            }
            footer={
              <LayoutFooter>
                <HStack gap={2} hAlign="end">
                  <Button
                    label="Get started"
                    variant="primary"
                    onClick={() => setIsOpen(false)}
                  />
                </HStack>
              </LayoutFooter>
            }
          />
        </Dialog>
      </>
    );
  },
};

/** Optional close controls and divider follow the surrounding Layout. */
export const WithoutCloseButton: Story = {
  render: () => (
    <Dialog isOpen isInline onOpenChange={() => {}}>
      <Layout
        defaultHasDividers
        header={
          <DialogHeroHeader
            title="A new view of your workspace"
            media={<HeroMedia />}
          />
        }
        content={
          <LayoutContent>
            <Text type="body">
              Close controls are supplied only when needed.
            </Text>
          </LayoutContent>
        }
      />
    </Dialog>
  ),
};

/** Logical positioning keeps the overlay on the trailing edge in RTL. */
export const RightToLeft: Story = {
  render: () => (
    <div dir="rtl">
      <Dialog isOpen isInline onOpenChange={() => {}} padding={8}>
        <Layout
          header={
            <DialogHeroHeader
              title="مرحبًا بك"
              media={<HeroMedia mode="light" />}
              mediaMode="light"
              startContent={<Icon icon="info" size="sm" />}
              onOpenChange={() => {}}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">جهّز مساحة عملك في ثلاث خطوات بسيطة.</Text>
            </LayoutContent>
          }
        />
      </Dialog>
    </div>
  ),
};

type MediaBleedFixture = {
  id: string;
  dir: 'ltr' | 'rtl';
  padding?: ComponentProps<typeof Dialog>['padding'];
  /** Public theme property set on an ancestor instead of the `padding` prop. */
  themePadding?: number;
};

/**
 * Representative Dialog paddings: the theme default, the zero and small/large
 * `padding` steps, a public theme override that is not a spacing step, and the
 * same large and theme paths under RTL.
 */
const MEDIA_BLEED_FIXTURES: MediaBleedFixture[] = [
  {id: 'theme-default', dir: 'ltr'},
  {id: 'padding-0', dir: 'ltr', padding: 0},
  {id: 'padding-2', dir: 'ltr', padding: 2},
  {id: 'padding-8', dir: 'ltr', padding: 8},
  {id: 'theme-override', dir: 'ltr', themePadding: 20},
  {id: 'rtl-padding-8', dir: 'rtl', padding: 8},
  {id: 'rtl-theme-override', dir: 'rtl', themePadding: 20},
];

/** Sets Dialog's public theme padding the way a theme would. */
function themePaddingStyle(
  padding: number | undefined,
): (CSSProperties & {'--astryx-dialog-padding': string}) | undefined {
  if (padding == null) {
    return undefined;
  }
  return {'--astryx-dialog-padding': `${padding}px`};
}

function assertBleedGeometry(label: string, actual: number, expected: number) {
  if (Math.abs(actual - expected) > 0.5) {
    throw new Error(
      `${label}: expected ${expected.toFixed(2)}px, received ${actual.toFixed(2)}px`,
    );
  }
}

/**
 * Browser geometry guard for the media's edge compensation, run in CI by
 * `.github/scripts/story-play-guard.js`. In every fixture the media area must
 * reach the dialog surface's inline-start, inline-end, and block-start edges
 * while the title stays inset by the header padding the media cancels. Edges
 * are measured logically, so the RTL fixtures prove the same contract with
 * inline-start on the right. Expected insets are read back from the rendered
 * DOM; only the theme override's declared value is restated.
 */
export const MediaBleedGeometry: Story = {
  render: () => (
    <div style={{display: 'flex', flexWrap: 'wrap', gap: 24}}>
      {MEDIA_BLEED_FIXTURES.map(({id, dir, padding, themePadding}) => (
        <div
          key={id}
          dir={dir}
          data-media-bleed-fixture={id}
          style={themePaddingStyle(themePadding)}>
          <Dialog
            isOpen
            isInline
            onOpenChange={() => {}}
            padding={padding}
            width={320}
            data-media-bleed-surface="">
            <Layout
              header={
                <DialogHeroHeader
                  title={id}
                  media={<HeroMedia mode="dark" />}
                  mediaMode="dark"
                  onOpenChange={() => {}}
                />
              }
              content={
                <LayoutContent>
                  <Text type="body">Media bleed fixture</Text>
                </LayoutContent>
              }
            />
          </Dialog>
        </div>
      ))}
    </div>
  ),
  play: async ({canvasElement}) => {
    await document.fonts.ready;
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    const insets = new Map<string, number>();
    for (const {id, dir, themePadding} of MEDIA_BLEED_FIXTURES) {
      const fixture = canvasElement.querySelector<HTMLElement>(
        `[data-media-bleed-fixture="${id}"]`,
      );
      const surface = fixture?.querySelector<HTMLElement>(
        '[data-media-bleed-surface]',
      );
      const mediaArea = fixture?.querySelector('svg')?.parentElement;
      const headerBox = mediaArea?.parentElement;
      const title = fixture?.querySelector<HTMLElement>('h2');
      if (!surface || !mediaArea || !headerBox || !title) {
        throw new Error(`${id}: media bleed fixture did not render`);
      }

      const surfaceRect = surface.getBoundingClientRect();
      const fromStart = (x: number) =>
        dir === 'rtl' ? surfaceRect.right - x : x - surfaceRect.left;
      const fromEnd = (x: number) =>
        dir === 'rtl' ? x - surfaceRect.left : surfaceRect.right - x;
      const startEdge = (rect: DOMRect) =>
        dir === 'rtl' ? rect.right : rect.left;
      const endEdge = (rect: DOMRect) =>
        dir === 'rtl' ? rect.left : rect.right;

      const mediaRect = mediaArea.getBoundingClientRect();
      const headerRect = headerBox.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      const headerStyle = getComputedStyle(headerBox);
      const inset =
        fromStart(startEdge(headerRect)) +
        Number.parseFloat(headerStyle.paddingInlineStart);
      const endInset =
        fromEnd(endEdge(headerRect)) +
        Number.parseFloat(headerStyle.paddingInlineEnd);
      const blockInset =
        headerRect.top -
        surfaceRect.top +
        Number.parseFloat(headerStyle.paddingBlockStart);

      // The media cancels exactly the padding around it on its three edges.
      assertBleedGeometry(
        `${id} media inline-start`,
        fromStart(startEdge(mediaRect)),
        0,
      );
      assertBleedGeometry(
        `${id} media inline-end`,
        fromEnd(endEdge(mediaRect)),
        0,
      );
      assertBleedGeometry(
        `${id} media block-start`,
        mediaRect.top - surfaceRect.top,
        0,
      );
      // ...while the title keeps that padding, so the fixture is not vacuous.
      assertBleedGeometry(
        `${id} title inline-start`,
        fromStart(startEdge(titleRect)),
        inset,
      );
      if (
        id !== 'padding-0' &&
        (inset <= 0 || endInset <= 0 || blockInset <= 0)
      ) {
        throw new Error(
          `${id}: expected nonzero header padding to cancel, received ${inset}/${endInset}/${blockInset}px`,
        );
      }
      if (themePadding != null) {
        assertBleedGeometry(`${id} theme inset`, inset, themePadding);
      }
      insets.set(id, inset);
    }

    // Padding steps must actually move the inset the media cancels.
    const zero = insets.get('padding-0') ?? Number.NaN;
    const small = insets.get('padding-2') ?? Number.NaN;
    const large = insets.get('padding-8') ?? Number.NaN;
    assertBleedGeometry('padding-0 inset', zero, 0);
    if (!(small > zero && large > small)) {
      throw new Error(
        `padding steps did not order the insets: 0=${zero}, 2=${small}, 8=${large}`,
      );
    }
    assertBleedGeometry(
      'rtl padding-8 mirrors ltr',
      insets.get('rtl-padding-8') ?? Number.NaN,
      large,
    );
  },
};

const CUSTOM_HEADING_RERENDERS = 3;

async function waitForCondition(
  isMet: () => boolean,
  description: string,
): Promise<void> {
  const deadline = performance.now() + 5000;
  while (!isMet()) {
    if (performance.now() > deadline) {
      throw new Error(`timed out waiting until ${description}`);
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
}

function describeElement(element: Element | null): string {
  if (element == null) {
    return 'null';
  }
  const id = element.id === '' ? '' : `#${element.id}`;
  return `<${element.tagName.toLowerCase()}${id}>`;
}

/**
 * Regression fixture for a caller-provided heading in an open modal. The
 * story re-renders the header after the modal opens, and every render passes
 * a new `title` element. Focus must stay on the heading: Chromium blurs a
 * focused element whose tabindex is removed, so a handshake that removes and
 * adds its attributes on each render moves focus to the page body. The
 * heading must also keep naming the dialog. Kept off the docs page because
 * the modal opens on load.
 */
export const CustomHeadingFocusAfterRerender: Story = {
  tags: ['!autodocs'],
  render: function CustomHeadingFocusAfterRerenderExample() {
    const [renderCount, setRenderCount] = useState(0);
    useEffect(() => {
      if (renderCount >= CUSTOM_HEADING_RERENDERS) {
        return;
      }
      const timer = setTimeout(() => setRenderCount(count => count + 1), 50);
      return () => clearTimeout(timer);
    }, [renderCount]);
    return (
      <Dialog isOpen onOpenChange={() => {}}>
        <Layout
          header={
            <DialogHeroHeader
              title={
                <Heading level={1} type="display-3">
                  Big moment
                </Heading>
              }
              media={<HeroMedia mode="dark" />}
              mediaMode="dark"
              onOpenChange={() => {}}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">
                <span data-rerender-count={renderCount}>
                  Re-renders after opening: {renderCount}
                </span>
              </Text>
            </LayoutContent>
          }
        />
      </Dialog>
    );
  },
  play: async ({canvasElement}) => {
    const doc = canvasElement.ownerDocument;
    await waitForCondition(
      () =>
        doc.querySelector(
          `[data-rerender-count="${CUSTOM_HEADING_RERENDERS}"]`,
        ) != null,
      `the header re-rendered ${CUSTOM_HEADING_RERENDERS} times after opening`,
    );
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const heading = doc.querySelector<HTMLElement>('dialog[open] h1');
    if (heading == null) {
      throw new Error('the open modal did not render the custom h1 heading');
    }
    if (doc.activeElement !== heading) {
      throw new Error(
        `focus left the custom heading after a re-render: ${describeElement(doc.activeElement)}`,
      );
    }
    const dialog = heading.closest('dialog');
    if (
      heading.id === '' ||
      dialog?.getAttribute('aria-labelledby') !== heading.id
    ) {
      throw new Error(
        `the custom heading no longer names the dialog: heading id "${heading.id}", aria-labelledby "${dialog?.getAttribute('aria-labelledby')}"`,
      );
    }
  },
};
