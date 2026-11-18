// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="category">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="category" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(option => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
      </div>
      <p>{results.length} products</p>
      {results.length === 0 ? (
        <p>No products match</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {results.map(product => (
            <Card key={product.name}>
              <CardHeader>
                <CardTitle>{product.name}</CardTitle>
                <CardDescription>{product.category}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
