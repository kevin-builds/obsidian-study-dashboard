import type { TFile } from "obsidian";

export const MS = 86400000;

export const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export const MON_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
export const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function today(): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d;
}

export function chip(parent: HTMLElement, label: string, value: string | number, tone?: "good" | "bad" | "warn") {
	const s = parent.createSpan({ cls: "sd-chip" });
	s.createEl("b", { text: String(value), cls: tone ? "sd-" + tone : "" });
	s.createSpan({ text: label, cls: "sd-muted" });
	return s;
}

export function empty(parent: HTMLElement, text: string) {
	return parent.createDiv({ cls: "sd-muted sd-empty", text });
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function relDays(days: number): string {
	if (days <= 0) return "heute";
	if (days === 1) return "gestern";
	return `vor ${days} Tagen`;
}

export const fmtDate = (d: Date) => d.toLocaleDateString("de-DE");
export const fmtTime = (ms: number) =>
	new Date(ms).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Kleine Liste "Dateiname … Datum" */
export function fileRow(parent: HTMLElement, link: (p: HTMLElement) => void, right: string, sub?: string) {
	const row = parent.createDiv({ cls: "sd-row" });
	const left = row.createDiv({ cls: "sd-row-main" });
	link(left);
	if (sub) left.createDiv({ cls: "sd-muted sd-tiny", text: sub });
	row.createSpan({ cls: "sd-muted sd-small sd-nowrap", text: right });
	return row;
}

export const folderOf = (f: TFile) => (f.parent && f.parent.path !== "/" ? f.parent.path : "");
