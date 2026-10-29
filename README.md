# Study Dashboard für Obsidian

Ein Dashboard für Obsidian, gebaut fürs Studium: Aktivitäts-Heatmap, Kalender aus Google/Outlook/iCloud, Lernplan für das Spaced-Repetition-Plugin, Klausur-Countdown, To-Dos und deine zuletzt bearbeiteten Notizen auf einer Seite.

Das Plugin braucht **kein Dataview** und keinen Code in deinen Notizen. Eingerichtet wird alles in den Plugin-Einstellungen.

## Widgets

| Widget | Was es zeigt |
| --- | --- |
| 📊 **Aktivität** | Heatmap im GitHub-Stil: neue (oder bearbeitete) Notizen pro Tag, dazu Streak und Wochenzahl. Ein Klick auf einen Tag listet die Notizen dieses Tages. |
| 📅 **Kalender** | Monatsansicht aus beliebig vielen iCal-Feeds. Serientermine werden aufgelöst, mehrtägige Termine (z.B. „Theoriephase“) als durchgehende Balken gezeigt, Farben per Stichwort. Mit Monatsnavigation und Tagesdetails. |
| 🎴 **Lernplan** | Alle Notizen mit dem Lernplan-Tag (Standard `#Lernplan`): fällige, neue und gefestigte Karten je Deck. Ein Klick startet direkt die Übung im Spaced-Repetition-Plugin. |
| ⏰ **Klausur-Countdown** | Tage bis zur Klausur und wie viele Karten du pro Tag schaffen musst, um rechtzeitig fertig zu sein. |
| ✅ **To-Dos** | Offene Aufgaben aus einer Datei. Direkt im Dashboard abhaken oder neue hinzufügen. |
| 🗒️ **Ordner-Notizen** | Die neuesten Notizen aus einem Ordner deiner Wahl. |
| 🗂️ **Zuletzt bearbeitet** | Die zuletzt geänderten Notizen im ganzen Vault. |
| 🔀 **Wiederholung** | Zufällige Karteikarten zum Aufdecken, unabhängig vom Scheduling. |
| 📆 **Kalender-iframe** | Optional: ein öffentlicher Google-Kalender als eingebettete Seite. |

Jedes Widget lässt sich ein- und ausschalten und verschieben. Das Dashboard aktualisiert sich von selbst, wenn sich Notizen ändern, und passt sich an helle, dunkle und schmale Bildschirme an.

## Installation

### Mit BRAT (empfohlen, bis das Plugin im offiziellen Verzeichnis ist)

1. Das Community-Plugin **BRAT** installieren und aktivieren.
2. BRAT → *Add Beta plugin* → `kevin-builds/obsidian-study-dashboard` eintragen.
3. Unter *Community Plugins* **Study Dashboard** aktivieren.

### Manuell

1. Aus dem neuesten [Release](../../releases) `main.js`, `manifest.json` und `styles.css` laden.
2. In deinem Vault den Ordner `.obsidian/plugins/study-dashboard/` anlegen und die drei Dateien hineinlegen.
3. Obsidian neu laden und **Study Dashboard** unter *Community Plugins* aktivieren.

## Benutzung

Es gibt zwei Wege, das Dashboard zu öffnen:

- **Eigene Ansicht:** Ribbon-Symbol links oder Befehl *Study Dashboard: Dashboard öffnen*. In den Einstellungen kann es beim Start automatisch geöffnet werden.
- **In einer Notiz:** einen Codeblock einfügen. Das ist praktisch zusammen mit dem *Homepage*-Plugin.

  ````markdown
  ---
  cssclasses:
    - study-dashboard
  ---

  ```study-dashboard
  ```
  ````

  Die Klasse `study-dashboard` blendet Titel und Eigenschaften aus und nutzt die volle Breite. Nur bestimmte Widgets zeigst du mit einer Zeile im Codeblock:

  ````markdown
  ```study-dashboard
  widgets: calendar, todos
  ```
  ````

  Verfügbare Namen: `activity`, `calendar`, `calendarEmbed`, `studyplan`, `countdown`, `todos`, `folder`, `recent`, `review`.

## Kalender einbinden

Google Kalender: *Einstellungen* → links den Kalender wählen → *Kalender integrieren* → **Geheime Adresse im iCal-Format** kopieren und in den Plugin-Einstellungen unter *Kalender* einfügen. Outlook und iCloud bieten ebenfalls ICS- bzw. `webcal://`-Links.

> [!warning]
> Die geheime iCal-Adresse ist wie ein Passwort: Wer sie hat, kann deinen Kalender lesen. Das Plugin speichert sie in `.obsidian/plugins/study-dashboard/data.json` in deinem Vault. Wenn du deinen Vault öffentlich teilst (z.B. als Git-Repo), schließe diese Datei aus.

Die Feeds werden zwischengespeichert (Standard: 30 Minuten). Der Befehl *Dashboard neu laden* holt sie sofort neu.

## Karteikarten

Das Plugin liest das Format des [Spaced-Repetition-Plugins](https://github.com/st3v3nmw/obsidian-spaced-repetition):

```markdown
#Lernplan #flashcards/Mathe

Was ist die Ableitung von sin(x)?
?
cos(x)

Hauptstadt von Frankreich :: Paris
```

- Nur Notizen mit dem **Lernplan-Tag** zählen. So steuerst du, welche Decks im Dashboard auftauchen.
- Das **Deck** kommt aus dem Tag `#flashcards/<Deck>`. Im Klausur-Countdown trägst du genau diesen Namen ein, damit die Karten der Klausur zugeordnet werden.
- „Gefestigt“ heißt: Intervall von mindestens 21 Tagen.

## Aussehen anpassen

Alle Farben kommen aus deinem Theme. Per CSS-Snippet kannst du die Variablen überschreiben, z.B.:

```css
body {
	--sd-radius: 6px;
	--sd-heat-4: #8250df;
}
```

## Entwicklung

```bash
npm install
npm run dev     # baut bei jeder Änderung neu
npm run build   # Produktions-Build
```

Für die Entwicklung den Repo-Ordner nach `<Vault>/.obsidian/plugins/study-dashboard` verlinken oder `main.js`, `manifest.json` und `styles.css` dorthin kopieren.

## Lizenz

MIT
