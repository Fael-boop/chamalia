import { useSyncExternalStore } from "react";

/** Per-device choice: some people want the agenda alerts on the phone only, or on the front desk PC only. */
const KEY = "chamalia.agendaAlerts";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAgendaAlerts(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Private mode: the choice lasts until the page is closed.
    memory = on;
  }
  listeners.forEach((listener) => listener());
}

let memory: boolean | null = null;

function snapshot(): boolean {
  return memory ?? read();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useAgendaAlertsEnabled = () => useSyncExternalStore(subscribe, snapshot);
