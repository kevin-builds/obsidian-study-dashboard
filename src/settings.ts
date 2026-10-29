export type WidgetId =
	| "activity"
	| "calendar"
	| "calendarEmbed"
	| "studyplan"
	| "countdown"
	| "todos"
	| "folder"
	| "recent"
	| "review";

export interface WidgetConfig {
	id: WidgetId;
	enabled: boolean;
}

export interface CalendarSource {
	name: string;
	url: string;
	color: string;
	enabled: boolean;
}

export interface ColorRule {
	keyword: string;
	color: string;
}

export interface Exam {
	subject: string;
	/** Unter-Tag von #flashcards, z.B. "Rechnerarchitektur" für #flashcards/Rechnerarchitektur */
	deck: string;
	/** YYYY-MM-DD oder leer */
	date: string;
}

export interface DashboardSettings {
	widgets: WidgetConfig[];
	openOnStartup: boolean;

	// Allgemein
	excludedFolders: string[];
	excludedNames: string[];

	// Aktivität
	activityMode: "created" | "modified";
	activityWeeks: number;

	// Lernplan
	flashcardTag: string;
	dailyGoal: number;
	reviewCount: number;
	exams: Exam[];

	// Kalender
	calendars: CalendarSource[];
	colorRules: ColorRule[];
	calendarEmbedUrl: string;
	calendarCacheMinutes: number;
	examColor: string;

	// To-Dos
	todoFile: string;

	// Ordner-Widget
	folderPath: string;
	folderTitle: string;

	// Zuletzt bearbeitet
	recentCount: number;
}

export const WIDGET_LABELS: Record<WidgetId, string> = {
	activity: "📊 Aktivität (Heatmap)",
	calendar: "📅 Kalender",
	calendarEmbed: "📆 Kalender-iframe",
	studyplan: "🎴 Lernplan",
	countdown: "⏰ Klausur-Countdown",
	todos: "✅ To-Dos",
	folder: "🗒️ Ordner-Notizen",
	recent: "🗂️ Zuletzt bearbeitet",
	review: "🔀 Wiederholung",
};

export const DEFAULT_SETTINGS: DashboardSettings = {
	widgets: [
		{ id: "activity", enabled: true },
		{ id: "calendar", enabled: true },
		{ id: "calendarEmbed", enabled: false },
		{ id: "studyplan", enabled: true },
		{ id: "countdown", enabled: true },
		{ id: "todos", enabled: true },
		{ id: "folder", enabled: true },
		{ id: "recent", enabled: true },
		{ id: "review", enabled: true },
	],
	openOnStartup: false,

	excludedFolders: [],
	excludedNames: [],

	activityMode: "created",
	activityWeeks: 52,

	flashcardTag: "Lernplan",
	dailyGoal: 30,
	reviewCount: 10,
	exams: [],

	calendars: [],
	colorRules: [],
	calendarEmbedUrl: "",
	calendarCacheMinutes: 30,
	examColor: "#e93147",

	todoFile: "To-Dos.md",

	folderPath: "Notizen",
	folderTitle: "🗒️ Notizen",

	recentCount: 8,
};

/** Ergänzt fehlende Widgets (z.B. nach einem Update), behält Reihenfolge des Nutzers. */
export function normalizeSettings(s: DashboardSettings): DashboardSettings {
	const known = new Set(s.widgets.map((w) => w.id));
	for (const w of DEFAULT_SETTINGS.widgets) if (!known.has(w.id)) s.widgets.push({ ...w });
	s.widgets = s.widgets.filter((w) => w.id in WIDGET_LABELS);
	return s;
}
