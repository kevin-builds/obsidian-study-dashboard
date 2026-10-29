import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import type StudyDashboardPlugin from "./main";
import { FlashcardData, loadFlashcards } from "./flashcards";
import { DashboardSettings, WidgetId } from "./settings";
import { WIDGETS } from "./widgets";

/** Zustand, der ein Neu-Rendern (z.B. nach Dateiänderung) überlebt. */
export interface DashboardState {
	calendarOffset: number;
	selectedDay: string | null;
	activityDay: string | null;
	reviewSeed: number;
}

export interface Card {
	el: HTMLElement;
	head: HTMLElement;
	aside: HTMLElement;
	body: HTMLElement;
}

export interface WidgetContext {
	app: App;
	plugin: StudyDashboardPlugin;
	settings: DashboardSettings;
	component: Component;
	state: DashboardState;
	/** Pfad der Notiz, in der das Dashboard steckt (für Links) — leer in der eigenen Ansicht. */
	sourcePath: string;
	card: Card;
	/** Alle Markdown-Dateien ohne ausgeschlossene Ordner/Namen und ohne die Dashboard-Notiz selbst. */
	files(): TFile[];
	isExcluded(f: TFile): boolean;
	flashcards(): Promise<FlashcardData>;
	rerender(): void;
	markdown(el: HTMLElement, md: string, sourcePath?: string): Promise<void>;
	openFile(path: string, newTab?: boolean): void;
	fileLink(parent: HTMLElement, file: TFile | string, text?: string): HTMLElement;
}

export type Widget = (ctx: WidgetContext) => Promise<void> | void;

export interface WidgetDef {
	title: (s: DashboardSettings) => string;
	full?: boolean;
	scroll?: boolean;
	render: Widget;
}

/**
 * Rendert das Dashboard in einen Container. Wird sowohl von der eigenen Ansicht
 * als auch vom Codeblock ```study-dashboard``` benutzt.
 */
export class DashboardRenderer {
	state: DashboardState = { calendarOffset: 0, selectedDay: null, activityDay: null, reviewSeed: Math.random() };
	/** Änderungen verpasst, weil verdeckt — beim nächsten Anzeigen neu zeichnen. */
	stale = false;
	private generation = 0;

	constructor(
		private plugin: StudyDashboardPlugin,
		private root: HTMLElement,
		private component: Component,
		private sourcePath = "",
		private only: WidgetId[] | null = null
	) {}

	isVisible() {
		return this.root.isConnected && this.root.isShown();
	}

	async render() {
		this.stale = false;
		const gen = ++this.generation;
		const { app, settings } = this.plugin;
		const scrollTop = this.root.closest(".view-content, .markdown-preview-view")?.scrollTop;

		const grid = createDiv({ cls: "sd-root" });
		// Erster Render: sofort anzeigen (Kalender lädt evtl. länger). Danach erst tauschen, wenn alles fertig ist → kein Flackern.
		const firstRender = !this.root.hasChildNodes();
		if (firstRender) this.root.appendChild(grid);
		let flash: Promise<FlashcardData> | null = null;

		const isExcluded = (f: TFile) =>
			f.path === this.sourcePath ||
			settings.excludedFolders.some((p) => p && (f.path === p || f.path.startsWith(p.replace(/\/$/, "") + "/"))) ||
			settings.excludedNames.includes(f.basename);

		const widgets = settings.widgets.filter((w) => (this.only ? this.only.includes(w.id) : w.enabled));
		const jobs: Promise<void>[] = [];
		for (const w of widgets) {
			const def = WIDGETS[w.id];
			const el = grid.createDiv({ cls: "sd-card" + (def.full ? " sd-full" : "") });
			el.dataset.widget = w.id;
			const head = el.createDiv({ cls: "sd-card-head" });
			head.createSpan({ cls: "sd-card-title", text: def.title(settings) });
			const aside = head.createSpan({ cls: "sd-card-aside" });
			const body = el.createDiv({ cls: "sd-card-body" + (def.scroll ? " sd-scroll" : "") });

			const ctx: WidgetContext = {
				app,
				plugin: this.plugin,
				settings,
				component: this.component,
				state: this.state,
				sourcePath: this.sourcePath,
				card: { el, head, aside, body },
				files: () => app.vault.getMarkdownFiles().filter((f) => !isExcluded(f)),
				isExcluded,
				flashcards: () => (flash ??= loadFlashcards(app, settings.flashcardTag, isExcluded)),
				rerender: () => this.render(),
				markdown: (target, md, sp) =>
					MarkdownRenderer.render(app, md, target, sp ?? this.sourcePath, this.component),
				openFile: (path, newTab = false) => app.workspace.openLinkText(path, this.sourcePath, newTab),
				fileLink: (parent, file, text) => {
					const path = typeof file === "string" ? file : file.path;
					const a = parent.createEl("a", {
						cls: "internal-link sd-link",
						text: text ?? (typeof file === "string" ? file : file.basename),
						attr: { href: path, "data-href": path },
					});
					a.addEventListener("click", (e) => {
						e.preventDefault();
						app.workspace.openLinkText(path, this.sourcePath, e.ctrlKey || e.metaKey);
					});
					a.addEventListener("mouseover", (e) =>
						app.workspace.trigger("hover-link", { event: e, source: "study-dashboard", hoverParent: this.component, targetEl: a, linktext: path, sourcePath: this.sourcePath })
					);
					return a;
				},
			};

			// Jede Karte isoliert: ein Fehler blendet nur diese Karte aus.
			jobs.push(
				Promise.resolve()
					.then(() => def.render(ctx))
					.catch((e) => {
						console.error(`[Study Dashboard] Widget "${w.id}" fehlgeschlagen:`, e);
						body.empty();
						body.createDiv({ cls: "sd-error", text: "Dieses Widget konnte nicht geladen werden." });
						body.createDiv({ cls: "sd-muted sd-small", text: String((e as Error)?.message ?? e) });
					})
			);
		}

		if (!widgets.length) grid.createDiv({ cls: "sd-muted", text: "Keine Widgets aktiv — in den Plugin-Einstellungen einschalten." });

		await Promise.all(jobs);
		if (gen !== this.generation) return; // ein neuerer Render hat uns überholt
		// Widgets, die nichts anzeigen wollen (z.B. Countdown ohne Klausuren), entfernen sich selbst
		grid.querySelectorAll(".sd-card.sd-hidden").forEach((c) => c.remove());
		if (firstRender) return;
		this.root.empty();
		this.root.appendChild(grid);
		const sc = this.root.closest(".view-content, .markdown-preview-view");
		if (sc && scrollTop) sc.scrollTop = scrollTop;
	}
}
