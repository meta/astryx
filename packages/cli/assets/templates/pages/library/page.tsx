// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, useMemo, type CSSProperties} from 'react';
import {Layout, LayoutHeader, LayoutContent} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Divider} from '@astryxdesign/core/Divider';
import {Section} from '@astryxdesign/core/Section';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, VStack, StackItem} from '@astryxdesign/core/Stack';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {OverflowList} from '@astryxdesign/core/OverflowList';
import {Center} from '@astryxdesign/core/Center';
import {MagnifyingGlassIcon} from '@heroicons/react/24/outline';

interface LibraryItem {
  id: string;
  name: string;
  description: string;
  category: string;
  type: 'Component' | 'Pattern' | 'Utility';
  imageUrl?: string;
}

const CATEGORIES = ['All', 'Layout', 'Forms', 'Navigation', 'Feedback', 'Data'];

const ITEMS: LibraryItem[] = [
  {
    id: '1',
    name: 'Stack',
    description:
      'Vertical and horizontal stack layouts with configurable gap and alignment.',
    category: 'Layout',
    type: 'Component',
    imageUrl:
      '/template-assets/colorful-home-horizontal-1.png',
  },
  {
    id: '2',
    name: 'Grid',
    description:
      'Responsive grid container with auto-fit columns and gap control.',
    category: 'Layout',
    type: 'Component',
    imageUrl:
      '/template-assets/illustrative-horizontal-3.png',
  },
  {
    id: '3',
    name: 'Card',
    description:
      'Surface container with optional padding, border, and shadow variants.',
    category: 'Layout',
    type: 'Component',
    imageUrl:
      '/template-assets/light-working-horizontal-2.png',
  },
  {
    id: '4',
    name: 'Center',
    description: 'Centers its child both horizontally and vertically.',
    category: 'Layout',
    type: 'Utility',
    imageUrl:
      '/template-assets/moody-scene-horizontal-1.png',
  },
  {
    id: '5',
    name: 'Section',
    description: 'Semantic page section with optional heading and divider.',
    category: 'Layout',
    type: 'Pattern',
    imageUrl:
      '/template-assets/colorful-lifestyle-horizontal-2.png',
  },
  {
    id: '6',
    name: 'Collapsible',
    description: 'Expandable region with animated height transition.',
    category: 'Layout',
    type: 'Component',
    imageUrl:
      '/template-assets/light-scene-horizontal-1.png',
  },
  {
    id: '7',
    name: 'TextInput',
    description:
      'Single-line text field with label, placeholder, and validation states.',
    category: 'Forms',
    type: 'Component',
    imageUrl:
      '/template-assets/moody-working-horizontal-1.png',
  },
  {
    id: '8',
    name: 'TextArea',
    description: 'Multi-line text field with auto-resize and character count.',
    category: 'Forms',
    type: 'Component',
    imageUrl:
      '/template-assets/colorful-working-horizontal-3.png',
  },
  {
    id: '9',
    name: 'CheckboxInput',
    description: 'Checkbox with label, indeterminate state, and group support.',
    category: 'Forms',
    type: 'Component',
    imageUrl:
      '/template-assets/illustrative-horizontal-1.png',
  },
  {
    id: '10',
    name: 'RadioList',
    description: 'Group of radio buttons with accessible fieldset wrapper.',
    category: 'Forms',
    type: 'Component',
    imageUrl:
      '/template-assets/light-home-horizontal-1.png',
  },
  {
    id: '11',
    name: 'Switch',
    description: 'Toggle switch for binary on/off settings.',
    category: 'Forms',
    type: 'Component',
    imageUrl:
      '/template-assets/moody-home-horizontal-2.png',
  },
  {
    id: '12',
    name: 'Selector',
    description:
      'Dropdown or inline option selector with single and multi-select modes.',
    category: 'Forms',
    type: 'Component',
    imageUrl:
      '/template-assets/colorful-product-1.png',
  },
  {
    id: '13',
    name: 'TabList',
    description:
      'Horizontal tab navigation with underline indicator and keyboard support.',
    category: 'Navigation',
    type: 'Component',
    imageUrl:
      '/template-assets/illustrative-horizontal-5.png',
  },
  {
    id: '14',
    name: 'TopNav',
    description: 'Application top bar with logo, nav links, and action slots.',
    category: 'Navigation',
    type: 'Pattern',
    imageUrl:
      '/template-assets/light-working-horizontal-1.png',
  },
  {
    id: '15',
    name: 'SideNav',
    description:
      'Vertical sidebar navigation with collapsible groups and active states.',
    category: 'Navigation',
    type: 'Pattern',
    imageUrl:
      '/template-assets/moody-lifestyle-horizontal-1.png',
  },
  {
    id: '16',
    name: 'Breadcrumbs',
    description: 'Path trail navigation with separator and truncation support.',
    category: 'Navigation',
    type: 'Component',
    imageUrl:
      '/template-assets/colorful-home-horizontal-2.png',
  },
  {
    id: '17',
    name: 'Pagination',
    description:
      'Page navigation with prev/next controls and page count display.',
    category: 'Navigation',
    type: 'Component',
    imageUrl:
      '/template-assets/colorful-working-horizontal-1.png',
  },
  {
    id: '18',
    name: 'MobileNav',
    description: 'Slide-out navigation drawer for mobile viewports.',
    category: 'Navigation',
    type: 'Pattern',
    imageUrl:
      '/template-assets/light-working-horizontal-3.png',
  },
  {
    id: '19',
    name: 'Badge',
    description:
      'Compact label for status, count, or category with semantic color variants.',
    category: 'Feedback',
    type: 'Component',
    imageUrl:
      '/template-assets/moody-working-horizontal-2.png',
  },
  {
    id: '20',
    name: 'Banner',
    description:
      'Full-width alert bar for info, success, warning, and error messages.',
    category: 'Feedback',
    type: 'Component',
    imageUrl:
      '/template-assets/illustrative-horizontal-2.png',
  },
  {
    id: '21',
    name: 'Spinner',
    description: 'Animated loading indicator with size and color variants.',
    category: 'Feedback',
    type: 'Component',
    imageUrl:
      '/template-assets/colorful-lifestyle-horizontal-1.png',
  },
  {
    id: '22',
    name: 'ProgressBar',
    description: 'Horizontal bar indicating task completion percentage.',
    category: 'Feedback',
    type: 'Component',
    imageUrl:
      '/template-assets/light-lifestyle-horizontal-1.png',
  },
  {
    id: '23',
    name: 'StatusDot',
    description:
      'Small dot indicator for presence, health, or pipeline status.',
    category: 'Feedback',
    type: 'Component',
    imageUrl:
      '/template-assets/moody-home-horizontal-1.png',
  },
  {
    id: '24',
    name: 'Tooltip',
    description:
      'Contextual label that appears on hover with configurable placement.',
    category: 'Feedback',
    type: 'Component',
    imageUrl:
      '/template-assets/colorful-working-horizontal-2.png',
  },
  {
    id: '25',
    name: 'Table',
    description:
      'Feature-rich data table with sorting, selection, and column resizing.',
    category: 'Data',
    type: 'Component',
    imageUrl:
      '/template-assets/illustrative-horizontal-4.png',
  },
  {
    id: '26',
    name: 'Avatar',
    description:
      'User profile image with fallback initials and status dot support.',
    category: 'Data',
    type: 'Component',
    imageUrl:
      '/template-assets/light-working-horizontal-4.png',
  },
  {
    id: '27',
    name: 'Skeleton',
    description:
      'Placeholder shimmer for loading states matching content shapes.',
    category: 'Data',
    type: 'Utility',
    imageUrl:
      '/template-assets/moody-lifestyle-horizontal-2.png',
  },
  {
    id: '28',
    name: 'HoverCard',
    description: 'Rich popover that appears on hover with arbitrary content.',
    category: 'Data',
    type: 'Component',
    imageUrl:
      '/template-assets/moody-scene-horizontal-2.png',
  },
  {
    id: '29',
    name: 'PowerSearch',
    description:
      'Command-palette style search with grouped results and keyboard nav.',
    category: 'Data',
    type: 'Pattern',
    imageUrl:
      '/template-assets/colorful-product-2.png',
  },
  {
    id: '30',
    name: 'Typeahead',
    description:
      'Autocomplete input with async suggestion loading and selection.',
    category: 'Data',
    type: 'Component',
    imageUrl:
      '/template-assets/moody-working-horizontal-3.png',
  },
];

const thumbnailWrapper: CSSProperties = {
  position: 'relative',
  aspectRatio: '16/9',
  overflow: 'clip',
  flexShrink: 0,
};
const thumbnailImage: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

// =============================================================================
// Side Nav
// =============================================================================

function LibraryCard({item}: {item: LibraryItem}) {
  return (
    <Card padding={0}>
      <div style={thumbnailWrapper}>
        <img src={item.imageUrl} alt={item.name} style={thumbnailImage} />
      </div>
      <Section variant="transparent" padding={4}>
        <VStack gap={1}>
          <Heading level={3}>{item.name}</Heading>
          <Text type="body" size="sm" color="secondary">
            {item.description}
          </Text>
        </VStack>
      </Section>
    </Card>
  );
}

function LibrarySection({
  category,
  items,
}: {
  category: string;
  items: LibraryItem[];
}) {
  return (
    <VStack gap={6}>
      <Heading level={2}>{category}</Heading>
      <Grid columns={{minWidth: 320}} gap={4}>
        {items.map(item => (
          <LibraryCard key={item.id} item={item} />
        ))}
      </Grid>
    </VStack>
  );
}

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('A-Z');

  const filtered = useMemo(() => {
    let items =
      activeTab === 'All' ? ITEMS : ITEMS.filter(i => i.category === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        i =>
          i.name.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q),
      );
    }
    const sorted = [...items];
    if (sortOrder === 'A-Z') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOrder === 'Z-A') {
      sorted.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortOrder === 'Newest') {
      sorted.sort((a, b) => Number(b.id) - Number(a.id));
    }
    return sorted;
  }, [activeTab, search, sortOrder]);

  const groupedSections = useMemo(() => {
    if (activeTab !== 'All') {
      return null;
    }
    const order = CATEGORIES.filter(c => c !== 'All');
    const map = new Map<string, LibraryItem[]>();
    for (const item of filtered) {
      let group = map.get(item.category);
      if (!group) {
        group = [];
        map.set(item.category, group);
      }
      group.push(item);
    }
    return order
      .filter(cat => map.has(cat))
      .map(cat => ({category: cat, items: map.get(cat) ?? []}));
  }, [activeTab, filtered]);

  return (
    <Layout
      header={
        <LayoutHeader hasDivider padding={6}>
          <Heading level={1}>Library</Heading>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={6}>
          <VStack gap={6}>
            <VStack gap={4}>
              <TextInput
                label="Search"
                isLabelHidden
                placeholder="Search..."
                value={search}
                onChange={setSearch}
                startIcon={MagnifyingGlassIcon}
                size="lg"
              />
              <HStack vAlign="center" gap={4}>
                <StackItem size="fill">
                  <VStack>
                    <ToggleButtonGroup
                      label="Filter by category"
                      value={activeTab}
                      onChange={v => setActiveTab(v ?? 'All')}>
                      <OverflowList
                        gap={1}
                        behavior="observeParent"
                        overflowRenderer={overflowItems => (
                          <DropdownMenu
                            button={{
                              label: `+${overflowItems.length}`,
                              variant: 'ghost',
                              size: 'lg',
                            }}
                            items={overflowItems.map(({index}) => ({
                              label: CATEGORIES[index],
                              onClick: () => setActiveTab(CATEGORIES[index]),
                            }))}
                          />
                        )}>
                        {CATEGORIES.map(cat => (
                          <ToggleButton
                            key={cat}
                            label={cat}
                            value={cat}
                            size="lg"
                          />
                        ))}
                      </OverflowList>
                    </ToggleButtonGroup>
                  </VStack>
                </StackItem>
                <DropdownMenu
                  button={{label: sortOrder, size: 'lg'}}
                  items={[
                    {label: 'A-Z', onClick: () => setSortOrder('A-Z')},
                    {label: 'Z-A', onClick: () => setSortOrder('Z-A')},
                    {label: 'Newest', onClick: () => setSortOrder('Newest')},
                  ]}
                />
              </HStack>
            </VStack>

            {filtered.length === 0 ? (
              <Center>
                <Text type="supporting" color="secondary">
                  No results found.
                </Text>
              </Center>
            ) : (
              <VStack gap={6}>
                {(
                  groupedSections ?? [{category: activeTab, items: filtered}]
                ).flatMap(section => [
                  <Divider key={`d-${section.category}`} />,
                  <LibrarySection
                    key={section.category}
                    category={section.category}
                    items={section.items}
                  />,
                ])}
              </VStack>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
