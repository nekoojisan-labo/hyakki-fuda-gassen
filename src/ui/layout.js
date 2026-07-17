export function getLayoutMode(layoutData, width, height) {
  return width / height >= layoutData.desktop.aspectMin ? "desktop" : "mobile";
}

export function applyLayout(slotElements, layoutData, width, height) {
  const mode = getLayoutMode(layoutData, width, height);
  const layout = layoutData[mode];
  for (const [slotId, element] of slotElements) {
    const slot = layout.slots[slotId];
    if (!slot) continue;
    element.style.setProperty("--slot-x", `${slot.x}%`);
    element.style.setProperty("--slot-y", `${slot.y}%`);
    element.style.setProperty("--slot-w", `${layout.card.w}%`);
    element.style.setProperty("--slot-h", `${layout.card.h}%`);
  }
  return mode;
}

export function validateLayout(layoutData) {
  const errors = [];
  const expected = ["cpu", "player"].flatMap((actor) => ["monster", "spell-trap"].flatMap((zone) => [1, 2, 3].map((index) => `${actor}-${zone}-${index}`)));
  for (const mode of ["desktop", "mobile"]) {
    for (const slotId of expected) {
      const slot = layoutData[mode]?.slots?.[slotId];
      if (!slot) errors.push(`${mode}: ${slotId} がありません`);
      else if (slot.x < 0 || slot.x > 100 || slot.y < 0 || slot.y > 100) errors.push(`${mode}: ${slotId} が画面外です`);
    }
  }
  return errors;
}
