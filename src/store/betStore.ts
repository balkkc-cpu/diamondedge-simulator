"use client";

import { create } from "zustand";
import { SlipBet } from "@/lib/types";

type BetStore = {
  bankroll: number;
  unitSize: number;
  bets: SlipBet[];
  setBankroll: (bankroll: number) => void;
  setUnitSize: (unitSize: number) => void;
  addBet: (bet: SlipBet) => void;
  removeBet: (id: string) => void;
  clear: () => void;
  /** Replace slip (e.g. load from My Library). */
  loadSlip: (bets: SlipBet[], bankroll: number, unitSize: number) => void;
};

export const useBetStore = create<BetStore>((set) => ({
  bankroll: 1000,
  unitSize: 25,
  bets: [],
  setBankroll: (bankroll) => set({ bankroll }),
  setUnitSize: (unitSize) => set({ unitSize }),
  addBet: (bet) =>
    set((state) => ({
      bets: state.bets.some((b) => b.id === bet.id) ? state.bets : [...state.bets, bet]
    })),
  removeBet: (id) => set((state) => ({ bets: state.bets.filter((b) => b.id !== id) })),
  clear: () => set({ bets: [] }),
  loadSlip: (bets, bankroll, unitSize) => set({ bets, bankroll, unitSize })
}));
