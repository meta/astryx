// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Collapsible, CollapsibleGroup} from '@astryxdesign/core/Collapsible';
import {Card} from '@astryxdesign/core/Card';
import {Text} from '@astryxdesign/core/Text';
import {Stack} from '@astryxdesign/core/Stack';

/**
 * One Collapsible per Card, several open at once so the reader can compare
 * across them — the case type="multiple" is for.
 *
 * Here the triggers keep their own `large` type: each is the heading of its
 * own surface, not a row in a list, so the 17px semibold is doing the job it
 * was sized for. Compare with the FAQ and Showcase examples, where the rows
 * share a surface and the questions step down to body-semibold.
 */
export default function CollapsibleMultipleAccordion() {
  return (
    <CollapsibleGroup type="multiple" defaultValue={['features', 'pricing']}>
      <Stack gap={2} maxWidth={440}>
        <Card>
          <Collapsible trigger="Features" value="features">
            <Text type="body" color="secondary">
              Real-time collaboration, full version history, and granular
              permissions. Every plan includes unlimited documents and unlimited
              guests — seats are counted for editors only.
            </Text>
          </Collapsible>
        </Card>

        <Card>
          <Collapsible trigger="Pricing" value="pricing">
            <Stack gap={2}>
              <Text type="body" color="secondary">
                Free for up to 5 editors. Pro is $12 per editor per month billed
                annually, or $15 month to month.
              </Text>
              <Text type="supporting">
                Non-profit and education pricing is 50% off any paid plan.
              </Text>
            </Stack>
          </Collapsible>
        </Card>

        <Card>
          <Collapsible trigger="Integrations" value="integrations">
            <Text type="body" color="secondary">
              Slack, GitHub, Jira, Figma, and 40 more through pre-built
              connectors, plus a REST API and outbound webhooks for anything not
              on the list.
            </Text>
          </Collapsible>
        </Card>
      </Stack>
    </CollapsibleGroup>
  );
}
