// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Selector} from '@astryxdesign/core/Selector';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';

const PRODUCTS = [
  {name: 'Notebook', category: 'Stationery'},
  {name: 'Pen set', category: 'Stationery'},
  {name: 'Desk lamp', category: 'Home'},
  {name: 'Throw blanket', category: 'Home'},
  {name: 'Headphones', category: 'Electronics'},
  {name: 'Phone stand', category: 'Electronics'},
  {name: 'Water bottle', category: 'Outdoor'},
  {name: 'Trail map', category: 'Outdoor'},
];
const CATEGORIES = ['All', 'Stationery', 'Home', 'Electronics', 'Outdoor'];

function filterProducts(category: string, query: string) {
  const needle = query.trim().toLowerCase();
  return PRODUCTS.filter(
    product =>
      (category === 'All' || product.category === category) &&
      product.name.toLowerCase().includes(needle),
  );
}

export default function App() {
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const results = filterProducts(category, query);
  return (
    <VStack gap={4} padding={6}>
      <HStack gap={3} wrap="wrap">
        <Selector
          label="Category"
          options={CATEGORIES}
          value={category}
          onChange={setCategory}
        />
        <TextInput
          type="search"
          label="Search"
          value={query}
          onChange={setQuery}
        />
      </HStack>
      <Text>{results.length} products</Text>
      {results.length === 0 ? (
        <Text>No products match</Text>
      ) : (
        <Grid columns={{minWidth: 180}} gap={3}>
          {results.map(product => (
            <Card key={product.name}>
              <VStack gap={1}>
                <Heading level={3}>{product.name}</Heading>
                <Text type="supporting">{product.category}</Text>
              </VStack>
            </Card>
          ))}
        </Grid>
      )}
    </VStack>
  );
}
