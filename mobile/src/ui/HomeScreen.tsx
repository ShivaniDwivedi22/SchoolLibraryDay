import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { addDays, daysBetween, longDate, shortDate, toISO } from '../core/dates';
import { cycleDay, isFirstDayBack, suggestion, Task, upcoming } from '../core/plan';
import { setTaskStatus } from '../engine';
import { showNow } from '../notify';
import { saveState, loadState } from '../store';
import { useApp } from './AppContext';
import { Btn, C, Card, Chips, H, Sub } from './kit';

export default function HomeScreen() {
  const { settings, state, cal, warning, update, reload } = useApp();
  if (!cal) return null;
  const today = toISO(new Date());
  const todayCycle = cycleDay(cal, settings.anchor, settings.cycleLength, today);
  const nextSchool = cal.nextSchoolDay(today);
  const tasks = upcoming(settings, cal, today, 8);
  const next = tasks[0];

  const mark = async (t: Task, status: 'packed' | 'skipped' | null) => {
    await setTaskStatus(t.key, status, `${t.rule.child} ${t.rule.title} ${t.date}`);
    await reload();
  };

  const recalibrate = (day: number) => {
    const date = todayCycle !== null ? today : nextSchool;
    if (!date) return;
    update({ ...settings, anchor: { date, day }, anchorConfirmed: true });
  };

  const suggestions = settings.smartSuggestions
    ? settings.rules.filter((r) => r.enabled).map((r) => ({ r, sug: suggestion(r, state) })).filter((x) => x.sug)
    : [];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {warning ? (
        <Card style={{ backgroundColor: C.warnSoft }}><Text style={{ color: C.warn }}>{warning}</Text></Card>
      ) : null}

      {!settings.anchorConfirmed ? (
        <Card style={{ backgroundColor: C.brandSoft }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink, marginBottom: 6 }}>Quick check</Text>
          <Text style={{ fontSize: 15, color: C.ink, marginBottom: 12 }}>
            Is {longDate(settings.anchor.date)} Cycle Day {settings.anchor.day}? The app counts every other day from this.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn title="Yes, that's right" onPress={() => update({ ...settings, anchorConfirmed: true })} />
          </View>
          <Sub style={{ marginTop: 10 }}>Not sure? Use "School says today is Day…" below once you know.</Sub>
        </Card>
      ) : null}

      <Card>
        <H>Today</H>
        <Text style={{ fontSize: 28, fontWeight: '800', color: C.ink }}>
          {todayCycle !== null ? `Cycle Day ${todayCycle}` : 'No school'}
        </Text>
        <Sub>
          {todayCycle !== null ? longDate(today) : `${cal.dayOffReason(today)}${nextSchool ? ` · back ${shortDate(nextSchool)} (Day ${cycleDay(cal, settings.anchor, settings.cycleLength, nextSchool)})` : ''}`}
        </Sub>
      </Card>

      {next ? <NextCard t={next} today={today} status={state.tasks[next.key]} onMark={mark} back={isFirstDayBack(cal, next.date)} /> : (
        <Card><H>Next up</H><Sub>No reminders coming up. Add one in the Reminders tab.</Sub></Card>
      )}

      {suggestions.map(({ r, sug }) => (
        <Card key={r.id} style={{ backgroundColor: C.goodSoft }}>
          <H>Smart suggestion</H>
          <Text style={{ fontSize: 15, color: C.ink, marginBottom: 10 }}>{sug!.text}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn small kind="good" title="Move it" onPress={() => update({
              ...settings, rules: settings.rules.map((x) => (x.id === r.id ? { ...x, nightBefore: sug!.time } : x)),
            })} />
            <Btn small kind="ghost" title="Keep current" onPress={async () => {
              const st = await loadState();
              await saveState({ ...st, dismissedSuggestions: { ...st.dismissedSuggestions, [r.id]: sug!.time } });
              await reload();
            }} />
          </View>
        </Card>
      ))}

      <Card>
        <H>Coming up</H>
        {tasks.length === 0 ? <Sub>Nothing scheduled.</Sub> : null}
        {tasks.map((t, i) => {
          const prevEnd = i === 0 ? today : addDays(tasks[i - 1].date, 1);
          const breaks = cal.breaksBetween(prevEnd, addDays(t.date, -1)).filter((b) => daysBetween(b.start, b.end) >= 1 || i === 0);
          const st = state.tasks[t.key];
          return (
            <View key={t.key}>
              {breaks.map((b) => (
                <Text key={b.start + b.name} style={{ color: C.warn, paddingVertical: 4 }}>
                  {shortDate(b.start)}{b.end !== b.start ? ` – ${shortDate(b.end)}` : ''} · {b.name}
                </Text>
              ))}
              <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Text style={{ width: 96, fontWeight: '600', color: C.ink }}>{shortDate(t.date)}</Text>
                <Text style={{ width: 52, color: C.sub }}>Day {t.cycle}</Text>
                <Text style={{ flex: 1, color: C.ink }}>
                  {t.rule.child}: {t.rule.title}{st === 'packed' ? '  ✅' : st === 'skipped' ? '  (skipped)' : ''}
                </Text>
              </View>
            </View>
          );
        })}
      </Card>

      <Card>
        <H>{todayCycle !== null ? 'School says today is Day…' : `School says ${nextSchool ? shortDate(nextSchool) : 'next school day'} is Day…`}</H>
        <Chips options={Array.from({ length: settings.cycleLength }, (_, i) => i + 1)}
          value={(todayCycle ?? (nextSchool ? cycleDay(cal, settings.anchor, settings.cycleLength, nextSchool) : 1)) ?? 1}
          onChange={recalibrate} />
        <Sub style={{ marginTop: 8 }}>Tap the right day if the school's count differs (after a snow day, for example). Everything re-adjusts.</Sub>
      </Card>

      <Btn kind="ghost" title="Send a test reminder" onPress={() => next
        ? showNow('Test reminder', `${next.rule.child}'s ${next.rule.title} is ${shortDate(next.date)} (Day ${next.cycle}).`, { taskKey: next.key })
        : showNow('Test reminder', 'Notifications are working.')} />
    </ScrollView>
  );
}

function NextCard({ t, today, status, onMark, back }: {
  t: Task; today: string; status?: string; onMark: (t: Task, s: 'packed' | 'skipped' | null) => void; back: boolean;
}) {
  const inDays = daysBetween(today, t.date);
  const when = inDays === 0 ? 'Today' : inDays === 1 ? 'Tomorrow' : `In ${inDays} days`;
  return (
    <Card style={{ borderLeftWidth: 5, borderLeftColor: inDays <= 1 && !status ? C.bad : C.brand }}>
      <H>Next up · {when}</H>
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink }}>{t.rule.child}: {t.rule.title}</Text>
      <Text style={{ fontSize: 16, color: C.ink, marginTop: 4 }}>{longDate(t.date)} · Cycle Day {t.cycle}</Text>
      {back ? <Text style={{ color: C.warn, marginTop: 6 }}>First day back after a break</Text> : null}
      {t.rule.items ? (
        <Text style={{ fontSize: 15, color: C.sub, marginTop: 6 }}>
          Pack {t.rule.items}{inDays === 1 ? ' tonight' : ''}.
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {status ? (
          <>
            <Text style={{ flex: 1, alignSelf: 'center', fontSize: 16, color: status === 'packed' ? C.good : C.sub }}>
              {status === 'packed' ? '✅ Packed. Reminders off for this day.' : 'Skipped this time.'}
            </Text>
            <Btn small kind="ghost" title="Undo" onPress={() => onMark(t, null)} />
          </>
        ) : (
          <>
            <View style={{ flex: 1 }}><Btn kind="good" title={'✅ Packed'} onPress={() => onMark(t, 'packed')} /></View>
            <Btn kind="ghost" title="Skip" onPress={() => onMark(t, 'skipped')} />
          </>
        )}
      </View>
    </Card>
  );
}
