import { Notice, TFile } from "obsidian";
import type { WidgetDef, WidgetContext } from "../dashboard";
import { chip, empty, fmtDate, MS, today } from "./ui";

const SR_PLUGIN = "obsidian-spaced-repetition";

/** Datei öffnen und direkt die Spaced-Repetition-Übung für diese Notiz starten. */
async function startReview(ctx: WidgetContext, file: TFile) {
	await ctx.app.workspace.getLeaf("tab").openFile(file);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const commands = (ctx.app as any).commands;
	if (!commands?.commands?.[`${SR_PLUGIN}:srs-review-flashcards-in-note`]) {
		new Notice("Spaced-Repetition-Plugin nicht gefunden — Notiz wurde nur geöffnet.");
		return;
	}
	window.setTimeout(() => commands.executeCommandById(`${SR_PLUGIN}:srs-review-flashcards-in-note`), 300);
}

export const studyplan: WidgetDef = {
	title: () => "🎴 Lernplan",
	async render(ctx) {
		const { body, aside } = ctx.card;
		const { settings } = ctx;
		aside.setText(`Tagesziel ${settings.dailyGoal} Karten`);
		const { decks } = await ctx.flashcards();

		if (!decks.length) {
			const e = empty(body, "Noch keine Karteikarten mit ");
			e.createEl("code", { text: "#" + settings.flashcardTag.replace(/^#/, "") });
			e.appendText(". Füge den Tag zu einer Notiz mit Karteikarten hinzu, damit sie hier erscheint.");
			return;
		}
		const sum = (k: "due" | "neu" | "total" | "mature") => decks.reduce((a, d) => a + d[k], 0);
		const due = sum("due"), neu = sum("neu");

		const stats = body.createDiv({ cls: "sd-stats" });
		chip(stats, "heute fällig", due, due ? "bad" : "good");
		chip(stats, "neu", neu);
		chip(stats, "Karten gesamt", sum("total"));

		if (due + neu === 0) body.createDiv({ cls: "sd-muted", text: "Alles erledigt ✅" });
		else if (due > settings.dailyGoal)
			body.createDiv({ cls: "sd-muted sd-small", text: `Mehr fällig als das Tagesziel — heute ${settings.dailyGoal} schaffen, Rest morgen.` });

		const tbl = body.createEl("table", { cls: "sd-table" });
		const hr = tbl.createEl("thead").createEl("tr");
		[["Deck", ""], ["🔥 fällig", "c"], ["🆕 neu", "c"], ["✔ gelernt", "c"]].forEach(([h, c]) => hr.createEl("th", { text: h, cls: c ? "sd-center" : "" }));
		const tb = tbl.createEl("tbody");
		for (const d of decks.slice().sort((a, b) => b.due - a.due || b.neu - a.neu || a.file.basename.localeCompare(b.file.basename))) {
			const tr = tb.createEl("tr");
			const a = tr.createEl("td").createEl("a", { text: d.file.basename, cls: "sd-link", attr: { href: "#", "aria-label": "Übung starten" } });
			a.addEventListener("click", (e) => {
				e.preventDefault();
				startReview(ctx, d.file);
			});
			tr.createEl("td", { text: d.due ? String(d.due) : "—", cls: "sd-center" + (d.due ? " sd-bad" : "") });
			tr.createEl("td", { text: d.neu ? String(d.neu) : "—", cls: "sd-center" });
			const pct = d.total ? Math.round((100 * d.mature) / d.total) : 0;
			const td = tr.createEl("td", { cls: "sd-center" });
			const bar = td.createDiv({ cls: "sd-progress", attr: { "aria-label": `${d.mature} von ${d.total} Karten gefestigt (Intervall ≥ 21 Tage)` } });
			bar.createDiv({ cls: "sd-progress-fill" }).style.width = pct + "%";
			td.createSpan({ cls: "sd-muted sd-tiny", text: pct + "%" });
		}
		body.createDiv({ cls: "sd-muted sd-tiny sd-hint", text: "💡 Klick auf ein Deck startet die Übung direkt." });
	},
};

export const countdown: WidgetDef = {
	title: () => "⏰ Klausur-Countdown",
	async render(ctx) {
		const { body, aside, el } = ctx.card;
		const { settings } = ctx;
		const t0 = today();
		const dated = settings.exams
			.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date))
			.map((e) => ({ ...e, d: new Date(e.date + "T00:00:00") }))
			.sort((a, b) => a.d.getTime() - b.d.getTime());
		// Vergangene Klausuren nur noch eine Woche lang zeigen
		const visible = dated.filter((e) => e.d.getTime() >= t0.getTime() - 7 * MS);
		if (!visible.length) {
			el.addClass("sd-hidden");
			return;
		}
		aside.setText("Pensum passt sich an die Deadline an");
		const { decks } = await ctx.flashcards();

		const tbl = body.createEl("table", { cls: "sd-table" });
		const hr = tbl.createEl("thead").createEl("tr");
		["Klausur", "Datum", "⏳", "offen", "Pensum"].forEach((h, i) => hr.createEl("th", { text: h, cls: i >= 2 ? "sd-center" : "" }));
		const tb = tbl.createEl("tbody");
		for (const ex of visible) {
			const tr = tb.createEl("tr");
			tr.createEl("td", { text: ex.subject });
			tr.createEl("td", { text: fmtDate(ex.d), cls: "sd-nowrap" });
			const days = Math.ceil((ex.d.getTime() - t0.getTime()) / MS);
			if (days < 0) {
				tr.addClass("sd-past");
				tr.createEl("td", { text: "vorbei", cls: "sd-center" });
				tr.createEl("td", { text: "—", cls: "sd-center" });
				tr.createEl("td", { text: "🎉", cls: "sd-center" });
				continue;
			}
			const own = decks.filter((d) => ex.deck && d.deck.toLowerCase() === ex.deck.replace(/^#?flashcards\//i, "").toLowerCase());
			const total = own.reduce((a, d) => a + d.total, 0);
			const open = own.reduce((a, d) => a + (d.total - d.mature), 0);
			tr.createEl("td", { text: days === 0 ? "heute!" : `${days} T`, cls: "sd-center sd-strong" + (days <= 7 ? " sd-bad" : "") });
			tr.createEl("td", { text: total ? String(open) : "—", cls: "sd-center" });
			const pens = Math.ceil(open / Math.max(days, 1));
			const td = tr.createEl("td", { cls: "sd-center sd-nowrap" });
			if (!total) td.createSpan({ cls: "sd-muted", text: "keine Karten" });
			else td.createSpan({ text: `${pens}/Tag${pens > settings.dailyGoal ? " ⚠️" : ""}`, cls: "sd-strong" + (pens > settings.dailyGoal ? " sd-bad" : "") });
		}
	},
};

export const review: WidgetDef = {
	title: () => "🔀 Wiederholung",
	full: true,
	async render(ctx) {
		const { body, aside } = ctx.card;
		const { cards } = await ctx.flashcards();
		aside.setText("Zufallskarten · unabhängig vom Scheduling");
		if (!cards.length) {
			empty(body, `Keine Karten mit #${ctx.settings.flashcardTag.replace(/^#/, "")} gefunden.`);
			return;
		}
		// Reproduzierbares Mischen per Seed → Karten bleiben gleich, bis man "Neu mischen" klickt
		let seed = Math.floor(ctx.state.reviewSeed * 2 ** 31) || 1;
		const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
		const pick = cards
			.map((c) => ({ c, r: rand() }))
			.sort((a, b) => a.r - b.r)
			.slice(0, Math.max(1, ctx.settings.reviewCount))
			.map((x) => x.c);

		const top = body.createDiv({ cls: "sd-review-head" });
		const btn = top.createEl("button", { text: "🔀 Neu mischen", cls: "sd-btn" });
		btn.addEventListener("click", () => {
			ctx.state.reviewSeed = Math.random();
			ctx.rerender();
		});
		top.createSpan({ cls: "sd-muted sd-small", text: `${pick.length} von ${cards.length} Karten` });

		const box = body.createDiv({ cls: "sd-review" });
		for (const c of pick) {
			const det = box.createEl("details", { cls: "sd-flashcard" });
			const s = det.createEl("summary");
			const q = s.createDiv({ cls: "sd-flashcard-q" });
			await ctx.markdown(q, c.q, c.file.path);
			const src = s.createDiv({ cls: "sd-muted sd-tiny" });
			ctx.fileLink(src, c.file);
			const ans = det.createDiv({ cls: "sd-flashcard-a" });
			await ctx.markdown(ans, c.a, c.file.path);
		}
	},
};
