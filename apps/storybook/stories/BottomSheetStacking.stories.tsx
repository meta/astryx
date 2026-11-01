// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file BottomSheetStacking.stories.tsx
 * @input Uses BottomSheet, each with its own open
 *   state, at phone width
 * @output Storybook scenarios for stacked bottom sheets: a drill-in with Back
 *   and Close all, a deep link at depth 3, a step flow (standalone steps that
 *   replace each other) at the base with a Help sheet, a step flow on top
 *   (edit → saved), a row-owned detail sheet nested in the
 *   list sheet's content, sheets opened out of tree order, a Dialog over a
 *   sheet and a sheet over that Dialog, and a file browser of unknown depth
 * @position Core story; stacked bottom sheets (no new component: stacking is
 *   BottomSheet behaviour)
 */
import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {Dialog} from '@astryxdesign/core/Dialog';
import {useToast} from '@astryxdesign/core/Toast';
import {useAnnounce} from '@astryxdesign/core/hooks';
import {Divider} from '@astryxdesign/core/Divider';
import {Heading} from '@astryxdesign/core/Heading';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Section} from '@astryxdesign/core/Section';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';

const meta: Meta<typeof BottomSheet> = {
  title: 'Core/BottomSheetStacking',
  component: BottomSheet,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    viewport: {defaultViewport: 'mobile1'},
    docs: {
      story: {inline: false, height: '560px'},
    },
  },
  decorators: [
    Story => (
      <div style={{minHeight: 480, padding: 16}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof BottomSheet>;

// ---------------------------------------------------------------------------
// Orders: list → order → edit, sibling sheets, with Back and Close all
// ---------------------------------------------------------------------------

const ORDERS = [
  {id: '1042', title: 'Trail runners', status: 'Shipped'},
  {id: '1043', title: 'Rain shell', status: 'Processing'},
  {id: '1044', title: 'Wool socks ×3', status: 'Delivered'},
];

/**
 * A control that announces from where it sits: inside a stacked sheet, the
 * words follow the sheet's dialog (useAnnounce's modal route) — the top
 * sheet hears its own, and a covered sheet's words reach the exposed one.
 */
function AnnounceButton({label, message}: {label: string; message: string}) {
  const announce = useAnnounce();
  return (
    <Button
      label={label}
      variant="ghost"
      size="sm"
      onClick={() => announce(message)}
    />
  );
}

function OrdersFlow({deepLink = false}: {deepLink?: boolean}) {
  const [isListOpen, setIsListOpen] = useState(deepLink);
  const [orderId, setOrderId] = useState<string | null>(
    deepLink ? ORDERS[0].id : null,
  );
  const [isEditing, setIsEditing] = useState(deepLink);
  const [note, setNote] = useState('Leave at the side door');
  const order = ORDERS.find(entry => entry.id === orderId) ?? null;

  const closeAll = () => {
    setIsListOpen(false);
    setOrderId(null);
    setIsEditing(false);
  };

  return (
    <VStack gap={3}>
      <Heading level={2}>Orders</Heading>
      <Text type="supporting" color="secondary">
        A drill-in: the list opens an order, the order opens an editor. Three
        sibling sheets, each with its own state; a sheet opened over another
        stacks on top of it. Back pops one; Close all closes every sheet in one
        update.
      </Text>
      <Button
        label={deepLink ? 'Open order 1042 editor' : 'Open orders'}
        onClick={() => {
          setIsListOpen(true);
          if (deepLink) {
            setOrderId(ORDERS[0].id);
            setIsEditing(true);
          }
        }}
      />
      <BottomSheet
        isOpen={isListOpen}
        onOpenChange={setIsListOpen}
        label="Orders"
        height="hug"
        data-testid="orders-list">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Your orders</Heading>
            <Divider />
            {ORDERS.map(entry => (
              <HStack key={entry.id} gap={2} vAlign="center">
                <VStack gap={0.5}>
                  <Text type="label">#{entry.id}</Text>
                  <Text type="supporting" color="secondary">
                    {entry.title} · {entry.status}
                  </Text>
                </VStack>
                <Button
                  label="View"
                  variant="secondary"
                  size="sm"
                  onClick={() => setOrderId(entry.id)}
                />
              </HStack>
            ))}
            <HStack gap={2} hAlign="end">
              <AnnounceButton
                label="Announce from Orders"
                message="Orders refreshed"
              />
              <Button label="Close all" variant="ghost" onClick={closeAll} />
              <Button
                label="Done"
                variant="secondary"
                onClick={() => setIsListOpen(false)}
              />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet
        isOpen={order != null}
        onOpenChange={open => {
          if (!open) {
            setOrderId(null);
          }
        }}
        label={order == null ? 'Order' : `Order ${order.id}`}
        height="hug"
        data-testid="orders-detail">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Order #{order?.id ?? ''}</Heading>
            <Text type="supporting" color="secondary">
              {order?.title} · {order?.status}
            </Text>
            <Divider />
            <Text type="body">Delivery note: {note}</Text>
            <HStack gap={2} hAlign="end">
              <AnnounceButton
                label="Announce from order"
                message="Order details loaded"
              />
              <Button label="Close all" variant="ghost" onClick={closeAll} />
              <Button
                label="Back"
                variant="secondary"
                onClick={() => setOrderId(null)}
              />
              <Button label="Edit note" onClick={() => setIsEditing(true)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet
        isOpen={isEditing}
        onOpenChange={setIsEditing}
        label="Edit delivery note"
        height="hug"
        purpose="form"
        data-testid="orders-edit">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Edit delivery note</Heading>
            <TextInput
              label="Delivery note"
              value={note}
              onChange={setNote}
              hasAutoFocus
            />
            <HStack gap={2} hAlign="end">
              <Button label="Close all" variant="ghost" onClick={closeAll} />
              <Button
                label="Back"
                variant="secondary"
                onClick={() => setIsEditing(false)}
              />
              <Button label="Save" onClick={() => setIsEditing(false)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
    </VStack>
  );
}

export const OrdersDrillIn: Story = {
  name: 'Orders drill-in (siblings, Back, Close all)',
  render: () => <OrdersFlow />,
};

export const DeepLinkDepthThree: Story = {
  name: 'Deep link at depth 3',
  render: () => <OrdersFlow deepLink />,
};

// ---------------------------------------------------------------------------
// Filters: a step flow at the base (categories → options) with Help on top
// ---------------------------------------------------------------------------

function FiltersFlow() {
  const [step, setStep] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [category, setCategory] = useState('shoes');
  const [sort, setSort] = useState('newest');

  return (
    <VStack gap={3}>
      <Heading level={2}>Filters</Heading>
      <Text type="supporting" color="secondary">
        The base is a two-step flow: one state value names the open step, and
        Next and Back replace one step with the other in place. Help is a
        standalone sheet that opens over either step; the step recedes.
      </Text>
      <Button label="Open filters" onClick={() => setStep('categories')} />
      <BottomSheet
        isOpen={step === 'categories'}
        onOpenChange={isOpen =>
          !isOpen && setStep(c => (c === 'categories' ? null : c))
        }
        label="Categories"
        height="hug"
        data-testid="filters-categories">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Category</Heading>
            <RadioList
              label="Category"
              isLabelHidden
              value={category}
              onChange={setCategory}>
              <RadioListItem label="Shoes" value="shoes" />
              <RadioListItem label="Jackets" value="jackets" />
              <RadioListItem label="Accessories" value="accessories" />
            </RadioList>
            <HStack gap={2} hAlign="end">
              <Button
                label="Help"
                variant="ghost"
                onClick={() => setIsHelpOpen(true)}
              />
              <Button label="Next" onClick={() => setStep('options')} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet
        isOpen={step === 'options'}
        onOpenChange={isOpen =>
          !isOpen && setStep(c => (c === 'options' ? null : c))
        }
        label="Options"
        height="hug"
        data-testid="filters-options">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Sort</Heading>
            <RadioList
              label="Sort"
              isLabelHidden
              value={sort}
              onChange={setSort}>
              <RadioListItem label="Newest" value="newest" />
              <RadioListItem label="Price: low to high" value="price" />
              <RadioListItem label="Top rated" value="rating" />
            </RadioList>
            <HStack gap={2} hAlign="end">
              <Button
                label="Help"
                variant="ghost"
                onClick={() => setIsHelpOpen(true)}
              />
              <Button
                label="Back"
                variant="secondary"
                onClick={() => setStep('categories')}
              />
              <Button label="Apply" onClick={() => setStep(null)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet
        isOpen={isHelpOpen}
        onOpenChange={setIsHelpOpen}
        label="Help"
        height="hug"
        data-testid="filters-help">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>About filters</Heading>
            <Text type="body">
              Pick a category first, then how to sort the results. Your choices
              are kept until you apply or close the filters.
            </Text>
            <HStack gap={2} hAlign="end">
              <Button label="Got it" onClick={() => setIsHelpOpen(false)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
    </VStack>
  );
}

export const FiltersSwitcherBase: Story = {
  name: 'Step flow at the base with a Help sheet',
  render: () => <FiltersFlow />,
};

// ---------------------------------------------------------------------------
// Contacts: a list with a two-step flow on top (edit → saved)
// ---------------------------------------------------------------------------

const CONTACTS = ['Ada Lovelace', 'Grace Hopper', 'Katherine Johnson'];

function ContactsFlow() {
  const [isListOpen, setIsListOpen] = useState(false);
  const [editStep, setEditStep] = useState<string | null>(null);
  const [contactIndex, setContactIndex] = useState(0);
  const [names, setNames] = useState(CONTACTS);
  const [draft, setDraft] = useState('');

  const startEdit = (index: number) => {
    setContactIndex(index);
    setDraft(names[index]);
    setEditStep('edit');
  };
  const save = () => {
    setNames(current =>
      current.map((name, index) => (index === contactIndex ? draft : name)),
    );
    setEditStep('saved');
  };

  return (
    <VStack gap={3}>
      <Heading level={2}>Contacts</Heading>
      <Text type="supporting" color="secondary">
        The top level is a two-step flow of standalone sheets: Save replaces the
        editor with a confirmation in place (one level up the stack; the list
        beneath stays covered), and Back returns to the list.
      </Text>
      <Button label="Open contacts" onClick={() => setIsListOpen(true)} />
      <BottomSheet
        isOpen={isListOpen}
        onOpenChange={setIsListOpen}
        label="Contacts"
        height="hug"
        data-testid="contacts-list">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Contacts</Heading>
            <Divider />
            {names.map((name, index) => (
              <HStack key={CONTACTS[index]} gap={2} vAlign="center">
                <Text type="body">{name}</Text>
                <Button
                  label="Edit"
                  variant="secondary"
                  size="sm"
                  onClick={() => startEdit(index)}
                />
              </HStack>
            ))}
            <HStack gap={2} hAlign="end">
              <Button
                label="Done"
                variant="secondary"
                onClick={() => setIsListOpen(false)}
              />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet
        isOpen={editStep === 'edit'}
        onOpenChange={isOpen =>
          !isOpen && setEditStep(c => (c === 'edit' ? null : c))
        }
        label="Edit contact"
        height="hug"
        purpose="form"
        data-testid="contacts-edit">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Edit contact</Heading>
            <TextInput
              label="Name"
              value={draft}
              onChange={setDraft}
              hasAutoFocus
            />
            <HStack gap={2} hAlign="end">
              <Button
                label="Cancel"
                variant="secondary"
                onClick={() => setEditStep(null)}
              />
              <Button label="Save" onClick={save} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet
        isOpen={editStep === 'saved'}
        onOpenChange={isOpen =>
          !isOpen && setEditStep(c => (c === 'saved' ? null : c))
        }
        label="Saved"
        height="hug"
        data-testid="contacts-saved">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Saved</Heading>
            <Text type="body">{draft} was updated.</Text>
            <HStack gap={2} hAlign="end">
              <Button label="Back" onClick={() => setEditStep(null)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
    </VStack>
  );
}

export const ContactsSwitcherTop: Story = {
  name: 'Step flow on top (edit → saved)',
  render: () => <ContactsFlow />,
};

// ---------------------------------------------------------------------------
// Places: each row owns its detail sheet, rendered in the list's content
// ---------------------------------------------------------------------------

const PLACES = [
  {id: 'lisbon', name: 'Lisbon', note: 'Tram 28 at dawn'},
  {id: 'kyoto', name: 'Kyoto', note: 'Philosopher’s Path'},
  {id: 'oaxaca', name: 'Oaxaca', note: 'Mercado 20 de Noviembre'},
];

/** Each row owns its detail sheet: nested in the list sheet's content. */
function PlaceRow({place}: {place: (typeof PLACES)[number]}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <HStack gap={2} vAlign="center">
        <Text type="label">{place.name}</Text>
        <Button
          label="Details"
          variant="secondary"
          size="sm"
          onClick={() => setIsOpen(true)}
        />
      </HStack>
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label={place.name}
        height="hug"
        data-testid={`place-${place.id}`}>
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>{place.name}</Heading>
            <Text type="supporting" color="secondary">
              {place.note}
            </Text>
            <HStack gap={2} hAlign="end">
              <Button label="Done" onClick={() => setIsOpen(false)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
    </>
  );
}

function PlacesFlow() {
  const [isListOpen, setIsListOpen] = useState(false);
  return (
    <VStack gap={3}>
      <Heading level={2}>Places</Heading>
      <Text type="supporting" color="secondary">
        Each row renders its own detail sheet right next to the row, inside the
        list sheet's content. It stacks above the list, leaves with it when the
        list is closed from code, and comes back with it while still open.
      </Text>
      <Button label="Open places" onClick={() => setIsListOpen(true)} />
      <BottomSheet
        isOpen={isListOpen}
        onOpenChange={setIsListOpen}
        label="Places"
        height="hug"
        data-testid="places-list">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Places</Heading>
            <Divider />
            {PLACES.map(place => (
              <PlaceRow key={place.id} place={place} />
            ))}
            <HStack gap={2} hAlign="end">
              <Button
                label="Done"
                variant="secondary"
                onClick={() => setIsListOpen(false)}
              />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
    </VStack>
  );
}

export const RowOwnedDetail: Story = {
  name: 'Row-owned detail sheet (nested in content)',
  render: () => <PlacesFlow />,
};

// ---------------------------------------------------------------------------
// Out of tree order: the sheet written second is opened first
// ---------------------------------------------------------------------------

function OutOfTreeOrderFlow() {
  const [isShippingOpen, setIsShippingOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  return (
    <VStack gap={3}>
      <Heading level={2}>Checkout</Heading>
      <Text type="supporting" color="secondary">
        Shipping is written first in the markup, Payment second. Open Payment
        first and then Shipping from inside it: Shipping ends up on top. Order
        is open order, not the order the sheets are written in.
      </Text>
      <Button label="Open payment" onClick={() => setIsPaymentOpen(true)} />
      <BottomSheet
        isOpen={isShippingOpen}
        onOpenChange={setIsShippingOpen}
        label="Shipping"
        height="hug"
        data-testid="shipping">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Shipping</Heading>
            <Text type="body">
              Written first, opened second: this sheet is on top.
            </Text>
            <HStack gap={2} hAlign="end">
              <Button label="Done" onClick={() => setIsShippingOpen(false)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet
        isOpen={isPaymentOpen}
        onOpenChange={setIsPaymentOpen}
        label="Payment"
        height="hug"
        data-testid="payment">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Payment</Heading>
            <Text type="body">
              Written second, opened first: this sheet recedes when Shipping
              opens over it.
            </Text>
            <HStack gap={2} hAlign="end">
              <Button
                label="Done"
                variant="secondary"
                onClick={() => setIsPaymentOpen(false)}
              />
              <Button
                label="Change shipping"
                onClick={() => setIsShippingOpen(true)}
              />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
    </VStack>
  );
}

export const OutOfTreeOrder: Story = {
  name: 'Opening out of tree order (open order wins)',
  render: () => <OutOfTreeOrderFlow />,
};

// ---------------------------------------------------------------------------
// Dialog interop: a Dialog over a sheet, then a sheet over the Dialog
// ---------------------------------------------------------------------------

function DialogInteropFlow() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const toast = useToast();
  return (
    <VStack gap={3}>
      <Heading level={2}>Photo</Heading>
      <Text type="supporting" color="secondary">
        Remove opens a Core Dialog over the sheet: the sheet does not recede,
        because only sheets count. Why? opens a sheet from inside the Dialog: it
        paints above the Dialog, and the first sheet recedes beneath both.
      </Text>
      <Button label="Open photo" onClick={() => setIsSheetOpen(true)} />
      <BottomSheet
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        label="Photo"
        height="hug"
        data-testid="photo">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Alps, 2025</Heading>
            <Text type="supporting" color="secondary">
              Taken on the way up to the hut.
            </Text>
            <HStack gap={2} hAlign="end">
              <Button
                label="Remove"
                variant="secondary"
                onClick={() => setIsConfirmOpen(true)}
              />
              <Button label="Done" onClick={() => setIsSheetOpen(false)} />
            </HStack>
          </VStack>
        </Section>
        <Dialog
          isOpen={isConfirmOpen}
          onOpenChange={setIsConfirmOpen}
          aria-label="Remove photo?"
          data-testid="confirm-dialog">
          <VStack gap={3}>
            <Heading level={3}>Remove this photo?</Heading>
            <HStack gap={2} hAlign="end">
              <Button
                label="Toast from dialog"
                variant="ghost"
                onClick={() =>
                  toast({body: 'Toast from the dialog', isAutoHide: false})
                }
              />
              <Button
                label="Why?"
                variant="secondary"
                onClick={() => setIsNoteOpen(true)}
              />
              <Button label="Keep" onClick={() => setIsConfirmOpen(false)} />
            </HStack>
          </VStack>
          <BottomSheet
            isOpen={isNoteOpen}
            onOpenChange={setIsNoteOpen}
            label="About removing"
            height="hug"
            data-testid="dialog-sheet">
            <Section padding={4}>
              <VStack gap={2}>
                <Text type="body">
                  Removing a photo only hides it from this album.
                </Text>
                <HStack gap={2} hAlign="end">
                  <Button label="Got it" onClick={() => setIsNoteOpen(false)} />
                </HStack>
              </VStack>
            </Section>
          </BottomSheet>
        </Dialog>
      </BottomSheet>
    </VStack>
  );
}

// A no-scrim sheet opened from a modal sheet and rendered outside it
// ---------------------------------------------------------------------------

/**
 * A modal sheet opens a `hasScrim={false}` sheet that lives outside it in
 * the tree. The modal keeps the page — and the no-scrim sheet — inert, so the
 * no-scrim sheet stays beneath the modal instead of painting above it with
 * nothing to press. Rendered inside the modal's content it would enter the
 * top layer as usual.
 */
function NonModalOutsideModalFlow() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHintOpen, setIsHintOpen] = useState(false);
  return (
    <VStack gap={3}>
      <Heading level={2}>Hints</Heading>
      <Text type="supporting" color="secondary">
        Open settings, then Show hint: the hint sheet is declared outside the
        modal sheet, so it stays beneath it while the modal is open and enters
        the top layer — above the page&apos;s fixed tab bar — once the modal
        closes. Swap to hint, inside settings, closes settings and opens the
        hint in one update.
      </Text>
      <Button label="Open settings" onClick={() => setIsModalOpen(true)} />
      <nav
        aria-label="Tabs"
        style={{
          position: 'fixed',
          insetInlineStart: 0,
          insetInlineEnd: 0,
          bottom: 0,
          zIndex: 10,
          padding: 12,
          background: 'var(--color-background-secondary, #eee)',
          display: 'flex',
          justifyContent: 'space-around',
        }}>
        <button type="button">Home</button>
        <button type="button">Search</button>
        <button type="button">Profile</button>
      </nav>
      <BottomSheet
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        label="Settings"
        height="hug">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Settings</Heading>
            <HStack gap={2} hAlign="end">
              <Button
                label="Show hint"
                variant="secondary"
                onClick={() => setIsHintOpen(true)}
              />
              <Button
                label="Swap to hint"
                variant="secondary"
                onClick={() => {
                  setIsModalOpen(false);
                  setIsHintOpen(true);
                }}
              />
              <Button label="Done" onClick={() => setIsModalOpen(false)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet
        isOpen={isHintOpen}
        onOpenChange={setIsHintOpen}
        hasScrim={false}
        label="Hint"
        height="hug">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Hint</Heading>
            <HStack gap={2} hAlign="end">
              <Button label="Got it" onClick={() => setIsHintOpen(false)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
    </VStack>
  );
}

export const NonModalOutsideModal: Story = {
  name: 'A no-scrim sheet opened from a modal sheet, declared outside it',
  render: () => <NonModalOutsideModalFlow />,
};

export const DialogInterop: Story = {
  name: 'Dialog over a sheet, sheet over the Dialog',
  render: () => <DialogInteropFlow />,
};
/**
 * A `hasScrim={false}` sheet opened while a Dialog is open stays beneath it.
 * Here the Dialog is conditionally rendered and is *unmounted* while still
 * open — no `close` event fires — and the sheet must still enter the top
 * layer, above the fixed tab bar, the moment the Dialog is gone.
 */
function NonModalUnderUnmountingDialogFlow() {
  const [isEditing, setIsEditing] = useState(false);
  const [isHintOpen, setIsHintOpen] = useState(false);
  return (
    <VStack gap={3}>
      <Heading level={2}>Editor</Heading>
      <Text type="supporting" color="secondary">
        Edit opens a Dialog. Inside it, Show hint opens a no-scrim sheet that is
        declared outside the Dialog, so it stays beneath it; Discard removes the
        open Dialog from the page without closing it. The hint then rises above
        the tab bar on its own.
      </Text>
      <Button label="Edit" onClick={() => setIsEditing(true)} />
      <nav
        aria-label="Tabs"
        style={{
          position: 'fixed',
          insetInlineStart: 0,
          insetInlineEnd: 0,
          bottom: 0,
          zIndex: 10,
          padding: 12,
          background: 'var(--color-background-secondary, #eee)',
          display: 'flex',
          justifyContent: 'space-around',
        }}>
        <button type="button">Home</button>
        <button type="button">Search</button>
        <button type="button">Profile</button>
      </nav>
      {isEditing && (
        <Dialog isOpen onOpenChange={() => {}} aria-label="Edit caption">
          <Section padding={4}>
            <VStack gap={3}>
              <Text>The caption editor.</Text>
              <HStack gap={2}>
                <Button
                  label="Show hint"
                  variant="secondary"
                  onClick={() => setIsHintOpen(true)}
                />
                <Button
                  label="Discard"
                  variant="secondary"
                  onClick={() => setIsEditing(false)}
                />
              </HStack>
              <Button label="Save" onClick={() => setIsEditing(false)} />
            </VStack>
          </Section>
        </Dialog>
      )}
      <BottomSheet
        isOpen={isHintOpen}
        onOpenChange={setIsHintOpen}
        hasScrim={false}
        label="Hint"
        height="hug">
        <Section padding={4}>
          <VStack gap={3}>
            <Text>Captions under 125 characters read best.</Text>
            <Button label="Got it" onClick={() => setIsHintOpen(false)} />
          </VStack>
        </Section>
      </BottomSheet>
    </VStack>
  );
}

export const NonModalUnderUnmountingDialog: Story = {
  name: 'A no-scrim sheet beneath a Dialog that unmounts while open',
  render: () => <NonModalUnderUnmountingDialogFlow />,
};

// ---------------------------------------------------------------------------
// File browser: mapped sheets of unknown depth
// ---------------------------------------------------------------------------

interface Folder {
  name: string;
  children: Folder[];
}

const ROOT: Folder = {
  name: 'Home',
  children: [
    {
      name: 'Photos',
      children: [
        {name: 'Trips', children: [{name: 'Alps', children: []}]},
        {name: 'Family', children: []},
      ],
    },
    {
      name: 'Documents',
      children: [{name: 'Taxes', children: [{name: '2025', children: []}]}],
    },
    {name: 'Music', children: []},
  ],
};

function FileBrowserFlow() {
  // `path` is the history of visited folders; `openDepth` says how many of
  // them are open. Closed entries stay mounted until their exit finishes and
  // are replaced the next time a folder opens at that depth.
  const [path, setPath] = useState<Folder[]>([ROOT]);
  const [openDepth, setOpenDepth] = useState(0);

  const openChild = (level: number, child: Folder) => {
    setPath([...path.slice(0, level + 1), child]);
    setOpenDepth(level + 2);
  };

  return (
    <VStack gap={3}>
      <Heading level={2}>Files</Heading>
      <Text type="supporting" color="secondary">
        One mapped BottomSheet per visited folder; the depth is whatever the
        person browses to. Sheets deeper than two steps back share the second
        recede step.
      </Text>
      <Button label="Browse files" onClick={() => setOpenDepth(1)} />
      {path.map((folder, level) => (
        <BottomSheet
          key={`${level}:${folder.name}`}
          isOpen={level < openDepth}
          onOpenChange={open => {
            if (!open) {
              setOpenDepth(level);
            }
          }}
          label={folder.name}
          height="hug"
          data-testid={`folder-${level}`}>
          <Section padding={4}>
            <VStack gap={3}>
              <Heading level={3}>{folder.name}</Heading>
              <Text type="supporting" color="secondary">
                {path
                  .slice(0, level + 1)
                  .map(entry => entry.name)
                  .join(' / ')}
              </Text>
              <Divider />
              {folder.children.length === 0 ? (
                <Text type="body">This folder is empty.</Text>
              ) : (
                folder.children.map(child => (
                  <HStack key={child.name} gap={2} vAlign="center">
                    <Text type="body">{child.name}</Text>
                    <Button
                      label="Open"
                      variant="secondary"
                      size="sm"
                      onClick={() => openChild(level, child)}
                    />
                  </HStack>
                ))
              )}
              <HStack gap={2} hAlign="end">
                <Button
                  label="Close all"
                  variant="ghost"
                  onClick={() => setOpenDepth(0)}
                />
                <Button
                  label={level === 0 ? 'Done' : 'Back'}
                  variant="secondary"
                  onClick={() => setOpenDepth(level)}
                />
              </HStack>
            </VStack>
          </Section>
        </BottomSheet>
      ))}
    </VStack>
  );
}

export const FileBrowserUnknownDepth: Story = {
  name: 'File browser (unknown depth)',
  render: () => <FileBrowserFlow />,
};
