export type WidgetId =
	| "activity"
	| "lecturePlan"
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

	// Vorlesungsplan
	lecturePlanUrl: string;
	lecturePlanCollapsed: boolean;

	// Kalender
	calendars: CalendarSource[];
	colorRules: ColorRule[];
	calendarEmbedUrl: string;
	calendarCacheMinutes: number;
	examColor: string;

	// To-Dos
	todoFile: string;

	// Notizen mit Klausuren-Tabelle und Kalender-Zeilen (leer = nur Einstellungen)
	examsFile: string;
	calendarFile: string;

	// Ordner-Widget
	folderPath: string;
	folderTitle: string;

	// Zuletzt bearbeitet
	recentCount: number;
}

export const WIDGET_LABELS: Record<WidgetId, string> = {
	activity: "📊 Aktivität (Heatmap)",
	lecturePlan: "🎓 Vorlesungsplan",
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
		{ id: "lecturePlan", enabled: true },
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

	lecturePlanUrl: "",
	lecturePlanCollapsed: false,

	calendars: [],
	colorRules: [],
	calendarEmbedUrl: "",
	calendarCacheMinutes: 30,
	examColor: "#e93147",

	todoFile: "To-Dos.md",
	examsFile: "",
	calendarFile: "",

	folderPath: "Notizen",
	folderTitle: "🗒️ Notizen",

	recentCount: 8,
};

/** Ergänzt fehlende Widgets (z.B. nach einem Update) an ihrer Standard-Position, behält Reihenfolge des Nutzers. */
export function normalizeSettings(s: DashboardSettings): DashboardSettings {
	const defs = DEFAULT_SETTINGS.widgets;
	defs.forEach((w, i) => {
		if (s.widgets.some((x) => x.id === w.id)) return;
		// vor dem nächsten bekannten Nachfolger aus der Standard-Reihenfolge einfügen
		const next = defs.slice(i + 1).map((d) => s.widgets.findIndex((x) => x.id === d.id)).find((j) => j >= 0);
		s.widgets.splice(next ?? s.widgets.length, 0, { ...w });
	});
	s.widgets = s.widgets.filter((w) => w.id in WIDGET_LABELS);
	return s;
}
