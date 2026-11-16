// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * Access denied: the screen an app shows when the signed-in account may not
 * open a page. It names the resource and the account, has a request for
 * access with an optional note to the owner (a demo until the app sends it),
 * and offers another account or home.
 */

import {useState} from 'react';

import {Center} from '@astryxdesign/core/Center';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Divider} from '@astryxdesign/core/Divider';
import {Icon} from '@astryxdesign/core/Icon';
import {useToast} from '@astryxdesign/core/Toast';

import {LockClosedIcon} from '@heroicons/react/24/outline';

const RESOURCE = 'Quarterly forecast';
const ACCOUNT = {name: 'Riley Quinn', email: 'riley.quinn@example.com'};

export default function AccessDeniedPage() {
  const showToast = useToast();
  const [note, setNote] = useState('');
  const [isRequested, setIsRequested] = useState(false);

  return (
    <Center height="100%" padding={6}>
      <VStack gap={5} width="100%" maxWidth={480}>
        <EmptyState
          icon={<Icon icon={LockClosedIcon} size="lg" />}
          headingLevel={1}
          title="You don't have access"
          description={`You need permission to open ${RESOURCE}. Ask an owner for access, or switch to an account that has it.`}
        />
        <HStack gap={3} vAlign="center">
          <Avatar name={ACCOUNT.name} size="md" />
          <VStack gap={0}>
            <Text type="body" weight="bold">
              {ACCOUNT.name}
            </Text>
            <Text type="supporting" color="secondary">
              Signed in as {ACCOUNT.email}
            </Text>
          </VStack>
        </HStack>
        <Divider />
        <TextArea
          label="Message to the owner"
          isOptional
          placeholder="Say why you need access"
          value={note}
          onChange={setNote}
          rows={3}
        />
        {isRequested ? (
          // Demo only: replace this banner with the call that sends the
          // request and the note to the resource's owners.
          <Banner
            status="info"
            container="card"
            title="Demo: no request was sent"
            description={
              note.trim()
                ? `In your app, the request and your note would go to the owners of ${RESOURCE} here.`
                : `In your app, the request would go to the owners of ${RESOURCE} here.`
            }
          />
        ) : null}
        <VStack gap={2}>
          <Button
            label="Request access"
            variant="primary"
            onClick={() => setIsRequested(true)}
          />
          <Button
            label="Switch account"
            variant="secondary"
            onClick={() =>
              // Demo only: replace this toast with the app's account switcher.
              showToast({
                body: 'Demo: the account switcher would open here',
                uniqueID: 'switch-account',
              })
            }
          />
          <Button label="Go to home" variant="ghost" href="/" />
        </VStack>
      </VStack>
    </Center>
  );
}
