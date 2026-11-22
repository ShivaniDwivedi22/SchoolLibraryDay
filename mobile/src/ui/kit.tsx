import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View, ViewStyle } from 'react-native';

import { hhmm, niceTime, parseHHMM } from '../core/dates';

export const C = {
  bg: '#F4F6FB',
  card: '#FFFFFF',
  ink: '#111827',
  sub: '#6B7280',
  line: '#E5E7EB',
  brand: '#2563EB',
  brandSoft: '#DBEAFE',
  good: '#16A34A',
  goodSoft: '#DCFCE7',
  warn: '#B45309',
  warnSoft: '#FEF3C7',
  bad: '#DC2626',
};

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function H({ children }: { children: React.ReactNode }) {
  return <Text style={s.h}>{children}</Text>;
}

export function Sub({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[s.sub, style]}>{children}</Text>;
}

export function Btn({ title, onPress, kind = 'primary', small, disabled }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'good' | 'danger'; small?: boolean; disabled?: boolean;
}) {
  const bg = { primary: C.brand, ghost: C.brandSoft, good: C.good, danger: '#FEE2E2' }[kind];
  const fg = { primary: '#fff', ghost: C.brand, good: '#fff', danger: C.bad }[kind];
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => [s.btn, small && s.btnSmall, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}>
      <Text style={[s.btnText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.label}>{label}</Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <Switch value={value} onValueChange={onChange} trackColor={{ true: C.brand }} />;
}

export function Chips<T extends string | number>({ options, value, onChange, labels }: {
  options: T[]; value: T; onChange: (v: T) => void; labels?: (v: T) => string;
}) {
  return (
    <View style={s.chips}>
      {options.map((o) => (
        <Pressable key={String(o)} onPress={() => onChange(o)} style={[s.chip, o === value && s.chipOn]}>
          <Text style={[s.chipText, o === value && { color: '#fff' }]}>{labels ? labels(o) : String(o)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Field({ value, onChange, placeholder, style }: {
  value: string; onChange: (v: string) => void; placeholder?: string; style?: object;
}) {
  return <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#9CA3AF"
    style={[s.input, style]} autoCapitalize="none" />;
}

/** Shows "7:00 PM" (or "Off"); tap to pick a time. */
export function TimeField({ value, onChange, allowOff = true }: {
  value: string; onChange: (v: string) => void; allowOff?: boolean;
}) {
  const [iosOpen, setIosOpen] = useState(false);
  const minutes = parseHHMM(value);
  const asDate = () => {
    const d = new Date();
    const m = minutes ?? 19 * 60;
    d.setHours(Math.floor(m / 60), m % 60, 0, 0);
    return d;
  };
  const pick = (d?: Date) => d && onChange(hhmm(d.getHours() * 60 + d.getMinutes()));
  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: asDate(), mode: 'time', is24Hour: false,
        onChange: (e, d) => e.type === 'set' && pick(d) });
    } else setIosOpen(true);
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable onPress={open} style={[s.timeBtn, minutes === null && { backgroundColor: C.line }]}>
        <Text style={[s.timeText, minutes === null && { color: C.sub }]}>{minutes === null ? 'Off' : niceTime(minutes)}</Text>
      </Pressable>
      {allowOff && minutes !== null ? (
        <Pressable onPress={() => onChange('')}><Text style={{ color: C.sub }}>Turn off</Text></Pressable>
      ) : null}
      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <View style={s.sheetWrap}>
            <View style={s.sheet}>
              <DateTimePicker value={asDate()} mode="time" display="spinner" onChange={(_, d) => pick(d)} />
              <Btn title="Done" onPress={() => setIosOpen(false)} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

export const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12,
          shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  h: { fontSize: 13, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  sub: { fontSize: 14, color: C.sub },
  btn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12 },
  btnText: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
         borderBottomColor: C.line },
  label: { fontSize: 16, color: C.ink },
  hint: { fontSize: 13, color: C.sub, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.brandSoft },
  chipOn: { backgroundColor: C.brand },
  chipText: { color: C.brand, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, fontSize: 16, color: C.ink, backgroundColor: '#fff' },
  timeBtn: { backgroundColor: C.brandSoft, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  timeText: { color: C.brand, fontWeight: '700', fontSize: 16 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', padding: 16, paddingBottom: 32, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
});
