// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input LabDemos rigs, published guidance, the lab store
 * @output The exit-gap argument, with both documents on screen
 * @position /motion/exit-gap
 *
 * The brief calls this the single highest-leverage fix in the audit, on the
 * strength of eleven components that animate in and vanish out. Checked
 * against the sources the brief itself cites, most of those eleven are correct
 * as they are: an exit earns its place when it aids orientation, and the
 * surfaces the user has already looked away from do not qualify.
 *
 * So the page argues something narrower than the brief does, and has to,
 * because three of the four surfaces it demos are named in the published docs
 * as instant-dismissal cases. What survives is the infrastructure finding:
 * useLayer cannot express an exit at all, which blocks the handful of surfaces
 * that genuinely want one.
 */

import * as stylex from '@stylexjs/stylex';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Grid} from '@astryxdesign/core/Grid';
import {Link} from '@astryxdesign/core/Link';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {LabPage} from '../PageFrame';
import {ComparePanes, DemoBody, DemoCard, TokenSlider} from '../LabPrimitives';
import {DialogRig, LayerRig, NativePopoverProbe} from '../LabDemos';
import {CORRECTED_EXIT_RULE, GUIDANCE_CONFLICTS} from '../publishedGuidance';

const sx = stylex.create({
  full: {width: '100%'},
  quote: {
    borderInlineStartWidth: '2px',
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: 'var(--color-border)',
    paddingInlineStart: '12px',
    maxWidth: '62ch',
  },
});

/** The eleven, as the brief lists them, plus the dialog family. */
const LAYER_CONSUMERS = [
  'Tooltip',
  'HoverCard',
  'Popover',
  'DropdownMenu',
  'ContextMenu',
  'Selector',
  'ComplexSelector',
  'PowerSearch',
  'Typeahead',
  'MoreMenu',
  'Breadcrumbs overflow',
];

/**
 * The same list, sorted by whether an exit would aid orientation — which is
 * the test the sources actually support, rather than "is it a presence
 * surface".
 *
 * This is a judgement, not a measurement: the generator can see that a
 * component has no exit, and cannot see whether it wants one. Argue with the
 * rows. The three marked `named` are quoted verbatim in the published page as
 * surfaces that may disappear instantly, so those are not a judgement at all.
 */
const EXIT_TRIAGE: ReadonlyArray<{
  readonly surface: string;
  readonly earns: boolean;
  readonly named?: boolean;
  readonly why: string;
}> = [
  {
    surface: 'Dialog, AlertDialog',
    earns: true,
    why: 'Dismissal reveals the page underneath, and the user chose it deliberately. The published page names a dialog as its own example of an exit worth animating.',
  },
  {
    surface: 'Lightbox',
    earns: true,
    why: 'Full-screen. Without an exit the underlying page reappears with no explanation of where the image went.',
  },
  {
    surface: 'BottomSheet, MobileNav',
    earns: true,
    why: 'Spatially anchored to an edge, so the exit has an obvious direction and the entrance already established it.',
  },
  {
    surface: 'CommandPalette',
    earns: true,
    why: 'Modal and it covers content — but it is also a power-user surface hit many times a day, so this is the row most likely to flip on frequency grounds.',
  },
  {
    surface: 'Tooltip',
    earns: false,
    named: true,
    why: 'The pointer has already left. Highest-frequency surface in the system, so criterion 2 argues against motion here even before orientation does.',
  },
  {
    surface: 'HoverCard',
    earns: false,
    named: true,
    why: 'Same shape as Tooltip: dismissal is a side effect of the user moving somewhere else.',
  },
  {
    surface: 'DropdownMenu, ContextMenu',
    earns: false,
    named: true,
    why: 'The menu has done its job the moment a pick is made, and attention has moved to whatever the pick affected.',
  },
  {
    surface: 'Popover',
    earns: false,
    why: 'Not named on the page, but the same class. Worth a second look if a popover is ever used as a panel rather than a hint.',
  },
  {
    surface: 'Selector, ComplexSelector, MultiSelector, Tokenizer',
    earns: false,
    why: 'Dropdown-class. Attention is on the field and the value that just landed in it, not on the list closing.',
  },
  {
    surface: 'Typeahead, PowerSearch, MoreMenu, Breadcrumbs overflow',
    earns: false,
    why: 'Same. All of these are the user getting somewhere, and the surface closing is not the event.',
  },
];

const RIGS = [
  {
    title: 'Tooltip',
    subtitle: 'useLayer · highest-frequency surface in the system',
    triggerLabel: 'Hover me',
    trigger: 'hover' as const,
    origin: 'top center',
    question:
      'The published page names tooltips specifically as a surface that may vanish. Does the exit earn its 175ms here, on something seen hundreds of times a day?',
  },
  {
    title: 'HoverCard',
    subtitle: 'useLayer · the most visible instance of the gap',
    triggerLabel: 'Hover a name',
    trigger: 'hover' as const,
    origin: 'top left',
    question:
      'A larger surface travelling the same distance. Judge the scale-from value here rather than on Tooltip — 0.96 reads differently at size.',
  },
  {
    title: 'Popover',
    subtitle: 'useLayer',
    triggerLabel: 'Click me',
    trigger: 'click' as const,
    origin: 'top left',
    question:
      'Click twice quickly. The exit has to retarget rather than restart, or rapid dismissal looks broken.',
  },
  {
    title: 'DropdownMenu',
    subtitle: 'useLayer · submenus too',
    triggerLabel: 'Open menu',
    trigger: 'click' as const,
    origin: 'top left',
    question:
      'A menu snapping shut is the case people notice. Does the exit help, or does it just delay the next click?',
  },
];

export default function ExitGapPage() {
  const conflict = GUIDANCE_CONFLICTS.find(c => c.id === 'exit-optional');
  const blocking = GUIDANCE_CONFLICTS.find(c => c.id === 'blocking');

  return (
    <LabPage
      title="The exit gap"
      intro="Eleven components animate in and vanish out, and the brief calls fixing all eleven the highest-leverage change in the audit. Checked against the sources it cites, most of them are already right: an exit earns its place when it aids orientation, and a surface the user has already looked away from does not qualify. What survives is narrower and still worth doing — useLayer cannot express an exit at all, which blocks the four or five surfaces that genuinely want one."
      decides="Which surfaces earn an animated exit, and what enter and exit cost on the ones that do."
      badges={<Badge variant="warning" label="the brief overreaches here" />}>
      {conflict != null && (
        <Banner
          status="warning"
          title="Not drift, and not a standoff — the sources settle this one"
          description={
            <VStack gap={2}>
              <Text {...stylex.props(sx.quote)}>
                <em>&ldquo;{conflict.published}&rdquo;</em>
              </Text>
              <Text>{conflict.reading}</Text>
              <Text>
                So this is not the usual which-document-wins problem. The
                brief&rsquo;s own reference says high-frequency UI often should
                not animate its exit, and the published page says the same thing
                about the same surfaces. The rule the sources support is
                narrower:
              </Text>
              <Text {...stylex.props(sx.quote)}>
                <em>{CORRECTED_EXIT_RULE}</em>
              </Text>
              <Text>
                Criterion 7 has been narrowed to match, which also resolves a
                contradiction inside the rubric: Tooltip is high-frequency
                enough that criterion 2 says give it no motion, while criterion
                7 as written made an instant dismissal a blocker. Both could not
                hold.
              </Text>
            </VStack>
          }
          endContent={
            <Link href="/pages/motion-lab/published/">All conflicts</Link>
          }
        />
      )}

      <DemoCard
        title="Tune the presence budget"
        question="These two values drive every pane on this page, and every layer demo in the lab.">
        <DemoBody>
          <TokenSlider token="--duration-enter" label="enter" max={600} />
          <TokenSlider token="--duration-exit" label="exit" max={600} />
          <TokenSlider token="--duration-overlay" label="overlay" max={900} />
          <Text type="supporting" color="secondary">
            Exit ships shorter than enter, which is beUI&rsquo;s rule — old
            content should leave faster than new arrives. Treat it as a default
            rather than a law. Emil scopes asymmetric timing to system responses
            versus deliberate actions, and a dialog the user chose to close and
            is watching may want the full enter duration. Drag them equal and
            judge it per surface rather than globally.
          </Text>
        </DemoBody>
      </DemoCard>

      <DemoCard
        title="Which of the eleven actually earn an exit"
        question="Orientation is the test, not presence. Three of these are named in the published page as instant-dismissal surfaces — the rest is judgement, so argue with it.">
        <DemoBody>
          <VStack gap={2} {...stylex.props(sx.full)}>
            {EXIT_TRIAGE.map(row => (
              <HStack key={row.surface} gap={3} vAlign="start">
                <Badge
                  variant={row.earns ? 'success' : 'neutral'}
                  label={row.earns ? 'earns one' : 'instant is fine'}
                />
                <VStack gap={0.5}>
                  <HStack gap={2} vAlign="center">
                    <Text weight="semibold">{row.surface}</Text>
                    {row.named === true && (
                      <Badge variant="warning" label="named in the docs" />
                    )}
                  </HStack>
                  <Text type="supporting" color="secondary">
                    {row.why}
                  </Text>
                </VStack>
              </HStack>
            ))}
          </VStack>
          <Text type="supporting" color="secondary">
            Four surfaces earn an exit and seven do not, which inverts the
            brief&rsquo;s framing: the fix is not eleven components short of a
            dismissal animation, it is a shared primitive that cannot express
            one for the four that want it. The work is the same size. The
            justification, and the rubric gate that follows from it, are not.
          </Text>
        </DemoBody>
      </DemoCard>

      <Heading level={2}>
        What an exit looks like on a surface that may not want one
      </Heading>
      <Text color="secondary">
        All four demos below are surfaces the triage puts in the &ldquo;instant
        is fine&rdquo; column, and three are named in the published page. They
        are still worth looking at — you cannot judge whether a dismissal aids
        orientation without seeing the alternative — but read them as the
        question rather than the fix. The card that follows them, Dialog, is the
        clear case for.
      </Text>

      {RIGS.map(rig => (
        <DemoCard
          key={rig.title}
          title={rig.title}
          question={rig.question}
          badges={<Badge label={rig.subtitle} />}>
          <ComparePanes
            panes={[
              {
                tone: 'before',
                label: 'Today — animates in, vanishes out',
                content: (
                  <LayerRig
                    mode="before"
                    label={rig.title}
                    triggerLabel={rig.triggerLabel}
                    trigger={rig.trigger}
                    origin={rig.origin}
                  />
                ),
              },
              {
                tone: 'after',
                label: 'Proposed — the exit retraces the entry',
                content: (
                  <LayerRig
                    mode="after"
                    label={rig.title}
                    triggerLabel={rig.triggerLabel}
                    trigger={rig.trigger}
                    origin={rig.origin}
                  />
                ),
              },
            ]}
          />
        </DemoCard>
      ))}

      <DemoCard
        title="Dialog, AlertDialog, CommandPalette"
        question="Two separate bugs in one surface: the panel has no exit, and the backdrop has no transition at all. Watch the focus ring on the trigger."
        badges={<Badge variant="error" label="focus races the exit" />}>
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label:
                'Today — no exit, scrim hard-cuts, focus returns immediately',
              content: <DialogRig mode="before" />,
            },
            {
              tone: 'after',
              label: 'Proposed — panel and scrim both exit, focus waits',
              content: <DialogRig mode="after" />,
            },
          ]}
        />
        <DemoBody>
          <Text type="supporting" color="secondary">
            In the left pane the focus ring lights the instant the dialog
            closes, while the dialog is still on screen. With a real exit
            animation that means focus moves — and the page may scroll —
            mid-animation. The brief lists this as a risk; here it is a thing
            you can watch, and it has to be settled before the Dialog work
            starts rather than after.
          </Text>
        </DemoBody>
      </DemoCard>

      <DemoCard
        title="The technique, running natively in this browser"
        question="Is the platform enough, or does the shared primitive need a JS fallback? This card answers it for real — nothing here is simulated.">
        <DemoBody>
          <NativePopoverProbe />
        </DemoBody>
      </DemoCard>

      <VStack gap={3}>
        <Heading level={2}>What one change buys</Heading>
        <Card padding={4}>
          <VStack gap={2}>
            <Text>
              Every component below is a <code>useLayer</code> consumer, so all
              of them inherit a dismissal animation from a single definition.
              That is the leverage — and it is also the risk, because it is one
              change to the code path that owns dismissal.
            </Text>
            <HStack gap={1} wrap="wrap">
              {LAYER_CONSUMERS.map(name => (
                <Badge key={name} label={name} />
              ))}
            </HStack>
          </VStack>
        </Card>
        <CodeBlock
          language="css"
          title="layerAnimations — one definition, eleven consumers"
          hasCopyButton
          code={`.layer {
  opacity: 0;
  transform: scale(0.96) translateY(-4px);
  transform-origin: var(--layer-origin);
  transition:
    opacity   var(--duration-exit) var(--ease-exit),
    transform var(--duration-exit) var(--ease-exit),
    display   var(--duration-exit) allow-discrete,
    overlay   var(--duration-exit) allow-discrete;
}

.layer:popover-open {
  opacity: 1;
  transform: scale(1) translateY(0);
  transition:
    opacity   var(--duration-enter) var(--ease-entry),
    transform var(--duration-enter) var(--ease-entry),
    display   var(--duration-enter) allow-discrete,
    overlay   var(--duration-enter) allow-discrete;
}

@starting-style {
  .layer:popover-open { opacity: 0; transform: scale(0.96) translateY(-4px); }
}`}
        />
        <CodeBlock
          language="tsx"
          title="useLayer — await the exit instead of hiding synchronously"
          hasCopyButton
          code={`- setOpen(false);                     // element gone this frame
+ setClosing(true);                   // stops accepting input immediately
+ await Promise.all(
+   el.getAnimations().map(a => a.finished),
+ );
+ setOpen(false);                     // focus return happens here`}
        />
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>What this work has to be careful about</Heading>
        <Grid columns={{minWidth: 300}} gap={3}>
          <Card padding={4}>
            <VStack gap={1.5}>
              <Text weight="semibold">Dismissal is load-bearing</Text>
              <Text type="supporting" color="secondary">
                Layer dismissal has its own invariants test for good reason.
                Keeping an element alive through its exit doubles the state
                matrix for focus return, outside-press and escape handling — and
                every one of those has to be tested against an element that is
                visible but already closing.
              </Text>
            </VStack>
          </Card>
          {blocking != null && (
            <Card padding={4}>
              <VStack gap={1.5}>
                <Text weight="semibold">
                  The published page already warns about this
                </Text>
                <Text type="supporting" color="secondary">
                  &ldquo;{blocking.published}&rdquo; The answer has to be that
                  the surface stops accepting input the moment dismissal starts,
                  not when the animation ends. Write that into the
                  primitive&rsquo;s contract rather than leaving it to each
                  consumer.
                </Text>
              </VStack>
            </Card>
          )}
          <Card padding={4}>
            <VStack gap={1.5}>
              <Text weight="semibold">
                Motion is already fighting the automated gates
              </Text>
              <Text type="supporting" color="secondary">
                Two fixes landed this month to stop animation interfering with
                the accessibility audit and the visual-regression capture. More
                motion means more of this, and there is no documented policy for
                it. The lab&rsquo;s reduced-motion switch doubles as the freeze
                mode a capture needs.
              </Text>
            </VStack>
          </Card>
        </Grid>
      </VStack>
    </LabPage>
  );
}
