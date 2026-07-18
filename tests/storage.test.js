import test from "node:test";
import assert from "node:assert/strict";
import { loadTurnStart, saveTurnStart } from "../src/core/storage.js";

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test("turn-start save round trips", () => {
  const storage = memoryStorage();
  const state = { version: 2, players: { player: {}, cpu: {} }, turn: { actor: "player" } };
  saveTurnStart(state, storage);
  assert.deepEqual(loadTurnStart(storage), state);
});

test("invalid save is removed and ignored", () => {
  const storage = memoryStorage();
  storage.setItem("hyakki-fuda-gassen-turn-start-v2", "not-json");
  assert.equal(loadTurnStart(storage), null);
});
