import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const cards = JSON.parse(await readFile(new URL("src/data/cards.json", root)));
const decks = JSON.parse(await readFile(new URL("src/data/decks.json", root)));
const ids = new Set(cards.map((card) => card.id));
const errors = [];
if (cards.length !== 20) errors.push(`カード種類が20ではありません: ${cards.length}`);
if (ids.size !== cards.length) errors.push("カードIDが重複しています");
const counts = cards.reduce((result, card) => ({ ...result, [card.type]: (result[card.type] ?? 0) + 1 }), {});
if (counts.monster !== 12 || counts.spell !== 5 || counts.trap !== 3) errors.push(`内訳が不正です: ${JSON.stringify(counts)}`);
for (const [owner, deck] of Object.entries(decks)) {
  if (deck.length !== 20) errors.push(`${owner}デッキが20枚ではありません`);
  for (const cardId of deck) if (!ids.has(cardId)) errors.push(`${owner}デッキの未定義ID: ${cardId}`);
}
for (const card of cards) {
  try { await access(new URL(card.art, root)); } catch { errors.push(`${card.id}の画像がありません: ${card.art}`); }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else console.log("data/assets: ok (20 types, 12/5/3, two 20-card decks)");
