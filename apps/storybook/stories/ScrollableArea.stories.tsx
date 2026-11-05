// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent, waitFor} from 'storybook/test';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {Section} from '@astryxdesign/core/Section';
import {Text} from '@astryxdesign/core/Text';
import {
  colorVars,
  radiusVars,
  spacingVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  canvas: {
    padding: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-body'],
  },
  viewport: {
    inlineSize: 340,
    blockSize: 180,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border-emphasized'],
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-surface'],
  },
  viewportWide: {
    inlineSize: 460,
  },
  viewportCompact: {
    inlineSize: 260,
    blockSize: 140,
  },
  containerViewport: {
    blockSize: 180,
  },
  contentPadding: {
    padding: spacingVars['--spacing-3'],
  },
  copy: {
    margin: 0,
    fontFamily: typographyVars['--font-family-body'],
    color: colorVars['--color-text-primary'],
  },
  supportingCopy: {
    color: colorVars['--color-text-secondary'],
  },
  card: {
    inlineSize: 150,
    minBlockSize: 96,
    boxSizing: 'border-box',
    padding: spacingVars['--spacing-3'],
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-background-muted'],
    flexShrink: 0,
  },
  horizontalRail: {
    display: 'flex',
    gap: spacingVars['--spacing-2'],
    inlineSize: 920,
    minBlockSize: 150,
    alignItems: 'stretch',
    padding: spacingVars['--spacing-2'],
  },
  verticalRail: {
    display: 'grid',
    gap: spacingVars['--spacing-2'],
    padding: spacingVars['--spacing-2'],
  },
  twoAxisCanvas: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 180px)',
    gridTemplateRows: 'repeat(4, 120px)',
    gap: spacingVars['--spacing-2'],
    inlineSize: 760,
    blockSize: 540,
    padding: spacingVars['--spacing-2'],
  },
  sticky: {
    position: 'sticky',
    zIndex: 1,
    alignSelf: 'start',
    padding: spacingVars['--spacing-2'],
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-neutral'],
    fontFamily: typographyVars['--font-family-body'],
    color: colorVars['--color-text-primary'],
    containerType: {
      default: null,
      '@supports (container-type: scroll-state)': 'scroll-state',
    },
  },
  stickyInlineStart: {
    insetInlineStart: 0,
  },
  stickyInlineEnd: {
    insetInlineEnd: 0,
  },
  stickyBlockStart: {
    insetBlockStart: 0,
  },
  stickyBlockEnd: {
    insetBlockEnd: 0,
    alignSelf: 'end',
  },
  stickyStateInlineStart: {
    backgroundColor: {
      default: 'transparent',
      '@container scroll-state(stuck: inline-start)':
        colorVars['--color-accent-muted'],
    },
  },
  stickyStateInlineEnd: {
    backgroundColor: {
      default: 'transparent',
      '@container scroll-state(stuck: inline-end)':
        colorVars['--color-accent-muted'],
    },
  },
  stickyStateBlockStart: {
    backgroundColor: {
      default: 'transparent',
      '@container scroll-state(stuck: block-start)':
        colorVars['--color-accent-muted'],
    },
  },
  stickyStateBlockEnd: {
    backgroundColor: {
      default: 'transparent',
      '@container scroll-state(stuck: block-end)':
        colorVars['--color-accent-muted'],
    },
  },
  edgeStatus: {
    position: 'sticky',
    insetBlockStart: 0,
    opacity: 0.45,
  },
  edgeStatusInlineEnd: {
    opacity: {
      default: 0.45,
      '@container scroll-state(scrollable: inline-end)': 1,
    },
  },
  nestedViewport: {
    inlineSize: 280,
    blockSize: 140,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colorVars['--color-border-emphasized'],
    borderRadius: radiusVars['--radius-element'],
  },
  nestedOuter: {
    inlineSize: 320,
    blockSize: 300,
  },
  stickyPassThroughOuter: {
    inlineSize: 360,
    blockSize: 220,
  },
  stickyPassThroughContent: {
    minBlockSize: 720,
    padding: spacingVars['--spacing-3'],
  },
  stickyPassThroughSpacer: {
    blockSize: 180,
    display: 'flex',
    alignItems: 'center',
  },
  stickyPassThroughInner: {
    blockSize: 140,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colorVars['--color-border-emphasized'],
    borderRadius: radiusVars['--radius-element'],
  },
  stickyPassThroughInnerContent: {
    blockSize: 120,
    padding: spacingVars['--spacing-2'],
  },
  stickyPassThroughTail: {
    blockSize: 360,
  },
  verticalWriting: {
    writingMode: 'vertical-rl',
    inlineSize: 220,
    blockSize: 280,
  },
  rtl: {
    direction: 'rtl',
  },
  scrollbarThin: {
    scrollbarWidth: 'thin',
  },
  scrollbarStable: {
    scrollbarGutter: 'stable both-edges',
  },
  scrollbarNeutral: {
    scrollbarColor: `${colorVars['--color-neutral']} transparent`,
  },
  transformedHost: {
    inlineSize: 360,
    transform: 'perspective(700px) rotateY(0deg)',
  },
  clippedFrame: {
    overflow: 'clip',
    borderRadius: radiusVars['--radius-container'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border-emphasized'],
  },
});

const meta = {
  title: 'Core/ScrollableArea',
  component: ScrollableArea,
  tags: ['autodocs'],
  args: {
    axis: 'block',
    label: 'Scrollable example',
    role: 'group',
    overscroll: 'allow',
    stickyContainment: 'whenScrollable',
  },
  argTypes: {
    axis: {control: 'select', options: ['inline', 'block', 'both']},
    role: {control: 'select', options: ['group', 'region']},
    overscroll: {control: 'select', options: ['allow', 'contain']},
    stickyContainment: {
      control: 'select',
      options: ['whenScrollable', 'always'],
    },
  },
} satisfies Meta<typeof ScrollableArea>;

export default meta;
type Story = StoryObj<typeof meta>;

function Cards({count}: {count: number}) {
  return (
    <div {...stylex.props(styles.horizontalRail)}>
      {Array.from({length: count}, (_, index) => (
        <div key={index} {...stylex.props(styles.card)}>
          <p {...stylex.props(styles.copy)}>Project {index + 1}</p>
          <p {...stylex.props(styles.copy, styles.supportingCopy)}>
            Native scrolling content
          </p>
        </div>
      ))}
    </div>
  );
}

function Rows({count}: {count: number}) {
  return (
    <div {...stylex.props(styles.verticalRail)}>
      {Array.from({length: count}, (_, index) => (
        <div key={index} {...stylex.props(styles.card)}>
          <p {...stylex.props(styles.copy)}>Activity {index + 1}</p>
        </div>
      ))}
    </div>
  );
}

export const Playground: Story = {
  render: args => (
    <div {...stylex.props(styles.canvas)}>
      <ScrollableArea {...args} xstyle={styles.viewport}>
        {args.axis === 'block' ? <Rows count={8} /> : <Cards count={8} />}
      </ScrollableArea>
    </div>
  ),
};

function ConditionalKeyboardDemo() {
  const [hasOverflow, setHasOverflow] = useState(false);
  return (
    <VStack gap={3} xstyle={styles.canvas}>
      <HStack gap={2} hAlign="start">
        <Button
          label={hasOverflow ? 'Make content fit' : 'Make content overflow'}
          onClick={() => setHasOverflow(current => !current)}>
          {hasOverflow ? 'Make content fit' : 'Make content overflow'}
        </Button>
        <Text type="supporting" color="secondary">
          Tab after toggling. The viewport is skipped when content fits and
          joins the tab order when content overflows.
        </Text>
      </HStack>
      <ScrollableArea
        axis="block"
        label="Conditional activity list"
        role="region"
        data-evidence="conditional-tabindex"
        xstyle={styles.viewportCompact}>
        <Rows count={hasOverflow ? 8 : 1} />
      </ScrollableArea>
    </VStack>
  );
}

export const ConditionalKeyboardAccess: Story = {
  render: () => <ConditionalKeyboardDemo />,
  play: async ({canvasElement}) => {
    const button = canvasElement.querySelector('button');
    const viewport = canvasElement.querySelector<HTMLElement>(
      '[data-evidence="conditional-tabindex"]',
    );
    expect(button).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (button == null || viewport == null) {
      return;
    }

    await waitFor(() => {
      expect(getComputedStyle(viewport).overflowY).toBe('clip');
      expect(viewport).not.toHaveAttribute('tabindex');
    });
    await userEvent.click(button);
    await waitFor(() => {
      expect(getComputedStyle(viewport).overflowY).toBe('auto');
      expect(viewport).toHaveAttribute('tabindex', '0');
    });
    await userEvent.click(button);
    await waitFor(() => {
      expect(getComputedStyle(viewport).overflowY).toBe('clip');
      expect(viewport).not.toHaveAttribute('tabindex');
    });
  },
  parameters: {controls: {disable: true}},
};

function NestedChainingExample({policy}: {policy: 'allow' | 'contain'}) {
  return (
    <VStack gap={2}>
      <Text weight="semibold">{policy}</Text>
      <ScrollableArea
        axis="block"
        label={`${policy} outer activity`}
        overscroll="allow"
        xstyle={[styles.viewport, styles.nestedOuter]}>
        <VStack gap={3} xstyle={styles.contentPadding}>
          <Text>Scroll the nested areas, then continue at each edge.</Text>
          <ScrollableArea
            axis="block"
            label={`${policy} fitting nested area`}
            overscroll={policy}
            data-evidence={`${policy}-fitting-nested`}
            xstyle={styles.nestedViewport}>
            <Rows count={1} />
          </ScrollableArea>
          <ScrollableArea
            axis="block"
            label={`${policy} overflowing nested area`}
            overscroll={policy}
            data-evidence={`${policy}-overflowing-nested`}
            xstyle={styles.nestedViewport}>
            <Rows count={6} />
          </ScrollableArea>
          <Rows count={4} />
        </VStack>
      </ScrollableArea>
    </VStack>
  );
}

export const Overscroll: Story = {
  render: () => (
    <HStack gap={4} xstyle={styles.canvas}>
      <NestedChainingExample policy="allow" />
      <NestedChainingExample policy="contain" />
    </HStack>
  ),
  parameters: {controls: {disable: true}},
};

function StickyLabel({
  edge,
}: {
  edge: 'inline-start' | 'inline-end' | 'block-start' | 'block-end';
}) {
  const stateStyle =
    edge === 'inline-start'
      ? styles.stickyStateInlineStart
      : edge === 'inline-end'
        ? styles.stickyStateInlineEnd
        : edge === 'block-start'
          ? styles.stickyStateBlockStart
          : styles.stickyStateBlockEnd;
  return <span {...stylex.props(stateStyle)}>{edge}</span>;
}

export const StickyLogicalEdges: Story = {
  render: () => (
    <VStack gap={4} xstyle={styles.canvas}>
      <Text weight="semibold">Inline start and end</Text>
      <ScrollableArea
        axis="inline"
        label="Inline sticky examples"
        data-evidence="sticky-inline"
        xstyle={[styles.viewport, styles.viewportWide]}>
        <div {...stylex.props(styles.horizontalRail)}>
          <div {...stylex.props(styles.sticky, styles.stickyInlineStart)}>
            <StickyLabel edge="inline-start" />
          </div>
          <Cards count={4} />
          <div {...stylex.props(styles.sticky, styles.stickyInlineEnd)}>
            <StickyLabel edge="inline-end" />
          </div>
        </div>
      </ScrollableArea>

      <Text weight="semibold">Block start and end</Text>
      <ScrollableArea
        axis="block"
        label="Block sticky examples"
        data-evidence="sticky-block"
        xstyle={[styles.viewport, styles.viewportWide]}>
        <div {...stylex.props(styles.verticalRail)}>
          <div {...stylex.props(styles.sticky, styles.stickyBlockStart)}>
            <StickyLabel edge="block-start" />
          </div>
          <Rows count={5} />
          <div {...stylex.props(styles.sticky, styles.stickyBlockEnd)}>
            <StickyLabel edge="block-end" />
          </div>
        </div>
      </ScrollableArea>

      <Text weight="semibold">Both axes</Text>
      <ScrollableArea
        axis="both"
        label="Two-axis sticky examples"
        data-evidence="sticky-both"
        xstyle={[styles.viewport, styles.viewportWide]}>
        <div {...stylex.props(styles.twoAxisCanvas)}>
          <div
            {...stylex.props(
              styles.sticky,
              styles.stickyInlineStart,
              styles.stickyBlockStart,
            )}>
            <StickyLabel edge="inline-start" /> ·{' '}
            <StickyLabel edge="block-start" />
          </div>
          {Array.from({length: 14}, (_, index) => (
            <div key={index} {...stylex.props(styles.card)}>
              Cell {index + 1}
            </div>
          ))}
          <div
            {...stylex.props(
              styles.sticky,
              styles.stickyInlineEnd,
              styles.stickyBlockEnd,
            )}>
            <StickyLabel edge="inline-end" /> · <StickyLabel edge="block-end" />
          </div>
        </div>
      </ScrollableArea>
    </VStack>
  ),
  parameters: {controls: {disable: true}},
};

export const FittingStickyPassthrough: Story = {
  render: () => (
    <div {...stylex.props(styles.canvas)}>
      <ScrollableArea
        axis="block"
        label="Outer Sticky owner"
        data-sticky-outer="true"
        xstyle={[styles.viewport, styles.stickyPassThroughOuter]}>
        <div {...stylex.props(styles.stickyPassThroughContent)}>
          <div {...stylex.props(styles.stickyPassThroughSpacer)}>
            <Text>
              Scroll until the fitting inner area reaches the outer viewport.
            </Text>
          </div>
          <ScrollableArea
            axis="block"
            label="Fitting inner area"
            data-sticky-fitting-area="true"
            xstyle={styles.stickyPassThroughInner}>
            <div {...stylex.props(styles.stickyPassThroughInnerContent)}>
              <div
                data-sticky-passthrough="true"
                {...stylex.props(styles.sticky, styles.stickyBlockStart)}>
                Sticky passes through the fitting area
              </div>
              <Text type="supporting">
                This content fits, so the inner viewport uses clip and does not
                capture Sticky.
              </Text>
            </div>
          </ScrollableArea>
          <Text type="supporting">
            Explicit containment keeps the fitting viewport as a Sticky
            boundary.
          </Text>
          <ScrollableArea
            axis="block"
            label="Explicit fitting Sticky boundary"
            stickyContainment="always"
            data-sticky-contained-area="true"
            xstyle={styles.stickyPassThroughInner}>
            <div {...stylex.props(styles.stickyPassThroughInnerContent)}>
              <div {...stylex.props(styles.sticky, styles.stickyBlockStart)}>
                Sticky stays with this fitting area
              </div>
            </div>
          </ScrollableArea>
          <div {...stylex.props(styles.stickyPassThroughTail)} />
        </div>
      </ScrollableArea>
    </div>
  ),
  play: async ({canvasElement}) => {
    await document.fonts.ready;
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    const outer = canvasElement.querySelector<HTMLElement>(
      '[data-sticky-outer="true"]',
    );
    const fittingArea = canvasElement.querySelector<HTMLElement>(
      '[data-sticky-fitting-area="true"]',
    );
    const containedArea = canvasElement.querySelector<HTMLElement>(
      '[data-sticky-contained-area="true"]',
    );
    const sticky = canvasElement.querySelector<HTMLElement>(
      '[data-sticky-passthrough="true"]',
    );
    expect(outer).not.toBeNull();
    expect(fittingArea).not.toBeNull();
    expect(containedArea).not.toBeNull();
    expect(sticky).not.toBeNull();
    if (
      outer == null ||
      fittingArea == null ||
      containedArea == null ||
      sticky == null
    ) {
      return;
    }

    expect(getComputedStyle(fittingArea).overflowX).toBe('clip');
    expect(getComputedStyle(fittingArea).overflowY).toBe('clip');
    expect(fittingArea).not.toHaveAttribute('tabindex');
    expect(getComputedStyle(containedArea).overflowX).toBe('hidden');
    expect(getComputedStyle(containedArea).overflowY).toBe('auto');
    expect(containedArea).not.toHaveAttribute('tabindex');

    outer.scrollTop = 200;
    outer.dispatchEvent(new Event('scroll'));
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    expect(
      Math.abs(
        sticky.getBoundingClientRect().top - outer.getBoundingClientRect().top,
      ),
    ).toBeLessThanOrEqual(2);
    outer.dataset.stickyPassthroughVerified = 'true';
  },
  parameters: {controls: {disable: true}},
};

export const LogicalDirections: Story = {
  render: () => (
    <VStack gap={4} xstyle={styles.canvas}>
      <Text weight="semibold">LTR inline axis</Text>
      <ScrollableArea
        axis="inline"
        label="LTR projects"
        data-evidence="writing-ltr"
        xstyle={styles.viewport}>
        <Cards count={6} />
      </ScrollableArea>
      <Text weight="semibold">RTL inline axis</Text>
      <ScrollableArea
        axis="inline"
        label="RTL projects"
        dir="rtl"
        data-evidence="writing-rtl"
        xstyle={[styles.viewport, styles.rtl]}>
        <Cards count={6} />
      </ScrollableArea>
      <Text weight="semibold">vertical-rl inline axis</Text>
      <ScrollableArea
        axis="inline"
        label="Vertical projects"
        data-evidence="writing-vertical-rl"
        xstyle={styles.verticalWriting}>
        <Cards count={6} />
      </ScrollableArea>
    </VStack>
  ),
  parameters: {controls: {disable: true}},
};

function RTLBehaviorProbeStory() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollToInlineEnd = () => {
    const viewport = viewportRef.current;
    if (viewport == null) {
      return;
    }
    viewport.scrollLeft +=
      getComputedStyle(viewport).direction === 'rtl' ? -160 : 160;
  };

  return (
    <VStack gap={3} xstyle={styles.canvas}>
      <Button
        label="Scroll inline end"
        data-rtl-scroll-button="true"
        onClick={scrollToInlineEnd}>
        Scroll inline end
      </Button>
      <ScrollableArea
        ref={viewportRef}
        axis="inline"
        label="Logical direction probe"
        data-rtl-scroll-probe="true"
        xstyle={styles.viewport}>
        <Cards count={6} />
      </ScrollableArea>
    </VStack>
  );
}

export const RTLBehaviorProbe: Story = {
  render: () => <RTLBehaviorProbeStory />,
  parameters: {controls: {disable: true}},
};

function TransformedClipDemo() {
  const [activations, setActivations] = useState(0);
  return (
    <VStack gap={2} xstyle={styles.canvas}>
      <Text type="supporting" color="secondary">
        The native viewport remains clickable inside a perspective ancestor and
        a clipped rounded frame.
      </Text>
      <div {...stylex.props(styles.transformedHost)}>
        <div {...stylex.props(styles.clippedFrame)}>
          <ScrollableArea
            axis="block"
            label="Transformed clipped activity"
            data-evidence="transformed-clipped"
            xstyle={styles.viewportCompact}>
            <VStack gap={2} xstyle={styles.contentPadding}>
              <Button
                label="Activate clipped target"
                data-transform-hit-target="true"
                onClick={() => setActivations(value => value + 1)}>
                Activate clipped target
              </Button>
              <Text data-transform-hit-count="true">
                Activations: {activations}
              </Text>
              <Rows count={5} />
            </VStack>
          </ScrollableArea>
        </div>
      </div>
    </VStack>
  );
}

export const TransformedClippedAncestor: Story = {
  render: () => <TransformedClipDemo />,
  parameters: {controls: {disable: true}},
};

export const ContainerIntegration: Story = {
  render: () => (
    <div {...stylex.props(styles.canvas)}>
      <Section padding={4} width={340}>
        <ScrollableArea
          axis="block"
          label="Full-bleed activity"
          isFullBleed
          padding={3}
          data-evidence="container-integration"
          xstyle={styles.containerViewport}>
          <Rows count={6} />
        </ScrollableArea>
      </Section>
    </div>
  ),
  parameters: {controls: {disable: true}},
};

export const NativeScrollbarPresentation: Story = {
  render: () => (
    <VStack gap={4} xstyle={styles.canvas}>
      <Text weight="semibold">Platform default with neutral thumb</Text>
      <ScrollableArea
        axis="inline"
        label="Default native scrollbar"
        data-evidence="scrollbar-default"
        xstyle={styles.viewport}>
        <Cards count={6} />
      </ScrollableArea>
      <Text weight="semibold">Thin width and stable gutter</Text>
      <ScrollableArea
        axis="inline"
        label="Thin stable native scrollbar"
        data-evidence="scrollbar-thin-stable"
        xstyle={[
          styles.viewport,
          styles.scrollbarThin,
          styles.scrollbarStable,
        ]}>
        <Cards count={6} />
      </ScrollableArea>
      <Text weight="semibold">
        Consumer neutral override, transparent track
      </Text>
      <ScrollableArea
        axis="inline"
        label="Neutral native scrollbar"
        data-evidence="scrollbar-neutral"
        xstyle={[styles.viewport, styles.scrollbarNeutral]}>
        <Cards count={6} />
      </ScrollableArea>
    </VStack>
  ),
  parameters: {controls: {disable: true}},
};
