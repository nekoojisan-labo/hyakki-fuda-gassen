import { activateSpell, attack, createGame, endTurn, enterBattlePhase, getBattlePreview, getCardAttack, getTributeCount, setBackrow, summonMonster } from "../core/game.js";
import { runCpuTurnSteps } from "../core/cpu.js";
import { clearSave, loadTurnStart, saveTurnStart } from "../core/storage.js";
import { applyLayout } from "./layout.js";
import { getNextGuidance, loadHintsEnabled, saveHintsEnabled } from "./guidance.js";

const [cards, decks, layoutData] = await Promise.all([
  fetch("src/data/cards.json").then((response) => response.json()),
  fetch("src/data/decks.json").then((response) => response.json()),
  fetch("src/data/layout.json").then((response) => response.json())
]);

const elementIds = [
  "battlefield", "slot-layer", "effect-layer", "hand", "message", "next-hint", "log",
  "cpu-life", "player-life", "cpu-deck", "player-deck", "cpu-grave", "player-grave",
  "battle-phase", "attack-confirm", "direct-attack", "end-turn", "attack-position", "set-position", "activate",
  "debug-toggle", "start-dialog", "resume-game", "new-game", "result-dialog", "result-title", "result-reason", "restart-game",
  "help-dialog", "help-open", "help-close", "help-start", "hints-toggle",
  "card-inspector", "inspector-kind", "inspector-name", "inspector-keyword", "inspector-condition", "inspector-target", "inspector-result", "inspector-availability",
  "event-stage", "event-icon", "event-type", "event-message",
  "combat-preview", "preview-attacker", "preview-attack", "preview-defense", "preview-defender", "preview-result", "preview-warning"
];
const elements = Object.fromEntries(elementIds.map((id) => [id, document.getElementById(id)]));
const cardMap = Object.fromEntries(cards.map((card) => [card.id, card]));
const slotElements = new Map();
const query = new URLSearchParams(location.search);

let state = null;
let selection = emptySelection();
let debugVisible = query.get("debug") === "1";
let hintsEnabled = loadHintsEnabled();
let lastPresentedEventId = 0;
let eventQueue = [];
let eventPresenting = false;
let eventTimer = null;

const toneLabels = {
  turn: "フェーズ", summon: "召喚", set: "セット", spell: "術式発動", trap: "罠発動",
  attack: "攻撃宣言", compare: "戦闘計算", damage: "ダメージ", danger: "破壊",
  heal: "回復", buff: "強化", debuff: "弱体", effect: "カード効果", reveal: "反転", guard: "防御", info: "進行"
};

function emptySelection() {
  return { handIndex: null, attackerSlot: null, targetSlot: null, tributeSlots: [], summonPosition: "attack" };
}

function resetSelection() {
  selection = emptySelection();
}

function resetEventPresentation() {
  if (eventTimer) window.clearTimeout(eventTimer);
  eventTimer = null;
  eventQueue = [];
  eventPresenting = false;
  elements["event-stage"].hidden = true;
}

function slotId(actor, zoneType, index) {
  return `${actor}-${zoneType}-${index + 1}`;
}

function createSlots() {
  for (const actor of ["cpu", "player"]) {
    for (const zoneType of ["monster", "spell-trap"]) {
      for (let index = 0; index < 3; index += 1) {
        const id = slotId(actor, zoneType, index);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `board-slot ${actor} ${zoneType}`;
        button.dataset.slot = id;
        button.dataset.actor = actor;
        button.dataset.zoneType = zoneType;
        button.dataset.index = String(index);
        button.innerHTML = `<span class="slot-debug">${id}<i></i></span>`;
        button.addEventListener("click", () => handleSlotClick(actor, zoneType, index));
        elements["slot-layer"].append(button);
        slotElements.set(id, button);
      }
    }
  }
  positionSlots();
}

function positionSlots() {
  const bounds = elements.battlefield.getBoundingClientRect();
  const mode = applyLayout(slotElements, layoutData, bounds.width, bounds.height);
  elements.battlefield.dataset.layout = mode;
}

function cardMarkup(item, actor, hidden = false) {
  if (!item) return "";
  const card = cardMap[item.cardId];
  if (hidden || item.faceDown) return `<span class="card-face card-back"><img src="assets/ui/card-back.svg" alt="伏せカード"></span>`;
  const stats = card.type === "monster"
    ? `<span class="stars">${"★".repeat(card.stars)}</span><span class="stats">${item.position === "defense" ? "DEF" : "ATK"} ${item.position === "defense" ? card.defense : getCardAttack(state, actor, item)}</span>`
    : `<span class="kind">${card.type === "spell" ? "術" : "罠"}</span>`;
  return `<span class="card-face"><img class="card-art" src="${card.art}" alt="${card.name}"><img class="card-frame" src="assets/ui/card-frame.svg" alt=""><strong>${card.name}</strong><span class="ability-mark">${card.keyword}</span>${stats}</span>`;
}

function selectedHandCard() {
  const item = state?.players.player.hand[selection.handIndex];
  return item ? cardMap[item.cardId] : null;
}

function spellTargetSpec(card) {
  if (!card || card.type !== "spell") return null;
  if (card.effect === "destroy-monster") return { actor: "cpu", zoneType: "monster", faceUp: true };
  if (card.effect === "boost-monster") return { actor: "player", zoneType: "monster", faceUp: true };
  if (card.effect === "destroy-backrow") return { actor: "cpu", zoneType: "spell-trap", faceUp: false };
  return null;
}

function isSpellTargetValid(card, actor, zoneType, index) {
  const spec = spellTargetSpec(card);
  if (!spec || actor !== spec.actor || zoneType !== spec.zoneType) return false;
  const zone = zoneType === "monster" ? state.players[actor].monsters : state.players[actor].backrow;
  const item = zone[index];
  if (!item) return false;
  return !spec.faceUp || !item.faceDown;
}

function spellUsability(card) {
  if (!card || card.type !== "spell") return { usable: false, reason: "魔法カードを選んでください" };
  if (state.turn.actor !== "player" || state.turn.phase !== "main") return { usable: false, reason: "自分のメインフェーズでのみ発動できます" };
  if (card.effect === "destroy-monster" && !state.players.cpu.monsters.some((item) => item && !item.faceDown)) return { usable: false, reason: "相手の表側モンスターが必要です" };
  if (card.effect === "boost-monster" && !state.players.player.monsters.some((item) => item && !item.faceDown)) return { usable: false, reason: "自分の表側モンスターが必要です" };
  if (card.effect === "destroy-backrow" && !state.players.cpu.backrow.some(Boolean)) return { usable: false, reason: "相手の伏せ札が必要です" };
  if (card.effect === "revive-monster") {
    const hasOpenSlot = state.players.player.monsters.some((item) => !item);
    const hasTarget = state.players.player.graveyard.some((item) => cardMap[item.cardId].type === "monster" && cardMap[item.cardId].stars <= 4);
    if (!hasOpenSlot || !hasTarget) return { usable: false, reason: "空き枠と墓地の星4以下モンスターが必要です" };
  }
  const needsTarget = Boolean(spellTargetSpec(card));
  if (needsTarget && selection.targetSlot === null) return { usable: false, reason: "光っている対象を先に選んでください", needsTarget: true };
  return { usable: true, reason: needsTarget ? "対象を確認して「効果発動」で確定できます" : "対象なし。そのまま「効果発動」で使えます", needsTarget };
}

function targetSelectionMatches(actor, zoneType, index) {
  if (selection.targetSlot !== index) return false;
  const card = selectedHandCard();
  if (state.turn.phase === "battle" && selection.attackerSlot !== null) return actor === "cpu" && zoneType === "monster";
  const spec = spellTargetSpec(card);
  return Boolean(spec && actor === spec.actor && zoneType === spec.zoneType);
}

function renderBoard() {
  for (const actor of ["cpu", "player"]) {
    const player = state.players[actor];
    for (let index = 0; index < 3; index += 1) {
      const monsterSlot = slotElements.get(slotId(actor, "monster", index));
      const monster = player.monsters[index];
      monsterSlot.classList.toggle("occupied", Boolean(monster));
      monsterSlot.classList.toggle("selected", actor === "player" && selection.attackerSlot === index);
      monsterSlot.classList.toggle("target-selected", targetSelectionMatches(actor, "monster", index));
      monsterSlot.classList.toggle("defense", monster?.position === "defense" || monster?.position === "set");
      monsterSlot.innerHTML = `${cardMarkup(monster, actor)}<span class="slot-debug">${monsterSlot.dataset.slot}<i></i></span>`;

      const backSlot = slotElements.get(slotId(actor, "spell-trap", index));
      const backrow = player.backrow[index];
      backSlot.classList.toggle("occupied", Boolean(backrow));
      backSlot.classList.toggle("target-selected", targetSelectionMatches(actor, "spell-trap", index));
      backSlot.innerHTML = `${cardMarkup(backrow, actor, Boolean(backrow))}<span class="slot-debug">${backSlot.dataset.slot}<i></i></span>`;
    }
  }
  renderValidTargets();
}

function renderValidTargets() {
  slotElements.forEach((element) => element.classList.remove("valid-target"));
  const card = selectedHandCard();
  if (card?.type === "spell") {
    for (let index = 0; index < 3; index += 1) {
      for (const actor of ["cpu", "player"]) {
        for (const zoneType of ["monster", "spell-trap"]) {
          if (isSpellTargetValid(card, actor, zoneType, index)) slotElements.get(slotId(actor, zoneType, index)).classList.add("valid-target");
        }
      }
    }
  }
  if (state.turn.phase === "battle" && selection.attackerSlot !== null) {
    state.players.cpu.monsters.forEach((monster, index) => {
      if (monster) slotElements.get(slotId("cpu", "monster", index)).classList.add("valid-target");
    });
  }
}

function renderHand() {
  elements.hand.replaceChildren();
  state.players.player.hand.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hand-card";
    button.classList.toggle("selected", selection.handIndex === index);
    button.innerHTML = cardMarkup(item, "player");
    button.addEventListener("click", () => {
      const selectingSame = selection.handIndex === index;
      resetSelection();
      selection.handIndex = selectingSame ? null : index;
      const card = cardMap[item.cardId];
      setMessage(selectingSame ? "カード選択を解除しました" : `${card.name}を選択。効果と対象を確認してください`);
      render();
    });
    elements.hand.append(button);
  });
}

function inspectorCard() {
  const handCard = selectedHandCard();
  if (handCard) return handCard;
  if (selection.attackerSlot !== null) {
    const monster = state.players.player.monsters[selection.attackerSlot];
    if (monster) return cardMap[monster.cardId];
  }
  return null;
}

function renderInspector() {
  const card = inspectorCard();
  const availability = elements["inspector-availability"];
  if (!card) {
    elements["inspector-kind"].textContent = "操作ガイド";
    elements["inspector-name"].textContent = "カードを選んでください";
    elements["inspector-keyword"].textContent = "効果をここに表示";
    elements["inspector-condition"].textContent = state.turn.phase === "battle" ? "攻撃できる自分のモンスターを選択" : "手札のカードを選択";
    elements["inspector-target"].textContent = "—";
    elements["inspector-result"].textContent = "発動条件・対象・結果を確認できます";
    availability.textContent = "現在の操作に合わせて、使える対象だけが光ります";
    availability.classList.remove("unavailable");
    return;
  }
  elements["inspector-kind"].textContent = card.type === "monster" ? `妖怪・星${card.stars}` : card.type === "spell" ? "術式カード" : "罠カード";
  elements["inspector-name"].textContent = `${card.name}｜${card.effectName}`;
  elements["inspector-keyword"].textContent = card.keyword;
  elements["inspector-condition"].textContent = card.condition;
  elements["inspector-target"].textContent = card.target;
  elements["inspector-result"].textContent = card.result;

  let status = { usable: true, reason: "使用できます" };
  if (selection.attackerSlot !== null && !selectedHandCard()) status = { usable: true, reason: selection.targetSlot === null ? "攻撃対象を選んでください" : "戦闘予測を確認し「攻撃実行」で確定できます" };
  else if (card.type === "monster") {
    const tributeCount = getTributeCount(card);
    const available = state.players.player.monsters.filter(Boolean).length;
    status = state.players.player.normalSummoned ? { usable: false, reason: "このターンはすでに通常召喚しています" } : available < tributeCount ? { usable: false, reason: `召喚素材が${tributeCount - available}体不足しています` } : { usable: true, reason: tributeCount ? `素材を${tributeCount}体選んでから空き枠へ出します` : "攻撃表示または裏側守備で召喚できます" };
  } else if (card.type === "spell") status = spellUsability(card);
  else status = state.players.player.backrow.some((item) => !item) ? { usable: true, reason: "空いている魔法・罠枠へ伏せられます" } : { usable: false, reason: "魔法・罠枠に空きがありません" };
  availability.textContent = status.reason;
  availability.classList.toggle("unavailable", !status.usable);
}

function renderCombatPreview() {
  const previewElement = elements["combat-preview"];
  if (state.turn.phase !== "battle" || selection.attackerSlot === null) {
    previewElement.hidden = true;
    return;
  }
  const hasDefenders = state.players.cpu.monsters.some(Boolean);
  if (hasDefenders && selection.targetSlot === null) {
    previewElement.hidden = true;
    return;
  }
  const preview = getBattlePreview(state, { actor: "player", attackerSlot: selection.attackerSlot, targetSlot: selection.targetSlot });
  if (!preview) {
    previewElement.hidden = true;
    return;
  }
  previewElement.hidden = false;
  elements["preview-attacker"].textContent = preview.attackerName;
  elements["preview-attack"].textContent = `ATK ${preview.attackValue}`;
  elements["preview-defense"].textContent = preview.defenderValue === null ? `${preview.defenderLabel} ???` : `${preview.defenderLabel} ${preview.defenderValue}`;
  elements["preview-defender"].textContent = preview.defenderName;
  elements["preview-result"].textContent = preview.outcome;
  elements["preview-warning"].textContent = preview.trapWarning ? "相手に伏せ札があります。罠で結果が変わる可能性があります。" : "";
}

function clearGuidanceTargets() {
  document.querySelectorAll(".guided-next").forEach((element) => element.classList.remove("guided-next"));
}

function guidanceElements(target) {
  if (target.startsWith("hand-")) return [elements.hand.children[Number(target.split("-")[1])]].filter(Boolean);
  if (target.startsWith("player-monster-")) return [slotElements.get(slotId("player", "monster", Number(target.split("-")[2])))].filter(Boolean);
  if (target === "open-player-monsters") return [...slotElements.values()].filter((element) => element.dataset.actor === "player" && element.dataset.zoneType === "monster" && !element.classList.contains("occupied"));
  if (target === "player-monsters") return [...slotElements.values()].filter((element) => element.dataset.actor === "player" && element.dataset.zoneType === "monster" && element.classList.contains("occupied"));
  if (target === "cpu-monsters") return [...slotElements.values()].filter((element) => element.dataset.actor === "cpu" && element.dataset.zoneType === "monster" && element.classList.contains("occupied"));
  if (target === "cpu-backrow") return [...slotElements.values()].filter((element) => element.dataset.actor === "cpu" && element.dataset.zoneType === "spell-trap" && element.classList.contains("occupied"));
  if (target === "open-player-backrow") return [...slotElements.values()].filter((element) => element.dataset.actor === "player" && element.dataset.zoneType === "spell-trap" && !element.classList.contains("occupied"));
  return [elements[target]].filter(Boolean);
}

function renderGuidance() {
  clearGuidanceTargets();
  elements["next-hint"].hidden = !hintsEnabled;
  elements["hints-toggle"].textContent = `ヒント ${hintsEnabled ? "ON" : "OFF"}`;
  elements["hints-toggle"].setAttribute("aria-pressed", String(hintsEnabled));
  if (!hintsEnabled || !state) return;
  const guidance = getNextGuidance(state, selection);
  elements["next-hint"].querySelector("span").textContent = guidance.text;
  guidance.targets.flatMap(guidanceElements).forEach((element) => element.classList.add("guided-next"));
}

function handleSlotClick(actor, zoneType, index) {
  if (!state || state.winner || state.turn.actor !== "player") return;
  try {
    const selectedCard = selectedHandCard();

    if (state.turn.phase === "main" && selectedCard?.type === "spell" && isSpellTargetValid(selectedCard, actor, zoneType, index)) {
      selection.targetSlot = index;
      const targetItem = zoneType === "monster" ? state.players[actor].monsters[index] : state.players[actor].backrow[index];
      const targetName = actor === "cpu" && zoneType === "spell-trap" ? "相手の伏せ札" : cardMap[targetItem.cardId].name;
      setMessage(`${targetName}を対象に選択。「効果発動」で確定してください`);
      render();
      return;
    }

    if (zoneType === "monster" && actor === "player") {
      const occupant = state.players.player.monsters[index];
      if (selectedCard?.type === "monster" && occupant) {
        const required = getTributeCount(selectedCard);
        if (required > 0) {
          if (selection.tributeSlots.length === required && selection.tributeSlots.includes(index)) {
            state = summonMonster(state, { actor: "player", handIndex: selection.handIndex, zoneIndex: index, position: selection.summonPosition, tributeSlots: selection.tributeSlots });
            resetSelection();
            setMessage("素材を使って上級召喚しました。中央表示と履歴で結果を確認できます");
          } else {
            selection.tributeSlots = selection.tributeSlots.includes(index) ? selection.tributeSlots.filter((slot) => slot !== index) : [...selection.tributeSlots, index].slice(-required);
            setMessage(`召喚素材 ${selection.tributeSlots.length}/${required}体を選択中。必要数を選んだら、空き枠または選択済み素材をもう一度押します`);
          }
        }
      } else if (selectedCard?.type === "monster" && !occupant) {
        state = summonMonster(state, { actor: "player", handIndex: selection.handIndex, zoneIndex: index, position: selection.summonPosition, tributeSlots: selection.tributeSlots });
        resetSelection();
        setMessage("召喚が完了しました。中央表示と履歴で結果を確認できます");
      } else if (state.turn.phase === "battle" && occupant) {
        if (occupant.position !== "attack" || occupant.faceDown || occupant.attacked) throw new Error("攻撃できる表側攻撃表示モンスターを選んでください");
        selection.handIndex = null;
        selection.attackerSlot = index;
        selection.targetSlot = null;
        setMessage(`${cardMap[occupant.cardId].name}を攻撃側に選択。次に相手モンスターを選んでください`);
      }
    } else if (zoneType === "monster" && actor === "cpu" && state.turn.phase === "battle" && selection.attackerSlot !== null && state.players.cpu.monsters[index]) {
      selection.targetSlot = index;
      setMessage("戦闘予測を確認し、問題なければ「攻撃実行」を押してください");
    } else if (zoneType === "spell-trap" && actor === "player" && selectedCard?.type === "trap" && !state.players.player.backrow[index]) {
      state = setBackrow(state, { actor: "player", handIndex: selection.handIndex, zoneIndex: index });
      resetSelection();
      setMessage("伏せ札をセットしました。罠は次のターン以降の攻撃に反応します");
    }
  } catch (error) {
    setMessage(`${error.message} 次の操作は上のヒントを確認してください`, true);
  }
  render();
}

function setMessage(message, isError = false) {
  elements.message.textContent = message;
  elements.message.classList.toggle("error", isError);
}

function effectTarget(id) {
  if (!id || id === "center") return elements.battlefield;
  if (id === "player-deck" || id === "cpu-deck") return elements[id]?.parentElement ?? elements.battlefield;
  return slotElements.get(id) ?? elements.battlefield;
}

function showEffect(id, effectName) {
  const target = effectTarget(id);
  const bounds = target.getBoundingClientRect();
  const boardBounds = elements.battlefield.getBoundingClientRect();
  const effect = document.createElement("img");
  effect.className = `battle-effect effect-${effectName}`;
  effect.src = `assets/effects/${effectName}.svg`;
  effect.alt = "";
  const isCenter = target === elements.battlefield;
  effect.style.left = `${isCenter ? boardBounds.width / 2 : bounds.left - boardBounds.left + bounds.width / 2}px`;
  effect.style.top = `${isCenter ? boardBounds.height / 2 : bounds.top - boardBounds.top + bounds.height / 2}px`;
  elements["effect-layer"].append(effect);
  effect.addEventListener("animationend", () => effect.remove());
}

function presentNextEvent() {
  if (!eventQueue.length) {
    eventPresenting = false;
    elements["event-stage"].hidden = true;
    return;
  }
  eventPresenting = true;
  const event = eventQueue.shift();
  const effectName = event.effect ?? "turn";
  elements["event-stage"].hidden = true;
  elements["event-stage"].dataset.tone = event.tone ?? "info";
  elements["event-icon"].src = `assets/effects/${effectName}.svg`;
  elements["event-type"].textContent = toneLabels[event.tone] ?? "進行";
  elements["event-message"].textContent = event.message;
  showEffect(event.anchor, effectName);
  window.requestAnimationFrame(() => {
    elements["event-stage"].hidden = false;
    eventTimer = window.setTimeout(() => {
      elements["event-stage"].hidden = true;
      presentNextEvent();
    }, 820);
  });
}

function queueNewEvents() {
  const events = (state.events ?? []).filter((event) => event.id > lastPresentedEventId);
  if (!events.length) return;
  lastPresentedEventId = events.at(-1).id;
  eventQueue.push(...events);
  if (!eventPresenting) presentNextEvent();
}

function renderLog() {
  const events = (state.events ?? []).slice(-10).reverse();
  elements.log.innerHTML = events.map((event) => `<li data-tone="${event.tone ?? "info"}">${event.message}</li>`).join("");
}

function render() {
  if (!state) return;
  renderBoard();
  renderHand();
  renderInspector();
  renderCombatPreview();
  for (const actor of ["cpu", "player"]) {
    elements[`${actor}-life`].textContent = String(state.players[actor].life);
    elements[`${actor}-deck`].textContent = String(state.players[actor].deck.length);
    elements[`${actor}-grave`].textContent = String(state.players[actor].graveyard.length);
  }
  document.getElementById("phase-main").classList.toggle("active", state.turn.phase === "main");
  document.getElementById("phase-battle").classList.toggle("active", state.turn.phase === "battle");
  renderLog();
  const playerTurn = state.turn.actor === "player" && !state.winner;
  const hasCpuMonsters = state.players.cpu.monsters.some(Boolean);
  elements["battle-phase"].disabled = !playerTurn || state.turn.phase !== "main";
  elements["attack-confirm"].disabled = !playerTurn || state.turn.phase !== "battle" || selection.attackerSlot === null || selection.targetSlot === null || !hasCpuMonsters;
  elements["direct-attack"].disabled = !playerTurn || state.turn.phase !== "battle" || selection.attackerSlot === null || hasCpuMonsters;
  const selectedCard = selectedHandCard();
  const spellStatus = spellUsability(selectedCard);
  elements.activate.disabled = !playerTurn || selectedCard?.type !== "spell" || !spellStatus.usable;
  elements.activate.title = selectedCard?.type === "spell" ? spellStatus.reason : "手札の魔法カードを選んでください";
  elements["attack-confirm"].title = elements["attack-confirm"].disabled ? "攻撃側と相手モンスターを選ぶと実行できます" : "表示中の戦闘予測で攻撃します";
  elements["direct-attack"].title = elements["direct-attack"].disabled ? "相手の場が空の時だけ直接攻撃できます" : "表示中の攻撃力で相手へ直接攻撃します";
  document.body.classList.toggle("debug-layout", debugVisible);
  elements["debug-toggle"].setAttribute("aria-pressed", String(debugVisible));
  positionSlots();
  renderGuidance();
  queueNewEvents();
  if (state.winner && !elements["result-dialog"].open) {
    clearSave();
    elements["result-title"].textContent = state.winner === "player" ? "勝利" : "敗北";
    elements["result-reason"].textContent = state.reason;
    elements["result-dialog"].showModal();
  }
}

function startNewGame() {
  resetEventPresentation();
  lastPresentedEventId = 0;
  state = createGame({ cards, decks });
  resetSelection();
  saveTurnStart(state);
  elements["start-dialog"].close();
  setMessage("新しい試合を開始しました。次の操作とカード詳細を確認してください");
  render();
  if (!query.has("autostart") && localStorage.getItem("hyakki-fuda-gassen-help-seen") !== "yes") elements["help-dialog"].showModal();
}

elements["attack-position"].addEventListener("click", () => { selection.summonPosition = "attack"; setMessage("攻撃表示を選択。空いているモンスター枠を押してください"); render(); });
elements["set-position"].addEventListener("click", () => { selection.summonPosition = "set"; setMessage("裏側守備を選択。空いているモンスター枠を押してください"); render(); });
elements["battle-phase"].addEventListener("click", () => {
  try {
    state = enterBattlePhase(state, "player");
    resetSelection();
    setMessage("バトルフェーズ。攻撃できる自分のモンスターを選んでください");
    render();
  } catch (error) { setMessage(error.message, true); }
});
elements["attack-confirm"].addEventListener("click", () => {
  try {
    state = attack(state, { actor: "player", attackerSlot: selection.attackerSlot, targetSlot: selection.targetSlot });
    resetSelection();
    setMessage("攻撃結果を中央表示と履歴で確認してください");
    render();
  } catch (error) { setMessage(error.message, true); }
});
elements["direct-attack"].addEventListener("click", () => {
  try {
    state = attack(state, { actor: "player", attackerSlot: selection.attackerSlot });
    resetSelection();
    setMessage("直接攻撃の結果を中央表示と履歴で確認してください");
    render();
  } catch (error) { setMessage(error.message, true); }
});
elements.activate.addEventListener("click", () => {
  try {
    const card = selectedHandCard();
    const spec = spellTargetSpec(card);
    state = activateSpell(state, { actor: "player", handIndex: selection.handIndex, targetActor: spec?.actor ?? "cpu", targetSlot: selection.targetSlot ?? 0 });
    resetSelection();
    setMessage("カード効果を解決しました。中央表示と履歴で結果を確認してください");
    render();
  } catch (error) { setMessage(`${error.message} 光っている対象と発動条件を確認してください`, true); }
});
elements["end-turn"].addEventListener("click", () => {
  try {
    resetSelection();
    state = endTurn(state, "player");
    saveTurnStart(state);
    setMessage("CPUのターン。行動は中央へ順番に表示されます");
    render();
    window.setTimeout(() => {
      const cpuSteps = runCpuTurnSteps(state);
      let stepIndex = 0;
      const showNextStep = () => {
        if (stepIndex >= cpuSteps.length) {
          if (!state.winner) saveTurnStart(state);
          resetSelection();
          setMessage(state.winner ? "勝負が決まりました" : "あなたのターンです。CPUの行動は「直近の出来事」から確認できます");
          render();
          return;
        }
        const previousEventId = state.events?.at(-1)?.id ?? 0;
        state = cpuSteps[stepIndex++];
        resetSelection();
        setMessage("CPUの行動を解決中です。中央表示と盤面を確認してください");
        render();
        const addedEvents = (state.events ?? []).filter((event) => event.id > previousEventId).length;
        window.setTimeout(showNextStep, Math.min(1800, Math.max(950, addedEvents * 620)));
      };
      showNextStep();
    }, 900);
  } catch (error) { setMessage(error.message, true); }
});
elements["debug-toggle"].addEventListener("click", () => { debugVisible = !debugVisible; render(); });
elements["help-open"].addEventListener("click", () => elements["help-dialog"].showModal());
elements["help-close"].addEventListener("click", () => { localStorage.setItem("hyakki-fuda-gassen-help-seen", "yes"); elements["help-dialog"].close(); });
elements["help-start"].addEventListener("click", () => { hintsEnabled = true; saveHintsEnabled(true); localStorage.setItem("hyakki-fuda-gassen-help-seen", "yes"); elements["help-dialog"].close(); render(); });
elements["hints-toggle"].addEventListener("click", () => { hintsEnabled = !hintsEnabled; saveHintsEnabled(hintsEnabled); renderGuidance(); });
elements["new-game"].addEventListener("click", startNewGame);
elements["restart-game"].addEventListener("click", () => { elements["result-dialog"].close(); startNewGame(); });
elements["resume-game"].addEventListener("click", () => {
  resetEventPresentation();
  state = loadTurnStart();
  lastPresentedEventId = state?.events?.at(-1)?.id ?? 0;
  resetSelection();
  elements["start-dialog"].close();
  setMessage("保存されたターン開始時点から再開しました");
  render();
});
window.addEventListener("resize", positionSlots);

createSlots();
const saved = loadTurnStart();
elements["resume-game"].hidden = !saved;
if (query.get("autostart") === "1") startNewGame();
else elements["start-dialog"].showModal();
