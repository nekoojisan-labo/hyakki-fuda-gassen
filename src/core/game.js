const STARTING_LIFE = 4000;
const ZONE_COUNT = 3;

function clone(state) {
  return structuredClone(state);
}

function otherActor(actor) {
  return actor === "player" ? "cpu" : "player";
}

function actorName(actor) {
  return actor === "player" ? "あなた" : "CPU";
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

function appendLog(state, message, meta = {}) {
  state.log = [message, ...state.log].slice(0, 12);
  state.events ??= [];
  state.nextEventId ??= 1;
  state.events = [...state.events, { id: state.nextEventId++, message, ...meta }].slice(-36);
}

function drawInto(state, actor, amount = 1, announce = true) {
  const player = state.players[actor];
  let drawn = 0;
  for (let count = 0; count < amount; count += 1) {
    const cardId = player.deck.shift();
    if (!cardId) {
      state.winner = otherActor(actor);
      state.reason = `${actor === "player" ? "あなた" : "CPU"}がドローできませんでした`;
      appendLog(state, `${actorName(actor)}は山札切れでドローできません`, { tone: "danger", effect: "destroy", anchor: "center" });
      return drawn;
    }
    player.hand.push({ uid: `${actor}-${state.nextUid++}`, cardId });
    drawn += 1;
  }
  if (announce && drawn) appendLog(state, `${actorName(actor)}はカードを${drawn}枚引きました`, { tone: "info", effect: "draw", anchor: `${actor}-deck` });
  return drawn;
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
    version: 2,
    cards: cardMap,
    players: {
      player: createPlayer(shuffle(decks.player, random)),
      cpu: createPlayer(shuffle(decks.cpu, random))
    },
    turn: { number: 1, actor: "player", phase: "main" },
    nextUid: 1,
    nextEventId: 1,
    winner: null,
    reason: null,
    log: [],
    events: []
  };
  drawInto(state, "player", 5, false);
  drawInto(state, "cpu", 5, false);
  appendLog(state, "あなたの先攻。メインフェーズ開始", { tone: "turn", effect: "turn", anchor: "center" });
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
    appendLog(state, `${actorName(actor)}のメインフェーズ`, { tone: "turn", effect: "turn", anchor: "center" });
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
    appendLog(state, `${state.cards[player.monsters[slot].cardId].name}を召喚素材にしました`, { tone: "info", effect: "destroy", anchor: `${actor}-monster-${slot + 1}` });
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
  appendLog(state, `${actorName(actor)}は${card.name}を${position === "attack" ? "攻撃表示で召喚" : "裏側守備でセット"}`, { tone: "summon", effect: "summon", anchor: `${actor}-monster-${zoneIndex + 1}`, cardId: card.id });
  if (position === "attack" && card.effect === "draw-on-summon") {
    const drawn = drawInto(state, actor, 1, false);
    if (drawn) appendLog(state, `${card.name}「${card.effectName}」で${drawn}枚ドロー`, { tone: "effect", effect: "draw", anchor: `${actor}-monster-${zoneIndex + 1}`, cardId: card.id });
  }
  if (position === "attack" && card.effect === "gain-life-on-summon") {
    player.life += 500;
    appendLog(state, `${card.name}「${card.effectName}」でLPを500回復`, { tone: "heal", effect: "heal", anchor: `${actor}-monster-${zoneIndex + 1}`, cardId: card.id });
  }
  if (position === "attack" && card.effect === "destroy-backrow-on-summon") {
    const targetActor = otherActor(actor);
    const targetSlot = state.players[targetActor].backrow.findIndex(Boolean);
    if (targetSlot >= 0) {
      const destroyed = state.cards[state.players[targetActor].backrow[targetSlot].cardId];
      moveBackrowToGrave(state, targetActor, targetSlot);
      appendLog(state, `${card.name}「${card.effectName}」で${destroyed.name}を破壊`, { tone: "effect", effect: "destroy", anchor: `${targetActor}-spell-trap-${targetSlot + 1}`, cardId: card.id });
    } else {
      appendLog(state, `${card.name}「${card.effectName}」は対象がなく不発`, { tone: "info", effect: "summon", anchor: `${actor}-monster-${zoneIndex + 1}`, cardId: card.id });
    }
  }
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
  appendLog(state, actor === "player" ? `${card.name}を伏せました。次のターンから反応します` : "CPUは伏せ札を1枚セット", { tone: "set", effect: "trap", anchor: `${actor}-spell-trap-${zoneIndex + 1}`, cardId: actor === "player" ? card.id : undefined });
  return state;
}

function moveMonsterToGrave(state, actor, slot) {
  const monster = state.players[actor].monsters[slot];
  if (!monster) return;
  const card = state.cards[monster.cardId];
  state.players[actor].graveyard.push(monster);
  state.players[actor].monsters[slot] = null;
  appendLog(state, `${card.name}は破壊され墓地へ`, { tone: "danger", effect: "destroy", anchor: `${actor}-monster-${slot + 1}`, cardId: card.id });
  if (card.effect === "gain-life-on-destroy") {
    state.players[actor].life += 300;
    appendLog(state, `${card.name}「${card.effectName}」でLPを300回復`, { tone: "heal", effect: "heal", anchor: `${actor}-monster-${slot + 1}`, cardId: card.id });
  }
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
  appendLog(state, `${actorName(actor)}は${card.name}「${card.effectName}」を発動`, { tone: "spell", effect: "spell", anchor: "center", cardId: card.id });
  if (card.effect === "destroy-monster") {
    const target = state.players[targetActor].monsters[targetSlot];
    if (!target || target.faceDown) throw new Error("破壊する表側モンスターを選んでください");
    moveMonsterToGrave(state, targetActor, targetSlot);
  } else if (card.effect === "boost-monster") {
    const target = player.monsters[targetSlot];
    if (!target || target.faceDown) throw new Error("強化する表側モンスターを選んでください");
    target.attackMod += 500;
    appendLog(state, `${state.cards[target.cardId].name}の攻撃力が500上昇`, { tone: "buff", effect: "buff", anchor: `${actor}-monster-${targetSlot + 1}`, cardId: target.cardId });
  } else if (card.effect === "draw-two") {
    const drawn = drawInto(state, actor, 2, false);
    if (drawn) appendLog(state, `${card.name}の効果でカードを${drawn}枚ドロー`, { tone: "effect", effect: "draw", anchor: `${actor}-deck`, cardId: card.id });
  } else if (card.effect === "destroy-backrow") {
    const target = state.players[targetActor].backrow[targetSlot];
    if (!target) throw new Error("破壊する伏せ札を選んでください");
    const targetCard = state.cards[target.cardId];
    moveBackrowToGrave(state, targetActor, targetSlot);
    appendLog(state, `${targetCard.name}を破壊して墓地へ`, { tone: "danger", effect: "destroy", anchor: `${targetActor}-spell-trap-${targetSlot + 1}`, cardId: targetCard.id });
  } else if (card.effect === "revive-monster") {
    const openSlot = player.monsters.findIndex((monster) => !monster);
    const graveIndex = player.graveyard.findIndex((graveItem) => {
      const graveCard = state.cards[graveItem.cardId];
      return graveCard.type === "monster" && graveCard.stars <= 4;
    });
    if (openSlot < 0 || graveIndex < 0) throw new Error("墓地から戻せるモンスターと空き枠が必要です");
    const [revived] = player.graveyard.splice(graveIndex, 1);
    player.monsters[openSlot] = { ...revived, position: "defense", faceDown: false, attacked: false, attackMod: 0 };
    appendLog(state, `${state.cards[revived.cardId].name}を守備表示で蘇生`, { tone: "summon", effect: "summon", anchor: `${actor}-monster-${openSlot + 1}`, cardId: revived.cardId });
  }
  player.graveyard.push(item);
  player.hand.splice(handIndex, 1);
  return state;
}

function triggerAttackTrap(state, defenderActor, attackerActor, attackerSlot) {
  const backrow = state.players[defenderActor].backrow;
  const trapSlot = backrow.findIndex((item) => item && state.cards[item.cardId].type === "trap" && item.setTurn < state.turn.number);
  if (trapSlot < 0) return { negated: false, halveDamage: false };
  const trap = state.cards[backrow[trapSlot].cardId];
  moveBackrowToGrave(state, defenderActor, trapSlot);
  appendLog(state, `${actorName(defenderActor)}の罠・${trap.name}「${trap.effectName}」が発動`, { tone: "trap", effect: "trap", anchor: `${defenderActor}-spell-trap-${trapSlot + 1}`, cardId: trap.id });
  if (trap.effect === "destroy-attacker") {
    moveMonsterToGrave(state, attackerActor, attackerSlot);
    appendLog(state, `${trap.name}が攻撃モンスターを破壊し、攻撃を無効化`, { tone: "danger", effect: "destroy", anchor: `${attackerActor}-monster-${attackerSlot + 1}`, cardId: trap.id });
    return { negated: true, halveDamage: false };
  }
  if (trap.effect === "negate-attack") {
    appendLog(state, `${trap.name}が攻撃を無効化`, { tone: "guard", effect: "guard", anchor: `${defenderActor}-monster-2`, cardId: trap.id });
    return { negated: true, halveDamage: false };
  }
  appendLog(state, `${trap.name}により、この戦闘のダメージは半分`, { tone: "guard", effect: "guard", anchor: `${defenderActor}-monster-2`, cardId: trap.id });
  return { negated: false, halveDamage: trap.effect === "halve-battle-damage" };
}

function currentAttack(state, actor, monster) {
  const card = state.cards[monster.cardId];
  const graveBoost = card.effect === "grave-boost" && state.players[actor].graveyard.some((item) => state.cards[item.cardId].type === "monster") ? 200 : 0;
  const fieldBoost = state.players[actor].monsters.some((ally) => ally && !ally.faceDown && state.cards[ally.cardId].effect === "field-boost") ? 200 : 0;
  return card.attack + (monster.attackMod ?? 0) + graveBoost + fieldBoost;
}

function reduceBattleDamage(state, actor, amount, halveDamage = false) {
  let result = halveDamage ? Math.floor(amount / 2) : amount;
  const guarded = state.players[actor].monsters.some((monster) => monster && !monster.faceDown && state.cards[monster.cardId].effect === "battle-guard");
  if (guarded) result = Math.max(0, result - 300);
  return result;
}

function dealBattleDamage(state, actor, amount, halveDamage = false) {
  const damage = reduceBattleDamage(state, actor, amount, halveDamage);
  state.players[actor].life -= damage;
  appendLog(state, `${actorName(actor)}に${damage}の戦闘ダメージ`, { tone: "damage", effect: "burst", anchor: "center", amount: damage });
  return damage;
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
  appendLog(state, `${actorName(actor)}のバトルフェーズ`, { tone: "turn", effect: "turn", anchor: "center" });
  return state;
}

export function attack(inputState, { actor, attackerSlot, targetSlot = null }) {
  requireTurn(inputState, actor, "battle");
  const state = clone(inputState);
  const defenderActor = otherActor(actor);
  const attacker = state.players[actor].monsters[attackerSlot];
  if (!attacker || attacker.position !== "attack" || attacker.faceDown) throw new Error("攻撃表示のモンスターを選んでください");
  if (attacker.attacked) throw new Error("このモンスターは攻撃済みです");
  const attackerCard = state.cards[attacker.cardId];
  const defenders = state.players[defenderActor].monsters;
  if (defenders.some(Boolean) && (targetSlot === null || !defenders[targetSlot])) throw new Error("攻撃対象を選んでください");
  const declaredTarget = targetSlot === null ? "相手プレイヤー" : defenders[targetSlot].faceDown ? "裏側守備モンスター" : state.cards[defenders[targetSlot].cardId].name;
  appendLog(state, `${attackerCard.name}が${declaredTarget}へ攻撃`, { tone: "attack", effect: "slash", anchor: targetSlot === null ? "center" : `${defenderActor}-monster-${targetSlot + 1}`, cardId: attackerCard.id });
  attacker.attacked = true;
  const trap = triggerAttackTrap(state, defenderActor, actor, attackerSlot);
  if (trap.negated) return state;
  if (!defenders.some(Boolean)) {
    const attackValue = currentAttack(state, actor, attacker);
    dealBattleDamage(state, defenderActor, attackValue, trap.halveDamage);
    checkLifeWinner(state);
    return state;
  }
  const defender = defenders[targetSlot];
  const defenderCard = state.cards[defender.cardId];
  if (defender.faceDown) {
    defender.faceDown = false;
    defender.position = "defense";
    appendLog(state, `伏せられていた${defenderCard.name}が表になりました`, { tone: "reveal", effect: "reveal", anchor: `${defenderActor}-monster-${targetSlot + 1}`, cardId: defenderCard.id });
    if (defenderCard.effect === "weaken-on-flip") {
      attacker.attackMod -= 300;
      appendLog(state, `${defenderCard.name}「${defenderCard.effectName}」で${attackerCard.name}の攻撃力が300低下`, { tone: "debuff", effect: "debuff", anchor: `${actor}-monster-${attackerSlot + 1}`, cardId: defenderCard.id });
    }
    if (defenderCard.effect === "draw-on-flip") {
      const drawn = drawInto(state, defenderActor, 1, false);
      if (drawn) appendLog(state, `${defenderCard.name}「${defenderCard.effectName}」で${actorName(defenderActor)}は${drawn}枚ドロー`, { tone: "effect", effect: "draw", anchor: `${defenderActor}-monster-${targetSlot + 1}`, cardId: defenderCard.id });
      if (state.winner) return state;
    }
  }
  const attackValue = currentAttack(state, actor, attacker);
  let defenderDestroyed = false;
  if (defender.position === "attack") {
    const defenderAttack = currentAttack(state, defenderActor, defender);
    const difference = attackValue - defenderAttack;
    appendLog(state, `攻撃力比較 ${attackValue} 対 ${defenderAttack}`, { tone: "compare", effect: "clash", anchor: `${defenderActor}-monster-${targetSlot + 1}` });
    if (difference >= 0) {
      moveMonsterToGrave(state, defenderActor, targetSlot);
      defenderDestroyed = true;
    }
    if (difference <= 0) moveMonsterToGrave(state, actor, attackerSlot);
    if (difference > 0) dealBattleDamage(state, defenderActor, difference, trap.halveDamage);
    if (difference < 0) dealBattleDamage(state, actor, Math.abs(difference));
  } else {
    const difference = attackValue - defenderCard.defense;
    appendLog(state, `攻撃力${attackValue} 対 守備力${defenderCard.defense}`, { tone: "compare", effect: "clash", anchor: `${defenderActor}-monster-${targetSlot + 1}` });
    if (difference > 0) {
      moveMonsterToGrave(state, defenderActor, targetSlot);
      defenderDestroyed = true;
      if (attackerCard.effect === "piercing") {
        dealBattleDamage(state, defenderActor, difference, trap.halveDamage);
        appendLog(state, `${attackerCard.name}「${attackerCard.effectName}」で守備を貫通`, { tone: "effect", effect: "slash", anchor: `${defenderActor}-monster-${targetSlot + 1}`, cardId: attackerCard.id });
      }
    }
    if (difference < 0) dealBattleDamage(state, actor, Math.abs(difference));
  }
  if (defenderCard.effect === "wall-recovery") {
    state.players[defenderActor].life += 300;
    appendLog(state, `${defenderCard.name}「${defenderCard.effectName}」でLPを300回復`, { tone: "heal", effect: "heal", anchor: `${defenderActor}-monster-${targetSlot + 1}`, cardId: defenderCard.id });
  }
  if (defenderDestroyed && attackerCard.effect === "rage-on-destroy" && state.players[actor].monsters[attackerSlot]) {
    state.players[actor].monsters[attackerSlot].attackMod += 300;
    appendLog(state, `${attackerCard.name}「${attackerCard.effectName}」で攻撃力が300上昇`, { tone: "buff", effect: "buff", anchor: `${actor}-monster-${attackerSlot + 1}`, cardId: attackerCard.id });
  }
  checkLifeWinner(state);
  return state;
}

export function getBattlePreview(state, { actor, attackerSlot, targetSlot = null }) {
  const defenderActor = otherActor(actor);
  const attacker = state.players[actor].monsters[attackerSlot];
  if (!attacker) return null;
  const attackerCard = state.cards[attacker.cardId];
  const attackValue = currentAttack(state, actor, attacker);
  const defenders = state.players[defenderActor].monsters;
  const trapWarning = state.players[defenderActor].backrow.some(Boolean);
  if (!defenders.some(Boolean)) {
    return { attackerName: attackerCard.name, attackValue, defenderName: "相手プレイヤー", defenderLabel: "DIRECT", defenderValue: 0, outcome: `${reduceBattleDamage(state, defenderActor, attackValue)}ダメージ`, trapWarning };
  }
  const defender = defenders[targetSlot];
  if (!defender) return null;
  if (defender.faceDown) {
    return { attackerName: attackerCard.name, attackValue, defenderName: "裏側守備カード", defenderLabel: "DEF", defenderValue: null, outcome: "攻撃後に正体と結果が判明", trapWarning };
  }
  const defenderCard = state.cards[defender.cardId];
  if (defender.position === "attack") {
    const defenderValue = currentAttack(state, defenderActor, defender);
    const difference = attackValue - defenderValue;
    const outcome = difference > 0 ? `${defenderCard.name}を破壊・相手に${reduceBattleDamage(state, defenderActor, difference)}ダメージ` : difference < 0 ? `${attackerCard.name}が破壊・自分に${reduceBattleDamage(state, actor, Math.abs(difference))}ダメージ` : "相打ち・両方を破壊";
    return { attackerName: attackerCard.name, attackValue, defenderName: defenderCard.name, defenderLabel: "ATK", defenderValue, outcome, trapWarning };
  }
  const difference = attackValue - defenderCard.defense;
  const piercingDamage = difference > 0 && attackerCard.effect === "piercing" ? reduceBattleDamage(state, defenderActor, difference) : 0;
  const outcome = difference > 0 ? `${defenderCard.name}を破壊${piercingDamage ? `・貫通${piercingDamage}ダメージ` : ""}` : difference < 0 ? `破壊なし・自分に${reduceBattleDamage(state, actor, Math.abs(difference))}ダメージ` : "破壊なし・ダメージなし";
  return { attackerName: attackerCard.name, attackValue, defenderName: defenderCard.name, defenderLabel: "DEF", defenderValue: defenderCard.defense, outcome, trapWarning };
}

export function endTurn(inputState, actor) {
  requireTurn(inputState, actor);
  return beginTurn(inputState, otherActor(actor));
}

export function getCardAttack(state, actor, monster) {
  return currentAttack(state, actor, monster);
}
