/**
 * Achievements: definitions and per-browser progress, kept in localStorage.
 *
 * Purely for fun and exploration, so there is no server side and no cheat protection.
 */

/** All achievements; `goal` marks ones that need several distinct steps (areas, discovered projects). */
export const ACHIEVEMENTS = [
  { id: 'chat', name: 'Moin!', desc: 'Schreib deine erste Chatnachricht.', hint: 'Sag doch mal was.' },
  { id: 'highfive', name: 'High Five', desc: 'Klatsch jemanden ab.', hint: 'Winken ist schön, zu zweit noch schöner.' },
  { id: 'bike', name: 'Leeze-Fan', desc: 'Fahr mit einer Leeze.', hint: 'Münster ohne Leeze?' },
  { id: 'greenwave', name: 'Grüne Welle', desc: 'Fahr bei Grün über die Radampel.', hint: 'Auf der Promenade zählt jemand runter.' },
  { id: 'parker', name: 'Aufräumer:in', desc: 'Park eine Leeze im Fahrradständer.', hint: 'Da liegen doch Leezen rum …' },
  { id: 'cleared', name: 'Münster ist aufgeräumt', desc: 'Sei dabei, wenn alle Leezen im Ständer stehen.', hint: 'Gemeinsam geht es schneller.' },
  { id: 'stroll', name: 'Stadtbummel', desc: 'Besuch Prinzipalmarkt, Lamberti, Promenade, Park und Aasee.', hint: 'Einmal überall hin.', goal: 5 },
  { id: 'jetty', name: 'Seebär:in', desc: 'Lauf bis ans Ende des Stegs.', hint: 'Am Aasee geht es noch ein Stück weiter.' },
  { id: 'cat', name: 'Katzenflüsterer', desc: 'Weck die Katze.', hint: 'Irgendwo schläft jemand …' },
  { id: 'squirrel', name: 'Eichhörnchen-Sichtung', desc: 'Komm dem AIchhörnchen nah.', hint: 'Auf der Promenade huscht manchmal etwas.' },
  { id: 'keeper', name: 'Türmerin gehört', desc: 'Sei an Lamberti, wenn die Türmerin bläst.', hint: 'Hör mal nach oben.' },
  { id: 'mascot', name: 'Winke, winke', desc: 'Steh vor dem Fenster, wenn das Maskottchen winkt.', hint: 'Manchmal schaut jemand aus dem Fenster.' },
  { id: 'kiosk', name: 'Kiosk-Kenner:in', desc: 'Besuch das Büdchen am Aasee.', hint: 'Durst?' },
  { id: 'history', name: 'Hack-Historiker:in', desc: 'Entdeck alle 10 früheren Münsterhack-Projekte.', hint: 'Achte auf die roten Fragezeichen.', goal: 10 },
];

const STORAGE_KEY = 'mh-achievements';
let state = { unlocked: [], progress: {} };
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (saved && Array.isArray(saved.unlocked)) state = { unlocked: saved.unlocked, progress: saved.progress || {} };
} catch {
  // Storage may be unavailable (private mode); achievements then last for this visit only.
}

/** Persist progress; failures are ignored for the same reason as above. */
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // See above.
  }
}

/** Whether an achievement is already unlocked. */
export function isUnlocked(id) {
  return state.unlocked.includes(id);
}

/** Unlock an achievement; returns its definition the first time, otherwise null. */
export function unlock(id) {
  if (isUnlocked(id)) return null;
  state.unlocked.push(id);
  save();
  return ACHIEVEMENTS.find((a) => a.id === id) ?? null;
}

/** Record a distinct step towards a goal achievement; returns its definition when this completes it, otherwise null. */
export function progress(id, step) {
  const steps = state.progress[id] || (state.progress[id] = []);
  if (steps.includes(step)) return null;
  steps.push(step);
  save();
  return steps.length >= ACHIEVEMENTS.find((a) => a.id === id).goal ? unlock(id) : null;
}

/** Number of distinct steps recorded for a goal achievement. */
export function progressCount(id) {
  return (state.progress[id] || []).length;
}

/** Number of unlocked achievements. */
export function unlockedCount() {
  return state.unlocked.length;
}
