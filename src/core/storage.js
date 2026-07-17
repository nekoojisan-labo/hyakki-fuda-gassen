const SAVE_KEY = "hyakki-fuda-gassen-turn-start-v1";

export function saveTurnStart(state, storage = localStorage) {
  storage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function loadTurnStart(storage = localStorage) {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const state = JSON.parse(raw);
    if (state?.version !== 1 || !state.players?.player || !state.players?.cpu || !state.turn) throw new Error("invalid save");
    return state;
  } catch {
    storage.removeItem(SAVE_KEY);
    return null;
  }
}

export function clearSave(storage = localStorage) {
  storage.removeItem(SAVE_KEY);
}
