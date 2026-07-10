import type { Stage } from "./types";

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function yearOf(iso: string): string {
  return iso.slice(0, 4);
}

export const STAGE_COLORS: Record<Stage, string> = {
  request: "bg-slate-500",
  quoted: "bg-sky-600",
  scheduled: "bg-indigo-600",
  fieldwork: "bg-amber-600",
  drafting: "bg-orange-600",
  review: "bg-purple-600",
  delivered: "bg-emerald-600",
  invoiced: "bg-slate-700",
};
