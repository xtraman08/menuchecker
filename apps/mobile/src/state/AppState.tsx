import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { DishCard, ScanResult } from '@/api/types';
import * as storage from '@/lib/storage';
import { addDish, clearRestaurant, type Shortlists } from './shortlist';

const ONBOARDED_KEY = 'fare.onboarded';

interface AppState {
  /** null while the stored flag is loading. */
  onboarded: boolean | null;
  setOnboarded: () => void;
  shortlists: Shortlists;
  addToShortlist: (restaurantId: string, dish: DishCard) => void;
  clearShortlist: (restaurantId: string) => void;
  /** The last scan, handed from the scan screen to the review screen. */
  scanDraft: ScanResult | null;
  setScanDraft: (s: ScanResult | null) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [onboarded, setOnboardedState] = useState<boolean | null>(null);
  const [shortlists, setShortlists] = useState<Shortlists>({});
  const [scanDraft, setScanDraft] = useState<ScanResult | null>(null);

  useEffect(() => {
    storage.getItem(ONBOARDED_KEY).then(
      (v) => setOnboardedState(v === '1'),
      () => setOnboardedState(false),
    );
  }, []);

  const setOnboarded = useCallback(() => {
    setOnboardedState(true);
    void storage.setItem(ONBOARDED_KEY, '1');
  }, []);

  const value = useMemo<AppState>(
    () => ({
      onboarded,
      setOnboarded,
      shortlists,
      addToShortlist: (rid, dish) => setShortlists((s) => addDish(s, rid, dish)),
      clearShortlist: (rid) => setShortlists((s) => clearRestaurant(s, rid)),
      scanDraft,
      setScanDraft,
    }),
    [onboarded, setOnboarded, shortlists, scanDraft],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be used inside AppStateProvider');
  return v;
}
