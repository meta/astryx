// Copyright (c) Meta Platforms, Inc. and affiliates.
import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {Table, useTableActivation} from '@astryxdesign/core';
const rows = Array.from({length: 8}, (_, index) => ({
  id: String(index),
  name: `Product ${index + 1}`,
}));
const meta: Meta = {
  title: 'Core/Table activation',
  component: Table,
};
export default meta;
function Example() {
  const [activeKey, setActiveKey] = useState<string | number | null>('1');
  const activation = useTableActivation({
    activeKey,
    onActivate: (_item, key) => setActiveKey(key),
  });
  return (
    <Table
      data={rows}
      columns={[{key: 'name', header: 'Product'}]}
      idKey="id"
      plugins={{activation}}
      hasHover
      isStriped
    />
  );
}
export const ControlledActivation: StoryObj = {
  render: () => <Example />,
};
