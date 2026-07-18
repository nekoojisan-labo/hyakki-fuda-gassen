import { mkdir, writeFile } from "node:fs/promises";

const assetRoot = new URL("../assets/", import.meta.url);
await mkdir(new URL("ui/", assetRoot), { recursive: true });

await writeFile(new URL("ui/card-back.svg", assetRoot), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect x="4" y="4" width="192" height="272" rx="12" fill="#100d10" stroke="#bd9854" stroke-width="8"/><rect x="18" y="18" width="164" height="244" rx="8" fill="#351417" stroke="#6e4e2d" stroke-width="3"/><path d="M100 43 128 89l49 11-37 34 4 50-44-22-44 22 4-50-37-34 49-11Z" fill="none" stroke="#b8914e" stroke-width="5"/><circle cx="100" cy="140" r="58" fill="none" stroke="#b8914e" stroke-width="3"/></svg>`);
await writeFile(new URL("ui/card-frame.svg", assetRoot), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect x="3" y="3" width="194" height="274" rx="12" fill="none" stroke="#d0ac61" stroke-width="6"/><path d="M14 45V15h30M156 15h30v30M14 235v30h30M156 265h30v-30" fill="none" stroke="#8f3028" stroke-width="5"/></svg>`);

console.log("generated 2 shared card UI SVG assets; backgrounds, effects, and card art are maintained separately");
