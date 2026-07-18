const HINTS_KEY = "hyakki-fuda-gassen-hints-v1";

function tributeCount(card) {
  if (!card || card.type !== "monster" || card.stars <= 4) return 0;
  return card.stars <= 6 ? 1 : 2;
}

export function getNextGuidance(state, selection) {
  if (!state || state.winner) return { text: "勝負が決まりました。結果を確認してください。", targets: [] };
  if (state.turn.actor !== "player") return { text: "CPUの行動中です。少し待ってください。", targets: [] };
  const player = state.players.player;
  const selectedItem = player.hand[selection.handIndex];
  const selectedCard = selectedItem && state.cards[selectedItem.cardId];

  if (state.turn.phase === "main") {
    if (selectedCard?.type === "monster") {
      const needed = tributeCount(selectedCard);
      if (selection.tributeSlots.length < needed) {
        return { text: `${selectedCard.name}には素材が${needed}体必要です。自分の場のモンスターを選んでください。`, targets: ["player-monsters"] };
      }
      return { text: `${selectedCard.name}を出す場所として、金色に光るモンスター枠を押してください。`, targets: ["open-player-monsters", ...selection.tributeSlots.map((index) => `player-monster-${index}`)] };
    }
    if (selectedCard?.type === "spell") {
      const targetMap = {
        "destroy-monster": "cpu-monsters",
        "boost-monster": "player-monsters",
        "destroy-backrow": "cpu-backrow"
      };
      const target = targetMap[selectedCard.effect];
      if (target && selection.targetSlot === null) return { text: `${selectedCard.name}の対象として、光っている盤面カードを選んでください。`, targets: [target] };
      return { text: `${selectedCard.name}の条件と結果を確認し、「効果発動」で確定してください。`, targets: ["activate"] };
    }
    if (selectedCard?.type === "trap") return { text: `${selectedCard.name}を伏せるため、金色に光る魔法・罠枠を押してください。`, targets: ["open-player-backrow"] };

    if (!player.normalSummoned) {
      const playable = player.hand
        .map((item, index) => ({ card: state.cards[item.cardId], index }))
        .filter(({ card }) => card.type === "monster" && tributeCount(card) <= player.monsters.filter(Boolean).length)
        .map(({ index }) => index);
      if (playable.length) return { text: "まず手札の光っているモンスターを1枚選びます。星4以下なら素材なしで出せます。", targets: playable.map((index) => `hand-${index}`) };
    }
    return { text: "召喚や魔法の準備が終わったら「バトルへ」を押します。", targets: ["battle-phase"] };
  }

  const attackers = player.monsters
    .map((monster, index) => ({ monster, index }))
    .filter(({ monster }) => monster && monster.position === "attack" && !monster.faceDown && !monster.attacked)
    .map(({ index }) => index);
  if (selection.attackerSlot === null) {
    if (attackers.length) return { text: "攻撃できる自分のモンスターを選んでください。", targets: attackers.map((index) => `player-monster-${index}`) };
    return { text: "攻撃できるモンスターがいません。「ターン終了」を押してください。", targets: ["end-turn"] };
  }
  if (state.players.cpu.monsters.some(Boolean)) {
    if (selection.targetSlot === null) return { text: "攻撃する相手モンスターを選んでください。まだ攻撃は実行されません。", targets: ["cpu-monsters"] };
    return { text: "戦闘予測を確認し、「攻撃実行」で確定してください。", targets: ["attack-confirm"] };
  }
  return { text: "相手の場が空です。「直接攻撃」を押してください。", targets: ["direct-attack"] };
}

export function loadHintsEnabled(storage = localStorage) {
  return storage.getItem(HINTS_KEY) !== "off";
}

export function saveHintsEnabled(enabled, storage = localStorage) {
  storage.setItem(HINTS_KEY, enabled ? "on" : "off");
}
