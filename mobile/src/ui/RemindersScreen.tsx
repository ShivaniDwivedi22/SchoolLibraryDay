import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { niceTime, parseHHMM } from '../core/dates';
import { newRule, Rule } from '../core/types';
import { useApp } from './AppContext';
import { Btn, C, Card, Chips, Field, H, Row, Sub, TimeField, Toggle } from './kit';

const TEMPLATES: { label: string; rule: Partial<Rule> }[] = [
  { label: 'Library book return', rule: { title: 'library book return day', items: 'the library book and its bag' } },
  { label: 'Library day', rule: { title: 'library day', items: '', nightBefore: '', morningOf: '07:00', followUp: false } },
  { label: 'Gym clothes', rule: { title: 'gym day', items: 'gym clothes and running shoes' } },
  { label: 'Music', rule: { title: 'music day', items: 'the instrument and music book' } },
  { label: 'Custom', rule: { title: '', items: '' } },
];

export default function RemindersScreen() {
  const { settings, update } = useApp();
  const [editing, setEditing] = useState<Rule | null>(null);
  const [picking, setPicking] = useState(false);
  const lastChild = settings.rules[settings.rules.length - 1]?.child ?? '';

  const save = (r: Rule) => {
    const exists = settings.rules.some((x) => x.id === r.id);
    update({ ...settings, rules: exists ? settings.rules.map((x) => (x.id === r.id ? r : x)) : [...settings.rules, r] });
    setEditing(null);
  };

  const children = [...new Set(settings.rules.map((r) => r.child || 'No name'))];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {children.map((child) => (
        <View key={child}>
          <H>{child}</H>
          {settings.rules.filter((r) => (r.child || 'No name') === child).map((r) => (
            <Pressable key={r.id} onPress={() => setEditing({ ...r })}>
              <Card style={{ opacity: r.enabled ? 1 : 0.5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ backgroundColor: C.brand, borderRadius: 10, width: 44, height: 44, alignItems: 'center',
                                 justifyContent: 'center', marginRight: 12 }}>
                    <Text style={{ color: '#fff', fontSize: 11 }}>DAY</Text>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{r.cycleDay}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{r.title || 'Untitled'}</Text>
                    <Sub>{describeTimes(r)}</Sub>
                  </View>
                  <Toggle value={r.enabled} onChange={(v) => update({
                    ...settings, rules: settings.rules.map((x) => (x.id === r.id ? { ...x, enabled: v } : x)),
                  })} />
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      ))}
      <Btn title="+ Add a reminder" onPress={() => setPicking(true)} />
      <Sub style={{ marginTop: 12 }}>
        One reminder per child and cycle day. Add more children the same way, for example "Emma, Day 2".
      </Sub>

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 }}>
          <Card>
            <H>What kind of reminder?</H>
            {TEMPLATES.map((t) => (
              <View key={t.label} style={{ marginBottom: 8 }}>
                <Btn kind="ghost" title={t.label} onPress={() => {
                  setPicking(false);
                  setEditing({ ...newRule(), child: lastChild, ...t.rule });
                }} />
              </View>
            ))}
            <Btn kind="danger" title="Cancel" onPress={() => setPicking(false)} />
          </Card>
        </View>
      </Modal>

      {editing ? (
        <Editor rule={editing} cycleLength={settings.cycleLength} onCancel={() => setEditing(null)} onSave={save}
          isNew={!settings.rules.some((x) => x.id === editing.id)}
          onDelete={() => Alert.alert('Delete reminder?', `${editing.child}: ${editing.title}`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => {
              update({ ...settings, rules: settings.rules.filter((x) => x.id !== editing.id) });
              setEditing(null);
            } },
          ])} />
      ) : null}
    </ScrollView>
  );
}

function describeTimes(r: Rule): string {
  const n = parseHHMM(r.nightBefore);
  const m = parseHHMM(r.morningOf);
  const parts = [];
  if (n !== null) parts.push(`${niceTime(n)} night before`);
  if (m !== null) parts.push(`${niceTime(m)} morning of`);
  if (r.followUp && m !== null) parts.push('last call');
  return parts.length ? parts.join(' · ') : 'No alerts (shown in the app only)';
}

function Editor({ rule, cycleLength, onCancel, onSave, onDelete, isNew }: {
  rule: Rule; cycleLength: number; onCancel: () => void; onSave: (r: Rule) => void; onDelete: () => void; isNew: boolean;
}) {
  const [r, setR] = useState(rule);
  const set = (patch: Partial<Rule>) => setR({ ...r, ...patch });
  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 60 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: C.ink, marginBottom: 16 }}>
          {isNew ? 'New reminder' : 'Edit reminder'}
        </Text>
        <Card>
          <H>Who and when</H>
          <Text style={{ color: C.ink, marginBottom: 6 }}>Child's name</Text>
          <Field value={r.child} onChange={(v) => set({ child: v })} placeholder="e.g. Arin" />
          <Text style={{ color: C.ink, marginTop: 14, marginBottom: 6 }}>Cycle day</Text>
          <Chips options={Array.from({ length: cycleLength }, (_, i) => i + 1)} value={r.cycleDay}
            onChange={(v) => set({ cycleDay: v })} />
        </Card>
        <Card>
          <H>What</H>
          <Text style={{ color: C.ink, marginBottom: 6 }}>What is it?</Text>
          <Field value={r.title} onChange={(v) => set({ title: v })} placeholder="e.g. library book return day" />
          <Text style={{ color: C.ink, marginTop: 14, marginBottom: 6 }}>What to pack (optional)</Text>
          <Field value={r.items} onChange={(v) => set({ items: v })} placeholder="e.g. the library book and its bag" />
        </Card>
        <Card>
          <H>Alerts</H>
          <Row label="Night before"><TimeField value={r.nightBefore} onChange={(v) => set({ nightBefore: v })} /></Row>
          <Row label="Morning of"><TimeField value={r.morningOf} onChange={(v) => set({ morningOf: v })} /></Row>
          <Row label="Last-call nudge" hint="A second alert after the morning one, unless you've tapped Packed">
            <Toggle value={r.followUp} onChange={(v) => set({ followUp: v })} />
          </Row>
        </Card>
        <View style={{ gap: 10 }}>
          <Btn title="Save" disabled={!r.title.trim()} onPress={() => onSave({ ...r, child: r.child.trim(), title: r.title.trim(), items: r.items.trim() })} />
          <Btn kind="ghost" title="Cancel" onPress={onCancel} />
          {!isNew ? <Btn kind="danger" title="Delete" onPress={onDelete} /> : null}
        </View>
      </ScrollView>
    </Modal>
  );
}
