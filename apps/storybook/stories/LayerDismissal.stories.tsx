// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayerDismissal.stories.tsx
 * @input Uses Dialog, Popover, Tooltip, Lightbox, MobileNav, BottomSheet,
 *   Button, Layout from @astryxdesign/core; InfoTip from @astryxdesign/lab
 * @output Storybook stories demonstrating shared layer dismissal
 * @position Storybook; the visual contract for the layer dismissal stack
 *
 * Every story here answers the same question — "what does ONE Escape press
 * do?" — for a different mix of layers. They exist to be pressed, not just
 * read: the behavior is invisible in a screenshot of a single state.
 */

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  Button,
  Dialog,
  DialogHeader,
  HoverCard,
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  Lightbox,
  MobileNav,
  Popover,
  Text,
  Tooltip,
  VStack,
} from '@astryxdesign/core';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {InfoTip} from '@astryxdesign/lab/InfoTip';
import type {Meta, StoryObj} from '@storybook/react-vite';

const sheetStyles = stylex.create({
  body: {padding: 24},
});

const meta: Meta = {
  title: 'Core/Layer Dismissal',
  parameters: {
    docs: {
      description: {
        component:
          'One Escape press dismisses exactly one layer — the top-most one. ' +
          'Every overlay family shares a single dismissal stack, so modals, ' +
          'popovers, menus and hover tips all peel off in the right order ' +
          'regardless of which primitive rendered them.',
      },
    },
  },
};
export default meta;

type Story = StoryObj;

/**
 * A modal opened from inside another modal. One Escape closes the inner one and
 * leaves the outer open; a second Escape closes the outer.
 *
 * The inner Dialog is rendered INSIDE the outer's subtree, which is how this is
 * written in real code and the case that used to close both at once.
 */
function ModalInModalExample() {
  const [isOuterOpen, setIsOuterOpen] = useState(false);
  const [isInnerOpen, setIsInnerOpen] = useState(false);

  return (
    <>
      <Button
        label="Open outer modal"
        variant="secondary"
        onClick={() => setIsOuterOpen(true)}
      />
      <Dialog
        isOpen={isOuterOpen}
        onOpenChange={setIsOuterOpen}
        width={520}
        aria-label="Outer modal">
        <Layout
          header={
            <DialogHeader
              title="Outer modal"
              subtitle="Press Escape once — only the layer on top should close"
              onOpenChange={setIsOuterOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={3}>
                <Text type="body">
                  Open the inner modal, then press Escape. The inner one closes
                  and this one stays.
                </Text>
                <Button
                  label="Open inner modal"
                  variant="primary"
                  onClick={() => setIsInnerOpen(true)}
                />
              </VStack>

              <Dialog
                isOpen={isInnerOpen}
                onOpenChange={setIsInnerOpen}
                width={380}
                aria-label="Inner modal">
                <Layout
                  header={
                    <DialogHeader
                      title="Inner modal"
                      onOpenChange={setIsInnerOpen}
                    />
                  }
                  content={
                    <LayoutContent>
                      <Text type="body">Escape closes this one only.</Text>
                    </LayoutContent>
                  }
                />
              </Dialog>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

export const ModalInModal: Story = {render: () => <ModalInModalExample />};

/**
 * A popover opened inside a modal. Escape closes the popover and leaves the
 * modal — the two families share one stack, so a mixed nesting orders the same
 * way a same-family nesting does.
 */
function PopoverInModalExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Open modal"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        width={520}
        aria-label="Modal hosting a popover">
        <Layout
          header={
            <DialogHeader
              title="Modal with a popover"
              onOpenChange={setIsOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={3}>
                <Text type="body">
                  Open the popover, then press Escape: the popover closes and
                  this modal stays open.
                </Text>
                <Popover
                  content={
                    <VStack gap={2}>
                      <Text type="body">Popover content</Text>
                      <Text type="supporting">Escape closes just this.</Text>
                    </VStack>
                  }>
                  <Button label="Open popover" variant="primary" />
                </Popover>
              </VStack>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

export const PopoverInModal: Story = {
  render: () => <PopoverInModalExample />,
};

/**
 * A hover tip inside a modal. The visible tip is the top-most layer, so Escape
 * hides the tip and the modal stays open; a second Escape closes the modal.
 *
 * Escape affects exactly one layer here, same as everywhere else — hover layers
 * get no special case. The alternative (hide the tip AND close the modal on one
 * press) was considered and rejected: someone dismissing a stray tooltip over a
 * half-filled form would lose the form. One extra keystroke is the cheaper way
 * to be wrong.
 *
 * A tip that is NOT showing claims nothing: presence is read from the DOM at
 * press time, so merely having a tooltip in the tree never eats an Escape.
 */
function HoverTipInModalExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Open modal"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        width={520}
        aria-label="Modal hosting a hover tip">
        <Layout
          header={
            <DialogHeader
              title="Modal with a hover tip"
              onOpenChange={setIsOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={3}>
                <Text type="body">
                  Hover the button below to show its tip, then press Escape: the
                  tip hides and this modal stays open. Press Escape again to
                  close the modal.
                </Text>
                <Tooltip content="A hover tip — Escape hides just this">
                  <Button label="Hover me" variant="primary" />
                </Tooltip>
              </VStack>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

export const HoverTipInModal: Story = {
  render: () => <HoverTipInModalExample />,
};

/**
 * A `required` modal is a `block` layer: Escape neither dismisses it nor falls
 * through to anything behind it. Open it from inside another modal and press
 * Escape — nothing happens at all, which is the point. The user must choose.
 */
function RequiredModalExample() {
  const [isHostOpen, setIsHostOpen] = useState(false);
  const [isRequiredOpen, setIsRequiredOpen] = useState(false);

  return (
    <>
      <Button
        label="Open host modal"
        variant="secondary"
        onClick={() => setIsHostOpen(true)}
      />
      <Dialog
        isOpen={isHostOpen}
        onOpenChange={setIsHostOpen}
        width={520}
        aria-label="Host modal">
        <Layout
          header={
            <DialogHeader title="Host modal" onOpenChange={setIsHostOpen} />
          }
          content={
            <LayoutContent>
              <VStack gap={3}>
                <Text type="body">
                  Open the required dialog, then press Escape. Neither dialog
                  closes: a required layer swallows the press so it cannot leak
                  to the layer underneath.
                </Text>
                <Button
                  label="Open required dialog"
                  variant="primary"
                  onClick={() => setIsRequiredOpen(true)}
                />
              </VStack>

              <Dialog
                isOpen={isRequiredOpen}
                onOpenChange={setIsRequiredOpen}
                purpose="required"
                width={380}
                aria-label="Required dialog">
                <Layout
                  header={<DialogHeader title="Choose an option" />}
                  content={
                    <LayoutContent>
                      <Text type="body">
                        Escape does nothing here. Pick an action to continue.
                      </Text>
                    </LayoutContent>
                  }
                  footer={
                    <LayoutFooter>
                      <HStack gap={2} hAlign="end">
                        <Button
                          label="Decline"
                          variant="secondary"
                          onClick={() => setIsRequiredOpen(false)}
                        />
                        <Button
                          label="Accept"
                          variant="primary"
                          onClick={() => setIsRequiredOpen(false)}
                        />
                      </HStack>
                    </LayoutFooter>
                  }
                />
              </Dialog>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

export const RequiredModalBlocksEscape: Story = {
  render: () => <RequiredModalExample />,
};

/**
 * A Lightbox opened from inside a `required` dialog. Escape closes the
 * Lightbox and leaves the required dialog exactly where it was.
 *
 * Lightbox used to close on the native `cancel` event alone, so the required
 * dialog — a `block` layer — swallowed the press and the Lightbox could only
 * be closed with the mouse.
 */
function RequiredModalWithLightboxExample() {
  const [isRequiredOpen, setIsRequiredOpen] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  return (
    <>
      <Button
        label="Open required dialog"
        variant="secondary"
        onClick={() => setIsRequiredOpen(true)}
      />
      <Dialog
        isOpen={isRequiredOpen}
        onOpenChange={setIsRequiredOpen}
        purpose="required"
        width={420}
        aria-label="Required dialog">
        <Layout
          header={<DialogHeader title="Confirm your evidence" />}
          content={
            <LayoutContent>
              <VStack gap={3}>
                <Text type="body">
                  Open the photo, then press Escape. The photo closes and this
                  dialog stays — it still requires an explicit choice.
                </Text>
                <Button
                  label="View photo"
                  variant="primary"
                  onClick={() => setIsLightboxOpen(true)}
                />
              </VStack>

              <Lightbox
                isOpen={isLightboxOpen}
                onOpenChange={setIsLightboxOpen}
                media={{
                  src: 'https://picsum.photos/id/1015/1200/800',
                  alt: 'A river through a canyon',
                }}
              />
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button
                  label="Decline"
                  variant="secondary"
                  onClick={() => setIsRequiredOpen(false)}
                />
                <Button
                  label="Accept"
                  variant="primary"
                  onClick={() => setIsRequiredOpen(false)}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}

export const RequiredModalWithLightbox: Story = {
  render: () => <RequiredModalWithLightboxExample />,
};

/**
 * A mobile nav drawer opened over a `required` dialog. Same shape as the
 * Lightbox story: Escape closes the drawer, the required dialog stays.
 */
function RequiredModalWithMobileNavExample() {
  const [isRequiredOpen, setIsRequiredOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);

  return (
    <>
      <Button
        label="Open required dialog"
        variant="secondary"
        onClick={() => setIsRequiredOpen(true)}
      />
      <Dialog
        isOpen={isRequiredOpen}
        onOpenChange={setIsRequiredOpen}
        purpose="required"
        width={420}
        aria-label="Required dialog">
        <Layout
          header={<DialogHeader title="Confirm your choice" />}
          content={
            <LayoutContent>
              <VStack gap={3}>
                <Text type="body">
                  Open the navigation drawer, then press Escape. The drawer
                  closes and this dialog stays.
                </Text>
                <Button
                  label="Open navigation"
                  variant="primary"
                  onClick={() => setIsNavOpen(true)}
                />
              </VStack>

              <MobileNav
                isOpen={isNavOpen}
                onOpenChange={setIsNavOpen}
                header="Navigation">
                <Text type="body">Escape closes this drawer only.</Text>
              </MobileNav>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button
                  label="Decline"
                  variant="secondary"
                  onClick={() => setIsRequiredOpen(false)}
                />
                <Button
                  label="Accept"
                  variant="primary"
                  onClick={() => setIsRequiredOpen(false)}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}

export const RequiredModalWithMobileNav: Story = {
  render: () => <RequiredModalWithMobileNavExample />,
};

/** A Lightbox on its own. Escape closes it, as it always has. */
function LightboxAloneExample() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button
        label="View photo"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Lightbox
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        media={{
          src: 'https://picsum.photos/id/1015/1200/800',
          alt: 'A river through a canyon',
        }}
      />
    </>
  );
}

export const LightboxAlone: Story = {render: () => <LightboxAloneExample />};

/** A mobile nav drawer on its own. Escape closes it, as it always has. */
function MobileNavAloneExample() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button
        label="Open navigation"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <MobileNav isOpen={isOpen} onOpenChange={setIsOpen} header="Navigation">
        <Text type="body">Escape closes this drawer.</Text>
      </MobileNav>
    </>
  );
}

export const MobileNavAlone: Story = {render: () => <MobileNavAloneExample />};

/**
 * A hover tip inside a non-modal bottom sheet. Both surfaces participate in
 * the shared dismissal stack, so the first Escape closes only the tip and the
 * next Escape closes the sheet.
 */
function SheetWithHoverTipExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Open sheet"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        hasScrim={false}
        label="Details"
        height="hug"
        padding={0}>
        <VStack gap={3} xstyle={sheetStyles.body}>
          <Text type="body">
            Hover the button to show the tip, then press Escape. The first press
            closes only the tip; the next press closes the sheet.
          </Text>
          <Tooltip content="A hover tip, showing">
            <Button label="Hover me" variant="secondary" />
          </Tooltip>
        </VStack>
      </BottomSheet>
    </>
  );
}

export const SheetWithHoverTip: Story = {
  render: () => <SheetWithHoverTipExample />,
};

/**
 * Three layers deep, in two different families: a modal, a modal opened from
 * inside it, and a popover opened from inside that. Three Escape presses peel
 * them off one at a time, innermost first — the ordering has to hold past the
 * two-layer case that is easy to get right by accident.
 */
function ThreeDeepExample() {
  const [isOuterOpen, setIsOuterOpen] = useState(false);
  const [isInnerOpen, setIsInnerOpen] = useState(false);

  return (
    <>
      <Button
        label="Open outer modal"
        variant="secondary"
        onClick={() => setIsOuterOpen(true)}
      />
      <Dialog
        isOpen={isOuterOpen}
        onOpenChange={setIsOuterOpen}
        width={520}
        aria-label="Outer modal">
        <Layout
          header={
            <DialogHeader title="Outer modal" onOpenChange={setIsOuterOpen} />
          }
          content={
            <LayoutContent>
              <VStack gap={3}>
                <Text type="body">
                  Open the inner modal, then the popover inside it. Three
                  Escapes, one layer each.
                </Text>
                <Button
                  label="Open inner modal"
                  variant="primary"
                  onClick={() => setIsInnerOpen(true)}
                />
              </VStack>

              <Dialog
                isOpen={isInnerOpen}
                onOpenChange={setIsInnerOpen}
                width={400}
                aria-label="Inner modal">
                <Layout
                  header={
                    <DialogHeader
                      title="Inner modal"
                      onOpenChange={setIsInnerOpen}
                    />
                  }
                  content={
                    <LayoutContent>
                      <Popover content={<Text type="body">Deepest layer</Text>}>
                        <Button label="Open popover" variant="primary" />
                      </Popover>
                    </LayoutContent>
                  }
                />
              </Dialog>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

export const ThreeDeep: Story = {render: () => <ThreeDeepExample />};

/**
 * A dialog whose `purpose` changes while it is open re-registers with the
 * stack. Its place in the order must not move: a second modal opened over it
 * still takes the next Escape, and a flip to `required` must not let the older
 * dialog start swallowing presses meant for the newer one.
 *
 * Open the first modal, open the second from inside it, flip the first to
 * required, then press Escape — the second closes, as it would have without
 * the flip.
 */
function PurposeFlipsWhileOpenExample() {
  const [isFirstOpen, setIsFirstOpen] = useState(false);
  const [isSecondOpen, setIsSecondOpen] = useState(false);
  const [isFirstRequired, setIsFirstRequired] = useState(false);

  return (
    <>
      <Button
        label="Open first modal"
        variant="secondary"
        onClick={() => setIsFirstOpen(true)}
      />
      <Dialog
        isOpen={isFirstOpen}
        onOpenChange={setIsFirstOpen}
        purpose={isFirstRequired ? 'required' : undefined}
        width={480}
        aria-label="First modal">
        <Layout
          header={<DialogHeader title="First modal" />}
          content={
            <LayoutContent>
              <VStack gap={3}>
                <Text type="body">
                  Open the second modal, then flip this one to required from
                  inside it. This one re-registers, and must not overtake the
                  modal opened after it — Escape should still close the second.
                </Text>
                <Button
                  label="Open second modal"
                  variant="primary"
                  onClick={() => setIsSecondOpen(true)}
                />
              </VStack>

              <Dialog
                isOpen={isSecondOpen}
                onOpenChange={setIsSecondOpen}
                width={380}
                aria-label="Second modal">
                <Layout
                  header={
                    <DialogHeader
                      title="Second modal"
                      onOpenChange={setIsSecondOpen}
                    />
                  }
                  content={
                    <LayoutContent>
                      <VStack gap={3}>
                        <Text type="body">Escape closes this one.</Text>
                        <Button
                          label="Make first required"
                          variant="secondary"
                          onClick={() => setIsFirstRequired(true)}
                        />
                      </VStack>
                    </LayoutContent>
                  }
                />
              </Dialog>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button
                  label="Done"
                  variant="secondary"
                  onClick={() => setIsFirstOpen(false)}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}

export const PurposeFlipsWhileOpen: Story = {
  render: () => <PurposeFlipsWhileOpenExample />,
};

/**
 * A lab InfoTip inside a modal, its tip showing. One Escape hides the tip and
 * leaves the modal open; a second closes the modal.
 *
 * The InfoTip used to `stopPropagation()` the press at its trigger, so the
 * stack never saw it and the browser's own close watcher closed the modal
 * underneath instead — one press, both gone (#5168). It now handles no keys of
 * its own and lets its Tooltip's stack entry take the press.
 */
function InfoTipInModalExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Open modal"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        width={480}
        aria-label="Modal with an info tip">
        <Layout
          header={
            <DialogHeader
              title="Modal with an info tip"
              subtitle="Focus or hover the info button, then press Escape once"
              onOpenChange={setIsOpen}
            />
          }
          content={
            <LayoutContent>
              <HStack gap={1} vAlign="center">
                <Text type="body">Rolling spend</Text>
                <InfoTip content="30-day rolling average, excluding refunds." />
              </HStack>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

export const InfoTipInModal: Story = {render: () => <InfoTipInModalExample />};

/**
 * A HoverCard with focusable content, inside a modal, with focus tabbed INTO
 * the card. One Escape hides the card and returns focus to its trigger; the
 * modal stays open.
 *
 * The card content used to claim the press itself with `stopPropagation()`,
 * which kept it from the dialog's own listener but not from the browser's
 * close watcher — so one press took the card and the modal with it. The card
 * is on the stack, so `onDismiss` does the work and the stack claims the press.
 */
function HoverCardInModalExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Open modal"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        width={520}
        aria-label="Modal with a hover card">
        <Layout
          header={
            <DialogHeader
              title="Modal with a hover card"
              subtitle="Hover the trigger, Tab into the card, then press Escape once"
              onOpenChange={setIsOpen}
            />
          }
          content={
            <LayoutContent>
              <HoverCard
                content={
                  <VStack gap={2}>
                    <Text type="body">Card body</Text>
                    <Button label="Card action" variant="secondary" />
                  </VStack>
                }>
                <Button label="Hover me" variant="secondary" />
              </HoverCard>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

export const HoverCardInModal: Story = {
  render: () => <HoverCardInModalExample />,
};

/**
 * A hover card the consumer controls (`isOpen`), inside a modal. One Escape
 * goes to the CARD — it is the top-most layer — and the card answers by
 * calling `onOpenChange(false)` rather than hiding itself. This consumer's
 * update closes it, so the card goes and the modal stays.
 *
 * Controlled follows control state: Escape attempts the close, the caller's
 * update function decides. Same contract as a controlled Dialog.
 */
function PinnedHoverCardInModalExample() {
  const [isOpen, setIsOpen] = useState(false);
  const [isCardOpen, setIsCardOpen] = useState(true);
  const [requests, setRequests] = useState(0);

  return (
    <>
      <Button
        label="Open modal"
        variant="secondary"
        onClick={() => {
          setIsCardOpen(true);
          setRequests(0);
          setIsOpen(true);
        }}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        width={520}
        aria-label="Modal with a pinned hover card">
        <Layout
          header={
            <DialogHeader
              title="Modal with a pinned hover card"
              subtitle="The app holds the card open — Escape asks it to close, and this app agrees"
              onOpenChange={setIsOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={2}>
                <HoverCard
                  isOpen={isCardOpen}
                  onOpenChange={open => {
                    setRequests(n => n + 1);
                    setIsCardOpen(open);
                  }}
                  content={
                    <VStack gap={2}>
                      <Text type="body">Pinned card</Text>
                      <Button label="Card action" variant="secondary" />
                    </VStack>
                  }>
                  <Button label="Card trigger" variant="secondary" />
                </HoverCard>
                <Text type="body">{`close requests: ${requests}`}</Text>
              </VStack>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

export const PinnedHoverCardInModal: Story = {
  render: () => <PinnedHoverCardInModalExample />,
};

/**
 * The same pinned card, with a consumer who ignores their own change handler.
 * Escape reaches the card, the card reports, nothing happens — and because the
 * card claimed the press, the modal underneath does not close either.
 *
 * That is the consumer's choice, not the stack's doing: a layer that holds
 * itself open and discards its close requests is keyboard-undismissable, and
 * so is anything behind it. The story exists to make that visible.
 */
function StuckHoverCardInModalExample() {
  const [isOpen, setIsOpen] = useState(false);
  const [requests, setRequests] = useState(0);

  return (
    <>
      <Button
        label="Open modal"
        variant="secondary"
        onClick={() => {
          setRequests(0);
          setIsOpen(true);
        }}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        width={520}
        aria-label="Modal with a stuck hover card">
        <Layout
          header={
            <DialogHeader
              title="Modal with a stuck hover card"
              subtitle="The app pins the card and ignores onOpenChange — Escape closes nothing"
              onOpenChange={setIsOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={2}>
                <HoverCard
                  isOpen
                  onOpenChange={() => setRequests(n => n + 1)}
                  content={<Text type="body">Stuck card</Text>}>
                  <Button label="Card trigger" variant="secondary" />
                </HoverCard>
                <Text type="body">{`close requests: ${requests}`}</Text>
              </VStack>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

export const StuckHoverCardInModal: Story = {
  render: () => <StuckHoverCardInModalExample />,
};

/**
 * The Tooltip side of the same contract. The tip is pinned open by the app
 * inside a modal; Escape reaches the tip, which calls `onOpenChange(false)`,
 * and this app's update hides it. The modal stays open — one press, one layer.
 */
function PinnedTooltipInModalExample() {
  const [isOpen, setIsOpen] = useState(false);
  const [isTipOpen, setIsTipOpen] = useState(true);
  const [requests, setRequests] = useState(0);

  return (
    <>
      <Button
        label="Open modal"
        variant="secondary"
        onClick={() => {
          setIsTipOpen(true);
          setRequests(0);
          setIsOpen(true);
        }}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        width={520}
        aria-label="Modal with a pinned tooltip">
        <Layout
          header={
            <DialogHeader
              title="Modal with a pinned tooltip"
              subtitle="The app holds the tip open — Escape asks it to close, and this app agrees"
              onOpenChange={setIsOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={2}>
                <Tooltip
                  isOpen={isTipOpen}
                  onOpenChange={open => {
                    setRequests(n => n + 1);
                    setIsTipOpen(open);
                  }}
                  content="Pinned tip">
                  <Button label="Tip trigger" variant="secondary" />
                </Tooltip>
                <Text type="body">{`close requests: ${requests}`}</Text>
              </VStack>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

export const PinnedTooltipInModal: Story = {
  render: () => <PinnedTooltipInModalExample />,
};
