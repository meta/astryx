// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Section} from '@astryxdesign/core/Section';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {Layout} from '@astryxdesign/core/Layout';
import {LayoutHeader} from '@astryxdesign/core/Layout';
import {LayoutContent} from '@astryxdesign/core/Layout';
import {VStack} from '@astryxdesign/core/Layout';
import {
  Cog6ToothIcon,
  FunnelIcon,
  PlusIcon,
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ShareIcon,
  EllipsisHorizontalIcon,
  MagnifyingGlassIcon,
  BellIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof Toolbar> = {
  title: 'Core/ToolbarEdgeCompensation',
  component: Toolbar,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof Toolbar>;

function AlignmentGuide({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div>
      <div
        style={{
          marginBottom: 8,
          fontSize: 12,
          color: 'var(--color-text-secondary)',
        }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function BodyContent({lines = 3}: {lines?: number}) {
  return (
    <VStack gap={2}>
      {Array.from({length: lines}, (_, i) => (
        <Text type="body" key={i}>
          {i === 0
            ? 'Body content should align with the toolbar text or button labels above.'
            : 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.'}
        </Text>
      ))}
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// 1. Ghost buttons at edges
// ---------------------------------------------------------------------------

/** Ghost buttons in start and end slots across all three sizes. The button text/icon should align flush with the container edge. */
export const GhostButtonsBothEdges: Story = {
  name: 'Ghost buttons: start + end',
  render: () => (
    <VStack gap={4}>
      {(['sm', 'md', 'lg'] as const).map(size => (
        <AlignmentGuide key={size} label={`size="${size}"`}>
          <Card width={600}>
            <Toolbar
              label={`Ghost buttons ${size}`}
              size={size}
              dividers={['bottom']}
              startContent={
                <>
                  <Button
                    label="Back"
                    variant="ghost"
                    icon={<ArrowLeftIcon />}
                    isIconOnly
                  />
                  <Button label="Edit" variant="ghost" />
                  <Button label="Share" variant="ghost" />
                </>
              }
              endContent={
                <>
                  <Button
                    label="Filter"
                    variant="ghost"
                    icon={<FunnelIcon />}
                    isIconOnly
                  />
                  <Button
                    label="Settings"
                    variant="ghost"
                    icon={<Cog6ToothIcon />}
                    isIconOnly
                  />
                </>
              }
            />
            <Section>
              <BodyContent />
            </Section>
          </Card>
        </AlignmentGuide>
      ))}
    </VStack>
  ),
};

// ---------------------------------------------------------------------------
// 2. Solid buttons at edges — no compensation needed
// ---------------------------------------------------------------------------

/** Solid (default) buttons at edges. These should NOT compensate — their padding is visually filled. */
export const SolidButtonsBothEdges: Story = {
  name: 'Solid buttons: start + end',
  render: () => (
    <VStack gap={4}>
      {(['sm', 'md', 'lg'] as const).map(size => (
        <AlignmentGuide key={size} label={`size="${size}"`}>
          <Card width={600}>
            <Toolbar
              label={`Solid buttons ${size}`}
              size={size}
              dividers={['bottom']}
              startContent={<Button label="New item" icon={<PlusIcon />} />}
              endContent={<Button label="Save" />}
            />
            <Section>
              <BodyContent />
            </Section>
          </Card>
        </AlignmentGuide>
      ))}
    </VStack>
  ),
};

// ---------------------------------------------------------------------------
// 3. Mixed: ghost start, solid end
// ---------------------------------------------------------------------------

/** Ghost on start edge, solid on end. Only the start should compensate. */
export const GhostStartSolidEnd: Story = {
  name: 'Mixed: ghost start, solid end',
  render: () => (
    <VStack gap={4}>
      {(['sm', 'md', 'lg'] as const).map(size => (
        <AlignmentGuide key={size} label={`size="${size}"`}>
          <Card width={600}>
            <Toolbar
              label={`Mixed ${size}`}
              size={size}
              dividers={['bottom']}
              startContent={
                <>
                  <Button
                    label="Back"
                    variant="ghost"
                    icon={<ArrowLeftIcon />}
                    isIconOnly
                  />
                  <Button label="Edit" variant="ghost" />
                </>
              }
              endContent={<Button label="Save" />}
            />
            <Section>
              <BodyContent />
            </Section>
          </Card>
        </AlignmentGuide>
      ))}
    </VStack>
  ),
};

// ---------------------------------------------------------------------------
// 4. Mixed: solid start, ghost end
// ---------------------------------------------------------------------------

/** Solid on start edge, ghost on end. Only the end should compensate. */
export const SolidStartGhostEnd: Story = {
  name: 'Mixed: solid start, ghost end',
  render: () => (
    <VStack gap={4}>
      {(['sm', 'md', 'lg'] as const).map(size => (
        <AlignmentGuide key={size} label={`size="${size}"`}>
          <Card width={600}>
            <Toolbar
              label={`Mixed ${size}`}
              size={size}
              dividers={['bottom']}
              startContent={<Button label="New item" icon={<PlusIcon />} />}
              endContent={
                <>
                  <Button
                    label="Filter"
                    variant="ghost"
                    icon={<FunnelIcon />}
                    isIconOnly
                  />
                  <Button
                    label="More"
                    variant="ghost"
                    icon={<EllipsisHorizontalIcon />}
                    isIconOnly
                  />
                </>
              }
            />
            <Section>
              <BodyContent />
            </Section>
          </Card>
        </AlignmentGuide>
      ))}
    </VStack>
  ),
};

// ---------------------------------------------------------------------------
// 5. Heading as start content + ghost end
// ---------------------------------------------------------------------------

/** Heading in start slot with ghost buttons at end. Check heading alignment with body text below. */
export const HeadingStartGhostEnd: Story = {
  name: 'Heading start + ghost end',
  render: () => (
    <VStack gap={4}>
      {(['sm', 'md', 'lg'] as const).map(size => (
        <AlignmentGuide key={size} label={`size="${size}"`}>
          <Card width={600}>
            <Toolbar
              label={`Heading ${size}`}
              size={size}
              dividers={['bottom']}
              startContent={<Heading level={4}>Section Title</Heading>}
              endContent={
                <>
                  <Button
                    label="Filter"
                    variant="ghost"
                    icon={<FunnelIcon />}
                    isIconOnly
                  />
                  <Button
                    label="Add"
                    variant="ghost"
                    icon={<PlusIcon />}
                    isIconOnly
                  />
                </>
              }
            />
            <Section>
              <BodyContent />
            </Section>
          </Card>
        </AlignmentGuide>
      ))}
    </VStack>
  ),
};

// ---------------------------------------------------------------------------
// 6. Text as start content + ghost end
// ---------------------------------------------------------------------------

/** Text (not heading) in start slot with ghost buttons. */
export const TextStartGhostEnd: Story = {
  name: 'Text start + ghost end',
  render: () => (
    <Card width={600}>
      <Toolbar
        label="Text start"
        dividers={['bottom']}
        startContent={
          <Text type="body" weight="bold">
            3 items selected
          </Text>
        }
        endContent={
          <>
            <Button label="Delete" variant="ghost" />
            <Button label="Archive" variant="ghost" />
          </>
        }
      />
      <Section>
        <BodyContent />
      </Section>
    </Card>
  ),
};

// ---------------------------------------------------------------------------
// 7. Heading start + solid end
// ---------------------------------------------------------------------------

/** Heading on start, solid on end. No edge compensation on buttons — check heading vs body alignment. */
export const HeadingStartSolidEnd: Story = {
  name: 'Heading start + solid end',
  render: () => (
    <Card width={600}>
      <Toolbar
        label="Heading solid"
        dividers={['bottom']}
        startContent={<Heading level={4}>Project Settings</Heading>}
        endContent={<Button label="Save changes" />}
      />
      <Section>
        <BodyContent />
      </Section>
    </Card>
  ),
};

// ---------------------------------------------------------------------------
// 8. Layout WITHOUT contentWidth — toolbar full bleed
// ---------------------------------------------------------------------------

/** Toolbar in Layout header, no contentWidth. Full-width toolbar, edge compensation normal. */
export const LayoutNoContentWidth: Story = {
  name: 'Layout: no contentWidth, ghost buttons',
  render: () => (
    <div style={{height: 400, border: '1px solid #e0e0e0', borderRadius: 8}}>
      <Layout
        header={
          <LayoutHeader hasDivider padding={0}>
            <Toolbar
              label="App header"
              startContent={
                <>
                  <Button
                    label="Menu"
                    variant="ghost"
                    icon={<Squares2X2Icon />}
                    isIconOnly
                  />
                  <Heading level={4}>Dashboard</Heading>
                </>
              }
              endContent={
                <>
                  <Button
                    label="Search"
                    variant="ghost"
                    icon={<MagnifyingGlassIcon />}
                    isIconOnly
                  />
                  <Button
                    label="Notifications"
                    variant="ghost"
                    icon={<BellIcon />}
                    isIconOnly
                  />
                  <Button
                    label="Settings"
                    variant="ghost"
                    icon={<Cog6ToothIcon />}
                    isIconOnly
                  />
                </>
              }
            />
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <BodyContent lines={6} />
          </LayoutContent>
        }
      />
    </div>
  ),
};

/** Same without contentWidth but solid buttons for baseline comparison. */
export const LayoutNoContentWidthSolid: Story = {
  name: 'Layout: no contentWidth, solid buttons',
  render: () => (
    <div style={{height: 400, border: '1px solid #e0e0e0', borderRadius: 8}}>
      <Layout
        header={
          <LayoutHeader hasDivider padding={0}>
            <Toolbar
              label="App header"
              startContent={<Heading level={4}>Dashboard</Heading>}
              endContent={
                <>
                  <Button label="Cancel" variant="secondary" />
                  <Button label="Save" />
                </>
              }
            />
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <BodyContent lines={6} />
          </LayoutContent>
        }
      />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 9. Layout WITH contentWidth — the critical case
// ---------------------------------------------------------------------------

/** Toolbar in Layout with contentWidth=640. Header is full bleed, body is constrained. Ghost buttons should still align flush. */
export const LayoutWithContentWidth: Story = {
  name: 'Layout: contentWidth=640, ghost buttons',
  render: () => (
    <div style={{height: 400, border: '1px solid #e0e0e0', borderRadius: 8}}>
      <Layout
        contentWidth={640}
        header={
          <LayoutHeader hasDivider padding={0}>
            <Toolbar
              label="Page header"
              startContent={
                <>
                  <Button
                    label="Back"
                    variant="ghost"
                    icon={<ArrowLeftIcon />}
                    isIconOnly
                  />
                  <Heading level={4}>Settings</Heading>
                </>
              }
              endContent={
                <>
                  <Button
                    label="Search"
                    variant="ghost"
                    icon={<MagnifyingGlassIcon />}
                    isIconOnly
                  />
                  <Button
                    label="More"
                    variant="ghost"
                    icon={<EllipsisHorizontalIcon />}
                    isIconOnly
                  />
                </>
              }
            />
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <BodyContent lines={6} />
          </LayoutContent>
        }
      />
    </div>
  ),
};

/** Same with contentWidth but solid buttons for comparison. */
export const LayoutWithContentWidthSolid: Story = {
  name: 'Layout: contentWidth=640, solid buttons',
  render: () => (
    <div style={{height: 400, border: '1px solid #e0e0e0', borderRadius: 8}}>
      <Layout
        contentWidth={640}
        header={
          <LayoutHeader hasDivider padding={0}>
            <Toolbar
              label="Page header"
              startContent={<Heading level={4}>Settings</Heading>}
              endContent={
                <>
                  <Button label="Cancel" variant="secondary" />
                  <Button label="Save" />
                </>
              }
            />
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <BodyContent lines={6} />
          </LayoutContent>
        }
      />
    </div>
  ),
};

/** Mixed ghost/solid with contentWidth — ghost start, solid end. */
export const LayoutWithContentWidthMixed: Story = {
  name: 'Layout: contentWidth=640, mixed',
  render: () => (
    <div style={{height: 400, border: '1px solid #e0e0e0', borderRadius: 8}}>
      <Layout
        contentWidth={640}
        header={
          <LayoutHeader hasDivider padding={0}>
            <Toolbar
              label="Page header"
              startContent={
                <>
                  <Button
                    label="Back"
                    variant="ghost"
                    icon={<ArrowLeftIcon />}
                    isIconOnly
                  />
                  <Heading level={4}>Edit Project</Heading>
                </>
              }
              endContent={<Button label="Save changes" />}
            />
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <BodyContent lines={6} />
          </LayoutContent>
        }
      />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 10. Wider contentWidth
// ---------------------------------------------------------------------------

/** contentWidth=960, ghost buttons. Common for dashboards. */
export const LayoutContentWidth960: Story = {
  name: 'Layout: contentWidth=960, ghost buttons',
  render: () => (
    <div style={{height: 400, border: '1px solid #e0e0e0', borderRadius: 8}}>
      <Layout
        contentWidth={960}
        header={
          <LayoutHeader hasDivider padding={0}>
            <Toolbar
              label="Dashboard header"
              startContent={
                <>
                  <Button
                    label="Back"
                    variant="ghost"
                    icon={<ChevronLeftIcon />}
                    isIconOnly
                  />
                  <Heading level={4}>Analytics Dashboard</Heading>
                </>
              }
              endContent={
                <>
                  <Button
                    label="Share"
                    variant="ghost"
                    icon={<ShareIcon />}
                    isIconOnly
                  />
                  <Button
                    label="Settings"
                    variant="ghost"
                    icon={<Cog6ToothIcon />}
                    isIconOnly
                  />
                </>
              }
            />
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <BodyContent lines={6} />
          </LayoutContent>
        }
      />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 11. Layout with padding prop
// ---------------------------------------------------------------------------

/** Layout with padding=4 and ghost toolbar. Layout outer padding interacts with toolbar edge compensation. */
export const LayoutWithPadding: Story = {
  name: 'Layout: padding=4, ghost buttons',
  render: () => (
    <div style={{height: 400, border: '1px solid #e0e0e0', borderRadius: 8}}>
      <Layout
        padding={4}
        header={
          <LayoutHeader hasDivider padding={0}>
            <Toolbar
              label="Padded layout header"
              startContent={
                <>
                  <Button
                    label="Back"
                    variant="ghost"
                    icon={<ArrowLeftIcon />}
                    isIconOnly
                  />
                  <Heading level={4}>Padded Layout</Heading>
                </>
              }
              endContent={
                <Button
                  label="Settings"
                  variant="ghost"
                  icon={<Cog6ToothIcon />}
                  isIconOnly
                />
              }
            />
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <BodyContent lines={6} />
          </LayoutContent>
        }
      />
    </div>
  ),
};

/** Layout with padding + contentWidth together. Both constraints active. */
export const LayoutWithPaddingAndContentWidth: Story = {
  name: 'Layout: padding=4 + contentWidth=640',
  render: () => (
    <div style={{height: 400, border: '1px solid #e0e0e0', borderRadius: 8}}>
      <Layout
        padding={4}
        contentWidth={640}
        header={
          <LayoutHeader hasDivider padding={0}>
            <Toolbar
              label="Padded constrained header"
              startContent={
                <>
                  <Button
                    label="Back"
                    variant="ghost"
                    icon={<ArrowLeftIcon />}
                    isIconOnly
                  />
                  <Heading level={4}>Constrained + Padded</Heading>
                </>
              }
              endContent={
                <>
                  <Button
                    label="Share"
                    variant="ghost"
                    icon={<ShareIcon />}
                    isIconOnly
                  />
                  <Button
                    label="Settings"
                    variant="ghost"
                    icon={<Cog6ToothIcon />}
                    isIconOnly
                  />
                </>
              }
            />
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <BodyContent lines={6} />
          </LayoutContent>
        }
      />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 12. LayoutHeader with default padding (not padding={0}) — double padding?
// ---------------------------------------------------------------------------

/** Toolbar inside LayoutHeader using the header's default padding (not padding={0}). Potential double-padding issue. */
export const LayoutHeaderDefaultPadding: Story = {
  name: 'Layout: header default padding + toolbar',
  render: () => (
    <div style={{height: 400, border: '1px solid #e0e0e0', borderRadius: 8}}>
      <Layout
        header={
          <LayoutHeader hasDivider>
            <Toolbar
              label="Double padded?"
              startContent={
                <>
                  <Button
                    label="Back"
                    variant="ghost"
                    icon={<ArrowLeftIcon />}
                    isIconOnly
                  />
                  <Heading level={4}>Double Padding Check</Heading>
                </>
              }
              endContent={
                <Button
                  label="Settings"
                  variant="ghost"
                  icon={<Cog6ToothIcon />}
                  isIconOnly
                />
              }
            />
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <BodyContent lines={4} />
          </LayoutContent>
        }
      />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 13. Side-by-side comparison
// ---------------------------------------------------------------------------

/** Direct visual comparison: ghost vs solid, with body content for alignment reference. */
export const SideBySideComparison: Story = {
  name: 'Comparison: ghost vs solid alignment',
  render: () => (
    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24}}>
      <AlignmentGuide label="Ghost buttons (should align flush)">
        <Card>
          <Toolbar
            label="Ghost"
            dividers={['bottom']}
            startContent={
              <>
                <Button
                  label="Back"
                  variant="ghost"
                  icon={<ArrowLeftIcon />}
                  isIconOnly
                />
                <Button label="Edit" variant="ghost" />
              </>
            }
            endContent={
              <Button
                label="More"
                variant="ghost"
                icon={<EllipsisHorizontalIcon />}
                isIconOnly
              />
            }
          />
          <Section>
            <BodyContent />
          </Section>
        </Card>
      </AlignmentGuide>
      <AlignmentGuide label="Solid buttons (natural padding)">
        <Card>
          <Toolbar
            label="Solid"
            dividers={['bottom']}
            startContent={<Button label="New" icon={<PlusIcon />} />}
            endContent={<Button label="Save" />}
          />
          <Section>
            <BodyContent />
          </Section>
        </Card>
      </AlignmentGuide>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 14. Three-slot with ghost edges
// ---------------------------------------------------------------------------

/** Three-slot (center content) with ghost buttons at both edges. Center stays centered. */
export const ThreeSlotGhostEdges: Story = {
  name: 'Three-slot: ghost edges + center heading',
  render: () => (
    <VStack gap={4}>
      {(['sm', 'md', 'lg'] as const).map(size => (
        <AlignmentGuide key={size} label={`size="${size}"`}>
          <Card width={700}>
            <Toolbar
              label={`Three slot ${size}`}
              size={size}
              dividers={['bottom']}
              startContent={
                <Button
                  label="Back"
                  variant="ghost"
                  icon={<ChevronLeftIcon />}
                  isIconOnly
                />
              }
              centerContent={<Heading level={4}>Document Title</Heading>}
              endContent={
                <>
                  <Button
                    label="Share"
                    variant="ghost"
                    icon={<ShareIcon />}
                    isIconOnly
                  />
                  <Button
                    label="More"
                    variant="ghost"
                    icon={<EllipsisHorizontalIcon />}
                    isIconOnly
                  />
                </>
              }
            />
            <Section>
              <BodyContent />
            </Section>
          </Card>
        </AlignmentGuide>
      ))}
    </VStack>
  ),
};

// ---------------------------------------------------------------------------
// 15. Three-slot with mixed ghost/solid
// ---------------------------------------------------------------------------

/** Three-slot: ghost start, center heading, solid end. */
export const ThreeSlotMixed: Story = {
  name: 'Three-slot: ghost start, solid end',
  render: () => (
    <Card width={700}>
      <Toolbar
        label="Mixed three slot"
        dividers={['bottom']}
        startContent={
          <Button
            label="Back"
            variant="ghost"
            icon={<ChevronLeftIcon />}
            isIconOnly
          />
        }
        centerContent={<Heading level={4}>Page Title</Heading>}
        endContent={
          <>
            <Button label="Cancel" variant="secondary" />
            <Button label="Publish" />
          </>
        }
      />
      <Section>
        <BodyContent />
      </Section>
    </Card>
  ),
};

// ---------------------------------------------------------------------------
// 16. Stress test: stacked variants
// ---------------------------------------------------------------------------

/** Multiple toolbars stacked — checks edge compensation consistency across adjacent toolbars with different content types. */
export const StackedVariants: Story = {
  name: 'Stress: stacked toolbar variants',
  render: () => (
    <Card width={700}>
      <Toolbar
        label="Ghost both"
        size="sm"
        dividers={['bottom']}
        startContent={
          <>
            <Button
              label="Back"
              variant="ghost"
              icon={<ArrowLeftIcon />}
              isIconOnly
            />
            <Heading level={4}>Ghost + Heading</Heading>
          </>
        }
        endContent={
          <Button
            label="Settings"
            variant="ghost"
            icon={<Cog6ToothIcon />}
            isIconOnly
          />
        }
      />
      <Toolbar
        label="Solid both"
        size="sm"
        dividers={['bottom']}
        startContent={<Button label="Add" size="sm" icon={<PlusIcon />} />}
        endContent={<Button label="Save" size="sm" />}
      />
      <Toolbar
        label="Ghost start solid end"
        size="sm"
        dividers={['bottom']}
        startContent={
          <Button
            label="Back"
            variant="ghost"
            icon={<ChevronLeftIcon />}
            isIconOnly
          />
        }
        endContent={
          <Button label="Next" size="sm" icon={<ChevronRightIcon />} />
        }
      />
      <Toolbar
        label="Text start ghost end"
        size="sm"
        dividers={['bottom']}
        startContent={
          <Text type="body" weight="bold">
            Selection mode
          </Text>
        }
        endContent={<Button label="Done" variant="ghost" />}
      />
      <Section>
        <BodyContent lines={2} />
      </Section>
    </Card>
  ),
};

// ---------------------------------------------------------------------------
// 17. Card > Layout with contentWidth > toolbar as header
// ---------------------------------------------------------------------------

/** Card wrapping a Layout with contentWidth. Toolbar lives in the LayoutHeader. Tests the full nesting chain: Card padding → Layout bleed → contentWidth constraint → toolbar edge compensation. */
export const CardLayoutContentWidthToolbar: Story = {
  name: 'Card > Layout(contentWidth) > Toolbar header',
  render: () => (
    <VStack gap={4}>
      <AlignmentGuide label="contentWidth=640, ghost buttons">
        <Card width={900}>
          <Layout
            contentWidth={640}
            header={
              <LayoutHeader hasDivider padding={0}>
                <Toolbar
                  label="Card layout header"
                  startContent={
                    <>
                      <Button
                        label="Back"
                        variant="ghost"
                        icon={<ArrowLeftIcon />}
                        isIconOnly
                      />
                      <Heading level={4}>Project Settings</Heading>
                    </>
                  }
                  endContent={
                    <>
                      <Button
                        label="Search"
                        variant="ghost"
                        icon={<MagnifyingGlassIcon />}
                        isIconOnly
                      />
                      <Button
                        label="Settings"
                        variant="ghost"
                        icon={<Cog6ToothIcon />}
                        isIconOnly
                      />
                    </>
                  }
                />
              </LayoutHeader>
            }
            content={
              <LayoutContent>
                <BodyContent lines={4} />
              </LayoutContent>
            }
          />
        </Card>
      </AlignmentGuide>
      <AlignmentGuide label="contentWidth=640, mixed (ghost start, solid end)">
        <Card width={900}>
          <Layout
            contentWidth={640}
            header={
              <LayoutHeader hasDivider padding={0}>
                <Toolbar
                  label="Card layout header"
                  startContent={
                    <>
                      <Button
                        label="Back"
                        variant="ghost"
                        icon={<ArrowLeftIcon />}
                        isIconOnly
                      />
                      <Heading level={4}>Edit Document</Heading>
                    </>
                  }
                  endContent={<Button label="Save changes" />}
                />
              </LayoutHeader>
            }
            content={
              <LayoutContent>
                <BodyContent lines={4} />
              </LayoutContent>
            }
          />
        </Card>
      </AlignmentGuide>
      <AlignmentGuide label="contentWidth=640, heading start, no end">
        <Card width={900}>
          <Layout
            contentWidth={640}
            header={
              <LayoutHeader hasDivider padding={0}>
                <Toolbar
                  label="Card layout header"
                  startContent={<Heading level={4}>Notifications</Heading>}
                />
              </LayoutHeader>
            }
            content={
              <LayoutContent>
                <BodyContent lines={4} />
              </LayoutContent>
            }
          />
        </Card>
      </AlignmentGuide>
    </VStack>
  ),
};

// ---------------------------------------------------------------------------
// 18. Card(padding=3/12px) > Layout > toolbar header + body text
// ---------------------------------------------------------------------------

/** Card with 12px padding wrapping a Layout. Toolbar in header, body text in content. Tests that toolbar edge compensation aligns with body text when the card has non-default (smaller) padding. */
export const CardSmallPaddingLayoutToolbar: Story = {
  name: 'Card(12px) > Layout > Toolbar + body',
  render: () => (
    <Card width={700} padding={3}>
      <Layout
        header={
          <LayoutHeader hasDivider padding={0}>
            <Toolbar
              label="Card header"
              startContent={
                <>
                  <Button
                    label="Back"
                    variant="ghost"
                    icon={<ArrowLeftIcon />}
                    isIconOnly
                  />
                  <Heading level={4}>Project Settings</Heading>
                </>
              }
              endContent={
                <>
                  <Button
                    label="Search"
                    variant="ghost"
                    icon={<MagnifyingGlassIcon />}
                    isIconOnly
                  />
                  <Button
                    label="Settings"
                    variant="ghost"
                    icon={<Cog6ToothIcon />}
                    isIconOnly
                  />
                </>
              }
            />
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <BodyContent lines={4} />
          </LayoutContent>
        }
      />
    </Card>
  ),
};

// ---------------------------------------------------------------------------
// 19. Toolbar with TabList — size cascades from toolbar
// ---------------------------------------------------------------------------

/** Toolbar with tab navigation. Size prop on toolbar cascades to tabs and buttons via SizeContext. */
export const WithTabs: Story = {
  name: 'Tabs in toolbar (all sizes)',
  render: () => {
    const [tab, setTab] = useState('overview');
    return (
      <VStack gap={4}>
        {(['sm', 'md', 'lg'] as const).map(size => (
          <AlignmentGuide key={size} label={`size="${size}"`}>
            <Card width={700}>
              <Toolbar
                label={`Tab toolbar ${size}`}
                size={size}
                dividers={['bottom']}
                startContent={
                  <TabList
                    value={tab}
                    onChange={setTab}
                    aria-label={`Tab toolbar tabs (${size})`}>
                    <Tab value="overview" label="Overview" />
                    <Tab value="analytics" label="Analytics" />
                    <Tab value="settings" label="Settings" />
                  </TabList>
                }
                endContent={
                  <>
                    <Button
                      label="Filter"
                      variant="ghost"
                      icon={<FunnelIcon />}
                      isIconOnly
                    />
                    <Button
                      label="Add"
                      variant="ghost"
                      icon={<PlusIcon />}
                      isIconOnly
                    />
                  </>
                }
              />
              <Section>
                <BodyContent />
              </Section>
            </Card>
          </AlignmentGuide>
        ))}
      </VStack>
    );
  },
};
