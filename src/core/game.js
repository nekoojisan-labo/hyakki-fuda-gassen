const STARTING_LIFE = 4000;
const ZONE_COUNT = 3;

function clone(state) {
  return structuredClone(state);
}

function otherActor(actor) {
  return actor === "player" ? "cpu" : "player";
}

function makeRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function createPlayer(deck) {
  return {
    life: STARTING_LIFE,
    deck,
    hand: [],
    monsters: Array(ZONE_COUNT).fill(null),
    backrow: Array(ZONE_COUNT).fill(null),
    graveyard: [],
    normalSummoned: false
  };
}

function appendLog(state, message) {
  state.log = [message, ...state.log].slice(0, 12);
}

function drawInto(state, actor, amount = 1) {
  const player = state.players[actor];
  for (let count = 0; count < amount; count += 1) {
    const cardId = player.deck.shift();
    if (!cardId) {
      state.winner = otherActor(actor);
      state.reason = `${actor === "player" ? "あなた" : "CPU"}がドローできませんでした`;
      return;
    }
    player.hand.push({ uid: `${actor}-${state.nextUid++}`, cardId });
  }
}

function requireTurn(state, actor, phase) {
  if (state.winner) throw new Error("試合は終了しています");
  if (state.turn.actor !== actor) throw new Error("自分のターンではありません");
  if (phase && state.turn.phase !== phase) throw new Error(`${phase}フェーズでのみ実行できます`);
}

function requireEmptyZone(zones, zoneIndex) {
  if (!Number.isInteger(zoneIndex) || zoneIndex < 0 || zoneIndex >= ZONE_COUNT) throw new Error("配置先が不正です");
  if (zones[zoneIndex]) throw new Error("選んだ枠は埋まっています");
}

export function getTributeCount(card) {
  if (card.type !== "monster" || card.stars <= 4) return 0;
  return card.stars <= 6 ? 1 : 2;
}

export function createGame({ cards, decks, seed = Date.now() }) {
  const cardMap = Object.fromEntries(cards.map((card) => [card.id, card]));
  const random = makeRng(seed);
  const state = {
    version: 1,
    cards: cardMap,
    players: {
      player: createPlayer(shuffle(decks.player, random)),
      cpu: createPlayer(shuffle(decks.cpu, random))
    },
    turn: { number: 1, actor: "player", phase: "main" },
    nextUid: 1,
    winner: null,
    reason: null,
    log: []
  };
  drawInto(state, "player", 5);
  drawInto(state, "cpu", 5);
  appendLog(state, "先攻。メインフェーズから開始します");
  return state;
}

export function beginTurn(inputState, actor) {
  const state = clone(inputState);
  state.turn = { number: state.turn.number + 1, actor, phase: "draw" };
  state.players[actor].normalSummoned = false;
  state.players[actor].monsters.forEach((monster) => {
    if (monster) monster.attacked = false;
  });
  drawInto(state, actor, 1);
  if (!state.winner) {
    state.turn.phase = "main";
    appendLog(state, `${actor === "player" ? "あなた" : "CPU"}のターン`);
  }
  return state;
}

export function summonMonster(inputState, { actor, handIndex, zoneIndex, position = "attack", tributeSlots = [] }) {
  requireTurn(inputState, actor, "main");
  const state = clone(inputState);
  const player = state.players[actor];
  if (player.normalSummoned) throw new Error("通常召喚は1ターンに1回です");
  const handItem = player.hand[handIndex];
  const card = handItem && state.cards[handItem.cardId];
  if (!card || card.type !== "monster") throw new Error("モンスターカードを選んでください");
  const requiredTributes = getTributeCount(card);
  const uniqueSlots = [...new Set(tributeSlots)];
  if (!uniqueSlots.includes(zoneIndex)) requireEmptyZone(player.monsters, zoneIndex);
  else if (!Number.isInteger(zoneIndex) || zoneIndex < 0 || zoneIndex >= ZONE_COUNT) throw new Error("配置先が不正です");
  if (uniqueSlots.length !== requiredTributes) throw new Error(`素材が${requiredTributes}体必要です`);
  for (const slot of uniqueSlots) {
    if (!player.monsters[slot]) throw new Error("素材にできない枠が含まれています");
  }
  for (const slot of uniqueSlots) {
    player.graveyard.push(player.monsters[slot]);
    player.monsters[slot] = null;
  }
  const [summoned] = player.hand.splice(handIndex, 1);
  player.monsters[zoneIndex] = {
    ...summoned,
    position,
    faceDown: position === "set",
    attackMod: 0,
    attacked: false
  };
  player.normalSummoned = true;
  appendLog(state, `${actor === "player" ? "あなた" : "CPU"}は${card.name}を${position === "attack" ? "攻撃表示で召喚" : "裏側守備でセット"}`);
  if (card.effect === "draw-on-summon" && position === "attack") drawInto(state, actor, 1);
  if (card.effect === "gain-life-on-summon" && position === "attack") player.life += 500;
  return state;
}

export function setBackrow(inputState, { actor, handIndex, zoneIndex }) {
  requireTurn(inputState, actor, "main");
  const state = clone(inputState);
  const player = state.players[actor];
  requireEmptyZone(player.backrow, zoneIndex);
  const item = player.hand[handIndex];
  const card = item && state.cards[item.cardId];
  if (!card || !["spell", "trap"].includes(card.type)) throw new Error("魔法または罠を選んでください");
  const [setCard] = player.hand.splice(handIndex, 1);
  player.backrow[zoneIndex] = { ...setCard, faceDown: true, setTurn: state.turn.number };
  appendLog(state, `${actor === "player" ? "あなた" : "CPU"}はカードを1枚伏せました`);
  return state;
}

function moveMonsterToGrave(state, actor, slot) {
  const monster = state.players[actor].monsters[slot];
  if (!monster) return;
  const card = state.cards[monster.cardId];
  state.players[actor].graveyard.push(monster);
  state.players[actor].monsters[slot] = null;
  if (card.effect === "gain-life-on-destroy") state.players[actor].life += 300;
}

function moveBackrowToGrave(state, actor, slot) {
  const item = state.players[actor].backrow[slot];
  if (!item) return;
  state.players[actor].graveyard.push(item);
  state.players[actor].backrow[slot] = null;
}

export function activateSpell(inputState, { actor, handIndex, targetActor = otherActor(actor), targetSlot = 0 }) {
  requireTurn(inputState, actor, "main");
  const state = clone(inputState);
  const player = state.players[actor];
  const item = player.hand[handIndex];
  const card = item && state.cards[item.cardId];
  if (!card || card.type !== "spell") throw new Error("魔法カードを選んでください");
  if (card.effect === "destroy-monster") {
    if (!state.players[targetActor].monsters[targetSlot]) throw new Error("破壊するモンスターを選んでください");
    moveMonsterToGrave(state, targetActor, targetSlot);
  } else if (card.effect === "boost-monster") {
    const target = player.monsters[targetSlot];
    if (!target) throw new Error("強化するモンスターを選んでください");
    target.attackMod += 500;
  } else if (card.effect === "draw-two") {
    drawInto(state, actor, 2);
  } else if (card.effect === "destroy-backrow") {
    if (!state.players[targetActor].backrow[targetSlot]) throw new Error("破壊する魔法・罠を選んでください");
    moveBackrowToGrave(state, targetActor, targetSlot);
  } else if (card.effect === "revive-monster") {
    const openSlot = player.monsters.findIndex((monster) => !monster);
    const graveIndex = player.graveyard.findIndex((graveItem) => {
      const graveCard = state.cards[graveItem.cardId];
      return graveCard.type === "monster" && graveCard.stars <= 4;
    });
    if (openSlot < 0 || graveIndex < 0) throw new Error("墓地から戻せるモンスターと空き枠が必要です");
    const [revived] = player.graveyard.splice(graveIndex, 1);
    player.monsters[openSlot] = { ...revived, position: "defense", faceDown: false, attacked: false, attackMod: 0 };
  }
  player.graveyard.push(item);
  player.hand.splice(handIndex, 1);
  appendLog(state, `${card.name}を発動しました`);
  return state;
}

function triggerAttackTrap(state, defenderActor, attackerActor, attackerSlot) {
  const backrow = state.players[defenderActor].backrow;
  const trapSlot = backrow.findIndex((item) => item && state.cards[item.cardId].type === "trap" && item.setTurn < state.turn.number);
  if (trapSlot < 0) return { negated: false, halveDamage: false };
  const trap = state.cards[backrow[trapSlot].cardId];
  moveBackrowToGrave(state, defenderActor, trapSlot);
  appendLog(state, `${trap.name}が発動しました`);
  if (trap.effect === "destroy-attacker") {
    moveMonsterToGrave(state, attackerActor, attackerSlot);
    return { negated: true, halveDamage: false };
  }
  if (trap.effect === "negate-attack") return { negated: true, halveDamage: false };
  return { negated: false, halveDamage: trap.effect === "halve-battle-damage" };
}

function currentAttack(state, actor, monster) {
  const card = state.cards[monster.cardId];
  const graveBoost = card.effect === "grave-boost" && state.players[actor].graveyard.some((item) => state.cards[item.cardId].type === "monster") ? 200 : 0;
  return card.attack + (monster.attackMod ?? 0) + graveBoost;
}

function checkLifeWinner(state) {
  for (const actor of ["player", "cpu"]) {
    if (state.players[actor].life <= 0) {
      state.players[actor].life = 0;
      state.winner = otherActor(actor);
      state.reason = `${actor === "player" ? "あなた" : "CPU"}のLPが0になりました`;
    }
  }
}

export function enterBattlePhase(inputState, actor) {
  requireTurn(inputState, actor, "main");
  const state = clone(inputState);
  state.turn.phase = "battle";
  appendLog(state, "バトルフェーズ");
  return state;
}

export function attack(inputState, { actor, attackerSlot, targetSlot = null }) {
  requireTurn(inputState, actor, "battle");
  const state = clone(inputState);
  const defenderActor = otherActor(actor);
  const attacker = state.players[actor].monsters[attackerSlot];
  if (!attacker || attacker.position !== "attack" || attacker.faceDown) throw new Error("攻撃表示のモンスターを選んでください");
  if (attacker.attacked) throw new Error("このモンスターは攻撃済みです");
  const defenders = state.players[defenderActor].monsters;
  if (defenders.some(Boolean) && (targetSlot === null || !defenders[targetSlot])) throw new Error("攻撃対象を選んでください");
  attacker.attacked = true;
  const trap = triggerAttackTrap(state, defenderActor, actor, attackerSlot);
  if (trap.negated) return state;
  const attackValue = currentAttack(state, actor, attacker);
  if (!defenders.some(Boolean)) {
    const damage = trap.halveDamage ? Math.floor(attackValue / 2) : attackValue;
    state.players[defenderActor].life -= damage;
    appendLog(state, `${damage}の直接ダメージ`);
    checkLifeWinner(state);
    return state;
  }
  const defender = defenders[targetSlot];
  const defenderCard = state.cards[defender.cardId];
  if (defender.faceDown) {
    defender.faceDown = false;
    defender.position = "defense";
    if (defenderCard.effect === "weaken-on-flip") attacker.attackMod -= 300;
  }
  if (defender.position === "attack") {
    const defenderAttack = currentAttack(state, defenderActor, defender);
    const difference = attackValue - defenderAttack;
    if (difference >= 0) moveMonsterToGrave(state, defenderActor, targetSlot);
    if (difference <= 0) moveMonsterToGrave(state, actor, attackerSlot);
    if (difference !== 0) state.players[difference > 0 ? defenderActor : actor].life -= Math.abs(difference);
  } else {
    const difference = attackValue - defenderCard.defense;
    if (difference > 0) moveMonsterToGrave(state, defenderActor, targetSlot);
    if (difference < 0) state.players[actor].life -= trap.halveDamage ? Math.floor(Math.abs(difference) / 2) : Math.abs(difference);
  }
  appendLog(state, `${state.cards[attacker.cardId].name}が攻撃しました`);
  checkLifeWinner(state);
  return state;
}

export function endTurn(inputState, actor) {
  requireTurn(inputState, actor);
  return beginTurn(inputState, otherActor(actor));
}

export function getCardAttack(state, actor, monster) {
  return currentAttack(state, actor, monster);
}
