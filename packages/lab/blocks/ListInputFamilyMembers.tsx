// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input Controlled family member records
 * @output A three-field ListInput (name, relationship, date of birth) whose
 *   records stack their fields when the list is narrow
 * @position Copyable Lab ListInput example
 */

import {useState} from 'react';
import type {ISODateString} from '@astryxdesign/core/Calendar';
import {DateInput} from '@astryxdesign/core/DateInput';
import {VStack} from '@astryxdesign/core/Layout';
import {Selector} from '@astryxdesign/core/Selector';
import {pixel, proportional} from '@astryxdesign/core/Table';
import {TextInput} from '@astryxdesign/core/TextInput';
import {ListInput, type ListInputColumn} from '@astryxdesign/lab';

type FamilyMember = {
  id: string;
  fullName: string;
  relationship: string;
  dateOfBirth: ISODateString | undefined;
};

const RELATIONSHIP_OPTIONS = [
  {value: 'spouse-or-partner', label: 'Spouse or partner'},
  {value: 'child', label: 'Child'},
  {value: 'parent', label: 'Parent'},
  {value: 'sibling', label: 'Sibling'},
  {value: 'other-dependent', label: 'Other dependent'},
];

const COLUMNS: ListInputColumn<FamilyMember>[] = [
  {
    key: 'fullName',
    header: 'Full legal name',
    width: proportional(2, {minWidth: 200}),
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
        label={label}
        isLabelHidden={isLabelHidden}
        value={item.fullName}
        onChange={fullName => updateItem({...item, fullName}, 'fullName')}
        status={status}
        statusVariant={statusVariant}
        isDisabled={isDisabled}
        isLoading={isLoading}
      />
    ),
  },
  {
    key: 'relationship',
    header: 'Relationship',
    width: proportional(1.25, {minWidth: 160}),
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
      <Selector
        label={label}
        isLabelHidden={isLabelHidden}
        options={RELATIONSHIP_OPTIONS}
        value={item.relationship}
        placeholder="Choose relationship"
        onChange={relationship =>
          updateItem({...item, relationship}, 'relationship')
        }
        status={status}
        statusVariant={statusVariant}
        isDisabled={isDisabled || isLoading}
      />
    ),
  },
  {
    key: 'dateOfBirth',
    header: 'Date of birth',
    width: pixel(176),
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
      <DateInput
        label={label}
        isLabelHidden={isLabelHidden}
        value={item.dateOfBirth}
        onChange={dateOfBirth =>
          updateItem({...item, dateOfBirth}, 'dateOfBirth')
        }
        status={status}
        statusVariant={statusVariant}
        isDisabled={isDisabled}
        isLoading={isLoading}
      />
    ),
  },
];

export default function ListInputFamilyMembers() {
  const [members, setMembers] = useState<FamilyMember[]>([
    {
      id: 'jordan',
      fullName: 'Jordan Lee',
      relationship: 'spouse-or-partner',
      dateOfBirth: '1988-11-02',
    },
    {
      id: 'alexandria',
      fullName: 'Alexandria María de la Cruz',
      relationship: 'child',
      dateOfBirth: '2012-06-24',
    },
    {
      id: 'grace',
      fullName: 'Grace Lee',
      relationship: 'parent',
      dateOfBirth: '1958-04-17',
    },
  ]);

  return (
    <VStack width={680} maxWidth="100%">
      <ListInput<FamilyMember>
        label="Family member declaration"
        description="Declare each immediate family member, their relationship to you, and their date of birth."
        value={members}
        onChange={setMembers}
        getItemKey={member => member.id}
        createItem={() => ({
          id: crypto.randomUUID(),
          fullName: '',
          relationship: '',
          dateOfBirth: undefined,
        })}
        columns={COLUMNS}
        itemName="family member"
        isRequired
      />
    </VStack>
  );
}
