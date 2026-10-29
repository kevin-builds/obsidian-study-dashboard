import type { TFile } from "obsidian";
import type { WidgetDef } from "../dashboard";
import { dayKey } from "../ics";
import { chip, fileRow, fmtTime, folderOf, MON_KURZ, MS, plural, relDays, today } from "./ui";

export const activity: WidgetDef = {
	title: () => "📊 Aktivität",
	full: true,
	render(ctx) {
		const { body, aside } = ctx.card;
		const { settings, state } = ctx;
		const created = settings.activityMode === "created";
		aside.setText(created ? "Notizen erstellt pro Tag" : "Notizen zuletzt bearbeitet pro Tag");

		const files = ctx.files();
		const stamp = (f: TFile) => (created ? f.stat.ctime : f.stat.mtime);
		const byDay = new Map<string, TFile[]>();
		for (const f of files) {
			const k = dayKey(new Date(stamp(f)));
			const arr = byDay.get(k);
			if (arr) arr.push(f);
			else byDay.set(k, [f]);
		}
		const n = (d: Date) => byDay.get(dayKey(d))?.length ?? 0;
		const t0 = today();

		// Streak: heute zählt mit, ein noch leerer heutiger Tag bricht die Serie aber nicht
		let streak = 0;
		const d = new Date(t0);
		if (!n(d)) d.setDate(d.getDate() - 1);
		while (n(d)) {
			streak++;
			d.setDate(d.getDate() - 1);
		}
		let week = 0;
		for (let i = 0; i < 7; i++) week += n(new Date(t0.getTime() - i * MS));

		const stats = body.createDiv({ cls: "sd-stats" });
		chip(stats, "Notizen gesamt", files.length);
		chip(stats, "letzte 7 Tage", week, week ? "good" : undefined);
		chip(stats, "Tage-Streak", streak, streak > 2 ? "warn" : undefined);
		const newest = files.reduce<TFile | null>((a, f) => (!a || stamp(f) > stamp(a) ? f : a), null);
		if (newest) {
			const s = stats.createSpan({ cls: "sd-muted sd-small" });
			s.appendText("zuletzt: ");
			ctx.fileLink(s, newest);
			const days = Math.floor((t0.getTime() - new Date(dayKey(new Date(stamp(newest))) + "T00:00:00").getTime()) / MS);
			s.appendText(` (${relDays(days)})`);
		}

		// Heatmap: Spalten = Wochen (Mo–So), rechts die aktuelle Woche
		const max = Math.max(1, ...Array.from(byDay.values(), (v) => v.length));
		const level = (c: number) => (c <= 0 ? 0 : c === 1 ? 1 : c / max <= 0.25 ? 2 : c / max <= 0.6 ? 3 : 4);

		const weeks = Math.max(4, Math.min(104, settings.activityWeeks));
		const dow = (t0.getDay() + 6) % 7;
		const start = new Date(t0);
		start.setDate(start.getDate() - dow - (weeks - 1) * 7);

		const wrap = body.createDiv({ cls: "sd-heat-wrap" });
		const g = wrap.createDiv({ cls: "sd-heat" });
		const labels = g.createDiv({ cls: "sd-heat-col sd-heat-labels" });
		labels.createDiv({ cls: "sd-heat-month" });
		["Mo", "", "Mi", "", "Fr", "", ""].forEach((t) => labels.createDiv({ cls: "sd-heat-label", text: t }));

		const detail = body.createDiv({ cls: "sd-heat-detail" });
		let active: HTMLElement | null = null;
		const showDay = (key: string, cell: HTMLElement | null) => {
			active?.removeClass("is-active");
			detail.empty();
			if (state.activityDay === key && cell === active) {
				state.activityDay = null;
				active = null;
				return;
			}
			state.activityDay = key;
			active = cell;
			cell?.addClass("is-active");
			const list = (byDay.get(key) ?? []).slice().sort((a, b) => stamp(b) - stamp(a));
			const head = detail.createDiv({ cls: "sd-detail-head" });
			head.setText(`${new Date(key + "T00:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })} — ${plural(list.length, "Notiz", "Notizen")}`);
			for (const f of list.slice(0, 15)) fileRow(detail, (p) => ctx.fileLink(p, f), fmtTime(stamp(f)), folderOf(f));
			if (list.length > 15) detail.createDiv({ cls: "sd-muted sd-small", text: `… und ${list.length - 15} weitere` });
		};

		let lastM = -1;
		for (let w = 0; w < weeks; w++) {
			const col = g.createDiv({ cls: "sd-heat-col" });
			const monday = new Date(start);
			monday.setDate(start.getDate() + w * 7);
			const lbl = col.createDiv({ cls: "sd-heat-month" });
			if (monday.getMonth() !== lastM) {
				lbl.setText(MON_KURZ[monday.getMonth()]);
				lastM = monday.getMonth();
			}
			for (let r = 0; r < 7; r++) {
				const day = new Date(monday);
				day.setDate(monday.getDate() + r);
				const box = col.createDiv({ cls: "sd-heat-cell" });
				if (day > t0) {
					box.addClass("is-future");
					continue;
				}
				const c = n(day);
				const key = dayKey(day);
				box.addClass("sd-l" + level(c));
				box.setAttr("aria-label", `${day.toLocaleDateString("de-DE")} — ${plural(c, "Notiz", "Notizen")}`);
				if (day.getTime() === t0.getTime()) box.addClass("is-today");
				if (c) box.addEventListener("click", () => showDay(key, box));
				if (state.activityDay === key) {
					state.activityDay = null;
					showDay(key, box);
				}
			}
		}
		// Heatmap ganz nach rechts scrollen (aktuelle Woche sichtbar), falls zu breit
		requestAnimationFrame(() => (wrap.scrollLeft = wrap.scrollWidth));
	},
};
