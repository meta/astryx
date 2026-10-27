// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input LabDemos rigs, the lab store
 * @output The coverage work, each as a working before-and-after
 * @position /motion/previews
 *
 * The "where to start" list from the brief, minus the presence work that has
 * its own page. Ordered by user-visible impact per unit of work, which is the
 * order the brief argues for and the order these should be picked up in.
 */

import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Grid} from '@astryxdesign/core/Grid';
import {Link} from '@astryxdesign/core/Link';
import {VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {LabPage} from '../PageFrame';
import {ComparePanes, DemoBody, DemoCard, TokenSlider} from '../LabPrimitives';
import {
  CheckTickRig,
  ChipRig,
  DisclosureRig,
  ListReorderRig,
  NavTintRig,
  RailRig,
  SkeletonSwapRig,
  StatCountRig,
  TabIndicatorRig,
} from '../LabDemos';

export default function PreviewsPage() {
  return (
    <LabPage
      title="Live previews"
      intro="The coverage work, each as a working before-and-after. Every control writes a real token, so a value settled here is settled everywhere. Turn the rail up to 4× to judge a curve, then back to 1× to judge whether it is too slow — those are different questions and they need different speeds."
      decides="Sliding indicators, disclosure convergence, the rail, chips, skeletons, lists.">
      <Banner
        status="info"
        title="Ordered by impact per unit of work"
        description={
          <Text>
            This is the brief&rsquo;s where-to-start list with the presence work
            removed, since that has{' '}
            <Link href="/pages/motion-lab/exit-gap/">its own page</Link> and is
            the one thing here blocked on a policy decision. Everything below is
            unblocked and can start as soon as the tokens land.
          </Text>
        }
      />

      <DemoCard
        title="Sliding indicators"
        question="TabList and SegmentedControl share one decision. A travelling indicator crossing five tabs feels different from one crossing two — judge it on the long jump, not the short one."
        badges={<Badge variant="error" label="ADD" />}>
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Today — per-item cross-fade',
              content: <TabIndicatorRig mode="before" />,
            },
            {
              tone: 'after',
              label: 'Proposed — one indicator travels',
              content: <TabIndicatorRig mode="after" />,
            },
          ]}
        />
        <DemoBody>
          <TokenSlider token="--duration-reveal" label="travel" max={700} />
          <Text type="supporting" color="secondary">
            Both panes here are core&rsquo;s <code>TabList</code>. The right one
            is a swizzled copy of that same source with three changes — a{' '}
            <code>hasTravellingIndicator</code> prop, one indicator in the strip
            positioned over the selected tab, and a context flag telling each
            Tab to suppress the indicator it draws for itself. It lives at{' '}
            <code>proposed/TabList/</code>, so the difference you are watching
            is the diff. The position is measured from the DOM rather than
            tracked in state, because the tabs size themselves — that
            ResizeObserver is the only real cost the proposal adds, and is the
            part to review if it ships.
          </Text>
          <Text type="supporting" color="secondary">
            The proposed pane uses <code>--ease-move</code> rather than the
            entry curve, because the indicator is already on screen: it needs a
            legible path, not an arrival accent. This is also the strongest
            candidate for the <code>layout</code> spring, since a travelling
            indicator is exactly the interruptible case.
          </Text>
        </DemoBody>
      </DemoCard>

      <DemoCard
        title="Disclosure bake-off"
        question="Nine surfaces, three techniques, and the newest component uses the one nobody else does. Settle it before more disclosure surfaces get built."
        badges={<Badge variant="warning" label="PARTIAL — three techniques" />}>
        <ComparePanes
          panes={[
            {
              tone: 'neutral',
              label: 'Grid tracks — CodeBlock, Chat',
              content: <DisclosureRig technique="grid" title="Grid tracks" />,
            },
            {
              tone: 'neutral',
              label: 'Height interpolation',
              content: <DisclosureRig technique="height" title="Height" />,
            },
            {
              tone: 'after',
              label: 'Height + offset fade — Collapsible',
              content: <DisclosureRig technique="offset" title="Collapsible" />,
            },
          ]}
        />
        <DemoBody>
          <TokenSlider token="--duration-reveal" label="reveal" max={700} />
          <Text type="supporting" color="secondary">
            There is probably no single winner. A table row cannot be a grid
            container, so Table row expansion and Table tree cannot use the
            grid-track technique whatever the bake-off concludes. The realistic
            outcome is one default plus a documented exception — which is worth
            writing down as the decision, rather than discovering it halfway
            through the convergence work.
          </Text>
        </DemoBody>
      </DemoCard>

      <DemoCard
        title="SideNav rail collapse"
        question="The rail's own width, not just the chevron. width is a layout property, so this is a deliberate criterion-6 exception — does it earn one?"
        badges={<Badge variant="error" label="ADD" />}>
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Today — the rail snaps',
              content: <RailRig mode="before" />,
            },
            {
              tone: 'after',
              label: 'Proposed — the rail animates, the page follows its edge',
              content: <RailRig mode="after" />,
            },
          ]}
        />
        <DemoBody>
          <Text type="supporting" color="secondary">
            Both panes are the real <code>AppShell</code> and{' '}
            <code>SideNav</code>, collapsed through SideNav&rsquo;s own
            controlled <code>collapsible</code> config. The proposal animates
            the rail&rsquo;s width on the lab&rsquo;s collapse-and-expand
            duration (<code>--duration-reveal</code>) and decelerating curve (
            <code>--ease-entry</code>), so tuning either token reaches it. The
            content is AppShell&rsquo;s flex sibling, so its edge follows the
            rail in the same frame with no script per frame. The page is
            anchored to that edge (<code>margin-inline: 0 auto</code>) rather
            than centered in its own widening space, so it moves with the rail
            instead of half as far, and never re-centers. Reduce Motion snaps.
          </Text>
          <Text type="supporting" color="secondary">
            The transform alternative — translate the rail and clip it — keeps
            the animation on the compositor but leaves the content beside it
            un-reflowed until the end, which reads worse than the layout cost.
          </Text>
        </DemoBody>
      </DemoCard>

      <DemoCard
        title="Skeleton → content"
        question="The archetypal hard swap. The failure is that it happens at a moment the user cannot predict."
        badges={<Badge variant="error" label="ADD" />}>
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Today — content hard-swaps',
              content: <SkeletonSwapRig mode="before" />,
            },
            {
              tone: 'after',
              label: 'Proposed — crossfade with overlap',
              content: <SkeletonSwapRig mode="after" />,
            },
          ]}
        />
        <DemoBody>
          <TokenSlider token="--duration-state" label="crossfade" max={400} />
        </DemoBody>
      </DemoCard>

      <DemoCard
        title="Chip add and remove"
        question="Tokenizer, Token and FileInput share this. Removal is the hard half: the chip has to leave while its neighbours close the gap."
        badges={<Badge variant="error" label="ADD" />}>
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Today — instant',
              content: <ChipRig mode="before" />,
            },
            {
              tone: 'after',
              label: 'Proposed — scale in, accelerate away',
              content: <ChipRig mode="after" />,
            },
          ]}
        />
        <DemoBody>
          <TokenSlider token="--duration-enter" label="add" max={500} />
          <TokenSlider token="--duration-exit" label="remove" max={500} />
        </DemoBody>
      </DemoCard>

      <DemoCard
        title="List add, remove and reorder"
        question="Reorder is movement the user did not initiate, so it has to be followable. This is the strongest argument for the layout spring."
        badges={<Badge variant="error" label="ADD" />}>
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Today — instant',
              content: <ListReorderRig mode="before" />,
            },
            {
              tone: 'after',
              label: 'Proposed — FLIP on --ease-move',
              content: <ListReorderRig mode="after" />,
            },
          ]}
        />
        <DemoBody>
          <Text type="supporting" color="secondary">
            FLIP — measure, move, invert, play — is the technique here because
            the rows are genuinely re-laid-out and only the visual correction is
            animated. Try it at 4×: a shuffle that is legible at 4× and
            illegible at 1× means the duration is too short, not that the
            technique is wrong.
          </Text>
        </DemoBody>
      </DemoCard>

      <Grid columns={{minWidth: 420}} gap={4}>
        <DemoCard
          title="Checkbox tick"
          question="A high-frequency surface, so criterion 2 applies: the answer may be that it should be almost nothing."
          badges={<Badge variant="error" label="ADD" />}>
          <ComparePanes
            panes={[
              {
                tone: 'before',
                label: 'Today — real CheckboxInput',
                content: <CheckTickRig technique="hard" />,
              },
              {
                tone: 'neutral',
                label: 'Draw',
                content: <CheckTickRig technique="draw" />,
              },
              {
                tone: 'after',
                label: 'Scale',
                content: <CheckTickRig technique="scale" />,
              },
            ]}
          />
        </DemoCard>

        <DemoCard
          title="Stat value change"
          question="A change of 4 and a change of 4,000 look identical today. Needs a delta threshold, or a jump from 12 to 1,300,000 spins for a second."
          badges={<Badge variant="error" label="ADD" />}>
          <ComparePanes
            panes={[
              {
                tone: 'before',
                label: 'Today — replaces itself',
                content: <StatCountRig mode="before" />,
              },
              {
                tone: 'after',
                label: 'Proposed — counts',
                content: <StatCountRig mode="after" />,
              },
            ]}
          />
        </DemoCard>

        <DemoCard
          title="NavItem hover tint"
          question="Hover a row in each pane. Today the tint snaps on; the proposal fades it on the state token, and narrows the hover gate to a fine pointer that hovers."
          badges={<Badge variant="error" label="ADD" />}>
          <ComparePanes
            panes={[
              {
                tone: 'before',
                label: 'Today — snaps on hover',
                content: <NavTintRig mode="before" />,
              },
              {
                tone: 'after',
                label: 'State token, fine pointers only',
                content: <NavTintRig mode="after" />,
              },
            ]}
          />
        </DemoCard>
      </Grid>

      <VStack gap={2}>
        <Heading level={2}>What is not here</Heading>
        <Text color="secondary">
          Around twenty more previews are specified but not built —
          ContextMenu&rsquo;s pointer-anchored origin, CommandPalette filter
          motion, TreeList depth, TransferList&rsquo;s cross-container move,
          Carousel, Calendar month change, Slider keyboard step, Resizable snap.
          Each one has a written brief saying what it must demonstrate, on{' '}
          <Link href="/pages/motion-lab/preview-plan/">Preview plan</Link>. The
          ones above were built first because each settles a decision that
          blocks other work.
        </Text>
      </VStack>
    </LabPage>
  );
}
