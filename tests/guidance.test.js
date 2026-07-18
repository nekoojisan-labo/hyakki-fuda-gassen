import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createGame, enterBattlePhase, summonMonster } from "../src/core/game.js";
import { getNextGuidance, loadHintsEnabled, saveHintsEnabled } from "../src/ui/guidance.js";

const cards = JSON.parse(await readFile(new URL("../src/data/cards.json", import.meta.url)));
const decks = JSON.parse(await readFile(new URL("../src/data/decks.json", import.meta.url)));
const emptySelection = { handIndex: null, attackerSlot: null, targetSlot: null, tributeSlots: [], summonPosition: "attack" };

test("opening guidance highlights playable hand monsters", () => {
  const state = createGame({ cards, decks, seed: 8 });
  state.players.player.hand = [{ uid: "a", cardId: "kamaitachi" }, { uid: "b", cardId: "white-serpent" }];
  const guidance = getNextGuidance(state, emptySelection);
  assert.match(guidance.text, /手札/);
  assert.deepEqual(guidance.targets, ["hand-0"]);
});

test("selected high-star monster asks for the correct number of materials", () => {
  const state = createGame({ cards, decks, seed: 9 });
  state.players.player.hand = [{ uid: "a", cardId: "white-serpent" }];
  const guidance = getNextGuidance(state, { ...emptySelection, handIndex: 0 });
  assert.match(guidance.text, /素材が2体/);
  assert.deepEqual(guidance.targets, ["player-monsters"]);
});

test("battle guidance progresses from attacker to direct attack", () => {
  let state = createGame({ cards, decks, seed: 10 });
  state.players.player.hand = [{ uid: "a", cardId: "kamaitachi" }];
  state = summonMonster(state, { actor: "player", handIndex: 0, zoneIndex: 0 });
  state = enterBattlePhase(state, "player");
  assert.deepEqual(getNextGuidance(state, emptySelection).targets, ["player-monster-0"]);
  assert.deepEqual(getNextGuidance(state, { ...emptySelection, attackerSlot: 0 }).targets, ["direct-attack"]);
});

test("battle guidance requires target confirmation before attack", () => {
  let state = createGame({ cards, decks, seed: 12 });
  state.players.player.hand = [{ uid: "a", cardId: "kamaitachi" }];
  state = summonMonster(state, { actor: "player", handIndex: 0, zoneIndex: 0 });
  state.players.cpu.monsters[0] = { uid: "b", cardId: "pipe-fox", position: "attack", faceDown: false, attacked: false, attackMod: 0 };
  state = enterBattlePhase(state, "player");
  assert.deepEqual(getNextGuidance(state, { ...emptySelection, attackerSlot: 0 }).targets, ["cpu-monsters"]);
  assert.deepEqual(getNextGuidance(state, { ...emptySelection, attackerSlot: 0, targetSlot: 0 }).targets, ["attack-confirm"]);
});

test("hint preference persists", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(loadHintsEnabled(storage), true);
  saveHintsEnabled(false, storage);
  assert.equal(loadHintsEnabled(storage), false);
});
