import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { SchoolCalendar } from '../core/schoolcal';
import { AppState, EMPTY_STATE, Settings, DEFAULT_SETTINGS } from '../core/types';
import { refreshAll } from '../engine';
import { loadCalendar, loadSettings, loadState, saveSettings } from '../store';

type Ctx = {
  settings: Settings;
  state: AppState;
  cal: SchoolCalendar | null;
  calSource: string;
  warning: string | null;
  busy: boolean;
  reload: () => Promise<void>;
  update: (s: Settings, opts?: { forceSync?: boolean; forceDownload?: boolean }) => Promise<void>;
  refresh: (opts?: { forceSync?: boolean; forceDownload?: boolean }) => Promise<string | null>;
};

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [cal, setCal] = useState<SchoolCalendar | null>(null);
  const [calSource, setCalSource] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const s = await loadSettings();
    const st = await loadState();
    const c = await loadCalendar(s);
    setSettings(s);
    setState(st);
    setCal(c.cal);
    setCalSource(c.source);
  }, []);

  const refresh = useCallback(async (opts?: { forceSync?: boolean; forceDownload?: boolean }) => {
    setBusy(true);
    try {
      const r = await refreshAll(opts);
      setWarning(r.warning);
      return r.calendarNote;
    } catch (e) {
      setWarning((e as Error).message);
      return null;
    } finally {
      await reload();
      setBusy(false);
    }
  }, [reload]);

  const update = useCallback(async (s: Settings, opts?: { forceSync?: boolean; forceDownload?: boolean }) => {
    setSettings(s);
    await saveSettings(s);
    await refresh({ forceSync: s.calendarSync.enabled, ...opts });
  }, [refresh]);

  useEffect(() => {
    reload().then(() => refresh());
  }, [reload, refresh]);

  return (
    <AppCtx.Provider value={{ settings, state, cal, calSource, warning, busy, reload, update, refresh }}>
      {children}
    </AppCtx.Provider>
  );
}
