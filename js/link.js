// URL の中身を読む（index.html で使う。画面には触らない。test/ で確かめる）
//   v3(現行): #<base64url>  詰めたバイナリ形式。詳細は create.js の buildTokenV3 と下の readV3
//   v2(旧)  : ?p=<base64url>  1パラメータにまとめた短縮形式
//     bytes = [2][flags][pubLen 2byte][pub JSON(短縮キー)][salt 8][iv 12][暗号文+tag][key 12 ※flags&1 のとき]
//     pub  : u=予定日YYYYMMDD r=解禁YYYYMMDDHHmm f=パパ m=ママ t=タイトル k=タップ回数
//     秘密 : g=性別コード(1文字) n=名前 s=メッセージ l/e/c=カスタム表示
//   v1(旧) : ?d=<公開JSON>&s=v1.<salt>.<iv>.<ct>[.<key>]  互換のため読み込み可
//   平文    : ?gender=girl&due=2027-02-14&reveal=2026-10-01T19:00&mom=花子&dad=太郎&name=ひな&msg=...
// URL の中身は外から来た文字なので、cleanParams で決まった項目・形・長さにそろえてから使う
(function () {
  "use strict";

  const GENDER_KEYS = ["boy", "girl", "twins-boys", "twins-girls", "twins-mixed", "twins", "surprise"];
  const ALIASES = { m: "boy", male: "boy", 男: "boy", 男の子: "boy", f: "girl", female: "girl", 女: "girl", 女の子: "girl" };
  const CODE_TO_GENDER = { b: "boy", g: "girl", B: "twins-boys", G: "twins-girls", M: "twins-mixed", T: "twins", c: "custom" };
  const PUB_KEYS = { u: "due", r: "reveal", f: "dad", m: "mom", t: "title", k: "taps" };
  const SECRET_KEYS = { g: "gender", n: "name", s: "msg", l: "label", e: "emoji", c: "color" };
  const V3_EPOCH = Date.UTC(2020, 0, 1);
  const V3_GENDERS = ["boy", "girl", "twins-boys", "twins-girls", "twins-mixed", "twins", "custom"];

  // 受けとる項目と、文字の長さ（作る画面で入れる長さより少し長め）
  const TEXT_MAX = { title: 40, dad: 20, mom: 20, name: 30, msg: 300, label: 30, emoji: 16, lead: 40 };
  const COLOR_KEYS = ["color", "boyColor", "girlColor"];
  const SEARCH_MAX = 8000; // URL の中身の長さの上限（ふつうは 200 字ほど）

  const b64urlToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
  const bytesToB64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64urlDecode = (str) => new TextDecoder().decode(b64urlToBytes(str));
  const expandDate = (v) => (v && v.length >= 8 ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` + (v.length >= 12 ? `T${v.slice(8, 10)}:${v.slice(10, 12)}` : "") : v);

  function readV2(token, p) {
    const bytes = b64urlToBytes(token);
    if (bytes[0] !== 2) throw new Error("unsupported");
    const hasKey = bytes[1] & 1;
    const pubLen = (bytes[2] << 8) | bytes[3];
    let i = 4;
    const pub = pubLen ? JSON.parse(new TextDecoder().decode(bytes.slice(i, i + pubLen))) : {};
    i += pubLen;
    if (pub && typeof pub === "object") for (const [k, v] of Object.entries(pub)) if (PUB_KEYS[k]) p[PUB_KEYS[k]] = String(v);
    p.due = expandDate(p.due);
    p.reveal = expandDate(p.reveal);
    const salt = bytes.slice(i, i + 8), iv = bytes.slice(i + 8, i + 20);
    const end = hasKey ? bytes.length - 12 : bytes.length;
    p.secret = { v: 2, salt, iv, ct: bytes.slice(i + 20, end), key: hasKey ? bytesToB64url(bytes.slice(end)) : null };
  }

  // v3: [0x30|合言葉あり][項目マスク][公開項目…][salt 8 ※合言葉あり][暗号文+tag 12][鍵 12 ※合言葉なし]
  function v3Reader(bytes, i = 0) {
    const need = (n) => {
      if (i + n > bytes.length) throw new Error("short");
    };
    const r = {
      get pos() { return i; },
      byte() { need(1); return bytes[i++]; },
      varint() { let n = 0, shift = 0, b; do { need(1); b = bytes[i++]; n |= (b & 127) << shift; shift += 7; } while (b & 128 && shift < 28); return n; },
      str() { const len = r.varint(); need(len); const v = new TextDecoder().decode(bytes.slice(i, i + len)); i += len; return v; }
    };
    return r;
  }
  function readV3(token, p) {
    const bytes = b64urlToBytes(token);
    if (bytes[0] >> 4 !== 3) throw new Error("unsupported");
    const hasPass = bytes[0] & 1, mask = bytes[1];
    const r = v3Reader(bytes, 2);
    const iso = (ms) => new Date(ms).toISOString(); // 壁時計の時刻をそのまま UTC として持っているので toISOString で戻せる
    if (mask & 1) { const days = (r.byte() << 8) | r.byte(); p.due = iso(V3_EPOCH + days * 864e5).slice(0, 10); }
    if (mask & 2) { const mins = (r.byte() << 16) | (r.byte() << 8) | r.byte(); p.reveal = iso(V3_EPOCH + mins * 6e4).slice(0, 16); }
    if (mask & 4) p.taps = String(r.byte());
    if (mask & 8) p.dad = r.str();
    if (mask & 16) p.mom = r.str();
    if (mask & 32) p.title = r.str();
    let i = r.pos;
    const salt = hasPass ? bytes.slice(i, (i += 8)) : null;
    const end = hasPass ? bytes.length : bytes.length - 12;
    if (end <= i) throw new Error("short");
    p.secret = { v: 3, salt, ct: bytes.slice(i, end), key: hasPass ? null : bytes.slice(end) };
  }
  function readV3Secret(plain) {
    const r = v3Reader(plain), head = r.byte(), out = { gender: V3_GENDERS[head & 7] };
    if (head & 8) out.name = r.str();
    if (head & 16) out.msg = r.str();
    if (head & 32) out.label = r.str();
    if (head & 64) out.emoji = r.str();
    if (head & 128) out.color = "#" + [r.byte(), r.byte(), r.byte()].map((b) => b.toString(16).padStart(2, "0")).join("");
    return out;
  }

  function normalizeGender(p) {
    const g = String(p.gender || p.g || "").trim().toLowerCase();
    p.gender = GENDER_KEYS.includes(g) ? g : ALIASES[g] || null;
    if (!p.gender && (g === "custom" || (g && p.label))) p.gender = "custom"; // カスタム
    delete p.g;
  }

  // カレンダーにある日か（2月30日・13月などは読まない。そのまま Date に渡すと次の月の日にずれる）
  function realDay(text) {
    const [y, m, d] = text.slice(0, 10).split("-").map(Number);
    const day = new Date(Date.UTC(y, m - 1, d));
    return day.getUTCMonth() === m - 1 && day.getUTCDate() === d;
  }

  // 決まった項目・形・長さにそろえる（secret はそのまま）。p を書きかえて返す
  function cleanParams(p) {
    const out = {};
    for (const [k, max] of Object.entries(TEXT_MAX)) {
      const v = p[k];
      if (typeof v === "string" || typeof v === "number") {
        const text = Array.from(String(v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim()).slice(0, max).join("");
        if (text) out[k] = text;
      }
    }
    for (const k of COLOR_KEYS) {
      // CSS に入るので、#rrggbb などの色か、色の名前だけ
      if (typeof p[k] === "string" && /^(#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]{3,20})$/i.test(p[k].trim())) out[k] = p[k].trim();
    }
    if (typeof p.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.due) && realDay(p.due)) out.due = p.due;
    if (typeof p.reveal === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(p.reveal) && realDay(p.reveal)) out.reveal = p.reveal;
    if (/^\d{1,3}$/.test(String(p.taps ?? ""))) out.taps = String(p.taps);
    out.gender = p.gender || p.g || null;
    if (p.secret) out.secret = p.secret;
    for (const k of Object.keys(p)) delete p[k];
    Object.assign(p, out);
    normalizeGender(p);
    return p;
  }

  // 開いたときの URL の中身（location.search か location.hash）を読む
  function readParams(search) {
    let p = {};
    const text = String(search || "");
    if (!text || text.length > SEARCH_MAX) return cleanParams(p);
    if (text.startsWith("#")) {
      try { readV3(text.slice(1), p); } catch (e) { p = {}; }
      return cleanParams(p);
    }
    const q = new URLSearchParams(text);
    if (q.get("p")) {
      try { readV2(q.get("p"), p); } catch (e) { p = {}; }
    } else {
      if (q.get("d")) {
        try {
          const d = JSON.parse(b64urlDecode(q.get("d")));
          if (d && typeof d === "object" && !Array.isArray(d)) p = d;
        } catch (e) { /* 読めない中身は使わない */ }
      }
      const s = q.get("s");
      if (s) {
        try {
          const [ver, salt, iv, ct, key] = s.split(".");
          if (ver === "v1") p.secret = { v: 1, salt: b64urlToBytes(salt), iv: b64urlToBytes(iv), ct: b64urlToBytes(ct), key: key || null };
        } catch (e) { /* 読めない中身は使わない */ }
      }
    }
    for (const [k, v] of q.entries()) if (!["p", "d", "s", "secret"].includes(k) && !Object.prototype.hasOwnProperty.call(p, k)) p[k] = v;
    return cleanParams(p);
  }

  // 開いた秘密の中身を P に入れる（v は形式。v3 は readV3Secret の結果、v2・v1 は JSON）
  function applySecret(P, data, v) {
    if (!data || typeof data !== "object") throw new Error("secret");
    if (v === 2) {
      for (const [k, val] of Object.entries(data)) if (SECRET_KEYS[k] && k !== "g") P[SECRET_KEYS[k]] = val;
      P.gender = CODE_TO_GENDER[data.g] || null;
    } else {
      for (const [k, val] of Object.entries(data)) if (k !== "pad" && k !== "secret") P[k] = val;
    }
    P.secret = null;
    return cleanParams(P);
  }

  // 発表のあと、すくすく（SuQSuQ）を「おなかの中」で開くリンク。予定日がまだ先のときだけ（そうでなければ null）
  //   形はすくすくと同じ ?due=YYYY-MM-DD&name=…（名前は発表のあとなので見せてよい）
  function suqsuqUrl(P, daysLeft) {
    if (!P.due || !(daysLeft > 0)) return null;
    const q = new URLSearchParams({ due: P.due });
    if (P.name) q.set("name", P.name);
    return `https://katsuan.github.io/suqsuq/?${q}`;
  }

  window.RevealParams = { readParams, readV3Secret, applySecret, cleanParams, b64urlToBytes, suqsuqUrl };
})();
