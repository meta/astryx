// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useCallback, useState, type CSSProperties} from 'react';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {Avatar} from '@astryxdesign/core/Avatar';
import {AvatarGroup} from '@astryxdesign/core/AvatarGroup';
import {Blockquote} from '@astryxdesign/core/Blockquote';
import {Breadcrumbs, BreadcrumbItem} from '@astryxdesign/core/Breadcrumbs';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {Icon} from '@astryxdesign/core/Icon';
import {List, ListItem} from '@astryxdesign/core/List';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {Outline, type OutlineItem} from '@astryxdesign/core/Outline';
import {Selector} from '@astryxdesign/core/Selector';
import {HStack, VStack, StackItem} from '@astryxdesign/core/Stack';
import {Layout, LayoutContent, LayoutPanel} from '@astryxdesign/core/Layout';
import {Table} from '@astryxdesign/core/Table';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {useToast} from '@astryxdesign/core/Toast';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  ArrowDownTrayIcon,
  ShareIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

const SECTIONS: OutlineItem[] = [
  {id: 'summary', label: 'Summary', level: 2},
  {id: 'context', label: 'Context', level: 2},
  {id: 'options', label: 'Options considered', level: 2},
  {id: 'decision', label: 'Decision', level: 2},
  {id: 'consequences', label: 'Consequences', level: 2},
  {id: 'rollout', label: 'Rollout', level: 3},
  {id: 'references', label: 'References', level: 2},
];

const SECTION_OPTIONS = SECTIONS.map(section => ({
  value: section.id,
  label: section.label,
}));

const AUTHORS = [{name: 'Ana Ruiz'}, {name: 'Sam Lee'}, {name: 'Priya Nair'}];

type OptionRow = {
  id: string;
  option: string;
  effort: string;
  risk: string;
  verdict: string;
};

const OPTIONS: OptionRow[] = [
  {
    id: 'a',
    option: 'Keep tokens in each app',
    effort: 'None',
    risk: 'Drift between apps keeps growing',
    verdict: 'Rejected',
  },
  {
    id: 'b',
    option: 'Copy tokens by hand each release',
    effort: 'Low',
    risk: 'Manual steps get skipped',
    verdict: 'Rejected',
  },
  {
    id: 'c',
    option: 'One shared token pipeline',
    effort: 'Medium',
    risk: 'Needs an owner and a migration',
    verdict: 'Chosen',
  },
];

const RELATED = [
  'Token naming conventions',
  'Theme release checklist',
  'Color contrast review',
];

const REVIEWERS = [
  {name: 'Jordan Kim', status: 'Approved'},
  {name: 'Lee Chen', status: 'Requested changes'},
  {name: 'Maya Patel', status: 'Pending'},
];

const reviewerBadge = (status: string) =>
  status === 'Approved'
    ? 'success'
    : status === 'Pending'
      ? 'neutral'
      : 'warning';

const railPanel: CSSProperties = {
  position: 'sticky',
  top: 24,
  alignSelf: 'start',
};

export default function ReportPage() {
  const showToast = useToast();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [activeId, setActiveId] = useState<string | undefined>(SECTIONS[0]?.id);

  // Demo only: replace these toasts with the calls that perform each action.
  const demo = (body: string, uniqueID: string) => showToast({body, uniqueID});

  const copyLink = () => {
    void navigator.clipboard
      .writeText(window.location.href)
      .then(() => showToast({body: 'Link copied', uniqueID: 'copy'}));
  };

  const scrollToId = useCallback((id: string) => {
    setActiveId(id);
    document
      .getElementById(id)
      ?.scrollIntoView({behavior: 'smooth', block: 'start'});
  }, []);

  const related = (
    <VStack gap={2}>
      <Text type="label">Related documents</Text>
      <List density="compact">
        {RELATED.map(title => (
          <ListItem
            key={title}
            label={title}
            startContent={<Icon icon={DocumentTextIcon} size="sm" />}
            onClick={() =>
              demo(`Demo: “${title}” would open here.`, `open-${title}`)
            }
          />
        ))}
      </List>
    </VStack>
  );

  const reviewers = (
    <VStack gap={2}>
      <Text type="label">Reviewers</Text>
      <List density="compact">
        {REVIEWERS.map(reviewer => (
          <ListItem
            key={reviewer.name}
            label={reviewer.name}
            startContent={<Avatar name={reviewer.name} size="sm" />}
            endContent={
              <Badge
                label={reviewer.status}
                variant={reviewerBadge(reviewer.status)}
              />
            }
          />
        ))}
      </List>
    </VStack>
  );

  return (
    <Layout
      height="auto"
      contentWidth={1040}
      end={
        isMobile ? undefined : (
          <LayoutPanel
            isScrollable={false}
            label="On this page"
            role="complementary"
            style={railPanel}>
            <VStack gap={6}>
              <Outline items={SECTIONS} onActiveIdChange={setActiveId} />
              <Divider />
              {related}
              {reviewers}
            </VStack>
          </LayoutPanel>
        )
      }
      content={
        <LayoutContent isScrollable={false} padding={isMobile ? 4 : 8}>
          <VStack gap={8}>
            <VStack gap={3}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem
                  onClick={() =>
                    demo('Demo: the reports list would open here.', 'crumb')
                  }>
                  Reports
                </BreadcrumbItem>
                <BreadcrumbItem>Decision records</BreadcrumbItem>
              </Breadcrumbs>
              <HStack gap={3} vAlign="start" wrap="wrap">
                <StackItem size="fill">
                  <Heading level={1} type="display-2">
                    Adopt a shared design token pipeline
                  </Heading>
                </StackItem>
                <HStack gap={1} vAlign="center">
                  <Button
                    label="Share"
                    variant="secondary"
                    icon={<Icon icon={ShareIcon} />}
                    isIconOnly={isMobile}
                    onClick={() =>
                      demo('Demo: a share dialog would open here.', 'share')
                    }
                  />
                  <Button
                    label="Export"
                    variant="secondary"
                    icon={<Icon icon={ArrowDownTrayIcon} />}
                    isIconOnly={isMobile}
                    onClick={() =>
                      demo('Demo: a PDF export would start here.', 'export')
                    }
                  />
                  <MoreMenu
                    presentation="adaptive"
                    items={[
                      {
                        label: 'Copy link',
                        onClick: copyLink,
                      },
                      {
                        label: 'Print',
                        onClick: () => window.print(),
                      },
                      {
                        label: 'Archive',
                        onClick: () =>
                          demo(
                            'Demo: the report would be archived here.',
                            'archive',
                          ),
                      },
                    ]}
                  />
                </HStack>
              </HStack>
              <HStack gap={3} vAlign="center" wrap="wrap">
                <Badge label="In review" variant="warning" />
                <AvatarGroup size="sm">
                  {AUTHORS.map(author => (
                    <Avatar key={author.name} name={author.name} />
                  ))}
                </AvatarGroup>
                <Text type="supporting" color="secondary">
                  Updated{' '}
                  <Timestamp value="2026-03-28T16:30:00Z" format="date" />
                </Text>
              </HStack>
              {isMobile && (
                <Selector
                  label="On this page"
                  isLabelHidden
                  options={SECTION_OPTIONS}
                  value={activeId}
                  onChange={scrollToId}
                  width="100%"
                />
              )}
            </VStack>

            <Card>
              <VStack gap={4}>
                <Heading id="summary" level={2}>
                  Summary
                </Heading>
                <Text type="body">
                  Every app keeps its own copy of the design tokens, so colors,
                  spacing and type drift apart between releases. This record
                  proposes one shared pipeline that builds the tokens once and
                  publishes them to every app.
                </Text>
                <MetadataList columns={isMobile ? 'single' : 'multi'}>
                  <MetadataListItem label="Type">
                    Decision record
                  </MetadataListItem>
                  <MetadataListItem label="Owner">Ana Ruiz</MetadataListItem>
                  <MetadataListItem label="Scope">
                    Web and mobile apps
                  </MetadataListItem>
                  <MetadataListItem label="Decision">
                    One shared pipeline
                  </MetadataListItem>
                </MetadataList>
              </VStack>
            </Card>

            <VStack gap={4}>
              <Heading id="context" level={2}>
                Context
              </Heading>
              <Text type="body">
                Three apps ship the same brand, but each one defines its tokens
                in its own repository. A color change takes a separate pull
                request in each app, and the apps rarely land them in the same
                week.
              </Text>
              <List listStyle="disc" density="compact">
                <ListItem
                  label={
                    <Text type="body">
                      Each release reviews tokens in three places.
                    </Text>
                  }
                />
                <ListItem
                  label={
                    <Text type="body">
                      Contrast fixes reach one app weeks before the others.
                    </Text>
                  }
                />
                <ListItem
                  label={
                    <Text type="body">
                      New apps copy whichever set they find first.
                    </Text>
                  }
                />
              </List>
            </VStack>

            <Divider />

            <VStack gap={4}>
              <Heading id="options" level={2}>
                Options considered
              </Heading>
              <Table
                data={OPTIONS}
                idKey="id"
                density="compact"
                columns={[
                  {key: 'option', header: 'Option'},
                  {key: 'effort', header: 'Effort'},
                  {key: 'risk', header: 'Main risk'},
                  {key: 'verdict', header: 'Verdict'},
                ]}
              />
            </VStack>

            <Divider />

            <VStack gap={4}>
              <Heading id="decision" level={2}>
                Decision
              </Heading>
              <Blockquote cite="Platform design review">
                Build the tokens once in a shared pipeline and publish them as a
                versioned package that every app installs.
              </Blockquote>
              <Text type="body">
                The pipeline owns the source of truth. Apps stop editing token
                values and take updates through a normal dependency upgrade.
              </Text>
            </VStack>

            <Divider />

            <VStack gap={4}>
              <Heading id="consequences" level={2}>
                Consequences
              </Heading>
              <Text type="body">
                Token changes become one reviewed change instead of three. Apps
                need a short migration to remove their local copies, and the
                pipeline needs an owner on the platform team.
              </Text>
              <Heading id="rollout" level={3}>
                Rollout
              </Heading>
              <List listStyle="decimal" density="compact">
                <ListItem
                  label={
                    <Text type="body">
                      Publish the first pipeline release beside the local
                      tokens.
                    </Text>
                  }
                />
                <ListItem
                  label={
                    <Text type="body">
                      Move one app and compare the rendered pages.
                    </Text>
                  }
                />
                <ListItem
                  label={
                    <Text type="body">
                      Move the other apps and delete the local copies.
                    </Text>
                  }
                />
              </List>
            </VStack>

            <Divider />

            <VStack gap={4}>
              <Heading id="references" level={2}>
                References
              </Heading>
              <List density="compact">
                {RELATED.map(title => (
                  <ListItem
                    key={title}
                    label={title}
                    startContent={<Icon icon={DocumentTextIcon} size="sm" />}
                    onClick={() =>
                      demo(`Demo: “${title}” would open here.`, `ref-${title}`)
                    }
                  />
                ))}
              </List>
            </VStack>

            {isMobile && (
              <VStack gap={6}>
                <Divider />
                {reviewers}
              </VStack>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
