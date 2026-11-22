import React from 'react';
import { FlatList, Text, View } from 'react-native';

import { useApp } from './AppContext';
import { C, Sub } from './kit';

export default function HistoryScreen() {
  const { state } = useApp();
  const items = [...state.log].reverse();
  return (
    <FlatList
      data={items}
      keyExtractor={(_, i) => String(i)}
      contentContainerStyle={{ padding: 16 }}
      ListEmptyComponent={<Sub>Nothing yet. Reminders, packing and syncs show up here.</Sub>}
      renderItem={({ item }) => (
        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <Text style={{ color: C.sub, fontSize: 12 }}>{new Date(item.at).toLocaleString()}</Text>
          <Text style={{ color: C.ink, fontSize: 15 }}>{item.text}</Text>
        </View>
      )}
    />
  );
}
