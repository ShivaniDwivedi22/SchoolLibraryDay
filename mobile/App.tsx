import './src/background';

import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { registerBackgroundRefresh } from './src/background';
import { setTaskStatus } from './src/engine';
import { ACTION_PACKED, ACTION_SNOOZE, setupNotifications, snooze } from './src/notify';
import { AppProvider, useApp } from './src/ui/AppContext';
import HistoryScreen from './src/ui/HistoryScreen';
import HomeScreen from './src/ui/HomeScreen';
import { C } from './src/ui/kit';
import RemindersScreen from './src/ui/RemindersScreen';
import SettingsScreen from './src/ui/SettingsScreen';

const TABS = [
  { key: 'home', label: 'Home', icon: '\u{1F3E0}' },
  { key: 'reminders', label: 'Reminders', icon: '\u{1F514}' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
  { key: 'history', label: 'History', icon: '\u{1F4DC}' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function useNotificationActions() {
  const { reload } = useApp();
  useEffect(() => {
    const handle = async (resp: Notifications.NotificationResponse | null) => {
      if (!resp) return;
      const { content, identifier } = resp.notification.request;
      const taskKey = content.data?.taskKey as string | undefined;
      if (!taskKey) return;
      if (resp.actionIdentifier === ACTION_PACKED) {
        await setTaskStatus(taskKey, 'packed', 'Packed from notification');
        await Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {});
      } else if (resp.actionIdentifier === ACTION_SNOOZE) {
        await snooze(content.title ?? 'Reminder', content.body ?? '', content.data ?? {});
        await Notifications.dismissNotificationAsync(identifier).catch(() => {});
      }
      await Notifications.clearLastNotificationResponseAsync();
      await reload();
    };
    Notifications.getLastNotificationResponseAsync().then(handle);
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [reload]);
}

function Shell() {
  const [tab, setTab] = useState<TabKey>('home');
  const { refresh } = useApp();
  useNotificationActions();
  useEffect(() => {
    (async () => {
      await setupNotifications();
      await registerBackgroundRefresh().catch(() => false);
      await refresh();
    })();
  }, [refresh]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: C.ink }}>
          {TABS.find((t) => t.key === tab)!.label === 'Home' ? 'School Day' : TABS.find((t) => t.key === tab)!.label}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'home' && <HomeScreen />}
        {tab === 'reminders' && <RemindersScreen />}
        {tab === 'settings' && <SettingsScreen />}
        {tab === 'history' && <HistoryScreen />}
      </View>
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line }}>
        <View style={{ flexDirection: 'row' }}>
          {TABS.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ fontSize: 20, opacity: tab === t.key ? 1 : 0.5 }}>{t.icon}</Text>
              <Text style={{ fontSize: 12, color: tab === t.key ? C.brand : C.sub, fontWeight: tab === t.key ? '700' : '400' }}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </SafeAreaProvider>
  );
}
