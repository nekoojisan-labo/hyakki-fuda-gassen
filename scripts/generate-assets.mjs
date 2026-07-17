import { mkdir, readFile, writeFile } from "node:fs/promises";

const cards = JSON.parse(await readFile(new URL("../src/data/cards.json", import.meta.url)));
const assetRoot = new URL("../assets/", import.meta.url);
await Promise.all(["cards", "backgrounds", "ui", "effects"].map((directory) => mkdir(new URL(`${directory}/`, assetRoot), { recursive: true })));

const motifs = {
  "kodama":"M52 76c-14-4-21-15-20-30 1-17 11-29 28-35-2 12 3 20 13 25 12 7 13 23 6 36-7 15-31 17-46 4Z",
  "pipe-fox":"M27 72c12-18 21-34 42-39 10-2 18 0 25 7-10 2-16 8-19 17 10-4 18-2 23 4-5 4-8 9-9 15-2 13-13 21-32 20-14-1-24-6-37-15Z",
  "chochin":"M42 22h36l8 13-6 49-20 12-20-12-6-49 8-13Zm4 18h28l-2 32H48l-2-32Z",
  "nekomata":"M31 76c-6-23 1-39 20-48l-7-17 18 11 17-11-3 22c16 12 20 28 11 46-13 14-43 15-56-3Zm50-39c19 4 25 15 20 32-4 12 1 19 12 22-19 3-29-7-26-23 3-15 0-24-6-31Z",
  "kamaitachi":"M16 69c15-5 28-15 37-29L45 20l22 13 20-20-1 27 24 8-24 9 7 25-23-15-17 23-5-24-32 3Z",
  "kappa":"M31 38c5-21 17-30 36-28 17 2 27 14 28 31l-8 9 7 35-26 12-31-10 5-36-11-13Zm21-16h26l-4 9H55l-3-9Z",
  "jorogumo":"M60 20 47 39l-22-8 17 19-22 9 24 1-15 22 24-13 7 28 7-28 24 13-15-22 24-1-22-9 17-19-22 8-13-19Z",
  "nurikabe":"M25 18h70v76H25V18Zm12 13v50h46V31H37Zm7 10h11v11H44V41Zm22 0h11v11H66V41Z",
  "karasu-tengu":"M23 83 48 39 38 18l24 13 24-13-8 25 22 40-31-13-9 27-9-27-28 13Z",
  "great-tengu":"M17 88 42 48 30 25l25 8 8-25 10 25 25-8-14 24 20 39-34-13-9 25-8-25-36 13Z",
  "white-serpent":"M29 82c12 9 27 8 36 1 10-8 8-20-5-24-11-4-17-13-14-24 4-13 19-21 37-17 16 3 26 13 28 27-13-9-26-10-36-3-8 6-8 13 1 17 26 11 31 35 13 51-19 18-55 20-75 2Z",
  "shuten-doji":"M24 84 37 44 25 20l25 13 10-25 11 25 25-13-12 25 13 39-28-12-9 27-9-27-27 12Zm27-34 9 7 10-7-3 16H54l-3-16Z"
};

function artSvg(card) {
  const isMonster = card.type === "monster";
  const accent = card.type === "monster" ? "#c55a3e" : card.type === "spell" ? "#4e9d83" : "#8560a8";
  const path = motifs[card.id] ?? "M60 13 72 42l31 2-24 20 8 31-27-17-27 17 8-31-24-20 31-2 12-29Z";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><radialGradient id="g"><stop stop-color="${accent}" stop-opacity=".8"/><stop offset="1" stop-color="#090b0f"/></radialGradient><filter id="n"><feTurbulence baseFrequency=".8" numOctaves="3" seed="${card.stars ?? card.name.length}" result="noise"/><feBlend in="SourceGraphic" in2="noise" mode="soft-light"/></filter></defs><rect width="120" height="120" rx="8" fill="url(#g)"/><circle cx="60" cy="58" r="47" fill="none" stroke="#d8b76c" stroke-opacity=".24"/><path d="${path}" fill="${isMonster ? "#19191b" : "#e9ddbd"}" stroke="#d8b76c" stroke-width="2" filter="url(#n)"/><text x="60" y="111" text-anchor="middle" fill="#efe5cb" font-size="11" font-family="serif">${card.name}</text></svg>`;
}

await Promise.all(cards.map((card) => writeFile(new URL(`cards/${card.id}.svg`, assetRoot), artSvg(card))));

await writeFile(new URL("backgrounds/shrine-battlefield.svg", assetRoot), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#08101a"/><stop offset=".5" stop-color="#111823"/><stop offset="1" stop-color="#090b0e"/></linearGradient><radialGradient id="moon"><stop stop-color="#d8d3bc" stop-opacity=".28"/><stop offset="1" stop-color="#768097" stop-opacity="0"/></radialGradient><filter id="grain"><feTurbulence baseFrequency=".75" numOctaves="4" seed="8"/><feBlend in="SourceGraphic" mode="soft-light"/></filter></defs><rect width="1600" height="900" fill="url(#sky)"/><circle cx="800" cy="210" r="260" fill="url(#moon)"/><path d="M0 260 210 150l210 110v55H0Zm1180 0 210-110 210 110v55h-420Z" fill="#08090b"/><path d="M0 342h1600v558H0z" fill="#111414"/><path d="M0 420 800 300l800 120v480H0Z" fill="#17191a"/><g stroke="#343638" stroke-width="3" opacity=".55"><path d="M0 520h1600M0 650h1600M0 790h1600"/><path d="m210 420-80 480m330-480-45 480m330-480-12 480m310-480 25 480m300-480 68 480"/></g><g fill="#6f221d" opacity=".65"><path d="m95 590 24-9-8 22 17 16-24-2-13 20-5-24-23-7 21-12Z"/><path d="m1450 510 20-14-3 24 21 12-24 5-6 24-12-21-24 3 17-18Z"/><path d="m1220 740 18-18 4 25 24 7-22 12 1 25-18-17-24 9 11-23-15-20Z"/></g><rect width="1600" height="900" fill="#101112" opacity=".18" filter="url(#grain)"/></svg>`);
await writeFile(new URL("ui/card-back.svg", assetRoot), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect x="4" y="4" width="192" height="272" rx="12" fill="#100d10" stroke="#bd9854" stroke-width="8"/><rect x="18" y="18" width="164" height="244" rx="8" fill="#351417" stroke="#6e4e2d" stroke-width="3"/><path d="M100 43 128 89l49 11-37 34 4 50-44-22-44 22 4-50-37-34 49-11Z" fill="none" stroke="#b8914e" stroke-width="5"/><circle cx="100" cy="140" r="58" fill="none" stroke="#b8914e" stroke-width="3"/></svg>`);
await writeFile(new URL("ui/card-frame.svg", assetRoot), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect x="3" y="3" width="194" height="274" rx="12" fill="none" stroke="#d0ac61" stroke-width="6"/><path d="M14 45V15h30M156 15h30v30M14 235v30h30M156 265h30v-30" fill="none" stroke="#8f3028" stroke-width="5"/></svg>`);
await writeFile(new URL("effects/slash.svg", assetRoot), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><filter id="g"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M35 250C90 175 165 100 270 38M62 272C118 199 189 126 282 67" fill="none" stroke="#f3d78e" stroke-width="10" stroke-linecap="round" filter="url(#g)"/></svg>`);
await writeFile(new URL("effects/burst.svg", assetRoot), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><g fill="none" stroke="#d24d36" filter="url(#none)"><circle cx="150" cy="150" r="58" stroke-width="18"/><path d="M150 12v62M150 226v62M12 150h62M226 150h62M53 53l45 45M202 202l45 45M247 53l-45 45M98 202l-45 45" stroke="#f1c36f" stroke-width="12" stroke-linecap="round"/></g></svg>`);

console.log(`generated ${cards.length + 5} separated SVG assets`);
