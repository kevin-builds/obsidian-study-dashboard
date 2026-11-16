// Klausuren und Kalender aus Notizen lesen, und die Vorlage "Dashboard-Ordner" anlegen.
import { App, normalizePath, TFile } from "obsidian";
import type { CalendarSource, ColorRule, Exam } from "./settings";

/** Zeilen außerhalb von ```-Codeblöcken und <!-- Kommentaren --> */
function contentLines(text: string): string[] {
	const out: string[] = [];
	let fence = false;
	for (const line of text.replace(/<!--[\s\S]*?-->/g, "").split("\n")) {
		if (/^\s*(```|~~~)/.test(line)) {
			fence = !fence;
			continue;
		}
		if (!fence) out.push(line);
	}
	return out;
}

/** "2026-12-08" oder "08.12.2026" → "2026-12-08", sonst "" */
function isoDate(v: string): string {
	v = v.trim();
	let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
	if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
	m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
	if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
	return "";
}

/** "`#flashcards/5_Semester/Mathe`" → "Mathe" (gleiche Regel wie beim Zählen der Karten) */
function deckName(v: string): string {
	const parts = v
		.replace(/[`\s]/g, "")
		.replace(/^#/, "")
		.replace(/^flashcards\//i, "")
		.split("/")
		.filter((p) => p && !/^\d+_Semester$/i.test(p));
	return parts[0] ?? "";
}

/** Tabelle | Fach | Deck | Datum | */
export function parseExams(text: string): Exam[] {
	const exams: Exam[] = [];
	for (const line of contentLines(text)) {
		if (!/^\s*\|/.test(line)) continue;
		const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
		const [subject = "", deck = "", date = ""] = cells;
		if (!subject || /^:?-{2,}:?$/.test(subject) || /^fach$/i.test(subject)) continue;
		exams.push({ subject, deck: deckName(deck), date: isoDate(date) });
	}
	return exams;
}

/** Zeilen "Kalender:: Name | Link | #Farbe" und "Farbe:: Stichwort | #Farbe" */
export function parseCalendarNote(text: string): { calendars: CalendarSource[]; colorRules: ColorRule[] } {
	const calendars: CalendarSource[] = [];
	const colorRules: ColorRule[] = [];
	// Hex oder ein Farbname, den CSS kennt („red“ ja, „rot“ nein)
	const isColor = (c: string) => /^#[0-9a-f]{3,8}$/i.test(c) || (/^[a-z]+$/i.test(c) && typeof CSS !== "undefined" && CSS.supports("color", c));
	for (const raw of contentLines(text)) {
		const line = raw.replace(/^\s*[-*+]\s+/, "").trim();
		let m = line.match(/^Kalender\s*::\s*(.+)$/i);
		if (m) {
			const [name = "", url = "", color = ""] = m[1].split("|").map((c) => c.trim());
			if (/^(https?|webcal):\/\//i.test(url))
				calendars.push({ name: name || "Kalender", url, color: isColor(color) ? color : "#4285f4", enabled: true });
			continue;
		}
		m = line.match(/^Farbe\s*::\s*(.+)$/i);
		if (m) {
			const [keyword = "", color = ""] = m[1].split("|").map((c) => c.trim());
			if (keyword && isColor(color)) colorRules.push({ keyword, color });
		}
	}
	return { calendars, colorRules };
}

export async function readNote(app: App, path: string): Promise<string | null> {
	path = path.trim();
	if (!path) return null;
	const f = app.vault.getAbstractFileByPath(normalizePath(path.endsWith(".md") ? path : path + ".md"));
	return f instanceof TFile ? app.vault.cachedRead(f) : null;
}

// ---------- Vorlage ----------

const HOME = `---
cssclasses:
  - study-dashboard
---

\`\`\`study-dashboard
\`\`\`
`;

const TODOS = `# To-Dos

Diese Liste erscheint im **Dashboard** und lässt sich dort direkt abhaken. Neue To-Dos hier oder über das Eingabefeld im Dashboard ergänzen.

- [ ] Erstes To-Do
`;

const EXAMS = `# Klausuren

Diese Tabelle steuert den **Klausur-Countdown** und die Klausurtermine im **Kalender** des Dashboards. Pro Klausur eine Zeile ergänzen.

- **Fach**: frei wählbarer Name.
- **Deck**: der Karteikarten-Tag ohne \`#flashcards/\`, z.B. \`Mathe\` für \`#flashcards/Mathe\`. Darüber werden die Karten der Klausur zugeordnet. Eine Semester-Ebene wie in \`#flashcards/3_Semester/Mathe\` wird übersprungen.
- **Datum**: \`JJJJ-MM-TT\` oder \`TT.MM.JJJJ\`. Leer lassen, solange der Termin nicht feststeht.

| Fach | Deck | Datum |
| ---- | ---- | ----- |
|      |      |       |
`;

const CALENDAR = `# Kalender

Diese Datei steuert den **Kalender** im Dashboard. Jeder Kalender mit einem iCal-Link (\`https://…\` oder \`webcal://…\`) funktioniert.

> [!warning] Der Link ist wie ein Passwort
> Wer ihn hat, kann den Kalender lesen. Diese Notiz nicht teilen und den Vault nicht öffentlich machen. Wer das vermeiden will, trägt den Kalender stattdessen in den Plugin-Einstellungen ein.

## So kommt man an den Link

**Apple Kalender (iCloud)**
- iPhone/iPad: Kalender-App → unten *Kalender* → beim Kalender auf ⓘ → **Öffentlicher Kalender** einschalten → *Link teilen …* → *Kopieren*.
- Mac: Kalender-App → Rechtsklick auf den Kalender → *Kalender teilen …* → **Öffentlicher Kalender** anhaken → Link kopieren.
- Geht nur mit iCloud-Kalendern, nicht mit „Auf meinem Mac“.

**Google Kalender**: calendar.google.com → *Einstellungen* → links den Kalender wählen → *Kalender integrieren* → **Geheime Adresse im iCal-Format** kopieren.

**Outlook / Microsoft 365**: *Einstellungen* → *Kalender* → *Freigegebene Kalender* → *Kalender veröffentlichen* → ICS-Link kopieren.

## Meine Kalender

Eine Zeile pro Kalender: \`Kalender:: Name | Link | #Farbe\`

<!-- Beispiel (ohne die Kommentarzeichen):
Kalender:: Uni | webcal://p01-caldav.icloud.com/published/2/… | #ff3b30
-->

## Farben nach Stichwort

iCal-Links enthalten keine Termin-Farben. Enthält der Titel eines Termins das Stichwort, bekommt er diese Farbe (das erste passende gewinnt). Format: \`Farbe:: Stichwort | #Farbe\`

Farbe:: Klausur | #e93147
Farbe:: Prüfung | #e93147
`;

export const TEMPLATE_FILES = { home: "Home.md", todos: "To-Dos.md", exams: "Klausuren.md", calendar: "Kalender.md" } as const;

/** Legt fehlende Vorlagen-Dateien im Ordner an. Vorhandene Dateien bleiben unangetastet. */
export async function createTemplateFolder(app: App, folder: string): Promise<{ dir: string; created: string[]; kept: string[] }> {
	const dir = normalizePath(folder.trim() || "Dashboard");
	if (!app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
	const contents: Record<keyof typeof TEMPLATE_FILES, string> = { home: HOME, todos: TODOS, exams: EXAMS, calendar: CALENDAR };
	const created: string[] = [];
	const kept: string[] = [];
	for (const key of Object.keys(TEMPLATE_FILES) as (keyof typeof TEMPLATE_FILES)[]) {
		const path = normalizePath(`${dir}/${TEMPLATE_FILES[key]}`);
		if (app.vault.getAbstractFileByPath(path)) kept.push(TEMPLATE_FILES[key]);
		else {
			await app.vault.create(path, contents[key]);
			created.push(TEMPLATE_FILES[key]);
		}
	}
	return { dir, created, kept };
}
