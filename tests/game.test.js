import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attack, beginTurn, createGame, enterBattlePhase, getTributeCount, summonMonster } from "../src/core/game.js";

const cards = JSON.parse(await readFile(new URL("../src/data/cards.json", import.meta.url)));
const decks = JSON.parse(await readFile(new URL("../src/data/decks.json", import.meta.url)));

test("initial game has five cards each and 4000 life", () => {
  const state = createGame({ cards, decks, seed: 7 });
  assert.equal(state.players.player.hand.length, 5);
  assert.equal(state.players.cpu.hand.length, 5);
  assert.equal(state.players.player.life, 4000);
  assert.equal(state.turn.phase, "main");
});

test("tribute count follows approved star rules", () => {
  assert.equal(getTributeCount(cards.find((card) => card.id === "kamaitachi")), 0);
  assert.equal(getTributeCount(cards.find((card) => card.id === "great-tengu")), 1);
  assert.equal(getTributeCount(cards.find((card) => card.id === "white-serpent")), 2);
});

test("second normal summon is rejected with a reason", () => {
  const state = createGame({ cards, decks, seed: 1 });
  state.players.player.hand = [{ uid: "a", cardId: "kamaitachi" }, { uid: "b", cardId: "chochin" }];
  const summoned = summonMonster(state, { actor: "player", handIndex: 0, zoneIndex: 0 });
  assert.throws(() => summonMonster(summoned, { actor: "player", handIndex: 0, zoneIndex: 1 }), /1ターンに1回/);
});

test("attacking stronger defense damages attacker player without destroying attacker", () => {
  const state = createGame({ cards, decks, seed: 2 });
  state.players.player.monsters[0] = { uid: "a", cardId: "kamaitachi", position: "attack", faceDown: false, attacked: false, attackMod: 200 };
  state.players.cpu.monsters[0] = { uid: "b", cardId: "nurikabe", position: "set", faceDown: true, attacked: false, attackMod: 0 };
  state.turn.phase = "main";
  const battle = enterBattlePhase(state, "player");
  const result = attack(battle, { actor: "player", attackerSlot: 0, targetSlot: 0 });
  assert.equal(result.players.player.life, 3600);
  assert.ok(result.players.player.monsters[0]);
  assert.equal(result.players.cpu.monsters[0].faceDown, false);
});

test("a tribute can vacate the destination slot for an advanced summon", () => {
  const state = createGame({ cards, decks, seed: 3 });
  state.players.player.hand = [{ uid: "high", cardId: "great-tengu" }];
  state.players.player.monsters[0] = { uid: "low", cardId: "chochin", position: "attack", faceDown: false, attacked: false, attackMod: 0 };
  const result = summonMonster(state, { actor: "player", handIndex: 0, zoneIndex: 0, tributeSlots: [0] });
  assert.equal(result.players.player.monsters[0].cardId, "great-tengu");
  assert.equal(result.players.player.graveyard[0].cardId, "chochin");
});

test("running out of cards causes a deck-out loss", () => {
  const state = createGame({ cards, decks, seed: 4 });
  state.players.cpu.deck = [];
  const result = beginTurn(state, "cpu");
  assert.equal(result.winner, "player");
  assert.match(result.reason, /ドローできません/);
});
