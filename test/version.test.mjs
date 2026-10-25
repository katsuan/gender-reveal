// 読みこみの印（?v=…）を変え忘れていないか（q-tuzuq と同じ考え方）
//   app.js・create.js・js/*.js を変えたのに印が前のコミットと同じだと、ブラウザが古い部品と新しい部品をまぜて読み、画面が出なくなる
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const sh = (cmd) => execSync(cmd, { cwd: new URL("..", import.meta.url), encoding: "utf8" }).trim();
// このリポジトリのファイルの印だけを見る（Q キットなど https:// で読む外のファイルの印は別）
const versions = (text) => [...new Set([...text.replace(/https?:\/\/[^"'\s]*/g, "").matchAll(/\?v=(\d{8,})/g)].map((m) => m[1]))];
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("読みこみの印は、どのファイルでも同じ値", () => {
  const all = new Set(["index.html", "create.html"].flatMap((f) => versions(read(f))));
  assert.equal(all.size, 1, `印がそろっていない：${[...all].join(", ")}`);
});

test("部品を変えたら、読みこみの印も変える", () => {
  let changed = "";
  try {
    changed = sh("git diff --name-only HEAD -- app.js create.js js");
  } catch {
    return; // git がないところでは見ない
  }
  if (!changed) return;
  const now = versions(read("index.html"))[0];
  const before = versions(sh("git show HEAD:index.html"))[0];
  assert.notEqual(now, before, `変えたファイル（${changed.replace(/\n/g, "・")}）があるのに、印が前と同じ（?v=${now}）。index.html・create.html の ?v= をそろえて新しくする`);
});
