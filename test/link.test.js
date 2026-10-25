// ジェンダーリビール：URL の中身（#…・?p=・?d=・平文）を読むテスト（画面に触らない部分。js/link.js）
//   node --test test/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const XSS = "<img src=x onerror=alert(1)>"; // qcheck-ok: W8 外からの文字の見本
const ROOT = path.join(__dirname, "..");
const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, atob, btoa, crypto: globalThis.crypto, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/link.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/calendar.js"), "utf8"), ctx);
// 作る画面（create.js）の v3 の作り方をそのまま使う
const create = fs.readFileSync(path.join(ROOT, "create.js"), "utf8");
const pick = (from, to) => create.slice(create.indexOf(from), create.indexOf(to));
vm.runInContext(pick("function bytesToB64url", "/* ============ 短縮URL(v2)") + pick("const V3_EPOCH", "/* ============ LINE共有") + ";globalThis.buildTokenV3 = buildTokenV3;", ctx);
const R = ctx.window.RevealParams;
const plainObj = (o) => JSON.parse(JSON.stringify(o));
const b64 = (s) => Buffer.from(s, "utf8").toString("base64url");

// 合言葉なしの v3 を開く（index.html の decryptSecret と同じ）
async function openV3(P) {
  const { key, ct } = P.secret;
  const base = await crypto.subtle.importKey("raw", key, "HKDF", false, ["deriveKey"]);
  const aes = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("gender-reveal v3") }, base, { name: "AES-GCM", length: 128 }, false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(12), tagLength: 96 }, aes, ct));
  return R.applySecret(P, R.readV3Secret(plain), 3);
}

test("作る画面で作った v3 のリンクを開くと、同じ中身に戻る", async () => {
  const token = await ctx.buildTokenV3({ due: "2027-02-14", reveal: "2026-12-24T19:00", dad: "太郎", mom: "花子", title: "発表", taps: "7" }, { gender: "custom", name: "ひな", msg: "よろしくね", label: "ふたご", emoji: "👶", color: "#f5c542" }, "");
  const P = R.readParams("#" + token);
  assert.deepEqual({ due: P.due, reveal: P.reveal, dad: P.dad, mom: P.mom, title: P.title, taps: P.taps }, { due: "2027-02-14", reveal: "2026-12-24T19:00", dad: "太郎", mom: "花子", title: "発表", taps: "7" });
  assert.ok(P.secret && P.secret.key);
  await openV3(P);
  assert.equal(P.gender, "custom");
  assert.equal(P.label, "ふたご");
  assert.equal(P.color, "#f5c542");
  assert.equal(P.secret, undefined);
});

test("名前の HTML は文字のまま残る（画面は textContent で出す）。長さは決まった長さまで", async () => {
  const token = await ctx.buildTokenV3({ dad: XSS, title: "あ".repeat(500) }, { gender: "girl", msg: "x".repeat(2000) }, "");
  const P = R.readParams("#" + token);
  assert.equal(P.dad, XSS.slice(0, 20));
  assert.equal(P.title.length, 40);
  await openV3(P);
  assert.equal(P.gender, "girl");
  assert.equal(P.msg.length, 300);
});

test("平文のリンク：決まった項目だけ受けとる。色は色の形だけ", () => {
  const P = R.readParams("?" + new URLSearchParams({ gender: "女の子", due: "2027-02-14", name: XSS, boyColor: "red;background:url(https://example.com/x)", girlColor: "#ff6fa8", color: "url(x)", secret: "x", foo: "bar", taps: "9999" }));
  assert.equal(P.gender, "girl");
  assert.equal(P.name, XSS);
  assert.equal(P.boyColor, undefined);
  assert.equal(P.girlColor, "#ff6fa8");
  assert.equal(P.color, undefined);
  assert.equal(P.secret, undefined);
  assert.equal(P.foo, undefined);
  assert.equal(P.taps, undefined);
});

test("日付の形がちがうものは受けとらない", () => {
  const P = R.readParams("?gender=boy&due=" + encodeURIComponent(XSS) + "&reveal=tomorrow");
  assert.equal(P.due, undefined);
  assert.equal(P.reveal, undefined);
  assert.equal(R.readParams("?g=girl").gender, "girl");
});

test("壊れた中身（base64 でない・短すぎる・長すぎる・JSON でない）でも落ちない", () => {
  const bad = ["#", "#%%%", "#!!!", "#MA", "#" + "A".repeat(9000), "?p=%%%", "?p=AgAA", "?d=" + b64("{bad"), "?d=" + b64("[1,2]"), "?s=v1.%%%.%%%", "?s=v1", "?d=" + b64(JSON.stringify({ dad: { a: 1 }, __proto__: { x: 1 } }))];
  for (const s of bad) {
    let P;
    assert.doesNotThrow(() => (P = R.readParams(s)), s.slice(0, 12));
    assert.equal(typeof P, "object");
    assert.ok(!P.dad || typeof P.dad === "string");
  }
});

test("v3 の文字の長さがうそ（中身より長い）でも落ちない", () => {
  // [0x30][マスク=8 パパ][長さ 200][文字は3バイトだけ]＋鍵 12 バイト
  const bytes = Buffer.from([0x30, 8, 200, 1, 0x61, 0x62, 0x63, ...new Array(12).fill(1)]);
  assert.doesNotThrow(() => R.readParams("#" + bytes.toString("base64url")));
  assert.equal(R.readParams("#" + bytes.toString("base64url")).dad, undefined);
});

test("v1（?d=&s=）の古いリンクも、決まった項目だけ受けとる", () => {
  const P = R.readParams("?d=" + b64(JSON.stringify({ due: "2027-01-01", mom: "花子", boyColor: "expression(alert(1))", extra: 1 }))); // qcheck-ok: W8 外からの文字の見本
  assert.deepEqual(plainObj(P), { mom: "花子", due: "2027-01-01", gender: null });
});

test("ない日（2月30日など）の予定日・発表日は読まない（次の月の日にずらさない）", () => {
  const P = R.readParams("?gender=girl&due=2027-02-30&reveal=2026-11-31T19:00");
  assert.equal(P.due, undefined);
  assert.equal(P.reveal, undefined);
  const ok = R.readParams("?gender=girl&due=2028-02-29&reveal=2026-12-24T19:00");
  assert.equal(ok.due, "2028-02-29");
  assert.equal(ok.reveal, "2026-12-24T19:00");
  assert.equal(R.readParams("?gender=girl&due=2027-02-29").due, undefined, "うるう年でない年の2月29日");
});

test("カレンダー：日曜はじまり（いままで）と月曜はじまりで、1日の位置と曜日の並びが変わる", () => {
  const Cal = ctx.window.RevealCalendar;
  // 2026年10月1日は木曜
  const sun = Cal.monthCells(2026, 9, 0);
  const mon = Cal.monthCells(2026, 9, 1);
  assert.equal(sun.findIndex((c) => !c.muted && c.day === 1), 4);
  assert.equal(mon.findIndex((c) => !c.muted && c.day === 1), 3);
  assert.equal(sun.length % 7, 0);
  assert.equal(mon.filter((c) => !c.muted).length, 31);
  assert.deepEqual(plainObj(Cal.weekdays(0)), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(plainObj(Cal.weekdays(1)), [1, 2, 3, 4, 5, 6, 0]);
  // 2027年2月1日は月曜：月曜はじまりなら、ちょうど4行
  const feb = Cal.monthCells(2027, 1, 1);
  assert.equal(feb.length, 28);
  assert.equal(feb[0].day, 1);
  assert.equal(feb[0].muted, false);
  // 前の月の終わり（2026年3月の前は2月、28日まで）
  const mar = Cal.monthCells(2026, 2, 1);
  assert.equal(mar.filter((c) => c.muted)[0].day, 23);
});

test("すくすくへのリンク：予定日がまだ先のときだけ、予定日と名前を渡す", () => {
  const P = R.readParams("?gender=girl&due=2027-02-14&name=" + encodeURIComponent("ひな"));
  assert.equal(R.suqsuqUrl(P, 30), "https://katsuan.github.io/suqsuq/?due=2027-02-14&name=" + encodeURIComponent("ひな"));
  assert.equal(R.suqsuqUrl(R.readParams("?gender=boy&due=2027-02-14"), 30), "https://katsuan.github.io/suqsuq/?due=2027-02-14");
  assert.equal(R.suqsuqUrl(P, 0), null);
  assert.equal(R.suqsuqUrl(P, null), null);
  assert.equal(R.suqsuqUrl(R.readParams("?gender=boy"), 30), null);
});
