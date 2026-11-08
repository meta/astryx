// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * A stepped checkout in two columns, capped at 1000px: the form column carries
 * the Stepper, the current step and the actions; the order summary sits beside
 * it as a sticky Card so the total is visible at every step.
 *
 * This is the wizard shape for flows where a running consequence has to stay on
 * screen. Choosing express shipping on step 2 changes the total, and the total
 * is what the person is actually deciding about — hiding it behind a Review
 * step means they discover the cost after they have committed to the effort.
 * The same argument applies to any flow with a live cost, quota, or capacity
 * readout.
 *
 * It is worth contrasting with the single-page `payment-form` template. Both
 * collect the same information. A single page is faster for a returning
 * customer with saved details; the stepped version wins when the form is long
 * enough that a single page reads as a wall, or when later steps depend on
 * earlier ones — here, delivery options are priced per address, so shipping has
 * to come before delivery.
 *
 * ## Extending this template
 *
 * **Progress is scoped to the column it describes.** The Stepper sits at the
 * top of the form column rather than in the Layout header. A header stepper
 * spans the summary too, which reads as a claim that the summary is one of the
 * things being stepped through, and it puts the "where am I" marker further
 * from the fields than the fields are from each other. Hoist it only if a
 * second column is also sequenced.
 *
 * **The actions end the form rather than pinning a page-wide bar.** Continue
 * advances the column above it, so it closes that column instead of stretching
 * across the summary in a footer. Back and Continue share one row: Back hugs
 * its label, Continue takes the rest, so the forward path is several times the
 * target without either button being a different size from the other.
 *
 * **Nothing on this page overrides a control size.** Buttons and fields all sit
 * at the default, which is what keeps the promo field level with Apply and the
 * quantity stepper level with Remove. Emphasis is carried by width and variant
 * instead — cheaper to keep true than a size scale applied by hand, and a rule
 * you can check: grep for `size=` and only Icons come back.
 *
 * **The summary is derived, never advanced.** Every figure in it reads the same
 * state the form writes, so it updates as the user types rather than on step
 * change. Do not snapshot the total into state on Next.
 *
 * **Below the two-column breakpoint the summary renders first.** A 360px
 * column beside the form would leave neither usable in a narrow host, so the
 * summary becomes a collapsed card before the stepper in both DOM and visual
 * order. The breakpoint follows the width this template actually receives,
 * not the viewport around an embedded preview or application shell.
 *
 * **Payment fields are placeholders, not an integration.** A real checkout
 * mounts a PCI-compliant iframe from the payment provider here; a raw card
 * number input would put your page in scope for PCI DSS. Pay validates these
 * placeholders and records a local completion state so the example has a
 * complete outcome without claiming that a payment was sent.
 *
 * **Keep the step count at four or fewer.** Cart, address, delivery, payment is
 * already the ceiling for how much friction a checkout can carry. Anything else
 * — gift options, promo codes, account creation — belongs inside an existing
 * step as progressive disclosure, not as a fifth step.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {Divider} from '@astryxdesign/core/Divider';
import {FieldStatus} from '@astryxdesign/core/FieldStatus';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {Icon} from '@astryxdesign/core/Icon';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Selector} from '@astryxdesign/core/Selector';
import {HStack, Stack, StackItem, VStack} from '@astryxdesign/core/Stack';
import {Step, Stepper} from '@astryxdesign/core/Stepper';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Thumbnail} from '@astryxdesign/core/Thumbnail';
import {
  CreditCardIcon,
  LockClosedIcon,
  MapPinIcon,
  ShoppingCartIcon,
  TruckIcon,
} from '@heroicons/react/24/outline';

// ── Data ──────────────────────────────────────────────────────────────────────

// Each step carries its own indicator glyph. Icons replace the default
// number-then-check pair, which means completion is no longer spelled out in
// the badge — the filled track and the completed tint carry it instead, and the
// icon stays constant so a step is recognisable before and after it is done.
// The one thing that does displace it is an error, which is louder than
// identity: a blocked step shows the error glyph until it is fixed.
const STEPS = [
  {label: 'Cart', icon: ShoppingCartIcon},
  {label: 'Shipping', icon: MapPinIcon},
  {label: 'Delivery', icon: TruckIcon},
  {label: 'Payment', icon: CreditCardIcon},
];

// Product photos from the committed template-assets set; the CLI swaps these
// for an inline placeholder when the template is scaffolded.
const CART_ITEMS = [
  {
    id: 'mug',
    name: 'Speckled Stoneware Mug',
    variant: 'Hand-thrown · 12 oz',
    price: 78,
    qty: 2,
    src: '/template-assets/light-product-1.png',
    isLimited: false,
  },
  {
    id: 'plate',
    name: 'Stoneware Dinner Plate',
    variant: 'Reactive glaze · 10 in',
    price: 72,
    qty: 1,
    src: '/template-assets/light-product-4.png',
    isLimited: false,
  },
  {
    id: 'bowl',
    name: 'Cereal Bowl',
    variant: 'Speckled clay · 6 in',
    price: 80,
    qty: 1,
    src: '/template-assets/light-product-5.png',
    isLimited: true,
  },
];

const COUNTRIES = [
  {value: 'us', label: 'United States'},
  {value: 'ca', label: 'Canada'},
  {value: 'uk', label: 'United Kingdom'},
];

const US_STATES = [
  'California',
  'Illinois',
  'Massachusetts',
  'New York',
  'Oregon',
  'Texas',
  'Washington',
];

const DELIVERY_OPTIONS = [
  {
    value: 'standard',
    label: 'Standard',
    window: '3–7 business days',
    price: 4.95,
  },
  {
    value: 'expedited',
    label: 'Expedited',
    window: '1–2 business days',
    price: 9.95,
  },
  {
    value: 'overnight',
    label: 'Overnight',
    window: 'Next business day by 5pm',
    price: 24.95,
  },
];

// Promo codes the store would validate server-side; checked here so the
// summary can react while the user types.
const PROMOS: Record<string, {label: string; rate: number}> = {
  WELCOME10: {label: 'WELCOME10 · 10% off', rate: 0.1},
  CLAY20: {label: 'CLAY20 · 20% off', rate: 0.2},
};

const TAX_RATE = 0.08;
const FREE_SHIPPING_THRESHOLD = 300;
const NARROW_HOST_WIDTH = 900;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const POSTAL_CODE_RULES: Record<
  string,
  {label: string; placeholder: string; pattern: RegExp; error: string}
> = {
  us: {
    label: 'ZIP code',
    placeholder: '10001',
    pattern: /^\d{5}(?:-\d{4})?$/,
    error: 'Enter a 5-digit ZIP code, with an optional 4-digit suffix.',
  },
  ca: {
    label: 'Postal code',
    placeholder: 'K1A 0B1',
    pattern:
      /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i,
    error: 'Enter a Canadian postal code, for example K1A 0B1.',
  },
  uk: {
    label: 'Postcode',
    placeholder: 'SW1A 1AA',
    pattern: /^(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})$/i,
    error: 'Enter a UK postcode, for example SW1A 1AA.',
  },
};

// ── Styles ────────────────────────────────────────────────────────────────────
// Plain inline styles over Astryx token CSS variables, so the template compiles
// in a project with no StyleX pipeline.

// The summary column holds its width while the form column takes the rest, and
// pins itself as the form scrolls past — the sticky offset is the page inset,
// so a stuck card sits where an unstuck one would. The narrow summary needs no
// order override because it is rendered before the form in the DOM.
const summaryColumn: CSSProperties = {
  width: 360,
  flexShrink: 0,
  position: 'sticky',
  top: 'var(--spacing-6)',
  alignSelf: 'flex-start',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// The footer summarises rather than quoting a field's message, so a blocked
// step never shows the same sentence in two places.
const blockedMessage = (count: number) =>
  count === 1
    ? 'One problem above needs fixing first.'
    : `${count} problems above need fixing first.`;

const money = (n: number) => `$${n.toFixed(2)}`;

export default function CheckoutWizardPage() {
  // The responsive variant changes rendered order, not only paint, so measure
  // the host directly. A viewport query would leave an embedded 600px preview
  // in the desktop split whenever the browser window happened to be wide.
  const hostRef = useRef<HTMLElement | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const attachHost = useCallback((element: HTMLElement | null) => {
    hostRef.current = element;
    if (element && element.clientWidth > 0) {
      setIsNarrow(element.clientWidth <= NARROW_HOST_WIDTH);
    }
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? host.clientWidth;
      if (width > 0) {
        setIsNarrow(width <= NARROW_HOST_WIDTH);
      }
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState<ReadonlySet<number>>(new Set());
  const [isComplete, setIsComplete] = useState(false);

  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(CART_ITEMS.map(item => [item.id, item.qty])),
  );
  const [promoInput, setPromoInput] = useState('');
  const [promoWasChecked, setPromoWasChecked] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [address, setAddress] = useState('');
  const [apartment, setApartment] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('us');

  const [delivery, setDelivery] = useState('standard');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [isGift, setIsGift] = useState(false);

  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [billingMatches, setBillingMatches] = useState(true);

  // ── Derived totals ─────────────────────────────────────────────────────────
  // Everything the summary shows is computed here, so the panel and the form
  // can never disagree about the price.

  const items = CART_ITEMS.map(item => ({
    ...item,
    qty: quantities[item.id] ?? item.qty,
  })).filter(item => item.qty > 0);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const promo = appliedPromo ? PROMOS[appliedPromo] : undefined;
  const discount = promo ? subtotal * promo.rate : 0;
  const deliveryOption =
    DELIVERY_OPTIONS.find(o => o.value === delivery) ?? DELIVERY_OPTIONS[0];
  const shipping =
    subtotal - discount >= FREE_SHIPPING_THRESHOLD && delivery === 'standard'
      ? 0
      : deliveryOption.price;
  const tax = (subtotal - discount) * TAX_RATE;
  const total = subtotal - discount + shipping + tax;
  const itemCount = items.reduce((sum, item) => sum + item.qty, 0);

  const postalRule = POSTAL_CODE_RULES[country] ?? POSTAL_CODE_RULES.us;

  const errorsByStep = useMemo<Array<Record<string, string>>>(() => {
    const cart: Record<string, string> = {};
    if (items.length === 0) {
      cart.items = 'Your cart is empty.';
    }

    const shippingStep: Record<string, string> = {};
    if (!EMAIL_PATTERN.test(email)) {
      shippingStep.email = 'Enter an email address for order updates.';
    }
    if (!firstName.trim()) {
      shippingStep.firstName = 'Required';
    }
    if (!lastName.trim()) {
      shippingStep.lastName = 'Required';
    }
    if (!address.trim()) {
      shippingStep.address = 'Required';
    }
    if (!city.trim()) {
      shippingStep.city = 'Required';
    }
    if (country === 'us' && !state) {
      shippingStep.state = 'Required';
    }
    if (!postalRule.pattern.test(postalCode.trim())) {
      shippingStep.postalCode = postalRule.error;
    }

    const deliveryStep: Record<string, string> = {};
    if (delivery === 'overnight' && country !== 'us') {
      deliveryStep.delivery = 'Overnight delivery is only available in the US.';
    }

    const payment: Record<string, string> = {};
    if (cardNumber.replace(/\s/g, '').length < 15) {
      payment.cardNumber = 'Enter the full card number.';
    }
    if (!cardName.trim()) {
      payment.cardName = 'Enter the name printed on the card.';
    }
    if (!/^\d{2}\s?\/\s?\d{2}$/.test(expiry.trim())) {
      payment.expiry = 'Use MM/YY.';
    }
    if (!/^\d{3,4}$/.test(cvc.trim())) {
      payment.cvc = '3 or 4 digits.';
    }

    return [cart, shippingStep, deliveryStep, payment];
  }, [
    items.length,
    email,
    firstName,
    lastName,
    address,
    city,
    state,
    postalCode,
    country,
    postalRule,
    delivery,
    cardNumber,
    cardName,
    expiry,
    cvc,
  ]);

  const shownErrors = (index: number) =>
    attempted.has(index) ? errorsByStep[index] : {};
  const currentErrors = shownErrors(step);
  const isLastStep = step === STEPS.length - 1;

  // Navigation queues focus until React has rendered the destination step and
  // its error state. The first aria-invalid control is also the first field in
  // DOM order; grouped controls forward focus to their first usable child.
  const stepContentRef = useRef<HTMLElement | null>(null);
  const pendingFocusStepRef = useRef<number | null>(null);
  useEffect(() => {
    if (pendingFocusStepRef.current !== step) {
      return;
    }
    pendingFocusStepRef.current = null;

    const root = stepContentRef.current;
    const invalid = root?.matches('[aria-invalid="true"]')
      ? root
      : (root?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? null);
    const focusTarget = invalid?.matches(
      'input, button, select, textarea, [tabindex]',
    )
      ? invalid
      : invalid?.querySelector<HTMLElement>(
          'input:not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        );
    focusTarget?.focus();
  }, [attempted, step]);

  const markAttempted = (indices: ReadonlyArray<number>) => {
    setAttempted(previous => {
      const next = new Set(previous);
      indices.forEach(index => next.add(index));
      return next;
    });
  };

  const goNext = () => {
    markAttempted([step]);
    if (Object.keys(errorsByStep[step]).length > 0) {
      pendingFocusStepRef.current = step;
      return;
    }
    if (isLastStep) {
      setIsComplete(true);
      return;
    }
    setStep(current => current + 1);
  };

  const goTo = (index: number) => {
    if (index <= step) {
      setStep(index);
      return;
    }

    const checked: number[] = [];
    let firstInvalid: number | null = null;
    for (let candidate = step; candidate < index; candidate += 1) {
      checked.push(candidate);
      if (Object.keys(errorsByStep[candidate]).length > 0) {
        firstInvalid = candidate;
        break;
      }
    }
    markAttempted(checked);

    if (firstInvalid != null) {
      pendingFocusStepRef.current = firstInvalid;
      setStep(firstInvalid);
      return;
    }
    setStep(index);
  };

  const handlePromoInputChange = (value: string) => {
    setPromoInput(value);
    setPromoWasChecked(false);
    setAppliedPromo(null);
  };

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    setPromoWasChecked(code.length > 0);
    setAppliedPromo(PROMOS[code] ? code : null);
  };

  // ── Summary ────────────────────────────────────────────────────────────────

  const totalsRows = (
    <VStack gap={2}>
      <HStack hAlign="between" vAlign="center">
        <Text type="body" color="secondary">
          Subtotal
        </Text>
        <Text type="body">{money(subtotal)}</Text>
      </HStack>
      {promo && (
        <HStack hAlign="between" vAlign="center">
          <Text type="body" color="secondary">
            {promo.label}
          </Text>
          <Text type="body">−{money(discount)}</Text>
        </HStack>
      )}
      <HStack hAlign="between" vAlign="center">
        <Text type="body" color="secondary">
          {deliveryOption.label} delivery
        </Text>
        <Text type="body">{shipping === 0 ? 'Free' : money(shipping)}</Text>
      </HStack>
      <HStack hAlign="between" vAlign="center">
        <Text type="body" color="secondary">
          Estimated tax
        </Text>
        <Text type="body">{money(tax)}</Text>
      </HStack>
      <Divider />
      <HStack hAlign="between" vAlign="center">
        <Text type="large" weight="bold">
          Total
        </Text>
        <Text type="large" weight="bold">
          {money(total)}
        </Text>
      </HStack>
    </VStack>
  );

  const summaryBody = (
    <VStack gap={4}>
      <VStack gap={3}>
        {items.map(item => (
          <HStack key={item.id} gap={3} vAlign="start">
            <Thumbnail src={item.src} alt={item.name} />
            <StackItem size="fill">
              <VStack gap={0.5}>
                <HStack gap={2} hAlign="between" vAlign="start">
                  <Text type="body" weight="medium">
                    {item.name}
                  </Text>
                  <Text type="body" weight="bold">
                    {money(item.price * item.qty)}
                  </Text>
                </HStack>
                <Text type="supporting" color="secondary">
                  {item.variant} · Qty {item.qty}
                </Text>
              </VStack>
            </StackItem>
          </HStack>
        ))}
      </VStack>
      <Divider />
      {totalsRows}
      {subtotal - discount < FREE_SHIPPING_THRESHOLD && (
        <Banner
          status="info"
          icon={<Icon icon={TruckIcon} size="sm" />}
          title={`${money(FREE_SHIPPING_THRESHOLD - (subtotal - discount))} away from free standard shipping`}
        />
      )}
    </VStack>
  );

  // One card, two shapes. Beside the form it is open and titled; stacked above
  // it, the title row becomes the Collapsible trigger and carries the total,
  // because that is the one line worth the vertical space when it is closed.
  const summaryCard = (
    <Card padding={5}>
      {isNarrow ? (
        <Collapsible
          trigger={`Order summary · ${money(total)}`}
          defaultIsOpen={false}>
          <VStack paddingBlockStart={3}>{summaryBody}</VStack>
        </Collapsible>
      ) : (
        <VStack gap={4}>
          <HStack gap={2} vAlign="center" hAlign="between">
            <Text type="label">Order summary</Text>
            <Badge
              variant="neutral"
              label={`${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
            />
          </HStack>
          {summaryBody}
        </VStack>
      )}
    </Card>
  );

  // ── Form column furniture ──────────────────────────────────────────────────

  // One stepper at every width. It collapses itself once the column is too
  // narrow to label four steps — bars and a named current step, with the
  // controls its `onStepClick` earns — so there is nothing here to swap.
  const progress = (
    <Stepper
      activeStep={step}
      orientation="horizontal"
      onStepClick={goTo}
      label="Checkout progress"
      density="balanced">
      {STEPS.map(({label, icon}, i) => {
        const hasError = Object.keys(shownErrors(i)).length > 0;
        return (
          <Step
            key={label}
            step={i}
            label={label}
            // Icons rather than the default badge, and the semantic `error`
            // glyph in place of the step's own when the step is blocked — the
            // same one FieldStatus puts beside the field that caused it, so a
            // problem looks the same wherever the eye lands first. Left
            // uncoloured on purpose: Icon inherits, so `status` tints it and
            // the indicator is never told it is an error twice.
            indicator={<Icon icon={hasError ? 'error' : icon} size="sm" />}
            status={hasError ? 'error' : undefined}
          />
        );
      })}
    </Stepper>
  );

  const actions = (
    // The count summarises rather than quoting a field's message, so a blocked
    // step never shows the same sentence in two places, and it sits above the
    // row rather than inside it — in the row it would compete with Continue for
    // the same horizontal space.
    <VStack gap={3} hAlign="start">
      {Object.keys(currentErrors).length > 0 && (
        <FieldStatus
          type="error"
          variant="detached"
          message={blockedMessage(Object.keys(currentErrors).length)}
        />
      )}
      {/* Back hugs its label and Continue takes everything left over, so the
          forward path is the wider target without either button changing size.
          Every control on this page is the default size; emphasis here comes
          from width, which is the axis the row has to spare. */}
      <HStack gap={3} vAlign="center" width="100%">
        <Button
          label={step === 0 ? 'Continue shopping' : 'Back'}
          variant="secondary"
          onClick={() => setStep(s => Math.max(0, s - 1))}
        />
        <StackItem size="fill">
          <Button
            label={isLastStep ? `Pay ${money(total)}` : 'Continue'}
            variant="primary"
            width="100%"
            onClick={goNext}
          />
        </StackItem>
      </HStack>
    </VStack>
  );

  return (
    <Layout
      height="fill"
      // One inset owner and one cap. The title row, the stepper, the fields,
      // the actions and the summary card all measure from this padding and
      // this width, which is what keeps "Checkout", "Review your cart" and
      // "Continue" on the same content line.
      padding={6}
      contentWidth={1000}
      content={
        <LayoutContent>
          <VStack ref={attachHost} gap={6}>
            <HStack gap={3} vAlign="center">
              <StackItem size="fill">
                <Heading level={1}>Checkout</Heading>
              </StackItem>
              <HStack gap={1.5} vAlign="center">
                <Icon icon={LockClosedIcon} size="sm" color="secondary" />
                <Text type="supporting" color="secondary">
                  Secure checkout
                </Text>
              </HStack>
            </HStack>

            <Stack
              direction={isNarrow ? 'vertical' : 'horizontal'}
              gap={6}
              vAlign="start">
              {/* When stacked, summary comes first in DOM as well as visual and
                  keyboard order. */}
              {isNarrow && <StackItem>{summaryCard}</StackItem>}

              {/* The form column owns the sequence end to end: progress at the
                  top, the step in the middle, the way out at the bottom. */}
              <StackItem size="fill">
                <VStack gap={6}>
                  {isComplete ? (
                    <VStack gap={4}>
                      <Banner
                        status="success"
                        title="Order confirmed"
                        description={`This local example completed an order for ${money(total)}. No payment was sent.`}
                      />
                      <Heading level={2}>Thanks for your order</Heading>
                      <Text type="body" color="secondary">
                        The completion is stored in this page's component state
                        so the template ends in a real, reviewable outcome.
                      </Text>
                    </VStack>
                  ) : (
                    progress
                  )}

                  {!isComplete && step === 0 && (
                    <VStack
                      ref={stepContentRef}
                      gap={5}
                      aria-invalid={currentErrors.items ? true : undefined}
                      tabIndex={-1}>
                      <Heading level={2}>Review your cart</Heading>
                      <VStack gap={4}>
                        {items.map(item => (
                          <VStack key={item.id} gap={3}>
                            <HStack gap={4} vAlign="start" wrap="wrap">
                              <Thumbnail src={item.src} alt={item.name} />
                              <StackItem size="fill">
                                <VStack gap={1}>
                                  <HStack
                                    gap={2}
                                    hAlign="between"
                                    vAlign="start">
                                    <HStack gap={2} vAlign="center" wrap="wrap">
                                      <Text type="body" weight="medium">
                                        {item.name}
                                      </Text>
                                      {item.isLimited && (
                                        <Badge
                                          variant="green"
                                          label="Limited"
                                        />
                                      )}
                                    </HStack>
                                    <Text type="body" weight="bold">
                                      {money(item.price * item.qty)}
                                    </Text>
                                  </HStack>
                                  <Text type="supporting" color="secondary">
                                    {item.variant} · {money(item.price)} each
                                  </Text>
                                  <HStack gap={2} vAlign="center">
                                    {/* Steppers on, because a quantity is
                                        adjusted far more often than it is
                                        typed. Without them the field reads as
                                        a text box that happens to hold a
                                        number, and going 1 → 2 costs a
                                        selection and a keystroke. */}
                                    <NumberInput
                                      label={`Quantity of ${item.name}`}
                                      isLabelHidden
                                      value={item.qty}
                                      onChange={qty =>
                                        setQuantities(q => ({
                                          ...q,
                                          [item.id]: qty,
                                        }))
                                      }
                                      min={0}
                                      max={10}
                                      isIntegerOnly
                                      hasNumberSteppers
                                      // Sized for two digits and the steppers,
                                      // not for the column. A quantity field
                                      // as wide as the row reads as somewhere
                                      // to type a sentence.
                                      width={96}
                                    />
                                    <Button
                                      label="Remove"
                                      variant="ghost"
                                      onClick={() =>
                                        setQuantities(q => ({
                                          ...q,
                                          [item.id]: 0,
                                        }))
                                      }
                                    />
                                  </HStack>
                                </VStack>
                              </StackItem>
                            </HStack>
                            <Divider />
                          </VStack>
                        ))}
                      </VStack>
                      {currentErrors.items && (
                        <FieldStatus
                          type="error"
                          variant="detached"
                          message={currentErrors.items}
                        />
                      )}
                      {/* vAlign="end" puts the button on the input's baseline
                    rather than the label's, so the row does not step down
                    when the status message appears under the field. */}
                      <HStack gap={2} vAlign="end">
                        <StackItem size="fill">
                          <TextInput
                            label="Promo code"
                            value={promoInput}
                            onChange={handlePromoInputChange}
                            placeholder="WELCOME10"
                            status={
                              appliedPromo
                                ? {
                                    type: 'success',
                                    message: `${PROMOS[appliedPromo].label} applied.`,
                                  }
                                : promoInput.trim() && promoWasChecked
                                  ? {
                                      type: 'warning',
                                      message: 'That promo code is not valid.',
                                    }
                                  : promoInput.trim()
                                    ? {
                                        type: 'warning',
                                        message:
                                          'Press Apply to check this code.',
                                      }
                                    : undefined
                            }
                          />
                        </StackItem>
                        <Button
                          label="Apply"
                          variant="secondary"
                          onClick={applyPromo}
                        />
                      </HStack>
                    </VStack>
                  )}

                  {!isComplete && step === 1 && (
                    <VStack ref={stepContentRef} gap={5}>
                      <VStack gap={1}>
                        <Heading level={2}>Where should it go?</Heading>
                        <Text type="supporting" color="secondary">
                          Delivery options and tax are calculated from this
                          address.
                        </Text>
                      </VStack>
                      {/* An address form is the canonical FormLayout case: a
                    vertical run with horizontal nests where fields genuinely
                    pair. `defaultOptionality="required"` inverts the marking
                    — a checkout asks for everything, so the exception worth
                    a badge is the one line you can skip. */}
                      <FormLayout defaultOptionality="required">
                        <TextInput
                          label="Email"
                          value={email}
                          onChange={setEmail}
                          placeholder="you@example.com"
                          description="Order confirmation and tracking go here."
                          status={
                            currentErrors.email
                              ? {type: 'error', message: currentErrors.email}
                              : undefined
                          }
                        />
                        <FormLayout
                          direction={isNarrow ? 'vertical' : 'horizontal'}
                          defaultOptionality="required">
                          <TextInput
                            label="First name"
                            value={firstName}
                            onChange={setFirstName}
                            status={
                              currentErrors.firstName
                                ? {
                                    type: 'error',
                                    message: currentErrors.firstName,
                                  }
                                : undefined
                            }
                          />
                          <TextInput
                            label="Last name"
                            value={lastName}
                            onChange={setLastName}
                            status={
                              currentErrors.lastName
                                ? {
                                    type: 'error',
                                    message: currentErrors.lastName,
                                  }
                                : undefined
                            }
                          />
                        </FormLayout>
                        <Selector
                          label="Country"
                          options={COUNTRIES}
                          value={country}
                          onChange={setCountry}
                        />
                        <TextInput
                          label="Street address"
                          value={address}
                          onChange={setAddress}
                          placeholder="123 Main Street"
                          status={
                            currentErrors.address
                              ? {
                                  type: 'error',
                                  message: currentErrors.address,
                                }
                              : undefined
                          }
                        />
                        <TextInput
                          label="Apartment, suite, etc."
                          isOptional
                          value={apartment}
                          onChange={setApartment}
                        />
                        <FormLayout
                          direction={isNarrow ? 'vertical' : 'horizontal'}
                          defaultOptionality="required">
                          <TextInput
                            label="City"
                            value={city}
                            onChange={setCity}
                            status={
                              currentErrors.city
                                ? {type: 'error', message: currentErrors.city}
                                : undefined
                            }
                          />
                          {country === 'us' && (
                            <Selector
                              label="State"
                              placeholder="Select state"
                              options={US_STATES}
                              value={state}
                              onChange={setState}
                              hasSearch
                              status={
                                currentErrors.state
                                  ? {
                                      type: 'error',
                                      message: currentErrors.state,
                                    }
                                  : undefined
                              }
                            />
                          )}
                          <TextInput
                            label={postalRule.label}
                            value={postalCode}
                            onChange={setPostalCode}
                            placeholder={postalRule.placeholder}
                            status={
                              currentErrors.postalCode
                                ? {
                                    type: 'error',
                                    message: currentErrors.postalCode,
                                  }
                                : undefined
                            }
                          />
                        </FormLayout>
                      </FormLayout>
                    </VStack>
                  )}

                  {!isComplete && step === 2 && (
                    <VStack ref={stepContentRef} gap={5}>
                      <VStack gap={1}>
                        <Heading level={2}>How fast do you need it?</Heading>
                        <Text type="supporting" color="secondary">
                          Estimates run from the day the order ships, usually
                          1–3 business days after you place it.
                        </Text>
                      </VStack>
                      <FormLayout defaultOptionality="required">
                        <RadioList
                          label="Delivery method"
                          value={delivery}
                          onChange={setDelivery}
                          status={
                            currentErrors.delivery
                              ? {
                                  type: 'error',
                                  message: currentErrors.delivery,
                                }
                              : undefined
                          }>
                          {DELIVERY_OPTIONS.map(option => {
                            const isFree =
                              option.value === 'standard' &&
                              subtotal - discount >= FREE_SHIPPING_THRESHOLD;
                            return (
                              <RadioListItem
                                key={option.value}
                                value={option.value}
                                label={option.label}
                                description={option.window}
                                endContent={
                                  <Text type="body" weight="medium">
                                    {isFree ? 'Free' : money(option.price)}
                                  </Text>
                                }
                              />
                            );
                          })}
                        </RadioList>
                        <Divider />
                        <CheckboxInput
                          label="This is a gift"
                          value={isGift}
                          onChange={setIsGift}
                        />
                        <TextArea
                          label={
                            isGift ? 'Gift message' : 'Delivery instructions'
                          }
                          isOptional
                          rows={3}
                          maxLength={240}
                          value={deliveryNote}
                          onChange={setDeliveryNote}
                          placeholder={
                            isGift
                              ? 'Happy birthday — hope these get plenty of use.'
                              : 'Leave with the neighbour at number 14.'
                          }
                          description={
                            isGift
                              ? 'Printed on a card. Prices are left off the packing slip.'
                              : 'Passed to the carrier where they support it.'
                          }
                        />
                      </FormLayout>
                    </VStack>
                  )}

                  {!isComplete && step === 3 && (
                    <VStack ref={stepContentRef} gap={5}>
                      <VStack gap={1}>
                        <Heading level={2}>Payment</Heading>
                        <Text type="supporting" color="secondary">
                          This template validates payment details and completes
                          locally. No card is charged.
                        </Text>
                      </VStack>
                      <FormLayout defaultOptionality="required">
                        <TextInput
                          label="Card number"
                          value={cardNumber}
                          onChange={setCardNumber}
                          placeholder="4242 4242 4242 4242"
                          startIcon={LockClosedIcon}
                          status={
                            currentErrors.cardNumber
                              ? {
                                  type: 'error',
                                  message: currentErrors.cardNumber,
                                }
                              : undefined
                          }
                        />
                        <TextInput
                          label="Name on card"
                          value={cardName}
                          onChange={setCardName}
                          status={
                            currentErrors.cardName
                              ? {
                                  type: 'error',
                                  message: currentErrors.cardName,
                                }
                              : undefined
                          }
                        />
                        {/* The one row that does not stretch. A horizontal
                      FormLayout would give MM/YY and three digits half the
                      form each, which reads as a mistake — short
                      fixed-length values stay short, so these two get sized
                      rather than divided. */}
                        <HStack gap={4} wrap="wrap">
                          <TextInput
                            label="Expiry"
                            width={140}
                            value={expiry}
                            onChange={setExpiry}
                            placeholder="MM/YY"
                            status={
                              currentErrors.expiry
                                ? {
                                    type: 'error',
                                    message: currentErrors.expiry,
                                  }
                                : undefined
                            }
                          />
                          <TextInput
                            label="CVC"
                            width={140}
                            value={cvc}
                            onChange={setCvc}
                            placeholder="123"
                            labelTooltip="Three digits on the back of the card, or four on the front for American Express."
                            status={
                              currentErrors.cvc
                                ? {type: 'error', message: currentErrors.cvc}
                                : undefined
                            }
                          />
                        </HStack>
                        <Divider />
                        <CheckboxInput
                          label="Billing address matches the shipping address"
                          value={billingMatches}
                          onChange={setBillingMatches}
                        />
                        {!billingMatches && (
                          <Banner
                            status="info"
                            title="Connect a billing-address step"
                            description="This local example does not collect a separate billing address or send payment. Add that flow with your payment provider."
                          />
                        )}
                      </FormLayout>
                    </VStack>
                  )}

                  {!isComplete && actions}
                </VStack>
              </StackItem>

              {/* Sticky beside the form on wide hosts only. */}
              {!isNarrow && (
                <StackItem style={summaryColumn}>{summaryCard}</StackItem>
              )}
            </Stack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
