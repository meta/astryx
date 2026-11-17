// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input Controlled subscriber records, starting empty
 * @output A one-column ListInput of email addresses with a six-record limit,
 *   duplicate detection, and blur validation
 * @position Copyable Lab ListInput example
 */

import {useMemo, useState} from 'react';
import {VStack} from '@astryxdesign/core/Layout';
import {TextInput} from '@astryxdesign/core/TextInput';
import {ListInput, type ListInputColumn} from '@astryxdesign/lab';

type Subscriber = {id: string; email: string};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function ListInputMailingList() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [hasChanged, setHasChanged] = useState(false);
  // Field errors wait until the field has been left once.
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());

  const columns = useMemo<ListInputColumn<Subscriber>[]>(
    () => [
      {
        key: 'email',
        header: 'Email address',
        renderInput: ({
          item,
          label,
          isLabelHidden,
          status,
          statusVariant,
          isDisabled,
          isLoading,
          updateItem,
        }) => (
          <TextInput
            type="email"
            label={label}
            isLabelHidden={isLabelHidden}
            value={item.email}
            placeholder="name@example.com"
            onChange={email => updateItem({...item, email}, 'email')}
            onBlur={() =>
              setTouched(current =>
                current.has(item.id) ? current : new Set(current).add(item.id),
              )
            }
            status={status}
            statusVariant={statusVariant}
            isDisabled={isDisabled}
            isLoading={isLoading}
          />
        ),
      },
    ],
    [],
  );

  return (
    <VStack width={680} maxWidth="100%">
      <ListInput<Subscriber>
        label="Mailing list"
        description="Add up to six addresses."
        value={subscribers}
        onChange={nextSubscribers => {
          setSubscribers(nextSubscribers);
          setHasChanged(true);
        }}
        getItemKey={subscriber => subscriber.id}
        createItem={() => ({id: crypto.randomUUID(), email: ''})}
        columns={columns}
        itemName="subscriber"
        isRequired
        maxItems={6}
        status={
          hasChanged && subscribers.length === 0
            ? {type: 'error', message: 'Add at least one subscriber.'}
            : undefined
        }
        getItemStatus={subscriber => {
          const email = subscriber.email.trim().toLowerCase();
          const isDuplicate =
            email !== '' &&
            subscribers.some(
              candidate =>
                candidate.id !== subscriber.id &&
                candidate.email.trim().toLowerCase() === email,
            );
          return isDuplicate
            ? {type: 'error', message: 'This address is already in the list.'}
            : undefined;
        }}
        getFieldStatus={subscriber => {
          if (!touched.has(subscriber.id)) {
            return undefined;
          }
          if (subscriber.email.trim() === '') {
            return {type: 'error', message: 'Enter an email address.'};
          }
          return isValidEmail(subscriber.email)
            ? undefined
            : {type: 'error', message: 'Enter a valid email address.'};
        }}
      />
    </VStack>
  );
}
