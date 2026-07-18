import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attack, createGame, endTurn, enterBattlePhase, getTributeCount, setBackrow, summonMonster } from "../src/core/game.js";
import { runCpuTurn, runCpuTurnSteps } from "../src/core/cpu.js";

const cards = JSON.parse(await readFile(new URL("../src/data/cards.json", import.meta.url)));
const decks = JSON.parse(await readFile(new URL("../src/data/decks.json", import.meta.url)));

function weakestTarget(state) {
  return state.players.cpu.monsters.reduce((best, monster, index) => {
    if (!monster) return best;
    if (best === null) return index;
    const value = monster.position === "attack" ? state.cards[monster.cardId].attack : state.cards[monster.cardId].defense;
    const bestMonster = state.players.cpu.monsters[best];
    const bestValue = bestMonster.position === "attack" ? state.cards[bestMonster.cardId].attack : state.cards[bestMonster.cardId].defense;
    return value < bestValue ? index : best;
  }, null);
}

function runAutomatedPlayerTurn(inputState) {
  let state = inputState;
  const monsters = state.players.player.hand
    .map((item, handIndex) => ({ card: state.cards[item.cardId], handIndex }))
    .filter(({ card }) => card.type === "monster")
    .sort((left, right) => right.card.attack - left.card.attack);

  for (const candidate of monsters) {
    const needed = getTributeCount(candidate.card);
    const occupied = state.players.player.monsters.map((monster, index) => ({ monster, index })).filter(({ monster }) => monster);
    const tributeSlots = occupied.slice(0, needed).map(({ index }) => index);
    const openSlot = state.players.player.monsters.findIndex((monster) => !monster);
    const destination = openSlot >= 0 ? openSlot : tributeSlots[0];
    if (tributeSlots.length === needed && destination !== undefined && destination >= 0) {
      state = summonMonster(state, { actor: "player", handIndex: candidate.handIndex, zoneIndex: destination, tributeSlots });
      break;
    }
  }

  const openBackrow = state.players.player.backrow.findIndex((item) => !item);
  const trapIndex = state.players.player.hand.findIndex((item) => state.cards[item.cardId].type === "trap");
  if (openBackrow >= 0 && trapIndex >= 0) state = setBackrow(state, { actor: "player", handIndex: trapIndex, zoneIndex: openBackrow });

  state = enterBattlePhase(state, "player");
  for (let slot = 0; slot < 3 && !state.winner; slot += 1) {
    const monster = state.players.player.monsters[slot];
    if (!monster || monster.position !== "attack" || monster.faceDown || monster.attacked) continue;
    state = attack(state, { actor: "player", attackerSlot: slot, targetSlot: weakestTarget(state) });
  }
  return state.winner ? state : runCpuTurn(endTurn(state, "player"));
}

test("a complete CPU match reaches a declared winner for multiple shuffled decks", () => {
  for (const seed of [11, 22, 33, 44, 55]) {
    let state = createGame({ cards, decks, seed });
    for (let turn = 0; turn < 24 && !state.winner; turn += 1) state = runAutomatedPlayerTurn(state);
    assert.ok(state.winner, `seed ${seed} did not finish`);
    assert.ok(["player", "cpu"].includes(state.winner));
    assert.ok(state.reason);
  }
});

test("CPU actions expose ordered snapshots for the UI narration queue", () => {
  const playerTurn = createGame({ cards, decks, seed: 31 });
  const cpuTurn = endTurn(playerTurn, "player");
  const steps = runCpuTurnSteps(cpuTurn);

  assert.ok(steps.length >= 2);
  for (let index = 1; index < steps.length; index += 1) {
    assert.ok(steps[index].events.at(-1).id >= steps[index - 1].events.at(-1).id);
  }
  const final = steps.at(-1);
  assert.ok(final.winner || final.turn.actor === "player");
  assert.deepEqual(final, runCpuTurn(cpuTurn));
});
