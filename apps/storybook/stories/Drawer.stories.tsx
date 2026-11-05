// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {Drawer, DrawerHeader} from '@astryxdesign/core/Drawer';
import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Divider} from '@astryxdesign/core/Divider';
import {Heading} from '@astryxdesign/core/Heading';
import {Layout, LayoutContent, LayoutFooter} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {VStack, HStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {Theme, defineTheme} from '@astryxdesign/core/theme';

const meta: Meta<typeof Drawer> = {
  title: 'Core/Drawer',
  component: Drawer,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: [
          'A side panel that **floats above** page content — it overlays the',
          'layout instead of reflowing it, which is what separates a drawer',
          'from a docked panel.',
          '',
          '- Anchors to the **inline start or end** edge only (left/right in',
          '  LTR); block-axis sheets are `BottomSheet`.',
          '- Works on **desktop and touch**: `width` is the desktop budget',
          '  budget, and below 640px the panel preserves a 56px reveal',
          '  without exceeding that budget (the experimental',
          '  `experimental={{isFullWidthOnMobile: true}}` makes it edge to edge).',
          '- **Scrim optional**: modal with a scrim by default, or',
          '  `hasScrim={false}` for a non-modal overlay that leaves the page',
          '  behind interactive.',
          '- **Square corners** (0px radius) — the panel is flush with three',
          '  viewport edges.',
        ].join('\n'),
      },
    },
  },
  decorators: [
    Story => (
      // 560 px wide, or the viewport less the frame's gutters (16 px a side,
      // twice) on a phone, so the story never scrolls the page sideways.
      <div
        style={{
          width: 'min(560px, 100vw - 64px)',
          minHeight: 360,
          padding: 32,
        }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Drawer>;

const REGIONS = ['us-east-1', 'eu-west-1', 'ap-south-1'];

export const Showcase: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button label="Open inspector" onClick={() => setIsOpen(true)} />
        <Drawer
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          label="Deployment details"
          width={400}>
          <Layout
            header={
              <DrawerHeader
                title="web-prod-04"
                subtitle="us-east-1, deployed 12 min ago"
                onOpenChange={setIsOpen}
                hasDivider
              />
            }
            content={
              <LayoutContent>
                <VStack gap={4}>
                  <VStack gap={2}>
                    <Text type="label">Status</Text>
                    <Text type="body">
                      Healthy - all 6 instances passing readiness checks.
                    </Text>
                  </VStack>
                  <VStack gap={2}>
                    <Text type="label">Build</Text>
                    <Text type="body">#4821 - main @ 03536f1</Text>
                  </VStack>
                </VStack>
              </LayoutContent>
            }
          />
        </Drawer>
      </>
    );
  },
};

/**
 * Non-modal inspector: no scrim, no focus trap, and the page behind stays
 * interactive. In a real master-detail flow, derive the open state from the
 * selection (`isOpen={selected != null}`) and clear it in `onOpenChange`.
 */
export const RowInspector: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button label="Open drawer" onClick={() => setIsOpen(true)} />
        <Drawer
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          label="Details"
          hasScrim={false}
          width={360}>
          <Section padding={4}>
            <VStack gap={4}>
              <VStack gap={1}>
                <Heading level={3}>Details</Heading>
                <Text type="supporting" color="secondary">
                  The page behind stays interactive.
                </Text>
              </VStack>
              <Button
                label="Close inspector"
                variant="secondary"
                onClick={() => setIsOpen(false)}
              />
            </VStack>
          </Section>
        </Drawer>
      </>
    );
  },
};

/**
 * Sibling drawers share one top-layer stack. A closing inner drawer continues
 * to own Escape until its slide-out finishes, then the outer drawer becomes
 * the topmost dismissible surface.
 */
export const StackedDrawers: Story = {
  render: () => {
    const [orderOpen, setOrderOpen] = useState(false);
    const [lineItemOpen, setLineItemOpen] = useState(false);
    return (
      <>
        <Button label="Open order" onClick={() => setOrderOpen(true)} />
        <Drawer
          isOpen={orderOpen}
          onOpenChange={setOrderOpen}
          label="Order details"
          hasScrim={false}>
          <Section padding={4}>
            <VStack gap={4}>
              <Heading level={3}>Order #4821</Heading>
              <Text type="body">Three line items, ready to ship.</Text>
              <Button
                label="Open line item"
                data-autofocus
                onClick={() => setLineItemOpen(true)}
              />
            </VStack>
          </Section>
        </Drawer>
        <Drawer
          isOpen={lineItemOpen}
          onOpenChange={setLineItemOpen}
          label="Line item details"
          hasScrim={false}
          width={320}>
          <Section padding={4}>
            <VStack gap={4}>
              <Heading level={3}>Compute instance</Heading>
              <Text type="body">Quantity 6 · us-east-1</Text>
              <Button
                label="Close line item"
                variant="secondary"
                data-autofocus
                onClick={() => setLineItemOpen(false)}
              />
            </VStack>
          </Section>
        </Drawer>
      </>
    );
  },
};

/**
 * Both edges. `side="start"` is left in LTR (and right in RTL) — use it for
 * navigation-adjacent content; `end` is the inspector convention.
 */
export const Sides: Story = {
  render: () => {
    const [side, setSide] = useState<'start' | 'end' | null>(null);
    return (
      <>
        <HStack gap={2}>
          <Button label="Open from start" onClick={() => setSide('start')} />
          <Button label="Open from end" onClick={() => setSide('end')} />
        </HStack>
        <Drawer
          isOpen={side != null}
          onOpenChange={isOpen => !isOpen && setSide(null)}
          label={`Filters (${side ?? 'end'})`}
          side={side ?? 'end'}>
          <Section padding={4}>
            <VStack gap={4}>
              <Heading level={3}>Filter by region</Heading>
              <Text type="supporting" color="secondary">
                Sliding in from the {side} edge.
              </Text>
            </VStack>
          </Section>
        </Drawer>
      </>
    );
  },
};

function selfDirectedRtlStory(side: 'start' | 'end'): Story {
  return {
    name: `Self-applied RTL ${side} audit`,
    parameters: {docs: {disable: true}},
    render: () => {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <Button
            label={`Open self-directed RTL ${side} drawer`}
            onClick={() => setIsOpen(true)}
          />
          <Drawer
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            label="Deployment details"
            side={side}
            dir="rtl">
            <Layout
              header={
                <DrawerHeader
                  title="Deployment details"
                  onOpenChange={setIsOpen}
                />
              }
              content={
                <LayoutContent>
                  <Text type="body">The Drawer root owns this RTL region.</Text>
                </LayoutContent>
              }
            />
          </Drawer>
        </>
      );
    },
  };
}

export const SelfDirectedRtlStart = selfDirectedRtlStory('start');
export const SelfDirectedRtlEnd = selfDirectedRtlStory('end');

export const NestedLtrOverride: Story = {
  name: 'Nested LTR override audit',
  parameters: {docs: {disable: true}},
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button
          label="Open nested LTR drawer"
          onClick={() => setIsOpen(true)}
        />
        <Drawer
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          label="Deployment details"
          side="end"
          dir="ltr">
          <Layout
            header={
              <DrawerHeader
                title="Deployment details"
                onOpenChange={setIsOpen}
              />
            }
            content={
              <LayoutContent>
                <Text type="body">
                  This local LTR region overrides the ambient RTL page.
                </Text>
              </LayoutContent>
            }
          />
        </Drawer>
      </>
    );
  },
};

/**
 * `width` is the desktop budget: a number of pixels or any CSS length.
 * Narrow the browser below 640px: each width remains an upper bound while
 * the drawer preserves a 56px reveal of the page behind.
 */
export const Widths: Story = {
  render: () => {
    const [width, setWidth] = useState<number | string | null>(null);
    return (
      <>
        <HStack gap={2}>
          <Button label="320px" onClick={() => setWidth(320)} />
          <Button label="480px" onClick={() => setWidth(480)} />
          <Button label="50%" onClick={() => setWidth('50%')} />
        </HStack>
        <Drawer
          isOpen={width != null}
          onOpenChange={isOpen => !isOpen && setWidth(null)}
          label="Details"
          width={width ?? 400}>
          <Section padding={4}>
            <VStack gap={4}>
              <Heading level={3}>web-prod-04</Heading>
              <Text type="body">Desktop width budget: {String(width)}</Text>
            </VStack>
          </Section>
        </Drawer>
      </>
    );
  },
};

/**
 * On touch viewports (below 640px) the drawer preserves a 56px reveal of the
 * page behind without exceeding its width budget; the experimental
 * `experimental={{isFullWidthOnMobile: true}}` makes it edge to edge. Resize the preview below 640px to compare.
 */
export const MobileWidth: Story = {
  render: () => {
    const [openFull, setOpenFull] = useState(false);
    const [openPartial, setOpenPartial] = useState(false);
    const [selected, setSelected] = useState<string[]>(REGIONS.slice(0, 1));
    const filters = (
      <Section padding={4}>
        <VStack gap={4}>
          <VStack gap={1}>
            <Heading level={3}>Filter by region</Heading>
            <Text type="supporting" color="secondary">
              Showing hosts in {selected.length} of {REGIONS.length} regions
            </Text>
          </VStack>
          <VStack gap={2}>
            {REGIONS.map(region => (
              <CheckboxInput
                key={region}
                label={region}
                value={selected.includes(region)}
                onChange={checked =>
                  setSelected(current =>
                    checked
                      ? [...current, region]
                      : current.filter(r => r !== region),
                  )
                }
              />
            ))}
          </VStack>
          <Button
            label="Apply filters"
            onClick={() => {
              setOpenFull(false);
              setOpenPartial(false);
            }}
            data-autofocus
          />
        </VStack>
      </Section>
    );
    return (
      <>
        <HStack gap={2}>
          <Button
            label="56px reveal on mobile"
            onClick={() => setOpenPartial(true)}
          />
          <Button
            label="Full width on mobile"
            variant="secondary"
            onClick={() => setOpenFull(true)}
          />
        </HStack>
        <Drawer
          isOpen={openPartial}
          onOpenChange={setOpenPartial}
          label="Region filters">
          {filters}
        </Drawer>
        <Drawer
          isOpen={openFull}
          onOpenChange={setOpenFull}
          label="Region filters (full width)"
          experimental={{isFullWidthOnMobile: true}}>
          {filters}
        </Drawer>
      </>
    );
  },
};

/**
 * A drawer floats above the page: the content underneath keeps its layout
 * and never reflows to make room, which is the difference between a drawer
 * and a docked panel. Compare the text column with the drawer open and
 * closed — nothing behind it moves.
 */
export const FloatsOverContent: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <VStack gap={3}>
          <Button
            label={isOpen ? 'Close drawer' : 'Open drawer'}
            onClick={() => setIsOpen(open => !open)}
          />
          <Heading level={3}>Deployment log</Heading>
          {[
            'The page keeps its full width while the drawer is open.',
            'No column reflows, no content jumps, nothing is pushed aside.',
            'The drawer is painted on top and the layout underneath is',
            'untouched — which is exactly what a docked panel would not do.',
          ].map(line => (
            <Text key={line} type="body">
              {line}
            </Text>
          ))}
        </VStack>
        <Drawer
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          label="Deployment details"
          hasScrim={false}>
          <Section padding={4}>
            <VStack gap={4}>
              <Heading level={3}>web-prod-04</Heading>
              <Text type="supporting" color="secondary">
                Floating above the page, not docked beside it.
              </Text>
            </VStack>
          </Section>
        </Drawer>
      </>
    );
  },
};

/**
 * With a scrim (default) the drawer is modal: the page behind dims, focus is
 * trapped, and clicking the scrim closes it. Without one it is a plain
 * overlay — no dimming, no focus trap, and the page behind stays clickable,
 * which is what master-detail flows want.
 */
export const Scrim: Story = {
  render: () => {
    const [openWith, setOpenWith] = useState(false);
    const [openWithout, setOpenWithout] = useState(false);
    return (
      <>
        <VStack gap={3}>
          <HStack gap={2}>
            <Button label="With scrim" onClick={() => setOpenWith(true)} />
            <Button
              label="Without scrim"
              variant="secondary"
              onClick={() => setOpenWithout(true)}
            />
          </HStack>
          <Text type="supporting" color="secondary">
            These buttons stay clickable while the scrim-less drawer is open.
          </Text>
        </VStack>
        <Drawer
          isOpen={openWith}
          onOpenChange={setOpenWith}
          label="Modal details">
          <Section padding={4}>
            <VStack gap={4}>
              <Heading level={3}>Modal</Heading>
              <Text type="body">
                Scrim dims the page, focus is trapped, Escape or a scrim click
                closes.
              </Text>
            </VStack>
          </Section>
        </Drawer>
        <Drawer
          isOpen={openWithout}
          onOpenChange={setOpenWithout}
          label="Non-modal details"
          hasScrim={false}>
          {/* No scrim to click, so the header's close button is the visible exit. */}
          <Layout
            header={
              <DrawerHeader title="Non-modal" onOpenChange={setOpenWithout} />
            }
            content={
              <LayoutContent>
                <Text type="body">
                  No scrim, no focus trap. The page behind keeps working while
                  this stays open.
                </Text>
              </LayoutContent>
            }
          />
        </Drawer>
      </>
    );
  },
};

/**
 * `purpose` matches Dialog. `info` (default) closes on Escape and a scrim
 * click; `form` ignores the scrim click so a stray click cannot discard input;
 * `required` ignores both and is exposed as an `alertdialog`, so its content
 * owns the way out. Drawer has no close button of its own: `DrawerHeader`
 * renders one when given `onOpenChange`.
 */
export const Purpose: Story = {
  render: () => {
    const [purpose, setPurpose] = useState<'info' | 'form' | 'required' | null>(
      null,
    );
    const close = () => setPurpose(null);
    return (
      <>
        <HStack gap={2}>
          <Button label="info" onClick={() => setPurpose('info')} />
          <Button label="form" onClick={() => setPurpose('form')} />
          <Button label="required" onClick={() => setPurpose('required')} />
        </HStack>
        <Drawer
          isOpen={purpose != null}
          onOpenChange={isOpen => !isOpen && close()}
          label={`Purpose: ${purpose ?? 'info'}`}
          purpose={purpose ?? 'info'}>
          {purpose === 'required' ? (
            <Layout
              header={<DrawerHeader title="Accept the terms" />}
              content={
                <LayoutContent>
                  <VStack gap={4}>
                    <Text type="body">
                      Escape and the scrim do nothing. Only this button closes
                      the drawer.
                    </Text>
                    <Button label="Accept" data-autofocus onClick={close} />
                  </VStack>
                </LayoutContent>
              }
            />
          ) : (
            <Layout
              header={
                <DrawerHeader
                  title={purpose === 'form' ? 'Edit details' : 'Details'}
                  onOpenChange={isOpen => !isOpen && close()}
                />
              }
              content={
                <LayoutContent>
                  <Text type="body">
                    {purpose === 'form'
                      ? 'Escape or the close button closes; a scrim click does not.'
                      : 'Escape, a scrim click, or the close button closes.'}
                  </Text>
                </LayoutContent>
              }
            />
          )}
        </Drawer>
      </>
    );
  },
};

/**
 * A Layout as the drawer's child, exactly as inside a Dialog: the Layout
 * escapes the content area's container padding and redistributes it to its
 * regions, so the DrawerHeader slot, the scrolling LayoutContent, and the
 * pinned LayoutFooter share one content line and full-bleed dividers.
 */
export const LayoutComposition: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button label="Open with Layout" onClick={() => setIsOpen(true)} />
        <Drawer
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          label="Deployment details"
          width={400}>
          <Layout
            header={
              <DrawerHeader
                title="web-prod-04"
                subtitle="us-east-1, deployed 12 min ago"
                onOpenChange={setIsOpen}
                hasDivider
              />
            }
            content={
              <LayoutContent>
                <VStack gap={4}>
                  {REGIONS.map(region => (
                    <VStack gap={2} key={region}>
                      <Text type="label">{region}</Text>
                      <Text type="body">
                        Healthy - all instances passing readiness checks.
                      </Text>
                    </VStack>
                  ))}
                </VStack>
              </LayoutContent>
            }
            footer={
              <LayoutFooter hasDivider>
                <HStack gap={2} hAlign="end">
                  <Button
                    label="Cancel"
                    variant="secondary"
                    onClick={() => setIsOpen(false)}
                  />
                  <Button
                    label="Redeploy"
                    variant="primary"
                    onClick={() => setIsOpen(false)}
                  />
                </HStack>
              </LayoutFooter>
            }
          />
        </Drawer>
      </>
    );
  },
};

/**
 * The `padding` prop insets plain content on the spacing scale, like Dialog.
 * Without it the inset is `--spacing-4` (16px); this story sets 6 (24px), and
 * `padding={0}` gives a full-bleed content area. The inset is published as
 * container geometry: the Divider is a bleed child and stretches edge to edge
 * through it, and a Section child would escape it the same way.
 */
export const ContainerPadding: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button label="Open padded drawer" onClick={() => setIsOpen(true)} />
        <Drawer
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          label="Run summary"
          width={400}
          padding={6}>
          <VStack gap={4}>
            <Heading level={2}>Run summary</Heading>
            <Text type="body">
              Plain children sit inside the drawer&apos;s own padding - no
              Section wrapper needed.
            </Text>
            <Divider isFullBleed />
            <Text type="body">
              The divider above opts into bleed (isFullBleed): it compensates
              against the published inset and reaches both panel edges.
            </Text>
            <Button label="Close" onClick={() => setIsOpen(false)} />
          </VStack>
        </Drawer>
      </>
    );
  },
};

const paddedDrawerTheme = defineTheme({
  name: 'drawer-padding-demo',
  components: {
    drawer: {
      base: {padding: '24px'},
    },
  },
});

/**
 * A theme's `padding` on `drawer` reaches the content area through the
 * `--astryx-drawer-padding` container tokens (the drawer itself gets no
 * padding prop here). A lone Section child would escape the themed inset and
 * apply its own padding, exactly as it would inside a Dialog.
 */
export const ThemedPadding: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <Theme theme={paddedDrawerTheme}>
        <Button label="Open themed drawer" onClick={() => setIsOpen(true)} />
        <Drawer
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          label="Run summary"
          width={400}>
          <VStack gap={4}>
            <Heading level={2}>Run summary</Heading>
            <Text type="body">
              The theme sets drawer padding to 24px; this text is inset by it.
            </Text>
            <Button label="Close" onClick={() => setIsOpen(false)} />
          </VStack>
        </Drawer>
      </Theme>
    );
  },
};
