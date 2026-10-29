import type { WidgetDef } from "../dashboard";
import { allDaySpan, dayKey, expandEvent, midnight } from "../ics";
import { MONATE, MS, plural, today, WOCHENTAGE } from "./ui";

interface Phase {
	start: Date;
	endExcl: Date;
	title: string;
	color: string;
}
interface Point {
	title: string;
	color: string;
	time: string | null;
}

const MAX_CHIPS = 3;

export const calendar: WidgetDef = {
	title: () => "📅 Kalender",
	full: true,
	async render(ctx) {
		const { body, head, aside } = ctx.card;
		const { settings, state, plugin } = ctx;
		const t0 = today();
		const view = new Date(t0.getFullYear(), t0.getMonth() + state.calendarOffset, 1);
		const y = view.getFullYear(), mo = view.getMonth();

		// --- Kopf: Monat + Navigation ---
		head.querySelector(".sd-card-title")?.setText(`📅 ${MONATE[mo]} ${y}`);
		const nav = aside.createSpan({ cls: "sd-nav" });
		const btn = (label: string, title: string, delta: number | null) => {
			const b = nav.createEl("button", { text: label, cls: "sd-btn sd-btn-small", attr: { "aria-label": title } });
			b.addEventListener("click", () => {
				state.calendarOffset = delta === null ? 0 : state.calendarOffset + delta;
				state.selectedDay = null;
				ctx.rerender();
			});
		};
		btn("‹", "Vorheriger Monat", -1);
		btn("Heute", "Zum aktuellen Monat", null);
		btn("›", "Nächster Monat", 1);

		const colorFor = (title: string, fallback: string) => {
			const t = title.toLowerCase();
			for (const r of settings.colorRules) if (r.keyword && t.includes(r.keyword.toLowerCase())) return r.color;
			return fallback;
		};

		// Sichtbares 6-Wochen-Raster ab Montag vor dem Monatsersten
		const gridStart = new Date(y, mo, 1);
		gridStart.setDate(1 - ((gridStart.getDay() + 6) % 7));
		const gridEnd = new Date(gridStart);
		gridEnd.setDate(gridStart.getDate() + 41);
		gridEnd.setHours(23, 59, 59);
		// Für das Phasen-Banner auch über das Raster hinaus schauen
		const lookEnd = new Date(Math.max(gridEnd.getTime(), t0.getTime() + 120 * MS));

		const phases: Phase[] = [];
		const points = new Map<string, Point[]>();
		const addPoint = (d: Date, p: Point) => {
			const k = dayKey(d);
			const arr = points.get(k);
			if (arr) arr.push(p);
			else points.set(k, [p]);
		};

		for (const ex of settings.exams) {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(ex.date)) continue;
			const d = new Date(ex.date + "T00:00:00");
			if (d >= gridStart && d <= gridEnd) addPoint(d, { title: ex.subject, color: settings.examColor, time: null });
		}

		const sources = settings.calendars.filter((c) => c.enabled && /^(https?|webcal):\/\//i.test(c.url.trim()));
		const errors: string[] = [];
		await Promise.all(
			sources.map(async (c) => {
				try {
					for (const ev of await plugin.fetchCalendar(c.url)) {
						const span = allDaySpan(ev);
						if (ev.allDay && !ev.rrule && span >= 2) {
							if (ev.end && ev.end > gridStart && ev.start <= lookEnd)
								phases.push({ start: midnight(ev.start), endExcl: midnight(ev.end), title: ev.title, color: colorFor(ev.title, c.color) });
						} else {
							for (const occ of expandEvent(ev, gridStart, gridEnd))
								addPoint(occ, {
									title: ev.title,
									color: colorFor(ev.title, c.color),
									time: ev.allDay ? null : occ.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
								});
						}
					}
				} catch (e) {
					console.warn("[Study Dashboard] Kalender nicht ladbar:", c.name, e);
					errors.push(c.name);
				}
			})
		);
		phases.sort((a, b) => a.start.getTime() - b.start.getTime() || b.endExcl.getTime() - a.endExcl.getTime());
		const sortPts = (arr: Point[]) => arr.slice().sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
		const phasesOn = (d: Date) => phases.filter((p) => d >= p.start && d < p.endExcl);

		// --- Phasen-Banner: aktuelle bzw. nächste mehrtägige Phase ---
		const cur = phasesOn(t0)[0];
		const next = phases.find((p) => p.start > t0);
		const p = cur ?? next;
		if (p) {
			const last = new Date(p.endExcl.getTime() - MS);
			const banner = body.createDiv({ cls: "sd-banner" });
			banner.style.setProperty("--sd-c", p.color);
			banner.createEl("b", { text: p.title });
			const days = Math.ceil(((cur ? p.endExcl : p.start).getTime() - t0.getTime()) / MS);
			banner.createSpan({
				cls: "sd-muted",
				text: cur
					? ` · noch ${plural(days, "Tag", "Tage")} (bis ${last.toLocaleDateString("de-DE")})`
					: ` · beginnt in ${plural(days, "Tag", "Tagen")} (${p.start.toLocaleDateString("de-DE")})`,
			});
		}

		// --- Raster ---
		const cal = body.createDiv({ cls: "sd-cal" });
		WOCHENTAGE.forEach((t) => cal.createDiv({ cls: "sd-cal-dow", text: t }));
		const detail = body.createDiv({ cls: "sd-cal-detail" });

		let activeCell: HTMLElement | null = null;
		const showDay = (d: Date, cell: HTMLElement) => {
			activeCell?.removeClass("is-selected");
			activeCell = cell;
			cell.addClass("is-selected");
			state.selectedDay = dayKey(d);
			detail.empty();
			detail.createDiv({ cls: "sd-detail-head", text: d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }) });
			const ph = phasesOn(d);
			const pts = sortPts(points.get(dayKey(d)) ?? []);
			if (!ph.length && !pts.length) {
				detail.createDiv({ cls: "sd-muted sd-small", text: "Keine Termine." });
				return;
			}
			for (const x of ph) {
				const r = detail.createDiv({ cls: "sd-ev-row" });
				r.createSpan({ cls: "sd-dot sd-square" }).style.background = x.color;
				r.createSpan({ text: x.title + " (Zeitraum)" });
			}
			for (const e of pts) {
				const r = detail.createDiv({ cls: "sd-ev-row" });
				r.createSpan({ cls: "sd-dot" }).style.background = e.color;
				if (e.time) r.createSpan({ cls: "sd-muted sd-tabular", text: e.time });
				r.createSpan({ text: e.title });
			}
		};

		const initial = state.selectedDay ?? (state.calendarOffset === 0 ? dayKey(t0) : null);
		for (let i = 0; i < 42; i++) {
			const d = new Date(gridStart);
			d.setDate(gridStart.getDate() + i);
			const di = i % 7;
			const cell = cal.createDiv({ cls: "sd-cal-cell" });
			if (d.getMonth() !== mo) cell.addClass("is-outside");
			if (di >= 5) cell.addClass("is-weekend");
			if (d.getTime() === t0.getTime()) cell.addClass("is-today");
			cell.createDiv({ cls: "sd-cal-num", text: String(d.getDate()) });

			for (const ph of phasesOn(d)) {
				const isStart = d.getTime() === ph.start.getTime();
				const isEnd = d.getTime() === ph.endExcl.getTime() - MS;
				const bar = cell.createDiv({ cls: "sd-cal-bar", text: isStart || di === 0 ? ph.title : " " });
				bar.style.background = ph.color;
				if (isStart) bar.addClass("is-start");
				if (isEnd) bar.addClass("is-end");
			}
			const pts = sortPts(points.get(dayKey(d)) ?? []);
			for (const e of pts.slice(0, MAX_CHIPS)) {
				if (e.time) {
					const c = cell.createDiv({ cls: "sd-cal-ev" });
					c.createSpan({ cls: "sd-dot sd-dot-small" }).style.background = e.color;
					c.createSpan({ cls: "sd-muted", text: e.time });
					c.createSpan({ cls: "sd-ellipsis", text: e.title });
				} else {
					cell.createDiv({ cls: "sd-cal-allday", text: e.title }).style.background = e.color;
				}
			}
			if (pts.length > MAX_CHIPS) cell.createDiv({ cls: "sd-muted sd-tiny", text: `+${pts.length - MAX_CHIPS} mehr` });
			if (pts.length) cell.setAttr("aria-label", pts.map((e) => (e.time ? e.time + " " : "") + e.title).join("\n"));

			cell.addEventListener("click", () => showDay(d, cell));
			if (dayKey(d) === initial) showDay(d, cell);
		}
		if (!activeCell) detail.createDiv({ cls: "sd-muted sd-small", text: "Tag anklicken, um die Termine zu sehen." });

		if (errors.length) body.createDiv({ cls: "sd-error sd-small", text: "⚠️ Nicht ladbar: " + errors.join(", ") });
		if (!sources.length) body.createDiv({ cls: "sd-muted sd-small sd-hint", text: "💡 Google-/Outlook-/iCloud-Kalender per iCal-URL in den Plugin-Einstellungen hinzufügen." });
		else aside.prepend(createSpan({ cls: "sd-muted", text: sources.map((s) => s.name).join(" · ") + "  " }));
	},
};

export const calendarEmbed: WidgetDef = {
	title: () => "📆 Kalender (eingebettet)",
	full: true,
	render(ctx) {
		const url = ctx.settings.calendarEmbedUrl.trim();
		if (!/^https:\/\//.test(url)) {
			ctx.card.el.addClass("sd-hidden");
			return;
		}
		ctx.card.body.createEl("iframe", { cls: "sd-iframe", attr: { src: url, loading: "lazy" } });
	},
};
