import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { CalendarChoice, writableCalendars } from '../calendarSync';
import { longDate, toISO } from '../core/dates';
import { Settings } from '../core/types';
import { useApp } from './AppContext';
import { Btn, C, Card, Chips, Field, H, Row, Sub, TimeField, Toggle } from './kit';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const isISO = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export default function SettingsScreen() {
  const { settings, cal, calSource, update, refresh, busy, state } = useApp();
  const [choices, setChoices] = useState<CalendarChoice[] | null>(null);
  const [closure, setClosure] = useState(toISO(new Date()));
  const [pause, setPause] = useState(settings.pauseUntil ?? '');
  const [url, setUrl] = useState(settings.calendarUrl);
  const set = (patch: Partial<Settings>, opts?: { forceSync?: boolean; forceDownload?: boolean }) =>
    update({ ...settings, ...patch }, opts);
  const cs = settings.calendarSync;

  const chooseCalendar = async () => {
    try {
      setChoices(await writableCalendars());
    } catch (e) {
      Alert.alert('Calendar', (e as Error).message);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Card>
        <H>Google Calendar and email</H>
        <Row label="Add return days to a calendar" hint="Choose your Gmail calendar and the events sync to Google Calendar everywhere">
          <Toggle value={cs.enabled} onChange={(v) => {
            if (v && !cs.calendarId) chooseCalendar();
            set({ calendarSync: { ...cs, enabled: v } }, { forceSync: true });
          }} />
        </Row>
        {cs.enabled ? (
          <>
            <Row label="Calendar" hint={cs.calendarLabel || 'Not chosen yet'}>
              <Btn small kind="ghost" title="Choose" onPress={chooseCalendar} />
            </Row>
            <Row label="Event time on the day" hint="Calendar alerts follow your reminder times">
              <TimeField allowOff={false} value={cs.eventTime} onChange={(v) => set({ calendarSync: { ...cs, eventTime: v } }, { forceSync: true })} />
            </Row>
            <Row label="Email reminder" hint="Google emails your Gmail the night before (Google accounts only)">
              <Toggle value={cs.emailReminder} onChange={(v) => set({ calendarSync: { ...cs, emailReminder: v } }, { forceSync: true })} />
            </Row>
            <View style={{ marginTop: 10 }}>
              <Btn small kind="ghost" title={busy ? 'Syncing…' : 'Sync now'} disabled={busy} onPress={async () => {
                const note = await refresh({ forceSync: true });
                if (note) Alert.alert('Calendar', note);
              }} />
            </View>
            <Sub style={{ marginTop: 6 }}>
              {state.calendarSyncedAt ? `Last synced ${new Date(state.calendarSyncedAt).toLocaleString()}` : 'Not synced yet'}
            </Sub>
          </>
        ) : null}
      </Card>

      <Card>
        <H>Smart features</H>
        <Row label="Weekly preview" hint="A summary of the coming week's school days">
          <Toggle value={settings.weeklyPreview.enabled} onChange={(v) => set({ weeklyPreview: { ...settings.weeklyPreview, enabled: v } })} />
        </Row>
        {settings.weeklyPreview.enabled ? (
          <View style={{ paddingVertical: 10, gap: 10 }}>
            <Chips options={[0, 1, 2, 3, 4, 5, 6]} value={settings.weeklyPreview.weekday} labels={(d) => WEEKDAYS[d]}
              onChange={(d) => set({ weeklyPreview: { ...settings.weeklyPreview, weekday: d } })} />
            <TimeField allowOff={false} value={settings.weeklyPreview.time}
              onChange={(v) => set({ weeklyPreview: { ...settings.weeklyPreview, time: v } })} />
          </View>
        ) : null}
        <Row label="Back-to-school heads-up" hint="Extra midday alert before the first day after a break">
          <Toggle value={settings.breakHeadsUp} onChange={(v) => set({ breakHeadsUp: v })} />
        </Row>
        <Row label="Learn my routine" hint="Suggests better reminder times from when you tap Packed">
          <Toggle value={settings.smartSuggestions} onChange={(v) => set({ smartSuggestions: v })} />
        </Row>
        <Text style={{ color: C.ink, marginTop: 12, marginBottom: 8 }}>Last-call nudge comes after the morning alert by</Text>
        <Chips options={[10, 20, 30, 45]} value={settings.followUpMinutes} labels={(m) => `${m} min`}
          onChange={(m) => set({ followUpMinutes: m })} />
      </Card>

      <Card>
        <H>Pause</H>
        <Text style={{ color: C.ink, marginBottom: 6 }}>No reminders up to and including (YYYY-MM-DD)</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Field style={{ flex: 1 }} value={pause} onChange={setPause} placeholder="e.g. 2027-03-19" />
          <Btn small title="Save" disabled={!!pause && !isISO(pause)} onPress={() => set({ pauseUntil: pause || null })} />
        </View>
        {settings.pauseUntil ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Text style={{ flex: 1, color: C.warn }}>Paused until {longDate(settings.pauseUntil)}</Text>
            <Btn small kind="ghost" title="Resume" onPress={() => { setPause(''); set({ pauseUntil: null }); }} />
          </View>
        ) : null}
      </Card>

      <Card>
        <H>School</H>
        <Row label="Days in the cycle">
          <Chips options={[4, 5, 6]} value={settings.cycleLength} onChange={(n) => set({ cycleLength: n })} />
        </Row>
        <Row label="Cycle count starts from" hint={`${longDate(settings.anchor.date)} = Day ${settings.anchor.day}. Change it from the Home tab.`}>
          <View />
        </Row>
        <Text style={{ color: C.ink, marginTop: 12, marginBottom: 6 }}>Snow days / unplanned closures</Text>
        {settings.extraClosures.map((d) => (
          <View key={d} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
            <Text style={{ flex: 1, color: C.ink }}>{longDate(d)}</Text>
            <Pressable onPress={() => set({ extraClosures: settings.extraClosures.filter((x) => x !== d) })}>
              <Text style={{ color: C.bad }}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Field style={{ flex: 1 }} value={closure} onChange={setClosure} placeholder="YYYY-MM-DD" />
          <Btn small title="Add" disabled={!isISO(closure)} onPress={() =>
            set({ extraClosures: [...new Set([...settings.extraClosures, closure])].sort() })} />
        </View>
        <Sub style={{ marginTop: 6 }}>The cycle continues where it stopped. If the school skips ahead instead, fix it on the Home tab.</Sub>

        <Text style={{ color: C.ink, marginTop: 16, marginBottom: 6 }}>School calendar feed</Text>
        <Field value={url} onChange={setUrl} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Btn small kind="ghost" title={busy ? 'Updating…' : 'Update calendar now'} disabled={busy} onPress={() =>
            url !== settings.calendarUrl ? set({ calendarUrl: url }, { forceDownload: true }) : refresh({ forceDownload: true })} />
        </View>
        <Sub style={{ marginTop: 6 }}>
          Using the {calSource}: school year {cal?.firstDay ?? '?'} to {cal?.lastDay ?? '?'}.
        </Sub>
      </Card>

      <Modal visible={choices !== null} transparent animationType="fade" onRequestClose={() => setChoices(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 20 }}>
          <Card style={{ maxHeight: '80%' }}>
            <H>Choose a calendar</H>
            <Sub style={{ marginBottom: 8 }}>Pick the one with your Gmail address to see events in Google Calendar.</Sub>
            <ScrollView>
              {(choices ?? []).map((c) => (
                <Pressable key={c.id} onPress={() => {
                  setChoices(null);
                  set({ calendarSync: { ...cs, enabled: true, calendarId: c.id, calendarLabel: c.label } }, { forceSync: true });
                }} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <Text style={{ fontSize: 16, color: C.ink }}>{c.label}</Text>
                  {c.email ? <Sub>Supports email reminders</Sub> : null}
                </Pressable>
              ))}
              {choices?.length === 0 ? <Sub>No calendars you can add events to. Add your Google account in phone Settings.</Sub> : null}
            </ScrollView>
            <View style={{ marginTop: 10 }}><Btn kind="ghost" title="Cancel" onPress={() => setChoices(null)} /></View>
          </Card>
        </View>
      </Modal>
    </ScrollView>
  );
}
