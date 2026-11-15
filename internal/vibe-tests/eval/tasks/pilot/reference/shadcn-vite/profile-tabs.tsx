// Copyright (c) Meta Platforms, Inc. and affiliates.

import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';

export default function App() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Ada Lovelace</h1>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <h2>Overview</h2>
        </TabsContent>
        <TabsContent value="activity">
          <h2>Recent activity</h2>
        </TabsContent>
        <TabsContent value="settings">
          <h2>Account settings</h2>
        </TabsContent>
      </Tabs>
    </div>
  );
}
