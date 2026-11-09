// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it} from 'vitest';
import {expectFieldInputProps} from '../Field/fieldInputFamily.testing';
import {describeFieldInputParts} from '../Field/fieldInputFamily.render-testing';
import {FileInput, type FileInputProps} from './FileInput';

describe('FileInput props type (family:input-fields FR10)', () => {
  it('accepts container* and control* and no root styling', () => {
    expectFieldInputProps<FileInputProps>();
  });
});

describeFieldInputParts('FileInput', {
  renderMember: props => (
    <FileInput label="Resume" value={null} onChange={() => {}} {...props} />
  ),
  getControl: () => document.querySelector<HTMLElement>('input[type="file"]')!,
  inGroup: false,
  controlReferencesDescription: false,
});
