// Minimaler iCal-Parser (RFC 5545) mit Serientermin-Expansion.
// Unterstützt: DTSTART/DTEND (Datum, lokal, UTC), RRULE (DAILY/WEEKLY/MONTHLY/YEARLY
// mit INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY), EXDATE und verschobene Einzeltermine (RECURRENCE-ID).

export interface IcsEvent {
	uid: string;
	start: Date;
	end: Date | null;
	allDay: boolean;
	title: string;
	rrule: string | null;
	exdates: Set<string>;
	recurrenceId: string | null;
}

const MS = 86400000;
const DMAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export const dayKey = (d: Date) =>
	d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

export const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function icsDate(params: string, value: string): { date: Date; allDay: boolean } | null {
	const allDay = /VALUE=DATE(?![-A-Z])/.test(params) || /^\d{8}$/.test(value);
	const m = value.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
	if (!m) return null;
	const [Y, Mo, D, h, mi, s] = [+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)];
	const date = m[7] ? new Date(Date.UTC(Y, Mo, D, h, mi, s)) : new Date(Y, Mo, D, h, mi, s);
	return { date, allDay };
}

const unescape = (s: string) =>
	s.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");

export function parseICS(text: string): IcsEvent[] {
	text = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "");
	const evs: IcsEvent[] = [];
	for (const part of text.split("BEGIN:VEVENT").slice(1)) {
		const body = part.split("END:VEVENT")[0];
		const fld = (k: string) => {
			const m = body.match(new RegExp("^" + k + "([^:\\n]*):(.*)$", "m"));
			return m ? { params: m[1], value: m[2].trim() } : null;
		};
		const ds = fld("DTSTART");
		if (!ds) continue;
		const st = icsDate(ds.params, ds.value);
		if (!st) continue;
		const de = fld("DTEND");
		const en = de ? icsDate(de.params, de.value) : null;
		const exdates = new Set<string>();
		for (const m of body.matchAll(/^EXDATE[^:\n]*:(.*)$/gm))
			for (const v of m[1].split(",")) {
				const p = icsDate("", v.trim());
				if (p) exdates.add(dayKey(p.date));
			}
		const rid = fld("RECURRENCE-ID");
		const ridDate = rid ? icsDate(rid.params, rid.value) : null;
		evs.push({
			uid: fld("UID")?.value ?? "",
			start: st.date,
			end: en ? en.date : null,
			allDay: st.allDay,
			title: unescape(fld("SUMMARY")?.value ?? "(ohne Titel)"),
			rrule: fld("RRULE")?.value ?? null,
			exdates,
			recurrenceId: ridDate ? dayKey(ridDate.date) : null,
		});
	}
	// Verschobene/geänderte Einzeltermine einer Serie: Originaltermin der Serie ausblenden
	const masters = new Map<string, IcsEvent>();
	for (const e of evs) if (e.rrule && e.uid && !e.recurrenceId) masters.set(e.uid, e);
	for (const e of evs) if (e.recurrenceId) masters.get(e.uid)?.exdates.add(e.recurrenceId);
	return evs;
}

/** Liefert alle Vorkommen eines Termins innerhalb [winStart, winEnd]. */
export function expandEvent(ev: IcsEvent, winStart: Date, winEnd: Date): Date[] {
	const s = ev.start;
	const setT = (d: Date) => {
		d.setHours(s.getHours(), s.getMinutes(), 0, 0);
		return d;
	};
	let occ: Date[] = [];
	if (!ev.rrule) occ = [new Date(s)];
	else {
		const R: Record<string, string> = {};
		for (const kv of ev.rrule.split(";")) {
			const [k, v] = kv.split("=");
			if (k) R[k] = v;
		}
		const interval = Math.max(1, parseInt(R.INTERVAL || "1"));
		const count = R.COUNT ? parseInt(R.COUNT) : null;
		const until = R.UNTIL ? icsDate("", R.UNTIL)?.date ?? null : null;
		let guard = 0;
		switch (R.FREQ) {
			case "WEEKLY": {
				const days = R.BYDAY
					? R.BYDAY.split(",").map((x) => DMAP[x.replace(/^[+-]?\d+/, "")])
					: [s.getDay()];
				const mon = midnight(s);
				mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
				for (let b = 0; guard < 10000; b++, guard++) {
					const base = new Date(mon);
					base.setDate(base.getDate() + b * 7 * interval);
					if (base > winEnd) break;
					for (let o = 0; o < 7; o++) {
						const d = setT(new Date(base));
						d.setDate(base.getDate() + o);
						if (d >= s && days.includes(d.getDay())) occ.push(d);
					}
				}
				break;
			}
			case "DAILY":
				for (let k = 0; guard < 20000; k++, guard++) {
					const d = setT(new Date(s));
					d.setDate(s.getDate() + k * interval);
					if (d > winEnd) break;
					occ.push(d);
				}
				break;
			case "MONTHLY": {
				const bymd = R.BYMONTHDAY ? parseInt(R.BYMONTHDAY) : null;
				const bd = R.BYDAY ? R.BYDAY.match(/^([+-]?\d+)?([A-Z]{2})$/) : null;
				for (let k = 0; guard < 2400; k++, guard++) {
					const mo = s.getMonth() + k * interval;
					const y = s.getFullYear() + Math.floor(mo / 12);
					const m0 = ((mo % 12) + 12) % 12;
					let d: Date;
					if (bd) {
						const nth = parseInt(bd[1] || "1");
						const wd = DMAP[bd[2]];
						if (nth < 0) {
							// z.B. -1MO = letzter Montag im Monat
							const last = new Date(y, m0 + 1, 0);
							const back = (last.getDay() - wd + 7) % 7;
							d = setT(new Date(y, m0, last.getDate() - back + (nth + 1) * 7));
						} else {
							const shift = (wd - new Date(y, m0, 1).getDay() + 7) % 7;
							d = setT(new Date(y, m0, 1 + shift + (nth - 1) * 7));
						}
						if (d.getMonth() !== m0) continue;
					} else {
						const day = bymd || s.getDate();
						d = setT(new Date(y, m0, day));
						if (d.getDate() !== day) continue;
					}
					if (d > winEnd) break;
					if (d >= s) occ.push(d);
				}
				break;
			}
			case "YEARLY":
				for (let k = 0; guard < 400; k++, guard++) {
					const d = setT(new Date(s.getFullYear() + k * interval, s.getMonth(), s.getDate()));
					if (d > winEnd) break;
					if (d >= s) occ.push(d);
				}
				break;
			default:
				occ = [new Date(s)];
		}
		if (until) occ = occ.filter((d) => d <= until);
		if (count) occ = occ.slice(0, count);
	}
	return occ.filter((d) => d >= winStart && d <= winEnd && !ev.exdates.has(dayKey(d)));
}

/** Dauer eines ganztägigen Termins in Tagen (DTEND ist exklusiv). */
export const allDaySpan = (ev: IcsEvent) =>
	ev.allDay ? (ev.end ? Math.round((midnight(ev.end).getTime() - midnight(ev.start).getTime()) / MS) : 1) : 0;
