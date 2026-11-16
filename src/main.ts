import { debounce, ItemView, MarkdownRenderChild, normalizePath, Notice, Plugin, requestUrl, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { DashboardRenderer } from "./dashboard";
import { IcsEvent, parseICS } from "./ics";
import { createTemplateFolder, parseCalendarNote, parseExams, readNote, TEMPLATE_FILES } from "./note-config";
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
	/** Letzter erfolgreicher Stand je Feed */
	private icsGood = new Map<string, { at: number; events: IcsEvent[] }>();
	/** Fehler-Backoff je Feed: bis wann nicht neu fragen */
	private icsFail = new Map<string, { until: number; delay: number; message: string }>();

	async onload() {
		await this.loadSettings();

		this.registerView(VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
		this.addRibbonIcon("layout-dashboard", "Dashboard öffnen", () => this.openView());
		this.addCommand({ id: "open", name: "Dashboard öffnen", callback: () => this.openView() });
		this.addCommand({ id: "create-folder", name: "Dashboard-Ordner mit Vorlagen anlegen", callback: () => this.createDashboardFolder() });
		this.addCommand({
			id: "refresh",
			name: "Dashboard neu laden (Kalender neu abrufen)",
			callback: () => {
				this.clearCalendarCache();
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

	/**
	 * Einstellungen plus Klausuren/Kalender aus den Notizen (falls eingestellt).
	 * Einträge aus den Notizen kommen zuerst; doppelte aus den Einstellungen (gleiches Deck/gleicher Link) entfallen.
	 */
	async effectiveSettings(): Promise<DashboardSettings> {
		const s = this.settings;
		const [examText, calText] = await Promise.all([readNote(this.app, s.examsFile), readNote(this.app, s.calendarFile)]);
		if (examText === null && calText === null) return s;
		const out = { ...s };
		if (examText !== null) {
			const fromNote = parseExams(examText);
			const key = (e: { subject: string; deck: string }) => (e.deck || e.subject).toLowerCase();
			const seen = new Set(fromNote.map(key));
			out.exams = [...fromNote, ...s.exams.filter((e) => !seen.has(key(e)))];
		}
		if (calText !== null) {
			const note = parseCalendarNote(calText);
			const urls = new Set(note.calendars.map((c) => c.url));
			out.calendars = [...note.calendars, ...s.calendars.filter((c) => !urls.has(c.url.trim()))];
			out.colorRules = [...note.colorRules, ...s.colorRules];
		}
		return out;
	}

	/** Legt Dashboard/ mit Home, To-Dos, Klausuren und Kalender an und stellt die Pfade darauf ein. */
	async createDashboardFolder(folder = "Dashboard") {
		try {
			const { dir, created, kept } = await createTemplateFolder(this.app, folder);
			const s = this.settings;
			s.todoFile = `${dir}/${TEMPLATE_FILES.todos}`;
			s.examsFile = `${dir}/${TEMPLATE_FILES.exams}`;
			s.calendarFile = `${dir}/${TEMPLATE_FILES.calendar}`;
			// Die Dashboard-Dateien sollen nicht als eigene Aktivität zählen
			if (!s.excludedFolders.includes(dir)) s.excludedFolders.push(dir);
			await this.saveSettings();
			const msg = created.length ? `Angelegt in „${dir}“: ${created.join(", ")}.` : `„${dir}“ war schon vollständig.`;
			new Notice(msg + (kept.length && created.length ? ` Unverändert: ${kept.join(", ")}.` : ""));
			const home = this.app.vault.getAbstractFileByPath(normalizePath(`${dir}/${TEMPLATE_FILES.home}`));
			if (home instanceof TFile) await this.app.workspace.getLeaf("tab").openFile(home);
		} catch (e) {
			new Notice(`Dashboard-Ordner konnte nicht angelegt werden: ${e instanceof Error ? e.message : e}`);
		}
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

	/**
	 * iCal-Feed holen, mit Zwischenspeicher, damit nicht jedes Neu-Zeichnen den Server fragt.
	 * - Erfolgreiche Abrufe werden auch auf der Platte gespeichert (überlebt Neustarts → kein Abruf beim Start).
	 * - Nach einem Fehler wird eine Weile gar nicht mehr gefragt (Backoff), sonst hält z.B. Google
	 *   mit „429 Too Many Requests“ die Sperre aufrecht. Solange wird der letzte gute Stand angezeigt.
	 * - force: Aktualisieren-Knopf — ignoriert Zwischenspeicher und Backoff (höchstens alle 30 s).
	 */
	async fetchCalendar(url: string, force = false): Promise<IcsEvent[]> {
		url = url.trim();
		const now = Date.now();
		const ttl = Math.max(1, this.settings.calendarCacheMinutes) * 60000;
		const hit = this.icsCache.get(url);
		if (hit && (!force || now - hit.at < 30000) && now - hit.at < ttl) return hit.events;

		const good = this.icsGood.get(url) ?? (await this.readDiskCache(url));
		if (!force && good && now - good.at < ttl) {
			const events = Promise.resolve(good.events);
			this.icsCache.set(url, { at: good.at, events });
			return events;
		}
		const fail = this.icsFail.get(url);
		if (!force && fail && now < fail.until) {
			if (good) return good.events;
			throw new Error(fail.message);
		}

		const events = this.download(url, good);
		this.icsCache.set(url, { at: now, events });
		events.catch(() => this.icsCache.delete(url));
		return events;
	}

	private async download(url: string, good: { at: number; events: IcsEvent[] } | null): Promise<IcsEvent[]> {
		let status = 0;
		let text = "";
		try {
			// requestUrl umgeht CORS und funktioniert auf Desktop und Mobile
			const r = await requestUrl({ url: url.replace(/^webcal:\/\//i, "https://"), throw: false });
			status = r.status;
			text = r.text;
		} catch (e) {
			status = 0;
		}
		if (status >= 200 && status < 300 && /BEGIN:VCALENDAR/.test(text)) {
			const events = parseICS(text);
			this.icsGood.set(url, { at: Date.now(), events });
			this.icsFail.delete(url);
			void this.writeDiskCache(url, text);
			return events;
		}
		// Fehler: Wartezeit verdoppeln (5 min … 2 h), bei 429 gleich mit 15 min anfangen
		const prev = this.icsFail.get(url)?.delay ?? 0;
		const delay = Math.min(120, Math.max(status === 429 ? 15 : 5, prev * 2));
		const message =
			status === 429
				? "Zu viele Abrufe — der Server blockt kurz"
				: status === 0
					? "Keine Verbindung"
					: `Server antwortet mit Fehler ${status}`;
		this.icsFail.set(url, { until: Date.now() + delay * 60000, delay, message });
		console.warn(`[Study Dashboard] Kalender-Abruf fehlgeschlagen (${status || "offline"}), nächster Versuch in ${delay} min`);
		if (good) return good.events;
		throw new Error(message);
	}

	/** Für die Anzeige: Stand des letzten erfolgreichen Abrufs und ggf. aktueller Fehler. */
	calendarStatus(url: string): { at: number | null; error: string | null } {
		url = url.trim();
		const fail = this.icsFail.get(url);
		return { at: this.icsGood.get(url)?.at ?? null, error: fail && Date.now() < fail.until ? fail.message : null };
	}

	// --- Platten-Zwischenspeicher (im Plugin-Ordner, damit ein Neustart nicht sofort neu abruft) ---
	private cacheFile = () => `${this.manifest.dir}/ics-cache.json`;
	private diskCache: Record<string, { at: number; text: string }> | null = null;
	private cacheKey(url: string) {
		let h = 0;
		for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
		return "k" + (h >>> 0).toString(36);
	}
	private async loadDiskCache() {
		if (this.diskCache) return this.diskCache;
		try {
			this.diskCache = JSON.parse(await this.app.vault.adapter.read(this.cacheFile()));
		} catch {
			this.diskCache = {};
		}
		return this.diskCache!;
	}
	private async readDiskCache(url: string) {
		const entry = (await this.loadDiskCache())[this.cacheKey(url)];
		if (!entry) return null;
		const good = { at: entry.at, events: parseICS(entry.text) };
		this.icsGood.set(url, good);
		return good;
	}
	private async writeDiskCache(url: string, text: string) {
		const cache = await this.loadDiskCache();
		cache[this.cacheKey(url)] = { at: Date.now(), text };
		try {
			await this.app.vault.adapter.write(this.cacheFile(), JSON.stringify(cache));
		} catch (e) {
			console.warn("[Study Dashboard] Kalender-Zwischenspeicher nicht schreibbar:", e);
		}
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
		this.icsFail.clear();
	}
}
