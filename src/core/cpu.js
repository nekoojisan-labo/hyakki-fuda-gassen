import { activateSpell, attack, endTurn, enterBattlePhase, getCardAttack, getTributeCount, setBackrow, summonMonster } from "./game.js";

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

function useOneSpell(inputState) {
  const priorities = ["destroy-monster", "destroy-backrow", "draw-two", "revive-monster", "boost-monster"];
  for (const effect of priorities) {
    const handIndex = inputState.players.cpu.hand.findIndex((item) => inputState.cards[item.cardId].type === "spell" && inputState.cards[item.cardId].effect === effect);
    if (handIndex < 0) continue;
    let targetSlot = 0;
    if (effect === "destroy-monster") targetSlot = inputState.players.player.monsters.findIndex((item) => item && !item.faceDown);
    if (effect === "destroy-backrow") targetSlot = inputState.players.player.backrow.findIndex(Boolean);
    if (effect === "boost-monster") targetSlot = inputState.players.cpu.monsters.findIndex((item) => item && !item.faceDown);
    if (["destroy-monster", "destroy-backrow", "boost-monster"].includes(effect) && targetSlot < 0) continue;
    try {
      return { state: activateSpell(inputState, { actor: "cpu", handIndex, targetActor: "player", targetSlot }), used: true };
    } catch {
      continue;
    }
  }
  return { state: inputState, used: false };
}

export function runCpuTurnSteps(inputState) {
  const steps = [];
  let state = inputState;
  if (state.winner || state.turn.actor !== "cpu") return steps;

  function record(nextState) {
    if (nextState !== state) {
      state = nextState;
      steps.push(state);
    }
  }

  let spellResult = useOneSpell(state);
  record(spellResult.state);
  if (state.winner) return steps;

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
      const summoned = safeAction(state, (current) => summonMonster(current, { actor: "cpu", handIndex: candidate.index, zoneIndex: destinationSlot, position: candidate.card.defense > candidate.card.attack + 350 ? "set" : "attack", tributeSlots }));
      record(summoned);
      break;
    }
  }

  if (!spellResult.used) {
    spellResult = useOneSpell(state);
    record(spellResult.state);
    if (state.winner) return steps;
  }

  const backrowIndex = state.players.cpu.backrow.findIndex((item) => !item);
  const trapIndex = state.players.cpu.hand.findIndex((item) => state.cards[item.cardId].type === "trap");
  if (backrowIndex >= 0 && trapIndex >= 0) record(safeAction(state, (current) => setBackrow(current, { actor: "cpu", handIndex: trapIndex, zoneIndex: backrowIndex })));

  record(safeAction(state, (current) => enterBattlePhase(current, "cpu")));
  for (let slot = 0; slot < 3 && !state.winner; slot += 1) {
    const monster = state.players.cpu.monsters[slot];
    if (!monster || monster.position !== "attack" || monster.faceDown || monster.attacked) continue;
    const playerTargets = state.players.player.monsters;
    const targetSlot = playerTargets.reduce((best, target, index) => {
      if (!target) return best;
      if (best === null) return index;
      const targetValue = target.position === "attack" ? getCardAttack(state, "player", target) : state.cards[target.cardId].defense;
      const bestMonster = playerTargets[best];
      const bestValue = bestMonster.position === "attack" ? getCardAttack(state, "player", bestMonster) : state.cards[bestMonster.cardId].defense;
      return targetValue < bestValue ? index : best;
    }, null);
    record(safeAction(state, (current) => attack(current, { actor: "cpu", attackerSlot: slot, targetSlot })));
  }

  if (!state.winner) record(endTurn(state, "cpu"));
  return steps;
}

export function runCpuTurn(inputState) {
  return runCpuTurnSteps(inputState).at(-1) ?? inputState;
}
