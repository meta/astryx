// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Toast, useToast, ToastViewport} from '@astryxdesign/core/Toast';
import type {
  ToastContentRenderProps,
  ToastOptions,
  ToastType,
} from '@astryxdesign/core/Toast';
import {Theme, defineTheme, useTheme} from '@astryxdesign/core/theme';
import {Button} from '@astryxdesign/core/Button';
import {Link} from '@astryxdesign/core/Link';
import {Card} from '@astryxdesign/core/Card';
import {Stack} from '@astryxdesign/core/Stack';
import {Heading} from '@astryxdesign/core/Text';
import {Dialog} from '@astryxdesign/core/Dialog';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Text} from '@astryxdesign/core/Text';
import {
  colorVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {Badge} from '@astryxdesign/core/Badge';
import {Layout, LayoutContent, LayoutPanel} from '@astryxdesign/core/Layout';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {SideNav, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {Table, pixel, proportional} from '@astryxdesign/core/Table';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {
  ArchiveBoxIcon,
  ClockIcon,
  EnvelopeIcon,
  InboxIcon,
  PaperAirplaneIcon,
  StarIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import {
  ArchiveBoxIcon as ArchiveBoxIconSolid,
  ClockIcon as ClockIconSolid,
  InboxIcon as InboxIconSolid,
  PaperAirplaneIcon as PaperAirplaneIconSolid,
  StarIcon as StarIconSolid,
} from '@heroicons/react/24/solid';

const styles = stylex.create({
  narrowLayoutReference: {
    width: 280,
    maxWidth: '100%',
  },
  mobileCanvas: {
    position: 'relative',
    boxSizing: 'border-box',
    inlineSize: 360,
    maxInlineSize: '100%',
    minBlockSize: 640,
    overflow: 'hidden',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-body)',
    boxShadow: 'var(--shadow-low)',
    transform: 'translateZ(0)',
  },
  mobileHeader: {
    paddingBlock: 'var(--spacing-4)',
    paddingInline: 'var(--spacing-4)',
    backgroundColor: 'var(--color-background-surface)',
    borderBlockEndWidth: 1,
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'var(--color-border)',
  },
  mobileContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-3)',
    padding: 'var(--spacing-4)',
  },
  mobileCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-2)',
    padding: 'var(--spacing-3)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-surface)',
  },
  rtlCanvas: {
    direction: 'rtl',
  },
  stackControls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--spacing-2)',
  },
  // One app page per colour mode, side by side (ThemedToastAction). The
  // frame paints the mode's own page background and positions the page's
  // inline toast in its bottom-end corner, where a viewport would put it.
  appPages: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--spacing-4)',
    padding: 'var(--spacing-4)',
  },
  appPageSlot: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-2)',
    flexBasis: 680,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  appPage: {
    position: 'relative',
    height: 560,
    overflow: 'hidden',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-body)',
  },
  appPageToast: {
    position: 'absolute',
    insetBlockEnd: 'var(--spacing-4)',
    insetInlineEnd: 'var(--spacing-4)',
    inlineSize: 400,
    maxInlineSize: 'calc(100% - 2 * var(--spacing-4))',
  },
  inboxHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 'var(--spacing-2)',
  },
  inboxActions: {
    display: 'flex',
    gap: 'var(--spacing-2)',
  },
});

const mobileStoryParameters = {
  docs: {
    story: {inline: false, height: '720px'},
  },
};

function MobileCanvas({
  title,
  description,
  isRtl = false,
  children,
}: {
  title: string;
  description: string;
  isRtl?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      dir={isRtl ? 'rtl' : undefined}
      {...stylex.props(styles.mobileCanvas, isRtl && styles.rtlCanvas)}>
      <div {...stylex.props(styles.mobileHeader)}>
        <Text type="label">{title}</Text>
        <Text type="supporting" color="secondary">
          {description}
        </Text>
      </div>
      <div {...stylex.props(styles.mobileContent)}>{children}</div>
    </div>
  );
}

function MockCard({children}: {children: ReactNode}) {
  return <div {...stylex.props(styles.mobileCard)}>{children}</div>;
}

interface ReplayToastSpec extends ToastOptions {
  key: string;
}

function ToastReplayControls({
  items,
  label = 'Show toast',
}: {
  items: ReadonlyArray<ReplayToastSpec>;
  label?: string;
}) {
  const toast = useToast();
  const dismissers = useRef<Array<() => void>>([]);
  const reset = (): void => {
    for (const dismiss of dismissers.current) {
      dismiss();
    }
    dismissers.current = [];
  };
  const replay = (): void => {
    reset();
    for (const item of items) {
      const {key, ...options} = item;
      dismissers.current.push(toast({uniqueID: key, ...options}));
    }
  };
  return (
    <div {...stylex.props(styles.stackControls)}>
      <Button label={label} onClick={replay} />
      <Button label="Reset" variant="secondary" onClick={reset} />
    </div>
  );
}

const meta: Meta = {
  title: 'Core/Toast',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Imperative toast notification system. Use `useToast()` for brief, non-critical feedback. Works with or without `LayerProvider`.',
      },
    },
  },
};

export default meta;

// =============================================================================
// Default
// =============================================================================

export const Default: StoryObj = {
  render: function DefaultStory() {
    const toast = useToast();
    return (
      <Button
        label="Show toast"
        onClick={() => toast({body: 'This is an info toast'})}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Plain info toasts are transient by default. Use them for brief, non-critical feedback that is also reflected elsewhere in the UI.',
      },
    },
  },
};

// =============================================================================
// Types
// =============================================================================

export const Types: StoryObj = {
  render: function TypesStory() {
    const toast = useToast();
    const types: ToastType[] = ['info', 'error'];
    return (
      <Stack direction="horizontal" gap={2}>
        {types.map(type => (
          <Button
            key={type}
            label={type}
            variant={type === 'error' ? 'destructive' : 'secondary'}
            onClick={() =>
              toast({
                body: `This is a ${type} notification.`,
                type,
              })
            }
          />
        ))}
      </Stack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Two toast types: info (default) and error. Plain info toasts are transient by default; error toasts persist until dismissed.',
      },
    },
  },
};

// =============================================================================
// With Action (endContent)
// =============================================================================

export const WithAction: StoryObj = {
  render: function WithActionStory() {
    const toast = useToast();
    return (
      <Stack direction="horizontal" gap={2}>
        <Button
          label="With button"
          onClick={() =>
            toast({
              body: 'Item deleted',
              isAutoHide: false,
              endContent: (
                <Button
                  label="Undo"
                  variant="secondary"
                  size="sm"
                  onClick={() => console.log('Undo!')}
                />
              ),
            })
          }
        />
        <Button
          label="With link"
          variant="secondary"
          onClick={() =>
            toast({
              body: 'Your report is ready.',
              isAutoHide: false,
              endContent: (
                <Link href="#" hasUnderline>
                  View report
                </Link>
              ),
            })
          }
        />
      </Stack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Use `endContent` for short trailing actions. Set `isAutoHide: false` when the action must remain available; timed content still needs to satisfy WCAG 2.2.1.',
      },
    },
  },
};

// =============================================================================
// Error Persists
// =============================================================================

export const ErrorPersists: StoryObj = {
  render: function ErrorPersistsStory() {
    const toast = useToast();
    return (
      <Button
        label="Trigger error"
        variant="destructive"
        onClick={() =>
          toast({
            body: 'Check your network connection and try again.',
            type: 'error',
          })
        }
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Error toasts default to `isAutoHide: false`; they persist until the user dismisses them.',
      },
    },
  },
};

// =============================================================================
// Programmatic Dismiss
// =============================================================================

export const ProgrammaticDismiss: StoryObj = {
  render: function ProgrammaticDismissStory() {
    const toast = useToast();
    const dismissRef = useRef<(() => void) | null>(null);
    return (
      <Stack direction="horizontal" gap={2}>
        <Button
          label="Show persistent toast"
          onClick={() => {
            dismissRef.current = toast({
              body: 'Uploading...',
              isAutoHide: false,
            });
          }}
        />
        <Button
          label="Dismiss"
          variant="secondary"
          onClick={() => {
            dismissRef.current?.();
            dismissRef.current = null;
          }}
        />
      </Stack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          '`useToast()` returns a dismiss function. Call it to remove the toast programmatically.',
      },
    },
  },
};

// =============================================================================
// Deduplication
// =============================================================================

export const Deduplication: StoryObj = {
  render: function DeduplicationStory() {
    const toast = useToast();
    return (
      <Stack direction="horizontal" gap={2}>
        <Button
          label="Offline (ignore)"
          onClick={() =>
            toast({
              body: 'You are offline',
              uniqueID: 'offline',
              collisionBehavior: 'ignore',
              isAutoHide: false,
            })
          }
        />
        <Button
          label="Progress (overwrite)"
          variant="secondary"
          onClick={() =>
            toast({
              body: `Uploading... ${Math.floor(Math.random() * 100)}%`,
              uniqueID: 'upload-progress',
              collisionBehavior: 'overwrite',
              isAutoHide: false,
            })
          }
        />
      </Stack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          '`uniqueID` prevents duplicate toasts. `ignore` keeps the existing; `overwrite` replaces it.',
      },
    },
  },
};

// =============================================================================
// Stacking
// =============================================================================

export const Stacking: StoryObj = {
  render: function StackingStory() {
    const toast = useToast();
    const countRef = useRef(0);
    return (
      <Button
        label="Add toast"
        onClick={() => {
          countRef.current++;
          const types: ToastType[] = ['info', 'error'];
          const type = types[countRef.current % types.length];
          toast({
            body: `Toast #${countRef.current} — ${type} notification.`,
            type,
          });
        }}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Multiple toasts stack vertically. Default max visible is 5.',
      },
    },
  },
};

// =============================================================================
// Layout references
// =============================================================================

export const NarrowLayoutReference: StoryObj = {
  name: 'Narrow layout reference',
  render: () => (
    <div {...stylex.props(styles.narrowLayoutReference)}>
      <Toast
        type="info"
        body="Arbeitsbereichsbenachrichtigungseinstellungen gespeichert"
        isAutoHide={false}
        autoHideDuration={5000}
        endContent={<Button label="Undo" variant="secondary" size="sm" />}
        onDismiss={() => {}}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Static visual reference for narrow viewport/content-fit behavior: realistic translated copy wraps while Undo and dismiss stay aligned with its first line. This example opts out of auto-hide and does not emulate touch, pointer, or hover capabilities.',
      },
    },
  },
};

// =============================================================================
// Mobile situations
// =============================================================================

export const MobileRtlSafeAreaPlacement: StoryObj = {
  name: 'Mobile situations / RTL logical placement',
  render: () => (
    <MobileCanvas
      title="إعدادات الفريق"
      description="bottomStart follows the document direction; safe-area insets are device behavior and are not pixel-emulated here."
      isRtl>
      <ToastViewport position="bottomStart" isTopLayer={false} maxVisible={2}>
        <MockCard>
          <Text type="supporting" color="secondary">
            The toast uses a logical start placement. On an RTL page, start is
            the right edge; device safe-area padding is handled by the viewport
            styles.
          </Text>
          <ToastReplayControls
            label="إظهار التنبيه"
            items={[
              {key: 'mobile-rtl-safe-area', body: 'تم حفظ إعدادات الفريق'},
            ]}
          />
        </MockCard>
      </ToastViewport>
    </MobileCanvas>
  ),
  parameters: {
    ...mobileStoryParameters,
    docs: {
      story: {
        ...mobileStoryParameters.docs.story,
        description:
          'RTL story for logical start/end placement. Safe-area behavior depends on real device insets; this story does not fake pixel evidence.',
      },
    },
  },
};

export const MobileSwipeToDismiss: StoryObj = {
  name: 'Mobile situations / Swipe to dismiss',
  render: () => (
    <MobileCanvas
      title="Swipe dismissal"
      description="Swipe is an enhancement only; the surface fades as it approaches the edge, and the visible close button remains the simple alternative.">
      <ToastViewport position="topEnd" isTopLayer={false} maxVisible={2}>
        <MockCard>
          <Text type="supporting" color="secondary">
            Use touch or pen input, or browser touch emulation, to swipe the
            toast toward its configured block edge: up for top placement, down
            for bottom placement. This matches the direction each Toast enters
            and exits, keeping one spatial model for the whole interaction. The
            gesture claims the touch only after dominant travel matches the
            dismiss edge, so opposite-direction and horizontal page scrolling
            remain available. Pen is supported as direct-contact input; mouse
            dragging is ignored to avoid conflicting with desktop text
            selection, where the close button remains available.
          </Text>
          <ToastReplayControls
            items={[
              {
                key: 'mobile-swipe-dismiss',
                body: 'Swipe or close me',
                isAutoHide: false,
              },
            ]}
          />
        </MockCard>
      </ToastViewport>
    </MobileCanvas>
  ),
  parameters: {
    ...mobileStoryParameters,
    docs: {
      story: {
        ...mobileStoryParameters.docs.story,
        description:
          'Interactive vertical edge swipe-to-dismiss example using real ToastViewport behavior. The vertical axis intentionally matches the Toast placement and motion model: top Toasts leave upward and bottom Toasts leave downward. A non-passive touchmove handoff claims only dominant travel toward that edge; opposite-direction and horizontal page scrolling remain available. Pen is supported as direct-contact input, while mouse drag is excluded to avoid conflicting with desktop selection; the close button and F6 keyboard access remain available.',
      },
    },
  },
};

export const MobileMotionEdgeAwareEntrance: StoryObj = {
  name: 'Mobile situations / Motion edge-aware entrance',
  render: () => (
    <MobileCanvas
      title="Motion replay"
      description="Replay top and bottom stacks to compare the 8px edge-directed slide, fade, and tighter stack spacing.">
      <Stack gap={3}>
        <ToastViewport position="topEnd" isTopLayer={false} maxVisible={3}>
          <MockCard>
            <Text type="supporting" color="secondary">
              Top placement travels 8px down from the top edge; exits return
              upward. Existing toasts make room through the wrapper grid-row
              transition.
            </Text>
            <ToastReplayControls
              label="Replay top stack"
              items={[
                {key: 'motion-top-1', body: 'Top first', isAutoHide: false},
                {key: 'motion-top-2', body: 'Top second', isAutoHide: false},
                {key: 'motion-top-3', body: 'Top third', isAutoHide: false},
              ]}
            />
          </MockCard>
        </ToastViewport>
        <ToastViewport position="bottomEnd" isTopLayer={false} maxVisible={3}>
          <MockCard>
            <Text type="supporting" color="secondary">
              Bottom placement travels 8px up from the bottom edge and returns
              downward on exit, with the same transform/opacity contract and
              tighter stack spacing.
            </Text>
            <ToastReplayControls
              label="Replay bottom stack"
              items={[
                {
                  key: 'motion-bottom-1',
                  body: 'Bottom first',
                  isAutoHide: false,
                },
                {
                  key: 'motion-bottom-2',
                  body: 'Bottom second',
                  isAutoHide: false,
                },
                {
                  key: 'motion-bottom-3',
                  body: 'Bottom third',
                  isAutoHide: false,
                },
              ]}
            />
          </MockCard>
        </ToastViewport>
      </Stack>
    </MobileCanvas>
  ),
  parameters: {
    ...mobileStoryParameters,
    docs: {
      story: {
        ...mobileStoryParameters.docs.story,
        description:
          'Replayable visual check for the focused motion change: an 8px top/bottom translate with the existing opacity and timing, plus the wrapper grid-row spacing transition.',
      },
    },
  },
};

export const NestedViewportLandmark: StoryObj = {
  name: 'Accessibility / Nested viewport landmark',
  render: () => (
    <MobileCanvas
      title="Nested providers"
      description="Only the viewport that receives a toast becomes a Notifications landmark.">
      <ToastViewport isTopLayer={false}>
        <ToastViewport isTopLayer={false}>
          <MockCard>
            <Text type="supporting" color="secondary">
              Show a toast, then inspect the accessibility tree: the empty outer
              viewport remains unnamed and only the inner viewport is a region.
            </Text>
            <ToastReplayControls
              items={[
                {
                  key: 'nested-viewport-landmark',
                  body: 'Notification settings saved',
                  isAutoHide: false,
                },
              ]}
            />
          </MockCard>
        </ToastViewport>
      </ToastViewport>
    </MobileCanvas>
  ),
  parameters: {
    ...mobileStoryParameters,
    docs: {
      story: {
        ...mobileStoryParameters.docs.story,
        description:
          'Accessibility check for nested ToastViewport composition. With a toast visible, exactly one named Notifications region should appear; with none visible, there should be zero.',
      },
    },
  },
};

export const NoProvider: StoryObj = {
  render: function NoProviderStory() {
    const toast = useToast();
    return (
      <Card padding={4}>
        <Stack gap={2}>
          <p style={{margin: 0, fontSize: 14}}>
            No LayerProvider: the hook creates a fallback viewport on
            document.body automatically.
          </p>
          <Button
            label="Show toast"
            onClick={() =>
              toast({
                body: 'Works without a provider!',
              })
            }
          />
        </Stack>
      </Card>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          '`useToast()` works without a provider. It lazily mounts a fallback viewport on first call.',
      },
    },
  },
};

// =============================================================================
// Toast over Dialog
// =============================================================================

export const ToastOverDialog: StoryObj = {
  render: function ToastOverDialogStory() {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <Stack gap={2}>
        <Button label="Open dialog" onClick={() => setIsOpen(true)} />
        <Dialog isOpen={isOpen} onOpenChange={() => setIsOpen(false)}>
          <ToastViewport isTopLayer={false}>
            <DialogToastContent onClose={() => setIsOpen(false)} />
          </ToastViewport>
        </Dialog>
      </Stack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "Dialog with its own `ToastViewport`: toasts render inside the dialog's top layer context and appear above the dialog overlay.",
      },
    },
  },
};

export const AppToastOverDialog: StoryObj = {
  render: function AppToastOverDialogStory() {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <ToastViewport>
        <Stack gap={2}>
          <Button label="Open dialog" onClick={() => setIsOpen(true)} />
          <Dialog
            isOpen={isOpen}
            onOpenChange={() => setIsOpen(false)}
            aria-label="Edit item">
            <DialogToastContent onClose={() => setIsOpen(false)} />
          </Dialog>
        </Stack>
      </ToastViewport>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "The app's own `ToastViewport` and no viewport in the dialog: while the dialog is open the viewport moves into it, so toasts fired from inside paint above the overlay and stay clickable.",
      },
    },
  },
};

function DialogToastContent({onClose}: {onClose: () => void}) {
  const toast = useToast();
  return (
    <Stack gap={3}>
      <p>Toasts fired here render inside the dialog, above its overlay.</p>
      <Stack direction="horizontal" gap={2} wrap="wrap">
        <Button label="Close" variant="secondary" onClick={onClose} />
        <Button
          label="Show toast"
          onClick={() => {
            toast({body: 'Toast from inside the dialog!'});
          }}
        />
        <Button
          label="Error toast"
          variant="destructive"
          onClick={() => {
            toast({body: 'Something went wrong.', type: 'error'});
          }}
        />
      </Stack>
    </Stack>
  );
}

export const AppToastOverBottomSheet: StoryObj = {
  render: function AppToastOverBottomSheetStory() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    return (
      // Toasts at the top, clear of the sheet rising from the bottom.
      <ToastViewport position="topEnd">
        <Stack gap={2}>
          <SheetToastContent openLabel="Open sheet" />
          <Button label="Open dialog" onClick={() => setIsDialogOpen(true)} />
          <Dialog
            isOpen={isDialogOpen}
            onOpenChange={() => setIsDialogOpen(false)}
            aria-label="Edit item">
            <SheetToastContent openLabel="Open sheet from the dialog" />
          </Dialog>
        </Stack>
      </ToastViewport>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "The app's own `ToastViewport` and a `BottomSheet`, opened on its own or from a dialog: while the sheet is open the viewport moves into it, so a toast fired from the sheet paints above it and its action stays clickable.",
      },
    },
  },
};

function SheetToastContent({openLabel}: {openLabel: string}) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('The item is in your inbox.');
  const toast = useToast();
  return (
    <>
      <Button label={openLabel} onClick={() => setIsOpen(true)} />
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label="Item actions">
        <Stack gap={3}>
          <p>{status}</p>
          <Button
            label="Archive"
            onClick={() => {
              setStatus('The item is archived.');
              toast({
                body: 'Item archived',
                isAutoHide: false,
                endContent: (
                  <Button
                    label="Undo"
                    variant="secondary"
                    size="sm"
                    onClick={() => setStatus('The item is back in your inbox.')}
                  />
                ),
              });
            }}
          />
        </Stack>
      </BottomSheet>
    </>
  );
}

// =============================================================================
// Theming
// =============================================================================

/**
 * `toast` is the card — the surface the toast paints. `base` restyles every
 * toast; `type:error` restyles just the error one, because `type` is the
 * toast's visual prop and the card renders it as a `.error` class.
 *
 * That one target covers more of the toast than it looks like it should:
 *
 * - **Inherited properties reach the content.** Font, size and letter-spacing
 *   set on `toast` cascade into the body and `endContent`. There is no
 *   `toast-body` target and none is needed.
 * - **Text colour looks after itself.** A toast measures the surface it just
 *   painted and picks the side that reads on it, so restyling the background
 *   is enough — the body, the dismiss glyph and `endContent` follow. Below,
 *   the cream card gets dark text and the deep red one light text, from
 *   nothing but the two `backgroundColor` rules.
 *
 * `onDark` / `onLight` are for overriding that choice, not for making it. They
 * apply only when the surface actually resolves to that side, so a toast whose
 * ambient text already reads gets neither.
 *
 * Wrap the viewport, not just the buttons: theme CSS is `@scope`d and the
 * toast renders inside the viewport.
 */
const brandToastTheme = defineTheme({
  name: 'toast-brand-demo',
  components: {
    toast: {
      base: {
        backgroundColor: '#FFF4D6',
        borderRadius: 'var(--radius-full)',
        paddingInline: 'var(--spacing-6)',
        boxShadow: 'var(--shadow-high)',
        fontFamily: 'var(--font-family-code)',
      },
      'type:error': {
        backgroundColor: '#5C0A18',
      },
    },
  },
});

/**
 * Default and themed, side by side, in both types. These are inline `Toast`
 * elements rather than fired ones so both states stay on screen together;
 * `ThemedToastLive` shows the same theme driving real `useToast()` calls.
 */
export const ThemedToast: StoryObj = {
  render: function ThemedToastStory() {
    return (
      <Stack direction="horizontal" gap={4} wrap="wrap">
        <ToastSpecimens label="Default" />
        <BrandToastScope>
          <ToastSpecimens label="brandToastTheme" />
        </BrandToastScope>
      </Stack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Pill radius, wider inline padding, the cream surface and the ' +
          'monospace body all come from `components.toast.base`; the deep red ' +
          'is `type:error`. Neither rule sets a text colour.',
      },
    },
  },
};

/**
 * The copyable shape: wrap the viewport in the theme and fire toasts normally.
 */
export const ThemedToastLive: StoryObj = {
  render: function ThemedToastLiveStory() {
    return (
      <BrandToastScope>
        <ToastViewport>
          <ThemedToastTriggers />
        </ToastViewport>
      </BrandToastScope>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Same theme, real toasts. The viewport is inside `Theme`, so the ' +
          'scoped theme CSS reaches the toasts it renders.',
      },
    },
  },
};

/**
 * "Ink Mail" is a brand whose toast is ink on both pages, one step lighter on
 * the dark page the way dark-mode elevation is drawn. Its secondary control is
 * a soft fill on the light page and a hairline outline on the dark one: a fill
 * on a dark page stacks a third tonal layer on page and card and reads muddy.
 * The toast action is a secondary control, so it should wear the same clothes
 * as the secondary buttons around it.
 *
 * It cannot do that from inside the card on its own. `light-dark()` and
 * `onDark`/`onLight` follow the SURFACE, and the surface is ink on both pages,
 * so a Button rule can only ever see the dark side: on the light page the Undo
 * would come out outlined while every other secondary button on the page is
 * filled. `themeMode` is the card saying which page it is on. The theme sets
 * its own properties on `toast['themeMode:*']`, they inherit into `endContent`,
 * and the theme's Button rule reads them ahead of its `light-dark()` fallback.
 * Product code passes `variant="secondary"` and nothing else.
 *
 * The Button rule is theme-wide by construction (the override grammar has no
 * descendant form), so outside a toast the properties are unset and the
 * fallback is the brand's normal secondary look. The second theme leaves the
 * toast rules out, for the story's `themeMode rule` control.
 */
function defineInkMailTheme(name: string, hasThemeModeRule: boolean) {
  return defineTheme({
    name,
    color: {accent: ['#1F4FD8', '#8FB0FF'], neutralStyle: 'warm'},
    tokens: {
      '--color-background-body': ['#F3F1EA', '#111214'],
      '--color-background-surface': ['#FFFFFF', '#1A1B1F'],
      // Ink on both pages, lifted a step on the dark one.
      '--color-background-inverted': ['#1B1D22', '#25282F'],
    },
    components: {
      button: {
        // The brand's secondary control: soft fill on the light page, hairline
        // outline on the dark one. Inside a toast the card's mode rules below
        // set the properties; everywhere else they are unset and light-dark()
        // decides. light-dark() takes colours only, so the ring's shape stays
        // constant and only its colour switches.
        'variant:secondary': {
          backgroundColor:
            'var(--ink-secondary-bg, light-dark(rgb(27 29 34 / 0.08), transparent))',
          boxShadow:
            'inset 0 0 0 1px var(--ink-secondary-ring, light-dark(transparent, rgb(255 255 255 / 0.24)))',
        },
      },
      ...(hasThemeModeRule
        ? {
            toast: {
              // Light page: the fill, in the card's own white, no ring. Dark
              // page: no fill, the ring. Only a toast sets these, so buttons
              // elsewhere keep the fallback.
              'themeMode:light': {
                '--ink-secondary-bg': 'rgb(255 255 255 / 0.16)',
                '--ink-secondary-ring': 'transparent',
              },
              'themeMode:dark': {
                '--ink-secondary-bg': 'transparent',
                '--ink-secondary-ring': 'rgb(255 255 255 / 0.24)',
              },
            },
          }
        : {}),
    },
  });
}

const inkMailTheme = defineInkMailTheme('ink-mail', true);
const inkMailLightDarkOnlyTheme = defineInkMailTheme(
  'ink-mail-light-dark-only',
  false,
);

interface InboxRow extends Record<string, unknown> {
  id: string;
  from: string;
  subject: string;
  time: string;
}

const inboxRows: InboxRow[] = [
  {
    id: '1',
    from: 'Priya Natarajan',
    subject: 'Launch review: notes and next steps',
    time: '9:42',
  },
  {
    id: '2',
    from: 'Design Systems',
    subject: 'Toast actions on the dark page',
    time: '9:10',
  },
  {
    id: '3',
    from: 'Marcus Webb',
    subject: 'Re: contract renewal',
    time: '8:05',
  },
  {
    id: '4',
    from: 'Billing',
    subject: 'Your August invoice is ready',
    time: 'Tue',
  },
  {
    id: '5',
    from: 'Lena Hoffmann',
    subject: 'Offsite agenda, first draft',
    time: 'Mon',
  },
  {id: '6', from: 'Support', subject: 'Ticket 4821 resolved', time: 'Mon'},
];

const inboxColumns = [
  {key: 'from', header: 'From', width: pixel(150)},
  {key: 'subject', header: 'Subject', width: proportional(1)},
  {key: 'time', header: 'Time', width: pixel(96)},
];

type InkMailMode = 'light' | 'dark';

// Both pages share one canvas, so each names its landmarks after its mode.
function InkMailTopNav({mode}: {mode: InkMailMode}) {
  return (
    <TopNav
      label={`Ink Mail, ${mode} app`}
      heading={
        <TopNavHeading
          heading="Ink Mail"
          logo={
            <NavIcon icon={<EnvelopeIcon style={{width: 16, height: 16}} />} />
          }
        />
      }
      startContent={
        <>
          <TopNavItem label="Mail" href="#" isSelected />
          <TopNavItem label="Contacts" href="#" />
          <TopNavItem label="Calendar" href="#" />
        </>
      }
      endContent={
        <Button
          label="Account"
          variant="ghost"
          icon={<UserCircleIcon style={{width: 16, height: 16}} />}
          isIconOnly
        />
      }
    />
  );
}

function InkMailSideNav({mode}: {mode: InkMailMode}) {
  return (
    <SideNav
      aria-label={`Mailboxes, ${mode} app`}
      topContent={<Button label="Compose" variant="primary" width="100%" />}>
      <SideNavSection title="Mailboxes" isHeaderHidden>
        <SideNavItem
          label="Inbox"
          icon={InboxIcon}
          selectedIcon={InboxIconSolid}
          isSelected
          href="#"
          endContent={<Badge label={6} />}
        />
        <SideNavItem
          label="Starred"
          icon={StarIcon}
          selectedIcon={StarIconSolid}
          href="#"
        />
        <SideNavItem
          label="Snoozed"
          icon={ClockIcon}
          selectedIcon={ClockIconSolid}
          href="#"
        />
        <SideNavItem
          label="Sent"
          icon={PaperAirplaneIcon}
          selectedIcon={PaperAirplaneIconSolid}
          href="#"
        />
        <SideNavItem
          label="Archive"
          icon={ArchiveBoxIcon}
          selectedIcon={ArchiveBoxIconSolid}
          href="#"
        />
      </SideNavSection>
    </SideNav>
  );
}

/**
 * One inbox page. The archive toast is an inline `Toast` in the frame's
 * bottom-end corner rather than a fired one, so both pages show it at once
 * (two live viewports on one canvas would be two identical "Notifications"
 * landmarks); Archive brings it back after a dismiss. The action is a plain
 * `variant="secondary"` Button; the theme decides how it reads on each page.
 */
function InkMailPage({mode, type}: {mode: InkMailMode; type: ToastType}) {
  const [isToastShown, setIsToastShown] = useState(true);
  const isError = type === 'error';
  return (
    <div {...stylex.props(styles.appPage)}>
      <Layout
        height="fill"
        header={<InkMailTopNav mode={mode} />}
        start={
          <LayoutPanel hasDivider padding={0} width={260}>
            <InkMailSideNav mode={mode} />
          </LayoutPanel>
        }
        content={
          <LayoutContent padding={6}>
            <Stack direction="vertical" gap={4}>
              <div {...stylex.props(styles.inboxHeader)}>
                <Heading level={2}>Inbox</Heading>
                <div {...stylex.props(styles.inboxActions)}>
                  <Button
                    label="Archive"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsToastShown(true)}
                  />
                  <Button label="Mark all read" variant="secondary" size="sm" />
                </div>
              </div>
              {/* Last child of the padded content: the rows bleed to its
                  edges, the way Table is built to sit in a frame. */}
              <Table
                data={inboxRows}
                columns={inboxColumns}
                idKey="id"
                hasHover
              />
            </Stack>
          </LayoutContent>
        }
      />
      {isToastShown && (
        <div {...stylex.props(styles.appPageToast)}>
          <Toast
            type={type}
            body={
              isError
                ? 'Could not archive the conversation.'
                : 'Conversation archived.'
            }
            endContent={
              <Button
                label={isError ? 'Retry' : 'Undo'}
                variant="secondary"
                size="sm"
              />
            }
            isAutoHide={false}
            autoHideDuration={5000}
            onDismiss={() => setIsToastShown(false)}
          />
        </div>
      )}
    </div>
  );
}

interface ThemedToastActionArgs {
  hasThemeModeRule: boolean;
  type: ToastType;
}

/**
 * The same inbox under each app mode, with the brand's ink toast in its
 * corner. The secondary buttons on the page differ by mode, the brand's
 * choice; the Undo in the toast follows them, and only `themeMode` lets it.
 */
export const ThemedToastAction: StoryObj<ThemedToastActionArgs> = {
  args: {hasThemeModeRule: true, type: 'info'},
  argTypes: {
    hasThemeModeRule: {
      name: 'themeMode rule',
      control: 'boolean',
      description:
        "Keep the theme's toast['themeMode:*'] rules. Off, the Button rule's light-dark() fallback is all the action has, and inside the card that only ever resolves to the dark side.",
    },
    type: {
      control: 'radio',
      options: ['info', 'error'],
      description:
        'The error surface resolves to the dark side on both pages under every shipped theme; the same rule applies to it.',
    },
  },
  render: function ThemedToastActionStory({hasThemeModeRule, type}) {
    const theme = hasThemeModeRule ? inkMailTheme : inkMailLightDarkOnlyTheme;
    return (
      <div {...stylex.props(styles.appPages)}>
        {(['light', 'dark'] as const).map(mode => (
          <div key={mode} {...stylex.props(styles.appPageSlot)}>
            <Text type="label">
              {mode === 'light' ? 'Light app' : 'Dark app'}
            </Text>
            <Theme theme={theme} mode={mode}>
              <InkMailPage mode={mode} type={type} />
            </Theme>
          </div>
        ))}
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "The same inbox under each app mode, with the brand's ink toast in " +
          'its corner. The secondary buttons on the page are a soft fill on ' +
          "the light page and a hairline outline on the dark one, the brand's " +
          'choice: a fill on a dark page is a third tonal layer on page and ' +
          'card. The Undo in the toast follows them, and it can only do so ' +
          'through `themeMode`, because the card is ink on both pages and ' +
          '`light-dark()` inside it always resolves to the dark side. Turn ' +
          'the **themeMode rule** control off: the Undo on the light page ' +
          "falls back to the outline, the dark page's clothes on a light " +
          'page, while nothing else on either page changes. Switch the type ' +
          "to `error` for the same rule on Core's error surface, which " +
          'resolves to the dark side on both pages under every shipped theme.',
      },
    },
  },
};

/**
 * An app names its colour mode once, at its root `Theme`. A nested `Theme`
 * defaults to `mode="system"`, which follows the OS rather than the mode the
 * toolbar picked — and Toast reads that mode to choose its inverted-surface
 * tokens, so an unthreaded nested theme renders dark text on a dark card.
 */
function BrandToastScope({children}: {children: ReactNode}) {
  const {mode} = useTheme();
  return (
    <Theme theme={brandToastTheme} mode={mode}>
      {children}
    </Theme>
  );
}

function ToastSpecimens({label}: {label: string}) {
  return (
    <Stack direction="vertical" gap={2}>
      <Heading level={4}>{label}</Heading>
      <Toast
        type="info"
        body="Your changes have been saved."
        isAutoHide={false}
        autoHideDuration={5000}
        onDismiss={noop}
      />
      <Toast
        type="error"
        body="Could not reach the server."
        isAutoHide={false}
        autoHideDuration={5000}
        onDismiss={noop}
      />
    </Stack>
  );
}

function ThemedToastTriggers() {
  const toast = useToast();
  return (
    <Stack direction="horizontal" gap={2}>
      <Button
        label="Themed info toast"
        onClick={() => toast({body: 'Your changes have been saved.'})}
      />
      <Button
        label="Themed error toast"
        variant="destructive"
        onClick={() =>
          toast({body: 'Could not reach the server.', type: 'error'})
        }
      />
    </Stack>
  );
}

function noop() {}

// =============================================================================
// Custom content (renderContent)
// =============================================================================

const customContentStyles = stylex.create({
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacingVars['--spacing-3'],
    width: '100%',
  },
  stripe: {
    alignSelf: 'stretch',
    width: 4,
    borderRadius: radiusVars['--radius-full'],
    flexShrink: 0,
  },
  stripeInfo: {backgroundColor: colorVars['--color-accent']},
  stripeError: {backgroundColor: colorVars['--color-text-red']},
  text: {flex: 1, minWidth: 0},
});

function ProductToastContent({
  type,
  body,
  endContent,
  dismiss,
}: ToastContentRenderProps) {
  return (
    <div {...stylex.props(customContentStyles.row)}>
      <div
        {...stylex.props(
          customContentStyles.stripe,
          type === 'error'
            ? customContentStyles.stripeError
            : customContentStyles.stripeInfo,
        )}
      />
      <div {...stylex.props(customContentStyles.text)}>{body}</div>
      {endContent}
      <Button
        label="Dismiss custom toast"
        variant="ghost"
        size="sm"
        onClick={dismiss}
      />
    </div>
  );
}

function ContentWithoutDismiss({type, body}: ToastContentRenderProps) {
  return (
    <div {...stylex.props(customContentStyles.row)}>
      <div
        {...stylex.props(
          customContentStyles.stripe,
          type === 'error'
            ? customContentStyles.stripeError
            : customContentStyles.stripeInfo,
        )}
      />
      <div {...stylex.props(customContentStyles.text)}>{body}</div>
    </div>
  );
}

const renderProductContent = (toast: ToastContentRenderProps) => (
  <ProductToastContent {...toast} />
);

export const CustomContent: StoryObj = {
  name: 'Custom content (renderContent)',
  render: function CustomContentStory() {
    const toast = useToast();
    return (
      <Stack direction="horizontal" gap={2} wrap="wrap">
        <Button
          label="Show"
          onClick={() => {
            toast({
              body: 'Your changes have been saved.',
              renderContent: renderProductContent,
            });
          }}
        />
        <Button
          label="With an action"
          variant="secondary"
          onClick={() => {
            toast({
              body: 'Row deleted.',
              endContent: <Button variant="ghost" size="sm" label="Undo" />,
              renderContent: renderProductContent,
            });
          }}
        />
        <Button
          label="Error"
          variant="destructive"
          onClick={() => {
            toast({
              body: 'Could not reach the server.',
              type: 'error',
              renderContent: renderProductContent,
            });
          }}
        />
        <Button
          label="Layout without a close"
          variant="ghost"
          onClick={() => {
            toast({
              body: 'This layout relies on auto-hide.',
              renderContent: toastProps => (
                <ContentWithoutDismiss {...toastProps} />
              ),
            });
          }}
        />
        <Button
          label="Without renderContent"
          variant="ghost"
          onClick={() => {
            toast({body: 'A toast from code that knows nothing about it.'});
          }}
        />
      </Stack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "`renderContent` replaces the content of one toast's card and receives a `dismiss` callback. The custom layout composes its own Astryx `Button`; a layout without a close is left as-is and can rely on auto-hide. The last button omits `renderContent`, showing the ordinary Astryx layout and dismiss control.",
      },
    },
  },
};

// =============================================================================
// Logical placement
// =============================================================================

/**
 * The viewport is rendered IN THE STORY TREE, not through the provider-less
 * fallback the other stories use, and `isTopLayer` keeps its default.
 *
 * Both details are load-bearing for the RTL audit:
 *
 * - the fallback container is appended to `<body>`, outside the decorator that
 *   sets `dir`, so a toast raised there can never flip and reads as a false
 *   not-RTL;
 * - `isTopLayer={false}` drops the `popover` attribute, and with it the UA
 *   `width: fit-content` this placement has to survive — a story without the
 *   popover would pass whether or not the viewport can span the inline axis.
 */
export const LogicalPlacement: StoryObj = {
  name: 'Logical placement follows direction',
  render: function LogicalPlacementStory() {
    return (
      <ToastViewport position="bottomEnd" maxVisible={1}>
        <LogicalPlacementTrigger />
      </ToastViewport>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          '`bottomEnd` is a logical placement: the toast sits on the inline END edge, which is the right in LTR and the left in RTL. The viewport spans the inline axis and aligns the card within itself, so the card follows the document direction with no per-direction styling.',
      },
    },
  },
};

function LogicalPlacementTrigger() {
  const toast = useToast();
  return (
    <Button
      label="Show toast"
      onClick={() => toast({body: 'Placement follows the document direction.'})}
    />
  );
}
