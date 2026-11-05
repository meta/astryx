// Copyright (c) Meta Platforms, Inc. and affiliates.

export const docs = {
  name: 'AnatomyOverrideFixture',
  displayName: 'Anatomy Override Fixture',
  category: 'Test',
  usage: {
    description: 'A multiline field for longer text.',
    anatomy: [
      {
        name: 'Field',
        required: true,
        description: 'The multiline text entry area.',
      },
      {
        name: 'Resize handle',
        required: false,
        description: 'Lets the user change the field height.',
      },
    ],
  },
  props: [],
};

export const docsZh = {
  name: 'AnatomyOverrideFixture',
  displayName: 'Anatomy Override Fixture',
  category: 'Test',
  usage: {
    description: '用于输入较长文本的多行字段。',
    anatomy: [
      {
        name: '文本区域',
        required: true,
        description: '用于输入多行文本的区域。',
      },
      {
        name: '调整大小控件',
        required: false,
        description: '允许用户调整字段高度。',
      },
    ],
  },
  props: [],
};
