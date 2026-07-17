import { activateSpell, attack, createGame, endTurn, enterBattlePhase, getCardAttack, getTributeCount, setBackrow, summonMonster } from "../core/game.js";
import { runCpuTurn } from "../core/cpu.js";
import { clearSave, loadTurnStart, saveTurnStart } from "../core/storage.js";
import { applyLayout } from "./layout.js";
import { getNextGuidance, loadHintsEnabled, saveHintsEnabled } from "./guidance.js";

const [cards, decks, layoutData] = await Promise.all([
  fetch("src/data/cards.json").then((response) => response.json()),
  fetch("src/data/decks.json").then((response) => response.json()),
  fetch("src/data/layout.json").then((response) => response.json())
]);

const elements = Object.fromEntries(["battlefield","slot-layer","effect-layer","hand","message","next-hint","log","cpu-life","player-life","cpu-deck","player-deck","cpu-grave","player-grave","battle-phase","direct-attack","end-turn","attack-position","set-position","activate","debug-toggle","start-dialog","resume-game","new-game","result-dialog","result-title","result-reason","restart-game","help-dialog","help-open","help-close","help-start","hints-toggle"].map((id) => [id, document.getElementById(id)]));
const cardMap = Object.fromEntries(cards.map((card) => [card.id, card]));
const slotElements = new Map();
let state = null;
let selection = { handIndex: null, attackerSlot: null, targetSlot: null, tributeSlots: [], summonPosition: "attack" };
const query = new URLSearchParams(location.search);
let debugVisible = query.get("debug") === "1";
let hintsEnabled = loadHintsEnabled();

function resetSelection() {
  selection = { handIndex: null, attackerSlot: null, targetSlot: null, tributeSlots: [], summonPosition: "attack" };
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
  const stats = card.type === "monster" ? `<span class="stars">${"★".repeat(card.stars)}</span><span class="stats">${item.position === "defense" ? "DEF" : "ATK"} ${item.position === "defense" ? card.defense : getCardAttack(state, actor, item)}</span>` : `<span class="kind">${card.type === "spell" ? "術" : "罠"}</span>`;
  return `<span class="card-face"><img class="card-art" src="${card.art}" alt="${card.name}"><img class="card-frame" src="assets/ui/card-frame.svg" alt=""><strong>${card.name}</strong>${stats}</span>`;
}

function renderBoard() {
  for (const actor of ["cpu", "player"]) {
    const player = state.players[actor];
    for (let index = 0; index < 3; index += 1) {
      const monsterSlot = slotElements.get(slotId(actor, "monster", index));
      const monster = player.monsters[index];
      monsterSlot.classList.toggle("occupied", Boolean(monster));
      monsterSlot.classList.toggle("selected", actor === "player" && (selection.attackerSlot === index || selection.tributeSlots.includes(index)));
      monsterSlot.classList.toggle("defense", monster?.position === "defense" || monster?.position === "set");
      monsterSlot.innerHTML = `${cardMarkup(monster, actor)}<span class="slot-debug">${monsterSlot.dataset.slot}<i></i></span>`;
      const backSlot = slotElements.get(slotId(actor, "spell-trap", index));
      const backrow = player.backrow[index];
      backSlot.classList.toggle("occupied", Boolean(backrow));
      backSlot.innerHTML = `${cardMarkup(backrow, actor, Boolean(backrow))}<span class="slot-debug">${backSlot.dataset.slot}<i></i></span>`;
    }
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
      selection.handIndex = selection.handIndex === index ? null : index;
      selection.tributeSlots = [];
      selection.targetSlot = null;
      const card = cardMap[item.cardId];
      setMessage(`${card.name} — ${card.text}`);
      render();
    });
    elements.hand.append(button);
  });
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

function selectedHandCard() {
  const item = state.players.player.hand[selection.handIndex];
  return item ? cardMap[item.cardId] : null;
}

function handleSlotClick(actor, zoneType, index) {
  if (!state || state.winner || state.turn.actor !== "player") return;
  try {
    const selectedCard = selectedHandCard();
    if (zoneType === "monster" && actor === "player") {
      const occupant = state.players.player.monsters[index];
      if (selectedCard?.type === "monster" && occupant) {
        const required = getTributeCount(selectedCard);
        if (required > 0) {
          selection.tributeSlots = selection.tributeSlots.includes(index) ? selection.tributeSlots.filter((slot) => slot !== index) : [...selection.tributeSlots, index].slice(-required);
          setMessage(`素材 ${selection.tributeSlots.length}/${required}体を選択中`);
        } else if (state.turn.phase === "battle") selection.attackerSlot = index;
      } else if (selectedCard?.type === "monster" && !occupant) {
        state = summonMonster(state, { actor: "player", handIndex: selection.handIndex, zoneIndex: index, position: selection.summonPosition, tributeSlots: selection.tributeSlots });
        resetSelection();
      } else if (state.turn.phase === "battle" && occupant) {
        selection.attackerSlot = index;
        setMessage(`${cardMap[occupant.cardId].name}の攻撃対象を選んでください`);
      }
    } else if (zoneType === "monster" && actor === "cpu" && state.turn.phase === "battle" && selection.attackerSlot !== null) {
      state = attack(state, { actor: "player", attackerSlot: selection.attackerSlot, targetSlot: index });
      showEffect(slotId("cpu", "monster", index), "slash");
      selection.attackerSlot = null;
    } else if (zoneType === "spell-trap" && actor === "player" && selectedCard && !state.players.player.backrow[index]) {
      state = setBackrow(state, { actor: "player", handIndex: selection.handIndex, zoneIndex: index });
      resetSelection();
    } else if (actor === "cpu") {
      selection.targetSlot = index;
      setMessage("対象を選びました。「効果発動」を押してください");
    }
  } catch (error) {
    setMessage(error.message, true);
  }
  render();
}

function setMessage(message, isError = false) {
  elements.message.textContent = message;
  elements.message.classList.toggle("error", isError);
}

function showEffect(id, effectName) {
  const target = slotElements.get(id);
  if (!target) return;
  const bounds = target.getBoundingClientRect();
  const boardBounds = elements.battlefield.getBoundingClientRect();
  const effect = document.createElement("img");
  effect.className = "battle-effect";
  effect.src = `assets/effects/${effectName}.svg`;
  effect.style.left = `${bounds.left - boardBounds.left + bounds.width / 2}px`;
  effect.style.top = `${bounds.top - boardBounds.top + bounds.height / 2}px`;
  elements["effect-layer"].append(effect);
  effect.addEventListener("animationend", () => effect.remove());
}

function render() {
  if (!state) return;
  renderBoard();
  renderHand();
  for (const actor of ["cpu", "player"]) {
    elements[`${actor}-life`].textContent = String(state.players[actor].life);
    elements[`${actor}-deck`].textContent = String(state.players[actor].deck.length);
    elements[`${actor}-grave`].textContent = String(state.players[actor].graveyard.length);
  }
  document.getElementById("phase-main").classList.toggle("active", state.turn.phase === "main");
  document.getElementById("phase-battle").classList.toggle("active", state.turn.phase === "battle");
  elements.log.innerHTML = state.log.map((message) => `<li>${message}</li>`).join("");
  const playerTurn = state.turn.actor === "player" && !state.winner;
  elements["battle-phase"].disabled = !playerTurn || state.turn.phase !== "main";
  elements["direct-attack"].disabled = !playerTurn || state.turn.phase !== "battle" || selection.attackerSlot === null || state.players.cpu.monsters.some(Boolean);
  elements.activate.disabled = !playerTurn || selectedHandCard()?.type !== "spell";
  elements.activate.title = elements.activate.disabled ? "手札の魔法カードを選ぶと使えます" : "選択中の魔法を使います";
  elements["direct-attack"].title = elements["direct-attack"].disabled ? "バトル中に攻撃モンスターを選び、相手の場が空の時に使えます" : "相手へ直接攻撃します";
  document.body.classList.toggle("debug-layout", debugVisible);
  elements["debug-toggle"].setAttribute("aria-pressed", String(debugVisible));
  positionSlots();
  renderGuidance();
  if (state.winner && !elements["result-dialog"].open) {
    clearSave();
    elements["result-title"].textContent = state.winner === "player" ? "勝利" : "敗北";
    elements["result-reason"].textContent = state.reason;
    elements["result-dialog"].showModal();
  }
}

function startNewGame() {
  state = createGame({ cards, decks });
  resetSelection();
  saveTurnStart(state);
  elements["start-dialog"].close();
  render();
  if (!query.has("autostart") && localStorage.getItem("hyakki-fuda-gassen-help-seen") !== "yes") elements["help-dialog"].showModal();
}

elements["attack-position"].addEventListener("click", () => { selection.summonPosition = "attack"; setMessage("攻撃表示：空いているモンスター枠をタップ"); });
elements["set-position"].addEventListener("click", () => { selection.summonPosition = "set"; setMessage("裏側守備：空いているモンスター枠をタップ"); });
elements["battle-phase"].addEventListener("click", () => { try { state = enterBattlePhase(state, "player"); resetSelection(); render(); } catch (error) { setMessage(error.message, true); } });
elements["direct-attack"].addEventListener("click", () => { try { state = attack(state, { actor: "player", attackerSlot: selection.attackerSlot }); showEffect(slotId("cpu", "monster", 1), "burst"); selection.attackerSlot = null; render(); } catch (error) { setMessage(error.message, true); } });
elements.activate.addEventListener("click", () => {
  try {
    const card = selectedHandCard();
    const targetActor = ["boost-monster","revive-monster"].includes(card.effect) ? "player" : "cpu";
    state = activateSpell(state, { actor: "player", handIndex: selection.handIndex, targetActor, targetSlot: selection.targetSlot ?? 0 });
    resetSelection(); render();
  } catch (error) { setMessage(error.message, true); }
});
elements["end-turn"].addEventListener("click", () => {
  try {
    state = endTurn(state, "player");
    saveTurnStart(state);
    render();
    setMessage("CPUが考えています…");
    window.setTimeout(() => { state = runCpuTurn(state); if (!state.winner) saveTurnStart(state); resetSelection(); setMessage("あなたのターンです"); render(); }, 650);
  } catch (error) { setMessage(error.message, true); }
});
elements["debug-toggle"].addEventListener("click", () => { debugVisible = !debugVisible; render(); });
elements["help-open"].addEventListener("click", () => elements["help-dialog"].showModal());
elements["help-close"].addEventListener("click", () => { localStorage.setItem("hyakki-fuda-gassen-help-seen", "yes"); elements["help-dialog"].close(); });
elements["help-start"].addEventListener("click", () => { hintsEnabled = true; saveHintsEnabled(true); localStorage.setItem("hyakki-fuda-gassen-help-seen", "yes"); elements["help-dialog"].close(); render(); });
elements["hints-toggle"].addEventListener("click", () => { hintsEnabled = !hintsEnabled; saveHintsEnabled(hintsEnabled); renderGuidance(); });
elements["new-game"].addEventListener("click", startNewGame);
elements["restart-game"].addEventListener("click", () => { elements["result-dialog"].close(); startNewGame(); });
elements["resume-game"].addEventListener("click", () => { state = loadTurnStart(); elements["start-dialog"].close(); render(); });
window.addEventListener("resize", positionSlots);

createSlots();
const saved = loadTurnStart();
elements["resume-game"].hidden = !saved;
if (query.get("autostart") === "1") startNewGame();
else elements["start-dialog"].showModal();
