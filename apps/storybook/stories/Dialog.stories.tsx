// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  HStack,
  VStack,
} from '@astryxdesign/core/Layout';
import {Button} from '@astryxdesign/core/Button';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  acceptedMessage: {
    marginTop: 12,
  },
});

const meta: Meta<typeof Dialog> = {
  title: 'Core/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  argTypes: {
    isOpen: {
      control: 'boolean',
      description: 'Whether the dialog is shown',
    },
    width: {
      control: 'number',
      description: 'Width of the dialog (default: 400)',
    },
    maxHeight: {
      control: 'text',
      description: 'Maximum height of the dialog (default: 75dvh)',
    },
    variant: {
      control: 'select',
      options: ['standard', 'fullscreen'],
      description: 'Dialog variant',
    },
    purpose: {
      control: 'select',
      options: ['required', 'form', 'info'],
      description: 'Dismissal behavior configuration',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Dialog>;

/**
 * Basic modal example with DialogHeader
 */
function BasicModalExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Open Modal"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog isOpen={isOpen} onOpenChange={open => setIsOpen(open)}>
        <Layout
          header={
            <DialogHeader
              title="Modal Title"
              onOpenChange={open => setIsOpen(open)}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">
                This is a modal using the native &lt;dialog&gt; element with
                Layout for structured content. Click outside or press Escape to
                close.
              </Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button
                  label="Cancel"
                  variant="secondary"
                  onClick={() => setIsOpen(false)}
                />
                <Button
                  label="Confirm"
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
}

export const Default: Story = {
  render: () => <BasicModalExample />,
};

/**
 * Dialog with subtitle example
 */
function SubtitleModalExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Open Modal with Subtitle"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog isOpen={isOpen} onOpenChange={open => setIsOpen(open)}>
        <Layout
          header={
            <DialogHeader
              title="Edit User Profile"
              subtitle="Make changes to your account settings"
              onOpenChange={open => setIsOpen(open)}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">
                The subtitle appears below the title in smaller, secondary text.
                It provides additional context about the dialog&apos;s purpose.
              </Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button
                  label="Cancel"
                  variant="secondary"
                  onClick={() => setIsOpen(false)}
                />
                <Button
                  label="Save Changes"
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
}

export const WithSubtitle: Story = {
  render: () => <SubtitleModalExample />,
};

/**
 * Custom width example
 */
function WideModalExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Open Wide Modal (600px)"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={open => setIsOpen(open)}
        width={600}>
        <Layout
          header={
            <DialogHeader
              title="Wide Modal"
              onOpenChange={open => setIsOpen(open)}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">This modal has a custom width of 600px.</Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack hAlign="end">
                <Button
                  label="Close"
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
}

export const CustomWidth: Story = {
  render: () => <WideModalExample />,
};

/**
 * Fullscreen variant
 */
function FullscreenModalExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Open Fullscreen Modal"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={open => setIsOpen(open)}
        variant="fullscreen">
        <Layout
          header={
            <DialogHeader
              title="Fullscreen Modal"
              onOpenChange={open => setIsOpen(open)}
            />
          }
          content={
            <LayoutContent>
              <div
                style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                <Text type="body">
                  This modal takes up the entire viewport. The width, maxHeight,
                  and position props are ignored in fullscreen mode.
                </Text>
                {Array.from({length: 30}, (_, i) => (
                  <Text type="body" key={i}>
                    {i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing
                    elit. Sed do eiusmod tempor incididunt ut labore et dolore
                    magna aliqua. Ut enim ad minim veniam, quis nostrud
                    exercitation ullamco laboris.
                  </Text>
                ))}
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack hAlign="end">
                <Button
                  label="Close"
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
}

export const Fullscreen: Story = {
  render: () => <FullscreenModalExample />,
};

/**
 * Purpose: required - cannot be dismissed
 */
function RequiredModalExample() {
  const [isOpen, setIsOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const handleAccept = () => {
    setAccepted(true);
    setIsOpen(false);
  };

  return (
    <>
      <Button
        label="Open Required Modal"
        variant="destructive"
        onClick={() => setIsOpen(true)}
      />
      {accepted && (
        <Text type="body" color="primary" xstyle={styles.acceptedMessage}>
          ✓ Terms accepted
        </Text>
      )}
      <Dialog
        isOpen={isOpen}
        onOpenChange={open => setIsOpen(open)}
        purpose="required">
        <Layout
          header={<DialogHeader title="Accept Terms" />}
          content={
            <LayoutContent>
              <Text type="body">
                This is a required modal. You cannot dismiss it by clicking
                outside or pressing Escape. You must complete the action.
              </Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack hAlign="end">
                <Button
                  label="I Accept"
                  variant="primary"
                  onClick={handleAccept}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}

export const PurposeRequired: Story = {
  render: () => <RequiredModalExample />,
};

/**
 * Purpose: form - prevents backdrop click
 */
function FormModalExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Open Form Modal"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={open => setIsOpen(open)}
        purpose="form"
        width={500}>
        <Layout
          header={
            <DialogHeader
              title="Edit Profile"
              onOpenChange={open => setIsOpen(open)}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">
                This modal uses purpose=&quot;form&quot;. Clicking outside
                won&apos;t close it (to prevent accidental data loss), but you
                can still press Escape. Try clicking outside vs pressing Escape.
              </Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button
                  label="Cancel"
                  variant="secondary"
                  onClick={() => setIsOpen(false)}
                />
                <Button
                  label="Save"
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
}

export const PurposeForm: Story = {
  render: () => <FormModalExample />,
};

/**
 * Purpose: info - allows all dismissals
 */
function InfoModalExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Open Info Modal"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={open => setIsOpen(open)}
        purpose="info">
        <Layout
          header={
            <DialogHeader
              title="Information"
              onOpenChange={open => setIsOpen(open)}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">
                This modal uses purpose=&quot;info&quot; (default). You can
                close it by clicking outside, pressing Escape, or using the
                button.
              </Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack hAlign="end">
                <Button
                  label="Got it"
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
}

export const PurposeInfo: Story = {
  render: () => <InfoModalExample />,
};

/**
 * Custom position example
 */
function PositionedModalExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Open Positioned Modal"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={open => setIsOpen(open)}
        position={{top: 100, end: 20}}
        width={350}>
        <Layout
          header={
            <DialogHeader
              title="Positioned Modal"
              onOpenChange={open => setIsOpen(open)}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">
                This modal is positioned at top: 100px, end: 20px instead of
                being centered.
              </Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack hAlign="end">
                <Button
                  label="Close"
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
}

export const CustomPosition: Story = {
  render: () => <PositionedModalExample />,
};

/**
 * Logical position example — start/end mirror under RTL.
 *
 * `start`/`end` map to inset-inline-start/end, so a dialog anchored to the
 * inline-start edge stays on the start edge in both LTR and RTL. This is the
 * preferred replacement for the deprecated physical `left`/`right` (which
 * never mirror). Toggle the story's direction (RTL) to see it flip.
 */
function LogicalPositionedModalExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Open Logically-Positioned Modal"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={open => setIsOpen(open)}
        position={{top: 100, start: 20}}
        width={350}>
        <Layout
          header={
            <DialogHeader
              title="Logically-Positioned Modal"
              onOpenChange={open => setIsOpen(open)}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">
                Positioned with the logical `start: 20` offset (maps to
                inset-inline-start). It hugs the inline-start edge — the left in
                LTR, the right in RTL — instead of a fixed physical side. Prefer
                `start`/`end` over the deprecated `left`/`right`.
              </Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack hAlign="end">
                <Button
                  label="Close"
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
}

export const LogicalPosition: Story = {
  render: () => <LogicalPositionedModalExample />,
};

/**
 * Scrolling content example
 */
function ScrollingModalExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Open Scrolling Modal"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={open => setIsOpen(open)}
        maxHeight="50vh">
        <Layout
          header={
            <DialogHeader
              title="Terms and Conditions"
              onOpenChange={open => setIsOpen(open)}
            />
          }
          content={
            <LayoutContent>
              <div
                style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                {Array.from({length: 20}, (_, i) => (
                  <Text type="body" key={i}>
                    {i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing
                    elit. Sed do eiusmod tempor incididunt ut labore et dolore
                    magna aliqua. Ut enim ad minim veniam, quis nostrud
                    exercitation ullamco laboris nisi ut aliquip ex ea commodo
                    consequat. Duis aute irure dolor in reprehenderit in
                    voluptate velit esse cillum dolore eu fugiat nulla pariatur.
                  </Text>
                ))}
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button
                  label="Decline"
                  variant="secondary"
                  onClick={() => setIsOpen(false)}
                />
                <Button
                  label="Accept"
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
}

export const ScrollingContent: Story = {
  render: () => <ScrollingModalExample />,
};

/**
 * Confirmation dialog pattern
 */
function ConfirmationModalExample() {
  const [isOpen, setIsOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const handleDelete = () => {
    setDeleted(true);
    setIsOpen(false);
  };

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
      <Button
        label="Delete Item"
        variant="destructive"
        onClick={() => setIsOpen(true)}
      />
      {deleted && (
        <Text type="body" color="primary">
          ✓ Item deleted (demo)
        </Text>
      )}
      <Dialog
        isOpen={isOpen}
        onOpenChange={open => setIsOpen(open)}
        width={350}
        purpose="form">
        <Layout
          header={
            <DialogHeader
              title="Confirm Delete"
              onOpenChange={open => setIsOpen(open)}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">
                Are you sure you want to delete this item? This action cannot be
                undone.
              </Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button
                  label="Cancel"
                  variant="secondary"
                  onClick={() => setIsOpen(false)}
                />
                <Button
                  label="Delete"
                  variant="destructive"
                  onClick={handleDelete}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </div>
  );
}

export const ConfirmationDialog: Story = {
  render: () => <ConfirmationModalExample />,
};

/**
 * All purpose variants side by side
 */
export const AllPurposes: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '12px', flexWrap: 'wrap'}}>
      <RequiredModalExample />
      <FormModalExample />
      <InfoModalExample />
    </div>
  ),
};

/**
 * Dialog with auto-focused input
 */
function AutoFocusInputExample() {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState('');
  return (
    <>
      <Button
        label="Open Dialog"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog isOpen={isOpen} onOpenChange={open => setIsOpen(open)}>
        <Layout
          header={
            <DialogHeader
              title="Auto-focused Input"
              onOpenChange={open => setIsOpen(open)}
            />
          }
          content={
            <LayoutContent>
              <TextInput
                label="Name"
                placeholder="This input is focused on mount"
                value={value}
                onChange={setValue}
                hasAutoFocus
              />
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

export const AutoFocusInput: Story = {
  render: () => <AutoFocusInputExample />,
};

/**
 * Nested dialogs — a dialog that opens a second dialog stacked on top.
 *
 * This is a behavior demonstration, not a recommended pattern: the Dialog docs
 * advise against nesting dialogs and suggest restructuring a flow into steps
 * within a single dialog instead. It exists so the stacking behavior of the
 * native <dialog> top layer is observable — each modal dialog pushes its own
 * backdrop, focus trap, and Escape handling on top of the one below it.
 *
 * Things to observe:
 * - Backdrop stacking: the second dialog dims the first, which is already
 *   dimming the page.
 * - Focus trap: focus is trapped inside the top-most dialog while it is open.
 * - Escape: a single Escape closes only the top-most dialog, revealing the
 *   first again.
 * - Scroll lock: the page body stays scroll-locked the whole time.
 */
function NestedDialogsExample() {
  const [isFirstOpen, setIsFirstOpen] = useState(false);
  const [isSecondOpen, setIsSecondOpen] = useState(false);

  return (
    <>
      <Button
        label="Open First Dialog"
        variant="secondary"
        onClick={() => setIsFirstOpen(true)}
      />
      <Dialog
        isOpen={isFirstOpen}
        onOpenChange={open => setIsFirstOpen(open)}
        width={480}>
        <Layout
          header={
            <DialogHeader
              title="First Dialog"
              subtitle="This is the dialog underneath"
              onOpenChange={open => setIsFirstOpen(open)}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">
                Open the second dialog to stack it on top. Notice how its
                backdrop dims this one, focus moves into it, and a single Escape
                returns you here rather than closing everything.
              </Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button
                  label="Close"
                  variant="secondary"
                  onClick={() => setIsFirstOpen(false)}
                />
                <Button
                  label="Open Second Dialog"
                  variant="primary"
                  onClick={() => setIsSecondOpen(true)}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
      <Dialog
        isOpen={isSecondOpen}
        onOpenChange={open => setIsSecondOpen(open)}
        width={360}>
        <Layout
          header={
            <DialogHeader
              title="Second Dialog"
              subtitle="Stacked on top of the first"
              onOpenChange={open => setIsSecondOpen(open)}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">
                This dialog sits on top of the first. Focus is trapped here
                until it closes, and pressing Escape or Close reveals the first
                dialog again.
              </Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack hAlign="end">
                <Button
                  label="Back"
                  variant="primary"
                  onClick={() => setIsSecondOpen(false)}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}

export const NestedDialogs: Story = {
  render: () => <NestedDialogsExample />,
};

type ReadinessReferenceProps = {
  frameWidth: number;
  summary: string;
  title: string;
};

function ReadinessReference({
  frameWidth,
  summary,
  title,
}: ReadinessReferenceProps) {
  return (
    <div style={{width: frameWidth, maxWidth: '100%'}}>
      <Text type="supporting" color="secondary">
        {summary}
      </Text>
      <Dialog isOpen isInline onOpenChange={() => {}} width={400}>
        <Layout
          header={<DialogHeader title={title} onOpenChange={() => {}} />}
          content={
            <LayoutContent>
              <Text type="body">
                This dialog keeps long content inside the surface. Resize or
                compare the frame to confirm text wraps instead of forcing
                horizontal overflow.
              </Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end" wrap="wrap">
                <Button label="Cancel" variant="secondary" />
                <Button label="Save changes" variant="primary" />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </div>
  );
}

/** Responsive and Interaction Readiness visual reference for wide viewport layout. */
export const ReadinessWideViewport: Story = {
  name: 'Readiness / wide viewport',
  render: () => (
    <ReadinessReference
      frameWidth={720}
      title="Wide viewport dialog"
      summary="Wide viewport reference: the requested 400px surface is preserved."
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Visual evidence for the wide viewport layout scenario. Storybook does not emulate pointer or hover capability here; pointer/hover independence is covered by implementation tests and audit notes.',
      },
    },
  },
};

/** Responsive and Interaction Readiness visual reference for narrow viewport layout. */
export const ReadinessNarrowViewport: Story = {
  name: 'Readiness / narrow viewport',
  render: () => (
    <ReadinessReference
      frameWidth={320}
      title="Narrow viewport dialog"
      summary="Narrow viewport reference: the surface clamps to the frame and wraps labels/content."
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Visual evidence for the narrow viewport layout scenario using a constrained review frame. Storybook does not emulate coarse pointer or no-hover capability here.',
      },
    },
  },
};

/** Visual reference for DialogHeader's default and explicit end-slot compensation. */
export const HeaderEndEdgeCompensation: Story = {
  name: 'Header / end edge compensation',
  render: () => (
    <VStack gap={4}>
      <Dialog isOpen isInline onOpenChange={() => {}} width={400}>
        <Layout
          header={
            <DialogHeader
              title="Automatic end-content compensation"
              endContent={<Button label="Help" variant="ghost" />}
              onOpenChange={() => {}}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">
                Omission preserves the released block and logical inline-end
                compensation whenever the close action renders.
              </Text>
            </LayoutContent>
          }
        />
      </Dialog>
      <Dialog isOpen isInline onOpenChange={() => {}} width={400}>
        <Layout
          header={
            <DialogHeader
              title="Inline-only end-content compensation"
              endContent={<Button label="Help" variant="ghost" />}
              endContentEdgeCompensation="inline"
              onOpenChange={() => {}}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">
                The anatomy-targeted prop keeps logical inline-end alignment
                while leaving the slot inside the header's block edges.
              </Text>
            </LayoutContent>
          }
        />
      </Dialog>
    </VStack>
  ),
};

type PresentationChoiceProps = {
  presentation: 'dialog' | 'fullscreen' | 'bottom-sheet';
};

function PresentationChoice({presentation}: PresentationChoiceProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('Active');
  const [notes, setNotes] = useState('');
  const title =
    presentation === 'fullscreen'
      ? 'Edit workflow details'
      : presentation === 'bottom-sheet'
        ? 'Filter results'
        : 'Confirm status change';

  const openButtonLabel =
    presentation === 'fullscreen'
      ? 'Open fullscreen Dialog'
      : presentation === 'bottom-sheet'
        ? 'Open Bottom Sheet'
        : 'Open Dialog';

  const footer = (
    <HStack gap={2} hAlign="end" wrap="wrap">
      <Button
        label="Cancel"
        variant="secondary"
        onClick={() => setIsOpen(false)}
      />
      <Button
        label="Apply"
        variant="primary"
        onClick={() => setIsOpen(false)}
      />
    </HStack>
  );

  const formContent = (
    <VStack gap={4}>
      <Text type="supporting" color="secondary">
        These deterministic examples compare presentation choices. The adaptive
        recipe uses BottomSheet only after explicit touchPresentation opt-in and
        matching touch-oriented conditions.
      </Text>
      <TextInput label="Status" value={filter} onChange={setFilter} />
      <TextArea label="Notes" rows={6} value={notes} onChange={setNotes} />
    </VStack>
  );

  if (presentation === 'bottom-sheet') {
    return (
      <>
        <Button label={openButtonLabel} onClick={() => setIsOpen(true)} />
        <BottomSheet
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          label={title}
          purpose="info"
          height="hug"
          padding={0}>
          <VStack gap={4} style={{padding: 'var(--spacing-4)'}}>
            <Heading level={3}>{title}</Heading>
            <Text type="supporting" color="secondary">
              Use Bottom Sheet for lightweight contextual actions, pickers, or
              filters. Its purpose contract controls Escape, scrim click, and
              swipe dismissal.
            </Text>
            <Button label="Active" variant="secondary" />
            <Button label="Archived" variant="secondary" />
            <Button label="Owned by me" variant="secondary" />
            {footer}
          </VStack>
        </BottomSheet>
      </>
    );
  }

  return (
    <>
      <Button label={openButtonLabel} onClick={() => setIsOpen(true)} />
      <Dialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        purpose="form"
        variant={presentation === 'fullscreen' ? 'fullscreen' : 'standard'}>
        <Layout
          header={<DialogHeader title={title} onOpenChange={setIsOpen} />}
          content={
            <LayoutContent>
              {presentation === 'fullscreen' ? (
                formContent
              ) : (
                <Text type="body">
                  Keep Dialog for centered, focused tasks and confirmations. It
                  stays the default presentation on every device.
                </Text>
              )}
            </LayoutContent>
          }
          footer={<LayoutFooter>{footer}</LayoutFooter>}
        />
      </Dialog>
    </>
  );
}

/** Mobile presentation alternative: keep centered Dialog for focused tasks. */
export const MobilePresentationKeepDialog: Story = {
  name: 'Mobile presentation alternatives / keep Dialog',
  render: () => <PresentationChoice presentation="dialog" />,
  parameters: {
    docs: {
      description: {
        story:
          'Deterministic presentation example: keep the centered responsive Dialog for confirmations and focused tasks. This is the default choice, not device emulation.',
      },
    },
  },
};

/** Mobile presentation alternative: fullscreen Dialog for complex workflows. */
export const MobilePresentationFullscreenDialog: Story = {
  name: 'Mobile presentation alternatives / fullscreen Dialog',
  render: () => <PresentationChoice presentation="fullscreen" />,
  parameters: {
    docs: {
      description: {
        story:
          'Deterministic presentation example: use fullscreen Dialog for complex, long, or keyboard-heavy workflows when the user should stay in a Dialog contract.',
      },
    },
  },
};

/** Mobile presentation alternative: BottomSheet for lightweight contextual UI. */
export const MobilePresentationBottomSheet: Story = {
  name: 'Mobile presentation alternatives / BottomSheet',
  render: () => <PresentationChoice presentation="bottom-sheet" />,
  parameters: {
    docs: {
      description: {
        story:
          'Deterministic presentation example: use BottomSheet for lightweight contextual actions, pickers, or filters. Its purpose prop controls Escape, scrim click, and swipe dismissal.',
      },
    },
  },
};
