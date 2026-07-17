import { activateSpell, attack, endTurn, enterBattlePhase, getTributeCount, setBackrow, summonMonster } from "./game.js";

function safeAction(state, action) {
  try {
    return action(state);
  } catch {
    return state;
  }
}

function lowestMonsterSlots(state) {
  return state.players.cpu.monsters
    .map((monster, slot) => ({ monster, slot }))
    .filter(({ monster }) => monster)
    .sort((left, right) => state.cards[left.monster.cardId].attack - state.cards[right.monster.cardId].attack)
    .map(({ slot }) => slot);
}

export function runCpuTurn(inputState) {
  let state = inputState;
  if (state.winner || state.turn.actor !== "cpu") return state;
  const spellIndex = state.players.cpu.hand.findIndex((item) => state.cards[item.cardId].type === "spell" && state.cards[item.cardId].effect === "draw-two");
  if (spellIndex >= 0) state = safeAction(state, (current) => activateSpell(current, { actor: "cpu", handIndex: spellIndex }));

  const candidates = state.players.cpu.hand
    .map((item, index) => ({ card: state.cards[item.cardId], index }))
    .filter(({ card }) => card.type === "monster")
    .sort((left, right) => right.card.attack - left.card.attack);
  for (const candidate of candidates) {
    const tributeCount = getTributeCount(candidate.card);
    const tributeSlots = lowestMonsterSlots(state).slice(0, tributeCount);
    const openMonster = state.players.cpu.monsters.findIndex((monster) => !monster);
    const destinationSlot = openMonster >= 0 ? openMonster : tributeSlots[0];
    if (destinationSlot !== undefined && destinationSlot >= 0 && tributeSlots.length === tributeCount) {
      state = safeAction(state, (current) => summonMonster(current, { actor: "cpu", handIndex: candidate.index, zoneIndex: destinationSlot, position: candidate.card.defense > candidate.card.attack + 350 ? "set" : "attack", tributeSlots }));
      break;
    }
  }
  const backrowIndex = state.players.cpu.backrow.findIndex((item) => !item);
  const trapIndex = state.players.cpu.hand.findIndex((item) => ["trap", "spell"].includes(state.cards[item.cardId].type));
  if (backrowIndex >= 0 && trapIndex >= 0) state = safeAction(state, (current) => setBackrow(current, { actor: "cpu", handIndex: trapIndex, zoneIndex: backrowIndex }));
  state = safeAction(state, (current) => enterBattlePhase(current, "cpu"));
  for (let slot = 0; slot < 3 && !state.winner; slot += 1) {
    const monster = state.players.cpu.monsters[slot];
    if (!monster || monster.position !== "attack" || monster.faceDown || monster.attacked) continue;
    const playerTargets = state.players.player.monsters;
    const targetSlot = playerTargets.reduce((best, target, index) => {
      if (!target) return best;
      if (best === null) return index;
      const targetValue = target.position === "attack" ? state.cards[target.cardId].attack : state.cards[target.cardId].defense;
      const bestMonster = playerTargets[best];
      const bestValue = bestMonster.position === "attack" ? state.cards[bestMonster.cardId].attack : state.cards[bestMonster.cardId].defense;
      return targetValue < bestValue ? index : best;
    }, null);
    state = safeAction(state, (current) => attack(current, { actor: "cpu", attackerSlot: slot, targetSlot }));
  }
  return state.winner ? state : endTurn(state, "cpu");
}
