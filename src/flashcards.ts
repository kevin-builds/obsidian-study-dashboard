import { App, getAllTags, TFile } from "obsidian";

// Format des Spaced-Repetition-Plugins (st3v3nmw/obsidian-spaced-repetition):
//   Frage            einzeilig:  Frage :: Antwort
//   ?                mehrzeilig: Frage, dann eine Zeile "?" (oder "??"), dann Antwort
//   Antwort
//   <!--SR:!2026-06-18,4,230-->   Fälligkeit, Intervall in Tagen, Ease
const SR_RE = /<!--SR:!(\d{4}-\d{2}-\d{2}),(\d+),(\d+)-->/g;
const SEPARATOR = /^\?\??$/;
const INLINE_CARD = /^[^\n<>|].*\S ::+ \S.*$/gm;

export interface Deck {
	file: TFile;
	deck: string;
	total: number;
	due: number;
	mature: number;
	neu: number;
}

export interface Card {
	q: string;
	a: string;
	file: TFile;
}

export interface FlashcardData {
	decks: Deck[];
	cards: Card[];
}

const normTag = (t: string) => t.replace(/^#/, "").toLowerCase();

export async function loadFlashcards(app: App, tag: string, isExcluded: (f: TFile) => boolean): Promise<FlashcardData> {
	const want = normTag(tag);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const decks: Deck[] = [];
	const cards: Card[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		if (isExcluded(file)) continue;
		const cache = app.metadataCache.getFileCache(file);
		const tags = cache ? (getAllTags(cache) ?? []).map(normTag) : [];
		// #Lernplan matcht auch #Lernplan/Unterthema
		if (!tags.some((t) => t === want || t.startsWith(want + "/"))) continue;

		const content = await app.vault.cachedRead(file);
		const fcTag = tags.find((t) => t === "flashcards" || t.startsWith("flashcards/"));
		// Originale Schreibweise des Deck-Namens aus dem Text holen (getAllTags liefert sie, normTag macht klein)
		const rawFc = cache ? (getAllTags(cache) ?? []).find((t) => normTag(t) === fcTag) : undefined;
		const deck = rawFc ? rawFc.split("/")[1] || "Allgemein" : file.basename;

		const total = (content.match(/^\?\??$/gm) || []).length + (content.match(INLINE_CARD) || []).length;
		let due = 0, mature = 0, scheduled = 0;
		for (const m of content.matchAll(SR_RE)) {
			scheduled++;
			if (new Date(m[1] + "T00:00:00") <= today) due++;
			if (parseInt(m[2]) >= 21) mature++;
		}
		decks.push({ file, deck, total, due, mature, neu: Math.max(0, total - scheduled) });

		const lines = content.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const inline = lines[i].match(/^([^\n<>|].*?\S) ::+ (\S.*)$/);
			if (inline) {
				cards.push({ q: inline[1], a: inline[2].replace(/<!--SR:.*?-->/g, "").trim(), file });
				continue;
			}
			if (!SEPARATOR.test(lines[i].trim())) continue;
			const q: string[] = [], a: string[] = [];
			for (let j = i - 1; j >= 0; j--) {
				const l = lines[j];
				if (!l.trim() || /^#{1,6}\s/.test(l) || /^---/.test(l)) break;
				q.unshift(l);
			}
			for (let j = i + 1; j < lines.length; j++) {
				const l = lines[j];
				if (!l.trim() || /^---/.test(l) || SEPARATOR.test(l.trim())) break;
				const clean = l.replace(/<!--SR:.*?-->/g, "").trimEnd();
				if (clean) a.push(clean);
			}
			if (q.length && a.length) cards.push({ q: q.join("\n"), a: a.join("\n"), file });
		}
	}
	return { decks, cards };
}
