import { readFile } from "node:fs/promises";
import { validateLayout } from "../src/ui/layout.js";

const layout = JSON.parse(await readFile(new URL("../src/data/layout.json", import.meta.url)));
const errors = validateLayout(layout);
for (const mode of ["desktop", "mobile"]) {
  const slots = Object.entries(layout[mode].slots).filter(([id]) => id.includes("monster") || id.includes("spell-trap"));
  for (let leftIndex = 0; leftIndex < slots.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < slots.length; rightIndex += 1) {
      const [leftId, left] = slots[leftIndex];
      const [rightId, right] = slots[rightIndex];
      const overlapsX = Math.abs(left.x - right.x) < layout[mode].card.w;
      const overlapsY = Math.abs(left.y - right.y) < layout[mode].card.h;
      if (overlapsX && overlapsY) errors.push(`${mode}: ${leftId} と ${rightId} が重なりすぎています`);
    }
  }
}
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
else console.log("layout: ok (desktop/mobile slots in bounds, no collisions)");
