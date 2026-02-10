import { writable } from "svelte/store";

export interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
  duration?: number;
}

const { subscribe, update } = writable<Toast[]>([]);

export const toasts = {
  subscribe,
  add: (message: string, type: Toast["type"] = "info", duration = 3000) => {
    const id = crypto.randomUUID();
    update((all) => [...all, { id, type, message, duration }]);

    if (duration > 0) {
      setTimeout(() => toasts.remove(id), duration);
    }
  },
  remove: (id: string) => {
    update((all) => all.filter((t) => t.id !== id));
  },
  success: (m: string) => toasts.add(m, "success"),
  error: (m: string) => toasts.add(m, "error"),
  info: (m: string) => toasts.add(m, "info"),
};
