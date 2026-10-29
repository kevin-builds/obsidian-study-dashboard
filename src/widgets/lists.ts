import { normalizePath, Notice, TFile, TFolder } from "obsidian";
import type { WidgetDef } from "../dashboard";
import { empty, fileRow, fmtTime, folderOf } from "./ui";

const TASK = /^(\s*[-*+] \[)(.)(\] ?)(.*)$/;

export const todos: WidgetDef = {
	title: () => "✅ To-Dos",
	scroll: true,
	async render(ctx) {
		const { body, aside } = ctx.card;
		const { app, settings } = ctx;
		const path = normalizePath(settings.todoFile || "To-Dos.md");
		const file = app.vault.getAbstractFileByPath(path.endsWith(".md") ? path : path + ".md");

		// Schnell hinzufügen
		const form = body.createEl("form", { cls: "sd-todo-add" });
		const input = form.createEl("input", { type: "text", attr: { placeholder: "Neues To-Do … (Enter)" } });
		form.addEventListener("submit", async (e) => {
			e.preventDefault();
			const text = input.value.trim();
			if (!text) return;
			let f = app.vault.getAbstractFileByPath(path.endsWith(".md") ? path : path + ".md");
			if (!f) f = await app.vault.create(path.endsWith(".md") ? path : path + ".md", "");
			if (!(f instanceof TFile)) return;
			await app.vault.process(f, (data) => {
				const lines = data.split("\n");
				// hinter dem letzten To-Do einfügen, sonst ans Ende
				let at = -1;
				lines.forEach((l, i) => TASK.test(l) && (at = i));
				if (at === -1) return data.replace(/\n*$/, "") + (data.trim() ? "\n\n" : "") + `- [ ] ${text}\n`;
				lines.splice(at + 1, 0, `- [ ] ${text}`);
				return lines.join("\n");
			});
			input.value = "";
			// das Dashboard aktualisiert sich über das modify-Event von selbst
		});

		if (!(file instanceof TFile)) {
			empty(body, "To-Do-Datei existiert noch nicht — das erste To-Do legt sie an.");
			return;
		}
		const lines = (await app.vault.cachedRead(file)).split("\n");
		const open: { line: number; text: string }[] = [];
		lines.forEach((l, i) => {
			const m = l.match(TASK);
			if (m && m[2] === " ") open.push({ line: i, text: m[4] });
		});
		aside.setText(`${open.length} offen`);

		if (!open.length) empty(body, "Nichts offen ✅");
		// Bewusst ohne Obsidians task-list-Klassen: deren CSS schiebt die Checkbox links aus der Karte heraus
		const list = body.createEl("ul", { cls: "sd-todos" });
		for (const t of open) {
			const li = list.createEl("li", { cls: "sd-todo" });
			const cb = li.createEl("input", { type: "checkbox", cls: "sd-todo-checkbox" });
			const label = li.createSpan({ cls: "sd-todo-text" });
			await ctx.markdown(label, t.text, file.path);
			// <p> aus dem Markdown-Renderer entpacken, damit die Zeile kompakt bleibt
			label.querySelectorAll("p").forEach((p) => p.replaceWith(...Array.from(p.childNodes)));
			cb.addEventListener("change", async () => {
				li.addClass("is-done");
				await app.vault.process(file, (data) => {
					const ls = data.split("\n");
					// Zeile prüfen (Datei könnte inzwischen geändert sein), sonst per Text suchen
					let idx = ls[t.line]?.match(TASK)?.[4] === t.text ? t.line : ls.findIndex((l) => l.match(TASK)?.[4] === t.text && l.match(TASK)?.[2] === " ");
					if (idx < 0) {
						new Notice("To-Do nicht mehr gefunden — Datei wurde geändert.");
						return data;
					}
					ls[idx] = ls[idx].replace(TASK, "$1x$3$4");
					return ls.join("\n");
				});
			});
		}
		const foot = body.createDiv({ cls: "sd-tiny sd-hint" });
		ctx.fileLink(foot, file, "Liste öffnen →");
	},
};

export const folder: WidgetDef = {
	title: (s) => s.folderTitle || "🗒️ Notizen",
	scroll: true,
	render(ctx) {
		const { body } = ctx.card;
		const { app, settings } = ctx;
		const dir = normalizePath(settings.folderPath || "/");
		const root = app.vault.getAbstractFileByPath(dir);

		// Neue Notiz im Ordner anlegen und mit markiertem Titel öffnen (wie Obsidians "Neue Notiz")
		const add = ctx.card.aside.createEl("button", { text: "＋ Neue Notiz", cls: "sd-btn sd-btn-small" });
		add.addEventListener("click", async () => {
			if (!app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
			let path = normalizePath(`${dir}/Unbenannt.md`);
			for (let i = 1; app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${dir}/Unbenannt ${i}.md`);
			const file = await app.vault.create(path, "");
			await app.workspace.getLeaf("tab").openFile(file, { active: true, state: { mode: "source" }, eState: { rename: "all" } });
		});

		if (!(root instanceof TFolder)) {
			empty(body, `Ordner „${dir}" gibt es noch nicht — „＋ Neue Notiz“ legt ihn an.`);
			return;
		}
		const files: TFile[] = [];
		const walk = (f: TFolder) => {
			for (const c of f.children) {
				if (c instanceof TFolder) walk(c);
				else if (c instanceof TFile && c.extension === "md" && c.basename !== root.name) files.push(c); // Folder Note ausblenden
			}
		};
		walk(root);
		files.sort((a, b) => b.stat.mtime - a.stat.mtime);
		if (!files.length) empty(body, "Noch keine Notizen.");
		for (const f of files.slice(0, settings.recentCount)) {
			const sub = folderOf(f) !== root.path ? folderOf(f).slice(root.path.length + 1) : undefined;
			fileRow(body, (p) => ctx.fileLink(p, f), new Date(f.stat.mtime).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }), sub);
		}
	},
};

export const recent: WidgetDef = {
	title: () => "🗂️ Zuletzt bearbeitet",
	scroll: true,
	render(ctx) {
		const files = ctx.files().sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, ctx.settings.recentCount);
		if (!files.length) empty(ctx.card.body, "Noch keine Notizen.");
		for (const f of files) fileRow(ctx.card.body, (p) => ctx.fileLink(p, f), fmtTime(f.stat.mtime), folderOf(f));
	},
};
