// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import {Section} from '@astryxdesign/core/Section';
import {
  Layout,
  LayoutHeader,
  LayoutFooter,
  LayoutContent,
  LayoutPanel,
  container,
  HStack,
  VStack,
} from '@astryxdesign/core/Layout';
import {Button} from '@astryxdesign/core/Button';
import {
  colorVars,
  spacingVars,
  typographyVars,
  radiusVars,
  shadowVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Theme} from '@astryxdesign/core';
import {stoneTheme} from '@astryxdesign/theme-stone';
import {neutralTheme} from '@astryxdesign/theme-neutral';

const styles = stylex.create({
  // Story wrapper styles
  pageWrapper: {
    height: 500,
    backgroundColor: colorVars['--color-background-body'],
    padding: spacingVars['--spacing-4'],
  },
  pageWrapperTall: {
    height: 600,
  },
  storySection: {
    padding: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-body'],
  },
  // Typography
  heading: {
    margin: 0,
    fontFamily: typographyVars['--font-family-body'],
    fontSize: 18,
    fontWeight: 600,
    color: colorVars['--color-text-primary'],
  },
  subheading: {
    margin: 0,
    fontFamily: typographyVars['--font-family-body'],
    fontSize: 14,
    fontWeight: 500,
    color: colorVars['--color-text-secondary'],
  },
  bodyText: {
    margin: 0,
    fontFamily: typographyVars['--font-family-body'],
    fontSize: 14,
    lineHeight: 1.5,
    color: colorVars['--color-text-secondary'],
  },
  // Panel content
  navItem: {
    padding: `${spacingVars['--spacing-2']} ${spacingVars['--spacing-3']}`,
    borderRadius: 6,
    cursor: 'pointer',
    color: colorVars['--color-text-primary'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: 14,
    backgroundColor: {
      default: 'transparent',
      ':hover': colorVars['--color-overlay-hover'],
    },
  },
  navItemActive: {
    backgroundColor: colorVars['--color-accent-muted'],
    color: colorVars['--color-text-accent'],
  },
  // Content placeholder
  placeholder: {
    backgroundColor: colorVars['--color-background-gray'],
    borderRadius: 8,
    padding: spacingVars['--spacing-4'],
    color: colorVars['--color-text-secondary'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: 14,
  },
  // Full bleed placeholder (no radius, no padding)
  placeholderFullBleed: {
    backgroundColor: colorVars['--color-background-gray'],
    padding: spacingVars['--spacing-4'],
    color: colorVars['--color-text-secondary'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: 14,
    minHeight: 100,
  },
  sectionLabel: {
    margin: `0 0 ${spacingVars['--spacing-2']} 0`,
    fontFamily: typographyVars['--font-family-body'],
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: colorVars['--color-text-secondary'],
  },
  // Demo container styling to visualize bounds
  demoContainer: {
    backgroundColor: colorVars['--color-background-card'],
    borderRadius: radiusVars['--radius-container'],
    boxShadow: shadowVars['--shadow-low'],
  },
  // Demo sizing for outer padding story
  demoSize: {
    width: 300,
    height: 220,
  },
  // contentWidth demo containers
  cwContainer: {
    border: '2px dashed',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    overflow: 'hidden',
  },
  cwContainerMatrix: {
    height: 240,
  },
  scrollbarProbeContent: {
    scrollbarGutter: 'stable',
  },
  cwContainer900: {
    width: 900,
  },
  cwContainer1200: {
    width: 1200,
  },
  cwContainer350: {
    width: 350,
  },
  cwContainer1000: {
    width: 1000,
  },
  cwContainer640: {
    width: 640,
  },
  cwContainer400: {
    width: 400,
  },
});

// Helper components for demo content
const NavItem = ({
  active,
  children,
}: {
  active?: boolean;
  children: React.ReactNode;
}) => (
  <div {...stylex.props(styles.navItem, active && styles.navItemActive)}>
    {children}
  </div>
);

const ScrollbarProbeContent = ({id, label}: {id: string; label: string}) => (
  <LayoutContent
    data-scrollbar-case={id}
    label={`${label} content`}
    role="region"
    tabIndex={0}
    xstyle={styles.scrollbarProbeContent}>
    <p {...stylex.props(styles.bodyText)}>
      Scroll this content to confirm its scrollbar stays on the outer edge of
      the content area.
    </p>
    {Array.from({length: 8}, (_, index) => (
      <div key={index} {...stylex.props(styles.placeholder)}>
        {label} content block {index + 1}
      </div>
    ))}
  </LayoutContent>
);

const meta: Meta<typeof Layout> = {
  title: 'Core/Layout',
  component: Layout,
  tags: ['autodocs'],
  parameters: {
    controls: {
      expanded: false,
    },
    docs: {
      description: {
        component: `
The Astryx Layout System provides a structured way to build page and component layouts.

**Components:**
- \`Card\` - Card container with shadow
- \`Section\` - Section container with background variants
- \`Layout\` - Arranges content into header, content, footer, and panel slots
- \`LayoutHeader\` - Header slot with optional divider
- \`LayoutContent\` - Scrollable main content area
- \`LayoutFooter\` - Footer slot with optional divider
- \`LayoutPanel\` - Side panel slots (start/end) with optional divider
        `,
      },
    },
  },
  // Hide auto-generated controls from Layout component
  argTypes: {
    content: {table: {disable: true}},
    end: {table: {disable: true}},
    footer: {table: {disable: true}},
    header: {table: {disable: true}},
    height: {table: {disable: true}},
    padding: {table: {disable: true}},
    start: {table: {disable: true}},
  },
};

export default meta;
type Story = StoryObj<typeof Layout>;

// =============================================================================
// Interactive Playground
// =============================================================================

type SpacingStep = 0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10;

interface PlaygroundArgs {
  // Card props
  cardWidth: number;
  cardHeight: number;
  // Layout props
  layoutPadding: SpacingStep;
  // Header props
  showHeader: boolean;
  headerHasDivider: boolean;
  headerPadding: SpacingStep;
  // Content props
  contentPadding: SpacingStep;
  contentIsScrollable: boolean;
  // Footer props
  showFooter: boolean;
  footerHasDivider: boolean;
  footerPadding: SpacingStep;
  // Start panel props
  showStartPanel: boolean;
  startPanelWidth: number;
  startPanelHasDivider: boolean;
  startPanelIsScrollable: boolean;
  // End panel props
  showEndPanel: boolean;
  endPanelWidth: number;
  endPanelHasDivider: boolean;
  endPanelIsScrollable: boolean;
}

export const Playground = {
  name: 'Playground',
  args: {
    // Card defaults
    cardWidth: 700,
    cardHeight: 400,
    // Layout defaults
    layoutPadding: 4,
    // Header defaults
    showHeader: true,
    headerHasDivider: true,
    headerPadding: 4,
    // Content defaults
    contentPadding: 4,
    contentIsScrollable: true,
    // Footer defaults
    showFooter: true,
    footerHasDivider: true,
    footerPadding: 4,
    // Start panel defaults
    showStartPanel: true,
    startPanelWidth: 160,
    startPanelHasDivider: true,
    startPanelIsScrollable: true,
    // End panel defaults
    showEndPanel: false,
    endPanelWidth: 200,
    endPanelHasDivider: true,
    endPanelIsScrollable: true,
  },
  argTypes: {
    // Card controls
    cardWidth: {
      control: {type: 'range', min: 300, max: 1000, step: 50},
      description: 'Width of the card container',
      table: {category: 'Card'},
    },
    cardHeight: {
      control: {type: 'range', min: 200, max: 600, step: 50},
      description: 'Height of the card container',
      table: {category: 'Card'},
    },
    // Layout controls
    layoutPadding: {
      control: {type: 'range', min: 0, max: 8, step: 1},
      description: 'Padding at layout outer edges (0 for full bleed)',
      table: {category: 'Layout'},
    },
    // Header controls
    showHeader: {
      control: 'boolean',
      description: 'Show or hide the header',
      table: {category: 'Header'},
    },
    headerHasDivider: {
      control: 'boolean',
      description: 'Add a border below the header',
      table: {category: 'Header'},
    },
    headerPadding: {
      control: {type: 'range', min: 0, max: 8, step: 1},
      description: 'Header padding (0 for full bleed)',
      table: {category: 'Header'},
    },
    // Content controls
    contentPadding: {
      control: {type: 'range', min: 0, max: 8, step: 1},
      description: 'Content padding (0 for edge-to-edge content)',
      table: {category: 'Content'},
    },
    contentIsScrollable: {
      control: 'boolean',
      description: 'Enable scrollable overflow',
      table: {category: 'Content'},
    },
    // Footer controls
    showFooter: {
      control: 'boolean',
      description: 'Show or hide the footer',
      table: {category: 'Footer'},
    },
    footerHasDivider: {
      control: 'boolean',
      description: 'Add a border above the footer',
      table: {category: 'Footer'},
    },
    footerPadding: {
      control: {type: 'range', min: 0, max: 8, step: 1},
      description: 'Footer padding (0 for full bleed)',
      table: {category: 'Footer'},
    },
    // Start panel controls
    showStartPanel: {
      control: 'boolean',
      description: 'Show or hide the start (left) panel',
      table: {category: 'Start Panel'},
    },
    startPanelWidth: {
      control: {type: 'range', min: 100, max: 300, step: 20},
      description: 'Width of the start panel',
      table: {category: 'Start Panel'},
    },
    startPanelHasDivider: {
      control: 'boolean',
      description: 'Add a border to the start panel',
      table: {category: 'Start Panel'},
    },
    startPanelIsScrollable: {
      control: 'boolean',
      description: 'Enable scrollable overflow for start panel',
      table: {category: 'Start Panel'},
    },
    // End panel controls
    showEndPanel: {
      control: 'boolean',
      description: 'Show or hide the end (right) panel',
      table: {category: 'End Panel'},
    },
    endPanelWidth: {
      control: {type: 'range', min: 100, max: 300, step: 20},
      description: 'Width of the end panel',
      table: {category: 'End Panel'},
    },
    endPanelHasDivider: {
      control: 'boolean',
      description: 'Add a border to the end panel',
      table: {category: 'End Panel'},
    },
    endPanelIsScrollable: {
      control: 'boolean',
      description: 'Enable scrollable overflow for end panel',
      table: {category: 'End Panel'},
    },
  },
  render: (args: PlaygroundArgs) => (
    <div {...stylex.props(styles.pageWrapper)}>
      <Card width={args.cardWidth} height={args.cardHeight}>
        <Layout
          padding={args.layoutPadding}
          header={
            args.showHeader ? (
              <LayoutHeader
                hasDivider={args.headerHasDivider}
                padding={args.headerPadding}>
                <h3 {...stylex.props(styles.heading)}>Layout Header</h3>
              </LayoutHeader>
            ) : undefined
          }
          start={
            args.showStartPanel ? (
              <LayoutPanel
                width={args.startPanelWidth}
                hasDivider={args.startPanelHasDivider}
                isScrollable={args.startPanelIsScrollable}
                role="navigation">
                <NavItem active>Dashboard</NavItem>
                <NavItem>Settings</NavItem>
                <NavItem>Profile</NavItem>
                <NavItem>Help</NavItem>
              </LayoutPanel>
            ) : undefined
          }
          content={
            <LayoutContent
              padding={args.contentPadding}
              isScrollable={args.contentIsScrollable}>
              <h4 {...stylex.props(styles.subheading)}>Main Content Area</h4>
              <br />
              <p {...stylex.props(styles.bodyText)}>
                This is the main content area. Use the controls panel to toggle
                headers, footers, side panels, and adjust their properties.
              </p>
              <br />
              <p {...stylex.props(styles.bodyText)}>
                Try setting padding to 0 to see how content can extend to the
                edges, or toggle &quot;isScrollable&quot; to change overflow
                behavior.
              </p>
              <br />
              <div {...stylex.props(styles.placeholder)}>
                Placeholder content block
              </div>
            </LayoutContent>
          }
          end={
            args.showEndPanel ? (
              <LayoutPanel
                width={args.endPanelWidth}
                hasDivider={args.endPanelHasDivider}
                isScrollable={args.endPanelIsScrollable}
                role="complementary">
                <p {...stylex.props(styles.sectionLabel)}>Details</p>
                <p {...stylex.props(styles.bodyText)}>
                  Additional information or actions can go in the end panel.
                </p>
              </LayoutPanel>
            ) : undefined
          }
          footer={
            args.showFooter ? (
              <LayoutFooter
                hasDivider={args.footerHasDivider}
                padding={args.footerPadding}>
                <HStack gap={2} hAlign="end">
                  <Button label="Cancel" variant="secondary">
                    Cancel
                  </Button>
                  <Button label="Save" variant="primary">
                    Save
                  </Button>
                </HStack>
              </LayoutFooter>
            ) : undefined
          }
        />
      </Card>
    </div>
  ),
};

// =============================================================================
// Example Stories
// =============================================================================

export const BasicCard: Story = {
  name: 'Basic Card Layout',
  render: () => (
    <div {...stylex.props(styles.pageWrapper)}>
      <Card width={400} height={350}>
        <Layout
          header={
            <LayoutHeader hasDivider>
              <h3 {...stylex.props(styles.heading)}>Card Title</h3>
            </LayoutHeader>
          }
          content={
            <LayoutContent>
              <p {...stylex.props(styles.bodyText)}>
                This is a basic card layout with a header, scrollable content
                area, and footer. The layout automatically handles padding and
                spacing between sections.
              </p>
              <br />
              <p {...stylex.props(styles.bodyText)}>
                Try scrolling this content area when it overflows.
              </p>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <HStack gap={2} hAlign="end">
                <Button label="Cancel" variant="secondary">
                  Cancel
                </Button>
                <Button label="Save" variant="primary">
                  Save
                </Button>
              </HStack>
            </LayoutFooter>
          }
        />
      </Card>
    </div>
  ),
};

export const WithSidebar: Story = {
  name: 'Layout with Sidebar',
  render: () => (
    <div {...stylex.props(styles.pageWrapper)}>
      <Card width={700} height={400}>
        <Layout
          header={
            <LayoutHeader hasDivider>
              <h3 {...stylex.props(styles.heading)}>Settings</h3>
            </LayoutHeader>
          }
          start={
            <LayoutPanel hasDivider role="navigation">
              <NavItem active>General</NavItem>
              <NavItem>Account</NavItem>
              <NavItem>Privacy</NavItem>
              <NavItem>Notifications</NavItem>
              <NavItem>Security</NavItem>
            </LayoutPanel>
          }
          content={
            <LayoutContent>
              <h4 {...stylex.props(styles.subheading)}>General Settings</h4>
              <br />
              <p {...stylex.props(styles.bodyText)}>
                Configure your general preferences here. The sidebar navigation
                allows you to switch between different settings sections.
              </p>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <HStack gap={2} hAlign="end">
                <Button label="Reset" variant="secondary">
                  Reset
                </Button>
                <Button label="Save Changes" variant="primary">
                  Save Changes
                </Button>
              </HStack>
            </LayoutFooter>
          }
        />
      </Card>
    </div>
  ),
};

export const DualPanels: Story = {
  name: 'Dual Panel Layout',
  render: () => (
    <div {...stylex.props(styles.pageWrapper, styles.pageWrapperTall)}>
      <Card width="100%" maxWidth={800} height={400}>
        <Layout
          header={
            <LayoutHeader hasDivider>
              <h3 {...stylex.props(styles.heading)}>File Browser</h3>
            </LayoutHeader>
          }
          start={
            <LayoutPanel hasDivider>
              <p {...stylex.props(styles.sectionLabel)}>Folders</p>
              <NavItem>Documents</NavItem>
              <NavItem active>Projects</NavItem>
              <NavItem>Downloads</NavItem>
            </LayoutPanel>
          }
          content={
            <LayoutContent>
              <p {...stylex.props(styles.sectionLabel)}>Files</p>
              <div {...stylex.props(styles.placeholder)}>
                Select a folder to view its contents
              </div>
            </LayoutContent>
          }
          end={
            <LayoutPanel hasDivider>
              <p {...stylex.props(styles.sectionLabel)}>Details</p>
              <p {...stylex.props(styles.bodyText)}>
                Select a file to view details
              </p>
            </LayoutPanel>
          }
        />
      </Card>
    </div>
  ),
};

export const NoDividers: Story = {
  name: 'Without Dividers',
  render: () => (
    <div {...stylex.props(styles.pageWrapper)}>
      <Card width={400} height={350}>
        <Layout
          header={
            <LayoutHeader>
              <h3 {...stylex.props(styles.heading)}>Seamless Layout</h3>
            </LayoutHeader>
          }
          content={
            <LayoutContent>
              <p {...stylex.props(styles.bodyText)}>
                When dividers are not used, the layout automatically collapses
                spacing between sections for a smooth visual flow.
              </p>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label="Continue" variant="primary">
                  Continue
                </Button>
              </HStack>
            </LayoutFooter>
          }
        />
      </Card>
    </div>
  ),
};

export const FullBleedContent: Story = {
  name: 'Full Bleed Content',
  render: () => (
    <div {...stylex.props(styles.pageWrapper)}>
      <Card width={400} height={350}>
        <Layout
          header={
            <LayoutHeader hasDivider>
              <h3 {...stylex.props(styles.heading)}>Full Bleed Example</h3>
            </LayoutHeader>
          }
          content={
            <LayoutContent padding={0}>
              <div {...stylex.props(styles.placeholderFullBleed)}>
                This content uses padding=0 to remove padding, allowing it to
                touch the edges. Useful for tables, images, or other
                edge-to-edge content.
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <HStack gap={2} hAlign="end">
                <Button label="Close" variant="secondary">
                  Close
                </Button>
              </HStack>
            </LayoutFooter>
          }
        />
      </Card>
    </div>
  ),
};

export const SectionVariants: Story = {
  name: 'Section Variants',
  render: () => (
    <VStack gap={6} xstyle={styles.storySection}>
      <p {...stylex.props(styles.sectionLabel)}>Section Variants</p>
      <HStack gap={4} wrap="wrap">
        <Section variant="section" width={300} height={250}>
          <Layout
            header={
              <LayoutHeader hasDivider>
                <p {...stylex.props(styles.subheading)}>Section</p>
              </LayoutHeader>
            }
            content={
              <LayoutContent>
                <p {...stylex.props(styles.bodyText)}>
                  Surface background color
                </p>
              </LayoutContent>
            }
          />
        </Section>

        <Section variant="muted" width={300} height={250}>
          <Layout
            header={
              <LayoutHeader hasDivider>
                <p {...stylex.props(styles.subheading)}>Wash</p>
              </LayoutHeader>
            }
            content={
              <LayoutContent>
                <p {...stylex.props(styles.bodyText)}>Wash background color</p>
              </LayoutContent>
            }
          />
        </Section>

        <Section variant="transparent" width={300} height={250}>
          <Layout
            header={
              <LayoutHeader hasDivider>
                <p {...stylex.props(styles.subheading)}>Transparent</p>
              </LayoutHeader>
            }
            content={
              <LayoutContent>
                <p {...stylex.props(styles.bodyText)}>
                  No background, shows parent
                </p>
              </LayoutContent>
            }
          />
        </Section>
      </HStack>
    </VStack>
  ),
};

export const ContentOnly: Story = {
  name: 'Content Only',
  render: () => (
    <div {...stylex.props(styles.pageWrapper)}>
      <Card width={400} height={350}>
        <Layout
          content={
            <LayoutContent>
              <h3 {...stylex.props(styles.heading)}>Simple Content</h3>
              <br />
              <p {...stylex.props(styles.bodyText)}>
                A layout can have just content without header or footer. This is
                useful for simple cards or content blocks.
              </p>
            </LayoutContent>
          }
        />
      </Card>
    </div>
  ),
};

export const ThemedLayout: Story = {
  name: 'Themed Layout (Neutral vs Stone)',
  render: () => (
    <HStack gap={6} xstyle={styles.storySection}>
      <VStack gap={3}>
        <p {...stylex.props(styles.sectionLabel)}>Stone Theme</p>
        <Theme theme={stoneTheme}>
          <Card width={400}>
            <Layout
              header={
                <LayoutHeader hasDivider>
                  <h3 {...stylex.props(styles.heading)}>Stone Theme</h3>
                </LayoutHeader>
              }
              content={
                <LayoutContent>
                  <p {...stylex.props(styles.bodyText)}>
                    This card uses the stone theme around the layout areas.
                  </p>
                </LayoutContent>
              }
              footer={
                <LayoutFooter hasDivider>
                  <HStack gap={2} hAlign="end">
                    <Button label="Cancel" variant="secondary">
                      Cancel
                    </Button>
                    <Button label="Save" variant="primary">
                      Save
                    </Button>
                  </HStack>
                </LayoutFooter>
              }
            />
          </Card>
        </Theme>
      </VStack>

      <VStack gap={3}>
        <p {...stylex.props(styles.sectionLabel)}>Neutral Theme</p>
        <Theme theme={neutralTheme}>
          <Card width={400}>
            <Layout
              header={
                <LayoutHeader hasDivider>
                  <h3 {...stylex.props(styles.heading)}>Neutral Theme</h3>
                </LayoutHeader>
              }
              content={
                <LayoutContent>
                  <p {...stylex.props(styles.bodyText)}>
                    This card uses the neutral theme around the layout areas.
                  </p>
                </LayoutContent>
              }
              footer={
                <LayoutFooter hasDivider>
                  <HStack gap={2} hAlign="end">
                    <Button label="Cancel" variant="secondary">
                      Cancel
                    </Button>
                    <Button label="Save" variant="primary">
                      Save
                    </Button>
                  </HStack>
                </LayoutFooter>
              }
            />
          </Card>
        </Theme>
      </VStack>
    </HStack>
  ),
};

export const OuterPaddingDemo: Story = {
  name: 'Outer Padding Demonstration',
  render: () => (
    <VStack gap={6} xstyle={styles.storySection}>
      <p {...stylex.props(styles.sectionLabel)}>Outer Padding</p>
      <p {...stylex.props(styles.bodyText)}>
        Outer padding creates space between the container edge and the layout
        content. Notice how the dividers are inset from the container edges as
        outer padding increases.
      </p>
      <HStack gap={4} wrap="wrap">
        <VStack gap={2}>
          <p {...stylex.props(styles.subheading)}>paddingOuterX/Y = spacing0</p>
          <div
            {...stylex.props(
              ...container({
                paddingOuterX: 'spacing0',
                paddingOuterY: 'spacing0',
              }),
              styles.demoContainer,
              styles.demoSize,
            )}>
            <Layout
              header={
                <LayoutHeader hasDivider>
                  <p {...stylex.props(styles.subheading)}>Header</p>
                </LayoutHeader>
              }
              content={
                <LayoutContent>
                  <p {...stylex.props(styles.bodyText)}>
                    Dividers touch container edges.
                  </p>
                </LayoutContent>
              }
              footer={
                <LayoutFooter hasDivider>
                  <p {...stylex.props(styles.bodyText)}>Footer</p>
                </LayoutFooter>
              }
            />
          </div>
        </VStack>

        <VStack gap={2}>
          <p {...stylex.props(styles.subheading)}>paddingOuterX/Y = spacing4</p>
          <div
            {...stylex.props(
              ...container({
                paddingOuterX: 'spacing4',
                paddingOuterY: 'spacing4',
              }),
              styles.demoContainer,
              styles.demoSize,
            )}>
            <Layout
              header={
                <LayoutHeader hasDivider>
                  <p {...stylex.props(styles.subheading)}>Header</p>
                </LayoutHeader>
              }
              content={
                <LayoutContent>
                  <p {...stylex.props(styles.bodyText)}>
                    16px inset from edges.
                  </p>
                </LayoutContent>
              }
              footer={
                <LayoutFooter hasDivider>
                  <p {...stylex.props(styles.bodyText)}>Footer</p>
                </LayoutFooter>
              }
            />
          </div>
        </VStack>

        <VStack gap={2}>
          <p {...stylex.props(styles.subheading)}>paddingOuterX/Y = spacing7</p>
          <div
            {...stylex.props(
              ...container({
                paddingOuterX: 'spacing7',
                paddingOuterY: 'spacing7',
              }),
              styles.demoContainer,
              styles.demoSize,
            )}>
            <Layout
              header={
                <LayoutHeader hasDivider>
                  <p {...stylex.props(styles.subheading)}>Header</p>
                </LayoutHeader>
              }
              content={
                <LayoutContent>
                  <p {...stylex.props(styles.bodyText)}>
                    48px inset from edges.
                  </p>
                </LayoutContent>
              }
              footer={
                <LayoutFooter hasDivider>
                  <p {...stylex.props(styles.bodyText)}>Footer</p>
                </LayoutFooter>
              }
            />
          </div>
        </VStack>
      </HStack>
    </VStack>
  ),
};

// =============================================================================
// Content Width Stories
// =============================================================================

export const ContentWidthWithDividers: Story = {
  name: 'Content Width — Dividers, No Panels',
  render: () => (
    <VStack gap={4} xstyle={styles.storySection}>
      <p {...stylex.props(styles.sectionLabel)}>
        contentWidth=640 in a 900px container; dividers remain full-bleed while
        content is constrained
      </p>
      <div {...stylex.props(styles.cwContainer, styles.cwContainer900)}>
        <Layout
          contentWidth={640}
          defaultHasDividers
          header={
            <LayoutHeader>
              <h3 {...stylex.props(styles.heading)}>Header</h3>
              <p {...stylex.props(styles.bodyText)}>
                Header content is constrained to 640px
              </p>
            </LayoutHeader>
          }
          content={
            <LayoutContent>
              <p {...stylex.props(styles.bodyText)}>
                Main content is constrained to 640px and centered. The dividers
                above and below span the full width of the container.
              </p>
              <br />
              <div {...stylex.props(styles.placeholder)}>
                Placeholder content block
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label="Cancel" variant="secondary">
                  Cancel
                </Button>
                <Button label="Save" variant="primary">
                  Save
                </Button>
              </HStack>
            </LayoutFooter>
          }
        />
      </div>
    </VStack>
  ),
};

export const ContentWidthWithStartPanel: Story = {
  name: 'Content Width — Start Panel',
  render: () => (
    <VStack gap={4} xstyle={styles.storySection}>
      <p {...stylex.props(styles.sectionLabel)}>
        contentWidth=640 with a 200px start panel: the panel stays aligned while
        content extends to the open end edge
      </p>
      <div {...stylex.props(styles.cwContainer, styles.cwContainer900)}>
        <Layout
          contentWidth={640}
          defaultHasDividers
          header={
            <LayoutHeader>
              <h3 {...stylex.props(styles.heading)}>Settings</h3>
            </LayoutHeader>
          }
          start={
            <LayoutPanel width={200} hasDivider role="navigation">
              <NavItem active>General</NavItem>
              <NavItem>Account</NavItem>
              <NavItem>Privacy</NavItem>
              <NavItem>Notifications</NavItem>
            </LayoutPanel>
          }
          content={
            <LayoutContent>
              <h4 {...stylex.props(styles.subheading)}>General Settings</h4>
              <br />
              <p {...stylex.props(styles.bodyText)}>
                The start panel stays inside the centered 640px frame while the
                content area extends to the container&apos;s open end edge.
              </p>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label="Save Changes" variant="primary">
                  Save Changes
                </Button>
              </HStack>
            </LayoutFooter>
          }
        />
      </div>
    </VStack>
  ),
};

export const ContentWidthWithBothPanels: Story = {
  name: 'Content Width — Both Panels',
  render: () => (
    <VStack gap={4} xstyle={styles.storySection}>
      <p {...stylex.props(styles.sectionLabel)}>
        contentWidth=800 with start=200 and end=200 panels in a 1200px container
      </p>
      <div {...stylex.props(styles.cwContainer, styles.cwContainer1200)}>
        <Layout
          contentWidth={800}
          defaultHasDividers
          header={
            <LayoutHeader>
              <h3 {...stylex.props(styles.heading)}>File Browser</h3>
            </LayoutHeader>
          }
          start={
            <LayoutPanel width={200} hasDivider>
              <p {...stylex.props(styles.sectionLabel)}>Folders</p>
              <NavItem>Documents</NavItem>
              <NavItem active>Projects</NavItem>
              <NavItem>Downloads</NavItem>
            </LayoutPanel>
          }
          content={
            <LayoutContent>
              <p {...stylex.props(styles.sectionLabel)}>Files</p>
              <div {...stylex.props(styles.placeholder)}>
                Select a folder to view its contents
              </div>
            </LayoutContent>
          }
          end={
            <LayoutPanel width={200} hasDivider>
              <p {...stylex.props(styles.sectionLabel)}>Details</p>
              <p {...stylex.props(styles.bodyText)}>
                Select a file to view details
              </p>
            </LayoutPanel>
          }
          footer={
            <LayoutFooter>
              <p {...stylex.props(styles.bodyText)}>3 items</p>
            </LayoutFooter>
          }
        />
      </div>
    </VStack>
  ),
};

export const ContentWidthScrollbarPlacement: Story = {
  name: 'Content Width — Scrollbar Placement',
  tags: ['visual-baseline'],
  render: () => {
    const cases = [
      {
        id: 'none',
        label: 'No panels',
        start: undefined,
        end: undefined,
      },
      {
        id: 'start',
        label: 'Start panel only',
        start: (
          <LayoutPanel width={160} hasDivider>
            <NavItem active>Nav</NavItem>
          </LayoutPanel>
        ),
        end: undefined,
      },
      {
        id: 'both',
        label: 'Start and end panels',
        start: (
          <LayoutPanel width={160} hasDivider>
            <NavItem active>Nav</NavItem>
          </LayoutPanel>
        ),
        end: (
          <LayoutPanel width={160} hasDivider>
            <p {...stylex.props(styles.bodyText)}>Details</p>
          </LayoutPanel>
        ),
      },
      {
        id: 'end',
        label: 'End panel only',
        start: undefined,
        end: (
          <LayoutPanel width={160} hasDivider>
            <p {...stylex.props(styles.bodyText)}>Details</p>
          </LayoutPanel>
        ),
      },
    ];

    return (
      <VStack gap={6} xstyle={styles.storySection}>
        <p {...stylex.props(styles.sectionLabel)}>
          contentWidth=640 in a 900px container. With no panels, content spans
          the container and aligns internally. With exactly one panel, content
          extends through the opposite open area. The two-panel layout remains
          constrained. Header markers expose both alignment edges.
        </p>
        {cases.map(({id, label, start, end}) => (
          <VStack key={id} gap={2}>
            <p {...stylex.props(styles.subheading)}>{label}</p>
            <div
              data-scrollbar-layout={id}
              {...stylex.props(
                styles.cwContainer,
                styles.cwContainer900,
                styles.cwContainerMatrix,
              )}>
              <Layout
                contentWidth={640}
                header={
                  <LayoutHeader hasDivider>
                    <HStack hAlign="between">
                      <span data-header-edge="start">Header start</span>
                      <span data-header-edge="end">Header end</span>
                    </HStack>
                  </LayoutHeader>
                }
                start={start}
                content={<ScrollbarProbeContent id={id} label={label} />}
                end={end}
              />
            </div>
          </VStack>
        ))}
      </VStack>
    );
  },
};

export const ContentWidthNoDividers: Story = {
  name: 'Content Width — No Dividers',
  render: () => (
    <VStack gap={4} xstyle={styles.storySection}>
      <p {...stylex.props(styles.sectionLabel)}>
        contentWidth=640 without dividers: constraint works the same
      </p>
      <div {...stylex.props(styles.cwContainer, styles.cwContainer900)}>
        <Layout
          contentWidth={640}
          header={
            <LayoutHeader>
              <h3 {...stylex.props(styles.heading)}>Seamless Layout</h3>
            </LayoutHeader>
          }
          content={
            <LayoutContent>
              <p {...stylex.props(styles.bodyText)}>
                Even without dividers, the content is constrained to 640px and
                centered. The visual flow is continuous with no divider lines.
              </p>
              <br />
              <div {...stylex.props(styles.placeholder)}>
                Placeholder content block
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label="Continue" variant="primary">
                  Continue
                </Button>
              </HStack>
            </LayoutFooter>
          }
        />
      </div>
    </VStack>
  ),
};

export const ContentWidthNarrower: Story = {
  name: 'Content Width — Narrower Than Container',
  render: () => (
    <VStack gap={4} xstyle={styles.storySection}>
      <p {...stylex.props(styles.sectionLabel)}>
        contentWidth=400 in a 900px container: content is visibly centered
      </p>
      <div {...stylex.props(styles.cwContainer, styles.cwContainer900)}>
        <Layout
          contentWidth={400}
          defaultHasDividers
          header={
            <LayoutHeader>
              <h3 {...stylex.props(styles.heading)}>Narrow Content</h3>
            </LayoutHeader>
          }
          content={
            <LayoutContent>
              <p {...stylex.props(styles.bodyText)}>
                This content is constrained to 400px inside a 900px container.
                Notice the visible centering, great for focused forms or
                settings pages.
              </p>
              <br />
              <div {...stylex.props(styles.placeholder)}>
                Narrow placeholder block
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label="Submit" variant="primary">
                  Submit
                </Button>
              </HStack>
            </LayoutFooter>
          }
        />
      </div>
    </VStack>
  ),
};

export const ContentWidthWider: Story = {
  name: 'Content Width — Wider Than Container',
  render: () => (
    <VStack gap={4} xstyle={styles.storySection}>
      <p {...stylex.props(styles.sectionLabel)}>
        contentWidth=2000 in a 350px container, degrades gracefully to 100%
      </p>
      <div {...stylex.props(styles.cwContainer, styles.cwContainer350)}>
        <Layout
          contentWidth={2000}
          defaultHasDividers
          header={
            <LayoutHeader>
              <h3 {...stylex.props(styles.heading)}>Overflow</h3>
            </LayoutHeader>
          }
          content={
            <LayoutContent>
              <p {...stylex.props(styles.bodyText)}>
                The contentWidth is 2000px but the container is only 350px. The
                content fills 100% of the available space, with no overflow or
                scrollbar.
              </p>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <p {...stylex.props(styles.bodyText)}>Footer</p>
            </LayoutFooter>
          }
        />
      </div>
    </VStack>
  ),
};

export const ContentWidthResponsive: Story = {
  name: 'Content Width — Responsive Panels',
  render: () => (
    <VStack gap={6} xstyle={styles.storySection}>
      <p {...stylex.props(styles.sectionLabel)}>
        contentWidth=640 with a start panel at three container widths — 1000px,
        640px, and 400px
      </p>
      <HStack gap={4} wrap="wrap">
        <VStack gap={2}>
          <p {...stylex.props(styles.subheading)}>1000px container</p>
          <div {...stylex.props(styles.cwContainer, styles.cwContainer1000)}>
            <Layout
              contentWidth={640}
              defaultHasDividers
              header={
                <LayoutHeader>
                  <h3 {...stylex.props(styles.heading)}>Wide</h3>
                </LayoutHeader>
              }
              start={
                <LayoutPanel
                  width={160}
                  hasDivider
                  role="navigation"
                  label="Wide navigation">
                  <NavItem active>Dashboard</NavItem>
                  <NavItem>Settings</NavItem>
                </LayoutPanel>
              }
              content={
                <LayoutContent>
                  <p {...stylex.props(styles.bodyText)}>
                    Content is centered with room to spare.
                  </p>
                </LayoutContent>
              }
              footer={
                <LayoutFooter>
                  <p {...stylex.props(styles.bodyText)}>Footer</p>
                </LayoutFooter>
              }
            />
          </div>
        </VStack>

        <VStack gap={2}>
          <p {...stylex.props(styles.subheading)}>640px container</p>
          <div {...stylex.props(styles.cwContainer, styles.cwContainer640)}>
            <Layout
              contentWidth={640}
              defaultHasDividers
              header={
                <LayoutHeader>
                  <h3 {...stylex.props(styles.heading)}>Medium</h3>
                </LayoutHeader>
              }
              start={
                <LayoutPanel
                  width={160}
                  hasDivider
                  role="navigation"
                  label="Medium navigation">
                  <NavItem active>Dashboard</NavItem>
                  <NavItem>Settings</NavItem>
                </LayoutPanel>
              }
              content={
                <LayoutContent>
                  <p {...stylex.props(styles.bodyText)}>
                    Content fills the available space.
                  </p>
                </LayoutContent>
              }
              footer={
                <LayoutFooter>
                  <p {...stylex.props(styles.bodyText)}>Footer</p>
                </LayoutFooter>
              }
            />
          </div>
        </VStack>

        <VStack gap={2}>
          <p {...stylex.props(styles.subheading)}>400px container</p>
          <div {...stylex.props(styles.cwContainer, styles.cwContainer400)}>
            <Layout
              contentWidth={640}
              defaultHasDividers
              header={
                <LayoutHeader>
                  <h3 {...stylex.props(styles.heading)}>Narrow</h3>
                </LayoutHeader>
              }
              start={
                <LayoutPanel
                  width={160}
                  hasDivider
                  role="navigation"
                  label="Narrow navigation">
                  <NavItem active>Dashboard</NavItem>
                  <NavItem>Settings</NavItem>
                </LayoutPanel>
              }
              content={
                <LayoutContent>
                  <p {...stylex.props(styles.bodyText)}>Degrades to 100%.</p>
                </LayoutContent>
              }
              footer={
                <LayoutFooter>
                  <p {...stylex.props(styles.bodyText)}>Footer</p>
                </LayoutFooter>
              }
            />
          </div>
        </VStack>
      </HStack>
    </VStack>
  ),
};

export const ContentWidthInAppShell: Story = {
  name: 'Content Width — Nested in AppShell',
  render: () => (
    <VStack gap={4} xstyle={styles.storySection}>
      <p {...stylex.props(styles.sectionLabel)}>
        Layout with contentWidth=640 nested inside an AppShell
      </p>
      <div {...stylex.props(styles.cwContainer, styles.cwContainer900)}>
        <AppShell height="auto">
          <Layout
            contentWidth={640}
            defaultHasDividers
            header={
              <LayoutHeader>
                <h3 {...stylex.props(styles.heading)}>
                  App Shell + Content Width
                </h3>
              </LayoutHeader>
            }
            content={
              <LayoutContent>
                <p {...stylex.props(styles.bodyText)}>
                  This layout is nested inside an AppShell. The contentWidth
                  constraint applies to the inner layout while the app shell
                  provides the outer structure.
                </p>
                <br />
                <div {...stylex.props(styles.placeholder)}>
                  Placeholder content block
                </div>
              </LayoutContent>
            }
            footer={
              <LayoutFooter>
                <HStack gap={2} hAlign="end">
                  <Button label="Cancel" variant="secondary">
                    Cancel
                  </Button>
                  <Button label="Save" variant="primary">
                    Save
                  </Button>
                </HStack>
              </LayoutFooter>
            }
          />
        </AppShell>
      </div>
    </VStack>
  ),
};

const nestedStyles = stylex.create({
  frame390: {
    width: 390,
    height: 360,
  },
  frame960: {
    width: 960,
    height: 360,
  },
  frame320: {
    width: 320,
  },
});

/** A page Layout with a details panel, as it sits inside AppShell content. */
const OrdersPageLayout = ({panelWidth}: {panelWidth: number}) => (
  <Layout
    header={
      <LayoutHeader hasDivider>
        <h3 {...stylex.props(styles.heading)}>Orders</h3>
      </LayoutHeader>
    }
    end={
      <LayoutPanel
        hasDivider
        width={panelWidth}
        role="complementary"
        label="Order details">
        <VStack gap={2}>
          <p {...stylex.props(styles.subheading)}>Order #1042</p>
          <p {...stylex.props(styles.bodyText)}>Shipped · 3 items</p>
        </VStack>
      </LayoutPanel>
    }
    content={
      <LayoutContent>
        <p {...stylex.props(styles.bodyText)}>
          Select an order to see its shipping and payment details.
        </p>
      </LayoutContent>
    }
  />
);

/**
 * A Layout nested in AppShell content keeps its regions' default inset:
 * AppShell's own internal Layout is full bleed (`padding={0}`), and a
 * Layout's `padding` applies only to its own regions. The Card row shows the
 * unchanged path: a Layout inside a padded Card still takes the Card's inset.
 * One AppShell per story: each renders a `<main>` landmark.
 */
export const NestedInAppShell: Story = {
  name: 'Nested Layout — Inset in AppShell',
  render: () => (
    <VStack gap={4} xstyle={styles.storySection}>
      <p {...stylex.props(styles.sectionLabel)}>
        Page Layout with a details panel inside AppShell (no padding props),
        390px frame
      </p>
      <div {...stylex.props(styles.cwContainer, nestedStyles.frame390)}>
        <AppShell>
          <OrdersPageLayout panelWidth={150} />
        </AppShell>
      </div>
      <p {...stylex.props(styles.sectionLabel)}>
        Unchanged: Layout inside Card padding=2 takes the Card inset
      </p>
      <div {...stylex.props(nestedStyles.frame320)}>
        <Card padding={2}>
          <Layout
            height="auto"
            header={
              <LayoutHeader hasDivider>
                <h3 {...stylex.props(styles.heading)}>Card title</h3>
              </LayoutHeader>
            }
            content={
              <LayoutContent>
                <p {...stylex.props(styles.bodyText)}>
                  Header and content align to the Card&apos;s 8px inset.
                </p>
              </LayoutContent>
            }
          />
        </Card>
      </div>
    </VStack>
  ),
};

/** The same nested page Layout in a 960px AppShell frame. */
export const NestedInAppShellWide: Story = {
  name: 'Nested Layout — Inset in AppShell (960px)',
  render: () => (
    <VStack gap={4} xstyle={styles.storySection}>
      <p {...stylex.props(styles.sectionLabel)}>
        Page Layout with a details panel inside AppShell (no padding props),
        960px frame
      </p>
      <div {...stylex.props(styles.cwContainer, nestedStyles.frame960)}>
        <AppShell>
          <OrdersPageLayout panelWidth={320} />
        </AppShell>
      </div>
    </VStack>
  ),
};
