import { debounce, ItemView, MarkdownRenderChild, Plugin, requestUrl, TAbstractFile, WorkspaceLeaf } from "obsidian";
import { DashboardRenderer } from "./dashboard";
import { IcsEvent, parseICS } from "./ics";
import { DashboardSettings, DEFAULT_SETTINGS, normalizeSettings, WIDGET_LABELS, WidgetId } from "./settings";
import { DashboardSettingTab } from "./settings-tab";

export const VIEW_TYPE = "study-dashboard";

class DashboardView extends ItemView {
	renderer: DashboardRenderer | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: StudyDashboardPlugin) {
		super(leaf);
	}
	getViewType() {
		return VIEW_TYPE;
	}
	getDisplayText() {
		return "Dashboard";
	}
	getIcon() {
		return "layout-dashboard";
	}
	async onOpen() {
		this.contentEl.addClass("sd-view");
		this.renderer = new DashboardRenderer(this.plugin, this.contentEl.createDiv(), this);
		this.plugin.hosts.add(this.renderer);
		await this.renderer.render();
	}
	async onClose() {
		if (this.renderer) this.plugin.hosts.delete(this.renderer);
	}
}

class DashboardBlock extends MarkdownRenderChild {
	renderer: DashboardRenderer;
	constructor(el: HTMLElement, private plugin: StudyDashboardPlugin, sourcePath: string, only: WidgetId[] | null) {
		super(el);
		this.renderer = new DashboardRenderer(plugin, el, this, sourcePath, only);
	}
	onload() {
		this.plugin.hosts.add(this.renderer);
		this.renderer.render();
	}
	onunload() {
		this.plugin.hosts.delete(this.renderer);
	}
}

export default class StudyDashboardPlugin extends Plugin {
	settings: DashboardSettings = DEFAULT_SETTINGS;
	hosts = new Set<DashboardRenderer>();
	private icsCache = new Map<string, { at: number; events: Promise<IcsEvent[]> }>();

	async onload() {
		await this.loadSettings();

		this.registerView(VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
		this.addRibbonIcon("layout-dashboard", "Dashboard öffnen", () => this.openView());
		this.addCommand({ id: "open", name: "Dashboard öffnen", callback: () => this.openView() });
		this.addCommand({
			id: "refresh",
			name: "Dashboard neu laden (Kalender neu abrufen)",
			callback: () => {
				this.icsCache.clear();
				this.refreshAll();
			},
		});

		// ```study-dashboard``` in jeder Notiz — optional mit Zeile "widgets: calendar, todos"
		this.registerMarkdownCodeBlockProcessor("study-dashboard", (source, el, ctx) => {
			const m = source.match(/^\s*widgets\s*:\s*(.+)$/im);
			const only = m
				? (m[1].split(/[,\s]+/).filter((w) => w in WIDGET_LABELS) as WidgetId[])
				: null;
			ctx.addChild(new DashboardBlock(el, this, ctx.sourcePath, only));
		});

		this.addSettingTab(new DashboardSettingTab(this.app, this));

		// Live-Aktualisierung bei Änderungen im Vault (gebündelt, nur sichtbare Dashboards)
		const schedule = debounce(() => this.refreshAll(true), 1500, true);
		const onChange = (f: TAbstractFile) => {
			if (f.path.startsWith(this.app.vault.configDir)) return;
			schedule();
		};
		this.registerEvent(this.app.vault.on("create", onChange));
		this.registerEvent(this.app.vault.on("delete", onChange));
		this.registerEvent(this.app.vault.on("rename", onChange));
		this.registerEvent(this.app.metadataCache.on("changed", onChange));
		// Mitternacht / längere Pausen: beim Zurückkehren ins Fenster neu zeichnen
		this.registerDomEvent(window, "focus", () => schedule());
		// Verdeckte Dashboards werden nicht aktualisiert — beim Wieder-Anzeigen nachholen
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refreshAll(true, true)));

		this.app.workspace.onLayoutReady(() => {
			if (this.settings.openOnStartup) this.openView(true);
		});
	}

	async openView(replace = false) {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (existing) {
			workspace.revealLeaf(existing);
			return;
		}
		const leaf = replace ? workspace.getLeaf(false) : workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE, active: true });
		workspace.revealLeaf(leaf);
	}

	refreshAll(onlyVisible = false, onlyStale = false) {
		for (const h of this.hosts) {
			if (onlyVisible && !h.isVisible()) {
				h.stale = true;
				continue;
			}
			if (onlyStale && !h.stale) continue;
			h.render();
		}
	}

	/** iCal-Feed holen, mit Zwischenspeicher, damit nicht jedes Neu-Zeichnen den Server fragt. */
	fetchCalendar(url: string): Promise<IcsEvent[]> {
		url = url.trim();
		const ttl = Math.max(1, this.settings.calendarCacheMinutes) * 60000;
		const hit = this.icsCache.get(url);
		if (hit && Date.now() - hit.at < ttl) return hit.events;
		// requestUrl umgeht CORS und funktioniert auf Desktop und Mobile
		const events = requestUrl({ url: url.replace(/^webcal:\/\//i, "https://") }).then((r) => parseICS(r.text));
		this.icsCache.set(url, { at: Date.now(), events });
		events.catch(() => this.icsCache.delete(url));
		return events;
	}

	async loadSettings() {
		const data = (await this.loadData()) ?? {};
		this.settings = normalizeSettings(Object.assign(structuredClone(DEFAULT_SETTINGS), data));
	}

	// Beim Tippen in den Einstellungen nicht bei jedem Buchstaben neu zeichnen
	private refreshSoon = debounce(() => this.refreshAll(), 800, true);

	async saveSettings() {
		await this.saveData(this.settings);
		this.refreshSoon();
	}

	clearCalendarCache() {
		this.icsCache.clear();
	}
}
