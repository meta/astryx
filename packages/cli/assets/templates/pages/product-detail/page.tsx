// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {VStack, HStack, Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Grid} from '@astryxdesign/core/Grid';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {useToast} from '@astryxdesign/core/Toast';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Icon} from '@astryxdesign/core/Icon';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Badge} from '@astryxdesign/core/Badge';
import {Divider} from '@astryxdesign/core/Divider';
import {Collapsible, CollapsibleGroup} from '@astryxdesign/core/Collapsible';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import type {CSSProperties} from 'react';

// Custom CSS here is limited to what Astryx components can't express today:
// - image fill + corner radius (no Image primitive — #2582)
// - the sticky info column (no sticky prop on Astryx layout primitives — #2613)
// Keeps the info column in view while the gallery scrolls. No sticky prop on
// Astryx layout primitives.
const stickyInfo: CSSProperties = {
  position: 'sticky',
  top: 'var(--spacing-8)',
  alignSelf: 'start',
};
// Fills the AspectRatio box + rounds corners. No objectFit/radius props on
// AspectRatio (#2582).
const heroImage: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: 'var(--radius-container)',
};
// Fills the thumbnail card. Corner radius + selection ring come from
// SelectableCard; the image only needs to fill and cover (#2582).
const thumbImage: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

import {RemoveIcon, AddIcon, StarIcon} from '@astryxdesign/template-icons';
import {StarIcon as StarIconSolid} from '@astryxdesign/template-icons/24/solid';

// ─── Star Rating ─────────────────────────────────────────────────────────────
function StarRating({rating, count}: {rating: number; count: number}) {
  const filled = Math.round(rating);
  const empty = 5 - filled;

  return (
    <HStack gap={1} vAlign="center">
      {Array.from({length: filled}, (_, i) => (
        <Icon key={`full-${i}`} icon={StarIconSolid} size="sm" />
      ))}
      {Array.from({length: empty}, (_, i) => (
        <Icon key={`empty-${i}`} icon={StarIcon} size="sm" />
      ))}
      <Text type="body" color="secondary">
        {rating} ({count})
      </Text>
    </HStack>
  );
}

// ─── Image URLs ─────────────────────────────────────────────────────────────
// IMAGES[0] = fallback hero; IMAGES[1..6] = thumbnails (first is selected by default)
const IMAGES = [
  '/template-assets/light-product-1.png',
  '/template-assets/light-product-1.png',
  '/template-assets/light-product-2.png',
  '/template-assets/light-product-3.png',
  '/template-assets/light-product-4.png',
  '/template-assets/light-product-5.png',
  '/template-assets/light-product-3.png',
];

// ─── Product Data ───────────────────────────────────────────────────────────
const PRODUCT = {
  name: 'Solstice Mug & Plate Set',
  price: 89.0,
  originalPrice: 119.0,
  description:
    'A hand-thrown mug and plate set that brings quiet warmth to every meal. The mug sits easy in the hand with a generous 12 oz capacity, while the 8-inch plate works for everything from toast to tapas. Each piece is kiln-fired at 2,300\u00B0F for a finish that resists chips and stains. Subtle variations in the reactive glaze mean no two sets are exactly alike. Dishwasher and microwave safe.',
  composition:
    'High-fire stoneware clay, wheel-thrown and trimmed by hand. Reactive glaze applied by dipping \u2014 color pools and breaks naturally over the clay body. Lead-free and food-safe. Unglazed foot ring reveals the raw clay underneath. Each piece is bisque-fired, glazed, then fired again to cone 10 in a gas reduction kiln.',
  deliveryReturns:
    'Free shipping on all ceramics orders over $75. Each piece is individually wrapped in recycled kraft paper and cushioned for transit. Returns accepted within 30 days \u2014 items must be unused and in original packaging. Replacement pieces available individually.',
  dimensions:
    'Mug height: 9.5 cm / 3.75 in. Mug diameter: 8.5 cm / 3.35 in. Capacity: 350 ml / 12 oz. Plate diameter: 20 cm / 8 in. Plate height: 2 cm / 0.75 in. Weight: 680 g / 1.5 lb (set).',
};

const COLORS = [
  {value: 'snow', label: 'Snow'},
  {value: 'sage', label: 'Sage'},
  {value: 'charcoal', label: 'Charcoal'},
];

const FINISHES = [
  {value: 'matte', label: 'Matte'},
  {value: 'satin', label: 'Satin'},
  {value: 'speckled', label: 'Speckled'},
];

const fmt = (n: number) => `$${n.toFixed(2)}`;

// ─── Image Gallery ──────────────────────────────────────────────────────────
function ImageGallery({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (i: number) => void;
}) {
  const heroSrc = IMAGES[selected + 1] ?? IMAGES[0];
  const thumbnails = IMAGES.slice(1);

  return (
    <VStack gap={3}>
      <AspectRatio ratio={4 / 5}>
        <img style={heroImage} src={heroSrc} alt={PRODUCT.name} />
      </AspectRatio>
      <Grid columns={3} gap={2}>
        {thumbnails.map((src, i) => (
          <AspectRatio key={i} ratio={1}>
            <SelectableCard
              label={`Product image ${i + 1}`}
              isSelected={selected === i}
              onChange={() => onSelect(i)}
              variant="transparent"
              padding={0}
              width="100%"
              height="100%">
              <img
                style={thumbImage}
                src={src}
                alt={`Product image ${i + 1}`}
              />
            </SelectableCard>
          </AspectRatio>
        ))}
      </Grid>
    </VStack>
  );
}

// ─── Product Info ───────────────────────────────────────────────────────────
function ProductInfo() {
  const [color, setColor] = useState('snow');
  const [finish, setFinish] = useState('matte');
  const [quantity, setQuantity] = useState<number | null>(1);
  const showToast = useToast();
  const glaze = COLORS.find(c => c.value === color)?.label ?? color;

  const decrement = () => setQuantity(q => Math.max(1, (q ?? 1) - 1));
  const increment = () => setQuantity(q => Math.min(10, (q ?? 1) + 1));

  return (
    <VStack gap={5}>
      <VStack gap={2}>
        <Text type="display-2" as="h1">
          {PRODUCT.name}
        </Text>
        <StarRating rating={4.3} count={128} />
        <HStack gap={2} vAlign="center">
          <Text type="large" weight="bold">
            {fmt(PRODUCT.price)}
          </Text>
          <Text type="body" color="secondary" hasStrikethrough>
            {fmt(PRODUCT.originalPrice)}
          </Text>
          <Badge variant="error" label="Sale" />
        </HStack>
      </VStack>
      <Text type="large" weight="normal">
        {PRODUCT.description}
      </Text>
      <VStack gap={2}>
        <Text type="label">Glaze</Text>
        <VStack hAlign="start">
          <SegmentedControl value={color} onChange={setColor} label="Glaze">
            {COLORS.map(c => (
              <SegmentedControlItem
                key={c.value}
                value={c.value}
                label={c.label}
              />
            ))}
          </SegmentedControl>
        </VStack>
      </VStack>
      <VStack gap={2}>
        <Text type="label">Finish</Text>
        <VStack hAlign="start">
          <SegmentedControl value={finish} onChange={setFinish} label="Finish">
            {FINISHES.map(f => (
              <SegmentedControlItem
                key={f.value}
                value={f.value}
                label={f.label}
              />
            ))}
          </SegmentedControl>
        </VStack>
      </VStack>
      <VStack gap={2}>
        <Text type="label">Quantity</Text>
        <HStack gap={1} vAlign="center">
          <Button
            label="Decrease quantity"
            variant="ghost"
            icon={<Icon icon={RemoveIcon} size="sm" />}
            clickAction={decrement}
            isDisabled={(quantity ?? 1) <= 1}
            isIconOnly
          />
          <Center width={100}>
            <NumberInput
              label="Quantity"
              isLabelHidden
              value={quantity}
              onChange={setQuantity}
              min={1}
              max={10}
              isIntegerOnly
            />
          </Center>
          <Button
            label="Increase quantity"
            variant="ghost"
            icon={<Icon icon={AddIcon} size="sm" />}
            clickAction={increment}
            isDisabled={(quantity ?? 1) >= 10}
            isIconOnly
          />
        </HStack>
      </VStack>
      <VStack gap={2}>
        <Button
          label="Add to Cart"
          variant="primary"
          size="lg"
          onClick={() =>
            // Demo only: replace this toast with the call that adds to the cart.
            showToast({
              body: `Demo: ${quantity ?? 1} × ${PRODUCT.name} (${glaze}) would be added to the cart here`,
              uniqueID: 'add-to-cart',
            })
          }
        />
        <Button
          label="Buy it now"
          size="lg"
          onClick={() =>
            // Demo only: replace this toast with the call that starts checkout.
            showToast({
              body: `Demo: checkout for ${PRODUCT.name} would start here`,
              uniqueID: 'buy-now',
            })
          }
        />
      </VStack>
      <CollapsibleGroup type="multiple" defaultValue={['composition']}>
        <Divider />
        <Collapsible
          value="composition"
          trigger={
            <Heading level={3} accessibilityLevel={2}>
              Composition
            </Heading>
          }>
          <Text type="body">{PRODUCT.composition}</Text>
        </Collapsible>
        <Divider />
        <Collapsible
          value="delivery"
          defaultIsOpen={false}
          trigger={
            <Heading level={3} accessibilityLevel={2}>
              Delivery &amp; Returns
            </Heading>
          }>
          <Text type="body">{PRODUCT.deliveryReturns}</Text>
        </Collapsible>
        <Divider />
        <Collapsible
          value="dimensions"
          defaultIsOpen={false}
          trigger={
            <Heading level={3} accessibilityLevel={2}>
              Dimensions
            </Heading>
          }>
          <Text type="body">{PRODUCT.dimensions}</Text>
        </Collapsible>
        <Divider />
      </CollapsibleGroup>
    </VStack>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function ProductDetailTemplate() {
  const [selectedThumb, setSelectedThumb] = useState(0);

  return (
    <Layout
      height="fill"
      contentWidth={1200}
      content={
        <LayoutContent role="main" padding={6}>
          <Grid columns={{minWidth: 320, max: 2, repeat: 'fit'}} gap={5}>
            <ImageGallery
              selected={selectedThumb}
              onSelect={setSelectedThumb}
            />
            <VStack gap={0} style={stickyInfo}>
              <ProductInfo />
            </VStack>
          </Grid>
        </LayoutContent>
      }
    />
  );
}
