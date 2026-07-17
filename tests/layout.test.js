import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getLayoutMode, validateLayout } from "../src/ui/layout.js";

const layout = JSON.parse(await readFile(new URL("../src/data/layout.json", import.meta.url)));

test("desktop and mobile choose separate coordinate tables", () => {
  assert.equal(getLayoutMode(layout, 1440, 900), "desktop");
  assert.equal(getLayoutMode(layout, 390, 844), "mobile");
});

test("all required named slots exist and stay in logical bounds", () => {
  assert.deepEqual(validateLayout(layout), []);
});
