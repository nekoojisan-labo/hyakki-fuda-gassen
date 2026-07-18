import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { activateSpell, attack, beginTurn, createGame, enterBattlePhase, getBattlePreview, getCardAttack, getTributeCount, setBackrow, summonMonster } from "../src/core/game.js";

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

test("battle preview explains the result without mutating state", () => {
  const state = createGame({ cards, decks, seed: 20 });
  state.players.player.monsters[0] = { uid: "a", cardId: "kamaitachi", position: "attack", faceDown: false, attacked: false, attackMod: 0 };
  state.players.cpu.monsters[0] = { uid: "b", cardId: "pipe-fox", position: "attack", faceDown: false, attacked: false, attackMod: 0 };
  state.turn.phase = "battle";
  const preview = getBattlePreview(state, { actor: "player", attackerSlot: 0, targetSlot: 0 });
  assert.equal(preview.attackValue, 1600);
  assert.match(preview.outcome, /破壊/);
  assert.equal(state.players.cpu.monsters[0].cardId, "pipe-fox");
});

test("flip, piercing, guard, recovery, field boost, summon removal, and rage effects resolve", () => {
  let state = createGame({ cards, decks, seed: 21 });
  state.players.player.monsters[0] = { uid: "a", cardId: "kamaitachi", position: "attack", faceDown: false, attacked: false, attackMod: 0 };
  state.players.cpu.monsters[0] = { uid: "b", cardId: "chochin", position: "set", faceDown: true, attacked: false, attackMod: 0 };
  state.turn.phase = "battle";
  const cpuHandBefore = state.players.cpu.hand.length;
  state = attack(state, { actor: "player", attackerSlot: 0, targetSlot: 0 });
  assert.equal(state.players.cpu.hand.length, cpuHandBefore + 1);
  assert.equal(state.players.cpu.life, 3800);

  state = createGame({ cards, decks, seed: 22 });
  state.players.player.monsters[0] = { uid: "a", cardId: "kamaitachi", position: "attack", faceDown: false, attacked: false, attackMod: 0 };
  state.players.player.monsters[1] = { uid: "guard", cardId: "kappa", position: "attack", faceDown: false, attacked: false, attackMod: 0 };
  state.players.cpu.monsters[0] = { uid: "b", cardId: "white-serpent", position: "attack", faceDown: false, attacked: false, attackMod: 0 };
  state.turn.phase = "battle";
  state = attack(state, { actor: "player", attackerSlot: 0, targetSlot: 0 });
  assert.equal(state.players.player.life, 3400);

  state = createGame({ cards, decks, seed: 23 });
  state.players.player.monsters[0] = { uid: "a", cardId: "kamaitachi", position: "attack", faceDown: false, attacked: false, attackMod: 0 };
  state.players.cpu.monsters[0] = { uid: "wall", cardId: "nurikabe", position: "defense", faceDown: false, attacked: false, attackMod: 0 };
  state.turn.phase = "battle";
  state = attack(state, { actor: "player", attackerSlot: 0, targetSlot: 0 });
  assert.equal(state.players.cpu.life, 4300);

  state = createGame({ cards, decks, seed: 24 });
  const great = { uid: "great", cardId: "great-tengu", position: "attack", faceDown: false, attacked: false, attackMod: 0 };
  const swift = { uid: "swift", cardId: "kamaitachi", position: "attack", faceDown: false, attacked: false, attackMod: 0 };
  state.players.player.monsters[0] = great;
  state.players.player.monsters[1] = swift;
  assert.equal(getCardAttack(state, "player", swift), 1800);

  state = createGame({ cards, decks, seed: 25 });
  state.players.player.hand = [{ uid: "high", cardId: "karasu-tengu" }];
  state.players.player.monsters[0] = { uid: "low", cardId: "kodama", position: "attack", faceDown: false, attacked: false, attackMod: 0 };
  state.players.cpu.backrow[0] = { uid: "trap", cardId: "barrier-return", faceDown: true, setTurn: 0 };
  state = summonMonster(state, { actor: "player", handIndex: 0, zoneIndex: 0, tributeSlots: [0] });
  assert.equal(state.players.cpu.backrow[0], null);

  state = createGame({ cards, decks, seed: 26 });
  state.players.player.monsters[0] = { uid: "boss", cardId: "shuten-doji", position: "attack", faceDown: false, attacked: false, attackMod: 0 };
  state.players.cpu.monsters[0] = { uid: "small", cardId: "pipe-fox", position: "attack", faceDown: false, attacked: false, attackMod: 0 };
  state.turn.phase = "battle";
  state = attack(state, { actor: "player", attackerSlot: 0, targetSlot: 0 });
  assert.equal(state.players.player.monsters[0].attackMod, 300);
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

test("draw spell resolves from hand and moves to the graveyard", () => {
  const state = createGame({ cards, decks, seed: 5 });
  state.players.player.hand = [{ uid: "spell", cardId: "night-parade" }];
  const result = activateSpell(state, { actor: "player", handIndex: 0 });
  assert.equal(result.players.player.hand.length, 2);
  assert.equal(result.players.player.graveyard.at(-1).cardId, "night-parade");
});

test("a previously set barrier trap negates an attack", () => {
  let state = createGame({ cards, decks, seed: 6 });
  state.players.player.hand = [{ uid: "trap", cardId: "barrier-return" }];
  state = setBackrow(state, { actor: "player", handIndex: 0, zoneIndex: 0 });
  state.turn = { number: 3, actor: "cpu", phase: "battle" };
  state.players.cpu.monsters[0] = { uid: "attacker", cardId: "great-tengu", position: "attack", faceDown: false, attacked: false, attackMod: 0 };
  const result = attack(state, { actor: "cpu", attackerSlot: 0 });
  assert.equal(result.players.player.life, 4000);
  assert.equal(result.players.player.backrow[0], null);
  assert.equal(result.players.cpu.monsters[0].attacked, true);
});
