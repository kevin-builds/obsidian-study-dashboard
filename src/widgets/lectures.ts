import { setIcon } from "obsidian";
import type { WidgetDef } from "../dashboard";
import { dayKey, expandEvent } from "../ics";
import { MS, today, WOCHENTAGE } from "./ui";

interface Lecture {
	start: Date;
	end: Date;
	title: string;
	room: string;
	person: string;
	exam: boolean;
	/** Spalte und Spaltenanzahl bei Überschneidungen */
	col: number;
	cols: number;
}

const PX_PER_HOUR = 46;
const pad = (n: number) => String(n).padStart(2, "0");
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const ddmm = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;

/** ISO-Kalenderwoche */
function isoWeek(d: Date): number {
	const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
	const day = t.getUTCDay() || 7;
	t.setUTCDate(t.getUTCDate() + 4 - day);
	const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
	return Math.ceil(((t.getTime() - yearStart.getTime()) / MS + 1) / 7);
}

/** Rapla-Seitenlink → iCal-Feed. Andere Links (schon iCal) bleiben, wie sie sind. */
export function lecturePlanIcal(url: string): string {
	return url.trim().replace(/\/rapla\/(internal_calendar|calendar)\?/, "/rapla/ical?");
}

/** Rapla-Seitenlink für genau eine Woche (zum Öffnen im Browser). */
function lecturePlanPage(url: string, monday: Date): string {
	const base = url.trim().replace(/[?&](pages|day|month|year)=[^&]*/g, "");
	if (!/\/rapla\/(internal_calendar|calendar)\?/.test(base)) return url.trim();
	return `${base}&pages=1&day=${monday.getDate()}&month=${monday.getMonth() + 1}&year=${monday.getFullYear()}`;
}

/** "Kurs: … Personen: Morath, Denis Ressourcen: …" → "Morath" */
function personOf(description: string): string {
	const m = description.match(/Personen:\s*(.*?)\s*(?:Ressourcen:|$)/);
	if (!m || !m[1]) return "";
	// Rapla schreibt "Nachname, Vorname[, Nachname, Vorname …]" → nur die Nachnamen
	return m[1]
		.split(",")
		.map((p) => p.trim())
		.filter((p, i) => p && i % 2 === 0)
		.join(", ");
}

/** "269C VL-Raum Unterrichtsraum, MA Online-Veranstaltung" → "269C, Online" */
function roomOf(location: string): string {
	return location
		.split(",")
		.map((r) => r.trim())
		.filter(Boolean)
		.map((r) => (/online/i.test(r) ? "Online" : r.split(/\s+/)[0]))
		.join(", ");
}

/** Überschneidende Termine eines Tages nebeneinander anordnen. */
function layoutDay(items: Lecture[]) {
	items.sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
	let group: Lecture[] = [];
	let groupEnd = 0;
	const flush = () => {
		const colEnds: number[] = [];
		for (const it of group) {
			let c = colEnds.findIndex((e) => e <= it.start.getTime());
			if (c < 0) c = colEnds.length;
			colEnds[c] = it.end.getTime();
			it.col = c;
		}
		for (const it of group) it.cols = colEnds.length;
		group = [];
	};
	for (const it of items) {
		if (group.length && it.start.getTime() >= groupEnd) flush();
		group.push(it);
		groupEnd = Math.max(groupEnd, it.end.getTime());
	}
	if (group.length) flush();
}

/** Vorlesungsplan (z.B. Rapla) als einklappbare Wochenansicht mit Wochen-Navigation. */
export const lecturePlan: WidgetDef = {
	title: () => "🎓 Vorlesungsplan",
	full: true,
	async render(ctx) {
		const { settings, plugin, state } = ctx;
		const { el, head, aside, body } = ctx.card;
		const url = settings.lecturePlanUrl.trim();
		if (!/^https?:\/\//.test(url)) {
			el.addClass("sd-hidden");
			return;
		}

		// --- Einklappen ---
		el.addClass("sd-collapsible");
		const chevron = createSpan({ cls: "sd-chevron" });
		setIcon(chevron, "chevron-down");
		head.prepend(chevron);
		head.setAttr("role", "button");
		head.setAttr("tabindex", "0");
		const apply = () => {
			el.toggleClass("is-collapsed", settings.lecturePlanCollapsed);
			head.setAttr("aria-expanded", String(!settings.lecturePlanCollapsed));
		};
		const toggle = () => {
			settings.lecturePlanCollapsed = !settings.lecturePlanCollapsed;
			apply();
			// Direkt speichern statt saveSettings(): sonst zeichnet das ganze Dashboard neu
			void plugin.saveData(settings);
		};
		head.addEventListener("click", toggle);
		head.addEventListener("keydown", (e) => {
			if (e.target === head && (e.key === "Enter" || e.key === " ")) {
				e.preventDefault();
				toggle();
			}
		});
		aside.addEventListener("click", (e) => e.stopPropagation());
		apply();

		// --- Kopfzeile: Navigation (einmal aufbauen, beim Blättern nur Text/Link ändern) ---
		const titleEl = head.querySelector(".sd-card-title");
		const range = aside.createSpan({ cls: "sd-muted sd-tabular sd-week-range" });
		const nav = aside.createSpan({ cls: "sd-nav" });
		const btn = (label: string, title: string, delta: number | null) => {
			const b = nav.createEl("button", { text: label, cls: "sd-btn sd-btn-small", attr: { "aria-label": title } });
			b.addEventListener("click", () => {
				state.lectureWeekOffset = delta === null ? 0 : state.lectureWeekOffset + delta;
				// Nur diese Karte neu zeichnen, nicht das ganze Dashboard → Blättern ist sofort da
				draw();
			});
		};
		btn("‹", "Vorherige Woche", -1);
		btn("Heute", "Aktuelle Woche", null);
		btn("›", "Nächste Woche", 1);
		const open = nav.createEl("a", { cls: "sd-btn sd-btn-small sd-week-open", attr: { "aria-label": "In Rapla öffnen" } });
		setIcon(open, "external-link");

		// --- Termine laden (einmal; der Feed ist zusätzlich im Plugin zwischengespeichert) ---
		let events: Awaited<ReturnType<typeof plugin.fetchCalendar>>;
		try {
			events = await plugin.fetchCalendar(lecturePlanIcal(url));
		} catch (e) {
			console.warn("[Study Dashboard] Vorlesungsplan nicht ladbar:", e);
			body.createDiv({ cls: "sd-error sd-small", text: "⚠️ Vorlesungsplan nicht ladbar. Link in den Einstellungen prüfen." });
			return;
		}

		const draw = () => {
			const t0 = today();
			const monday = new Date(t0);
			monday.setDate(t0.getDate() - ((t0.getDay() + 6) % 7) + 7 * state.lectureWeekOffset);
			const weekEnd = new Date(monday);
			weekEnd.setDate(monday.getDate() + 7);
			const saturday = new Date(monday);
			saturday.setDate(monday.getDate() + 5);

			titleEl?.setText(`🎓 Vorlesungsplan · KW ${isoWeek(monday)}`);
			range.setText(`${ddmm(monday)} – ${ddmm(saturday)}  `);
			open.setAttr("href", lecturePlanPage(url, monday));
			body.empty();

			const days: Lecture[][] = Array.from({ length: 7 }, () => []);
			for (const ev of events) {
				if (ev.allDay) continue;
				const dur = ev.end ? ev.end.getTime() - ev.start.getTime() : 90 * 60000;
				for (const occ of expandEvent(ev, monday, weekEnd)) {
					if (occ < monday || occ >= weekEnd) continue;
					const di = (occ.getDay() + 6) % 7;
					days[di].push({
						start: occ,
						end: new Date(occ.getTime() + dur),
						title: ev.title.replace(/\s+MA-[A-Z0-9]+\s*$/, "").trim(),
						room: roomOf(ev.location),
						person: personOf(ev.description),
						exam: /prüfung/i.test(ev.categories),
						col: 0,
						cols: 1,
					});
				}
			}
			days.forEach(layoutDay);

			// Mo–Fr immer, Sa/So nur wenn dort etwas ist
			const shown = [0, 1, 2, 3, 4, ...(days[5].length ? [5] : []), ...(days[6].length ? [6] : [])];
			const all = days.flat();
			if (!all.length) {
				body.createDiv({ cls: "sd-muted sd-small sd-week-empty", text: "Keine Vorlesungen in dieser Woche." });
				return;
			}

			const minH = Math.min(8, ...all.map((l) => l.start.getHours()));
			const maxH = Math.max(17, ...all.map((l) => l.end.getHours() + (l.end.getMinutes() ? 1 : 0)));
			const top = (d: Date) => ((d.getHours() - minH) * 60 + d.getMinutes()) * (PX_PER_HOUR / 60);
			const colorFor = (l: Lecture) => {
				if (l.exam) return settings.examColor;
				const t = l.title.toLowerCase();
				for (const r of settings.colorRules) if (r.keyword && t.includes(r.keyword.toLowerCase())) return r.color;
				return "var(--interactive-accent)";
			};
			const tip = (l: Lecture) => [`${hm(l.start)} – ${hm(l.end)}`, l.title, l.person, l.room].filter(Boolean).join("\n");

			// --- Raster (breite Bildschirme) ---
			const grid = body.createDiv({ cls: "sd-week" });
			grid.style.setProperty("--sd-week-cols", String(shown.length));
			grid.createDiv({ cls: "sd-week-corner" });
			for (const di of shown) {
				const d = new Date(monday);
				d.setDate(monday.getDate() + di);
				const h = grid.createDiv({ cls: "sd-week-dayhead", text: `${WOCHENTAGE[di]} ${ddmm(d)}` });
				if (dayKey(d) === dayKey(t0)) h.addClass("is-today");
			}
			const hours = grid.createDiv({ cls: "sd-week-hours" });
			hours.style.height = `${(maxH - minH) * PX_PER_HOUR}px`;
			for (let h = minH; h < maxH; h++) hours.createDiv({ cls: "sd-week-hour", text: `${pad(h)}:00` }).style.top = `${(h - minH) * PX_PER_HOUR}px`;

			for (const di of shown) {
				const d = new Date(monday);
				d.setDate(monday.getDate() + di);
				const col = grid.createDiv({ cls: "sd-week-col" });
				if (dayKey(d) === dayKey(t0)) col.addClass("is-today");
				col.style.height = `${(maxH - minH) * PX_PER_HOUR}px`;
				col.style.setProperty("--sd-hour", `${PX_PER_HOUR}px`);
				for (const l of days[di]) {
					const ev = col.createDiv({ cls: "sd-week-ev" + (l.exam ? " is-exam" : "") });
					ev.style.setProperty("--sd-c", colorFor(l));
					ev.style.top = `${top(l.start)}px`;
					ev.style.height = `${Math.max(18, top(l.end) - top(l.start) - 2)}px`;
					ev.style.left = `calc(${(100 / l.cols) * l.col}% + 2px)`;
					ev.style.width = `calc(${100 / l.cols}% - 4px)`;
					ev.setAttr("aria-label", tip(l));
					ev.createDiv({ cls: "sd-week-ev-time", text: `${hm(l.start)}–${hm(l.end)}` });
					ev.createDiv({ cls: "sd-week-ev-title", text: l.title });
					const meta = [l.room, l.person].filter(Boolean).join(" · ");
					if (meta) ev.createDiv({ cls: "sd-week-ev-meta", text: meta });
				}
			}

			// --- Liste (schmale Bildschirme, per CSS umgeschaltet) ---
			const list = body.createDiv({ cls: "sd-week-list" });
			for (const di of shown) {
				if (!days[di].length) continue;
				const d = new Date(monday);
				d.setDate(monday.getDate() + di);
				const head = list.createDiv({ cls: "sd-detail-head", text: d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }) });
				if (dayKey(d) === dayKey(t0)) head.addClass("is-today");
				for (const l of days[di]) {
					const r = list.createDiv({ cls: "sd-ev-row" });
					r.createSpan({ cls: "sd-dot" }).style.background = colorFor(l);
					r.createSpan({ cls: "sd-muted sd-tabular sd-nowrap", text: `${hm(l.start)}–${hm(l.end)}` });
					const txt = r.createSpan();
					txt.createSpan({ text: l.title });
					const meta = [l.room, l.person].filter(Boolean).join(" · ");
					if (meta) txt.createSpan({ cls: "sd-muted", text: " · " + meta });
				}
			}
		};
		draw();
	},
};
