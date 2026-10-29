import { App, PluginSettingTab, Setting } from "obsidian";
import type StudyDashboardPlugin from "./main";
import { WIDGET_LABELS } from "./settings";

const list = (v: string) => v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

export class DashboardSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: StudyDashboardPlugin) {
		super(app, plugin);
	}

	display() {
		const { containerEl } = this;
		const s = this.plugin.settings;
		const save = () => this.plugin.saveSettings();
		const saveAndRedraw = async () => {
			await save();
			this.display();
		};
		containerEl.empty();
		containerEl.addClass("sd-settings");

		// ---------- Allgemein ----------
		new Setting(containerEl).setName("Öffnen").setHeading();
		new Setting(containerEl)
			.setName("Beim Start öffnen")
			.setDesc("Öffnet das Dashboard als eigene Ansicht, sobald Obsidian startet. Alternativ den Codeblock ```study-dashboard``` in eine Notiz schreiben (z.B. für das Homepage-Plugin).")
			.addToggle((t) => t.setValue(s.openOnStartup).onChange((v) => ((s.openOnStartup = v), save())));

		// ---------- Widgets ----------
		new Setting(containerEl).setName("Widgets").setDesc("Ein-/ausschalten und Reihenfolge festlegen.").setHeading();
		s.widgets.forEach((w, i) => {
			new Setting(containerEl)
				.setName(WIDGET_LABELS[w.id])
				.addExtraButton((b) =>
					b.setIcon("arrow-up").setTooltip("Nach oben").setDisabled(i === 0).onClick(() => {
						[s.widgets[i - 1], s.widgets[i]] = [s.widgets[i], s.widgets[i - 1]];
						saveAndRedraw();
					})
				)
				.addExtraButton((b) =>
					b.setIcon("arrow-down").setTooltip("Nach unten").setDisabled(i === s.widgets.length - 1).onClick(() => {
						[s.widgets[i + 1], s.widgets[i]] = [s.widgets[i], s.widgets[i + 1]];
						saveAndRedraw();
					})
				)
				.addToggle((t) => t.setValue(w.enabled).onChange((v) => ((w.enabled = v), save())));
		});

		// ---------- Filter ----------
		new Setting(containerEl).setName("Filter").setHeading();
		new Setting(containerEl)
			.setName("Ausgeschlossene Ordner")
			.setDesc("Werden bei Aktivität, „Zuletzt bearbeitet“ und Karteikarten ignoriert. Ein Ordner pro Zeile, z.B. _System oder Templates.")
			.addTextArea((t) =>
				t.setValue(s.excludedFolders.join("\n")).onChange((v) => ((s.excludedFolders = list(v)), save()))
			);
		new Setting(containerEl)
			.setName("Ausgeschlossene Dateinamen")
			.setDesc("Dateinamen ohne .md, ein Name pro Zeile (z.B. CLAUDE, Home).")
			.addTextArea((t) => t.setValue(s.excludedNames.join("\n")).onChange((v) => ((s.excludedNames = list(v)), save())));

		// ---------- Aktivität ----------
		new Setting(containerEl).setName("Aktivität").setHeading();
		new Setting(containerEl)
			.setName("Was zählt als Aktivität?")
			.setDesc("Erstellt = neue Notizen pro Tag. Bearbeitet = Tag der letzten Änderung jeder Notiz.")
			.addDropdown((d) =>
				d
					.addOptions({ created: "Erstellt", modified: "Zuletzt bearbeitet" })
					.setValue(s.activityMode)
					.onChange((v) => ((s.activityMode = v as "created" | "modified"), save()))
			);
		new Setting(containerEl)
			.setName("Wochen in der Heatmap")
			.addSlider((sl) => sl.setLimits(12, 104, 4).setValue(s.activityWeeks).setDynamicTooltip().onChange((v) => ((s.activityWeeks = v), save())));

		// ---------- Lernplan ----------
		new Setting(containerEl).setName("Lernplan & Karteikarten").setHeading();
		containerEl.createDiv({
			cls: "setting-item-description sd-settings-note",
			text: "Liest Karteikarten im Format des Spaced-Repetition-Plugins (Frage / ? / Antwort und Frage :: Antwort). Nur Notizen mit dem Lernplan-Tag werden berücksichtigt.",
		});
		new Setting(containerEl)
			.setName("Lernplan-Tag")
			.setDesc("Ohne #. Unter-Tags zählen mit (Lernplan/Mathe).")
			.addText((t) => t.setValue(s.flashcardTag).onChange((v) => ((s.flashcardTag = v.replace(/^#/, "").trim() || "Lernplan"), save())));
		new Setting(containerEl)
			.setName("Tagesziel (Karten)")
			.addText((t) => num(t, s.dailyGoal, (v) => ((s.dailyGoal = v), save())));
		new Setting(containerEl)
			.setName("Karten in der Wiederholung")
			.addText((t) => num(t, s.reviewCount, (v) => ((s.reviewCount = v), save())));

		new Setting(containerEl).setName("Klausuren").setDesc("Deck = Unter-Tag von #flashcards, z.B. „Mathe“ für #flashcards/Mathe. Datum leer lassen, wenn noch unbekannt.").setHeading();
		s.exams.forEach((ex, i) => {
			new Setting(containerEl)
				.setClass("sd-settings-row")
				.addText((t) => t.setPlaceholder("Fach").setValue(ex.subject).onChange((v) => ((ex.subject = v), save())))
				.addText((t) => t.setPlaceholder("Deck").setValue(ex.deck).onChange((v) => ((ex.deck = v.replace(/^#?flashcards\//i, "")), save())))
				.addText((t) => {
					t.inputEl.type = "date";
					t.setValue(ex.date).onChange((v) => ((ex.date = v), save()));
				})
				.addExtraButton((b) => b.setIcon("trash").setTooltip("Entfernen").onClick(() => (s.exams.splice(i, 1), saveAndRedraw())));
		});
		new Setting(containerEl).addButton((b) =>
			b.setButtonText("＋ Klausur").onClick(() => (s.exams.push({ subject: "", deck: "", date: "" }), saveAndRedraw()))
		);

		// ---------- Kalender ----------
		new Setting(containerEl).setName("Kalender").setHeading();
		const note = containerEl.createDiv({ cls: "setting-item-description sd-settings-note" });
		note.appendText("Google Kalender: Einstellungen → Kalender auswählen → „Kalender integrieren“ → ");
		note.createEl("b", { text: "Geheime Adresse im iCal-Format" });
		note.appendText(". Outlook und iCloud bieten ebenfalls ICS-/webcal-Links. ");
		note.createEl("b", { text: "Achtung: " });
		note.appendText("Die geheime Adresse ist wie ein Passwort und wird in den Plugin-Daten deines Vaults gespeichert (.obsidian/plugins/study-dashboard/data.json).");

		s.calendars.forEach((c, i) => {
			new Setting(containerEl)
				.setClass("sd-settings-row")
				.addToggle((t) => t.setTooltip("Aktiv").setValue(c.enabled).onChange((v) => ((c.enabled = v), save())))
				.addText((t) => t.setPlaceholder("Name").setValue(c.name).onChange((v) => ((c.name = v), save())))
				.addText((t) => {
					t.inputEl.addClass("sd-wide");
					t.setPlaceholder("https://…/basic.ics").setValue(c.url).onChange((v) => {
						c.url = v.trim();
						this.plugin.clearCalendarCache();
						save();
					});
				})
				.addColorPicker((cp) => cp.setValue(c.color).onChange((v) => ((c.color = v), save())))
				.addExtraButton((b) => b.setIcon("trash").setTooltip("Entfernen").onClick(() => (s.calendars.splice(i, 1), saveAndRedraw())));
		});
		new Setting(containerEl).addButton((b) =>
			b.setButtonText("＋ Kalender").onClick(() => (s.calendars.push({ name: "Kalender", url: "", color: "#4285f4", enabled: true }), saveAndRedraw()))
		);

		new Setting(containerEl)
			.setName("Farben nach Stichwort")
			.setDesc("iCal-Feeds enthalten keine Termin-Farben. Enthält der Titel das Stichwort, bekommt der Termin diese Farbe (erstes passendes gewinnt).")
			.setHeading();
		s.colorRules.forEach((r, i) => {
			new Setting(containerEl)
				.setClass("sd-settings-row")
				.addText((t) => t.setPlaceholder("Stichwort").setValue(r.keyword).onChange((v) => ((r.keyword = v), save())))
				.addColorPicker((cp) => cp.setValue(r.color).onChange((v) => ((r.color = v), save())))
				.addExtraButton((b) => b.setIcon("trash").onClick(() => (s.colorRules.splice(i, 1), saveAndRedraw())));
		});
		new Setting(containerEl).addButton((b) =>
			b.setButtonText("＋ Farbregel").onClick(() => (s.colorRules.push({ keyword: "", color: "#0b8043" }), saveAndRedraw()))
		);

		new Setting(containerEl)
			.setName("Farbe für Klausuren")
			.addColorPicker((cp) => cp.setValue(s.examColor).onChange((v) => ((s.examColor = v), save())));
		new Setting(containerEl)
			.setName("Kalender zwischenspeichern (Minuten)")
			.setDesc("So lange wird ein Feed wiederverwendet, bevor er neu geladen wird. Befehl „Dashboard neu laden“ lädt sofort neu.")
			.addText((t) => num(t, s.calendarCacheMinutes, (v) => ((s.calendarCacheMinutes = v), save())));
		new Setting(containerEl)
			.setName("Eingebetteter Kalender (iframe)")
			.setDesc("Optional: Embed-URL eines öffentlichen Google-Kalenders. Für das Widget „Kalender-iframe“.")
			.addText((t) => t.setPlaceholder("https://calendar.google.com/calendar/embed?src=…").setValue(s.calendarEmbedUrl).onChange((v) => ((s.calendarEmbedUrl = v.trim()), save())));

		// ---------- Listen ----------
		new Setting(containerEl).setName("Listen").setHeading();
		new Setting(containerEl)
			.setName("To-Do-Datei")
			.setDesc("Pfad im Vault. Offene Aufgaben (- [ ]) erscheinen im Dashboard und sind dort abhakbar.")
			.addText((t) => t.setPlaceholder("To-Dos.md").setValue(s.todoFile).onChange((v) => ((s.todoFile = v.trim()), save())));
		new Setting(containerEl)
			.setName("Ordner-Widget: Ordner")
			.addText((t) => t.setPlaceholder("Notizen").setValue(s.folderPath).onChange((v) => ((s.folderPath = v.trim()), save())));
		new Setting(containerEl)
			.setName("Ordner-Widget: Titel")
			.addText((t) => t.setValue(s.folderTitle).onChange((v) => ((s.folderTitle = v), save())));
		new Setting(containerEl)
			.setName("Einträge pro Liste")
			.addText((t) => num(t, s.recentCount, (v) => ((s.recentCount = v), save())));
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function num(t: any, value: number, set: (v: number) => void) {
	t.inputEl.type = "number";
	t.inputEl.min = "1";
	t.setValue(String(value)).onChange((v: string) => {
		const n = parseInt(v);
		if (n > 0) set(n);
	});
}
