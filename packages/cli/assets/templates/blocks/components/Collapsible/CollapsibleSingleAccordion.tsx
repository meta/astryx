// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Collapsible, CollapsibleGroup} from '@astryxdesign/core/Collapsible';
import {Section} from '@astryxdesign/core/Section';
import {Text} from '@astryxdesign/core/Text';
import {Stack} from '@astryxdesign/core/Stack';

/**
 * type="single": opening one section closes the others, so only one body of
 * content competes for attention at a time. Use `defaultValue` to pre-expand
 * whichever section a first-time reader needs.
 *
 * Each Collapsible owns a Section, so the trigger is that section's heading
 * and keeps its own `large` type.
 */
export default function CollapsibleSingleAccordion() {
  return (
    <CollapsibleGroup type="single" defaultValue="general">
      <Stack gap={2} maxWidth={440}>
        <Section>
          <Collapsible trigger="General" value="general">
            <Text type="body" color="secondary">
              Language, time zone, and date format. Time zone drives every
              timestamp in the product, including exports and scheduled reports.
            </Text>
          </Collapsible>
        </Section>

        <Section>
          <Collapsible trigger="Privacy" value="privacy">
            <Text type="body" color="secondary">
              Control who can see your profile and activity. Turning off
              discovery also removes you from @-mention autocomplete for people
              outside your workspace.
            </Text>
          </Collapsible>
        </Section>

        <Section>
          <Collapsible trigger="Notifications" value="notifications">
            <Text type="body" color="secondary">
              Choose what you are notified about and how it reaches you.
              Mentions always come through; everything else can be batched into
              a daily digest.
            </Text>
          </Collapsible>
        </Section>
      </Stack>
    </CollapsibleGroup>
  );
}
