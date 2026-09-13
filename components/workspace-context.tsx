"use client";
import { createContext, useContext } from "react";
import type { OutletId, Period } from "@/lib/demo-data";

type WorkspaceState = {
  outlet: OutletId;
  setOutlet: (id: OutletId) => void;
  period: Period;
  setPeriod: (p: Period) => void;
  notify: (message: string) => void;
  used: number;
  quota: number;
  setUsed: React.Dispatch<React.SetStateAction<number>>;
};
export const WorkspaceContext = createContext<WorkspaceState | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace is required");
  return value;
}
