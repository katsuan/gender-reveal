// ジェンダーリビール（BabyQ）：作るページ（create.html）の入口。答えを暗号にして、発表ページのリンク（#… の v3）を作る
// 読まれるところ：create.html（いちばん最後）
(() => {
  "use strict";
  // id の要素を返す
  const $ = id => document.getElementById(id);
  const form = $("form");

  // 自由に書く: 選んだ色で「絵文字 言葉」がどう見えるかを表示
  function updateColorPreview() {
    $("colorPreview").style.color = form.color.value;
    $("colorPreview").textContent = `${form.emoji.value.trim() || "👦👧"} ${form.label.value.trim() || "男の子と女の子！"}`;
  }
  form.addEventListener("input", updateColorPreview);
  updateColorPreview();

  // 自由に書く：絵文字は、発表する言葉の入力枠の中の左。押したとき・言葉を入れているあいだは、下に選べる絵文字とカスタム（Q キットの pickField）
  const EMOJI_CHOICES = ["👦👧", "👶", "🍼", "🎉", "💛", "🌈", "⭐", "🐣"];
  const emojiCustom = Object.assign(document.createElement("input"), { className: "ls-picker-custom", maxLength: 8, placeholder: "✏️" });
  emojiCustom.setAttribute("aria-label", "ほかの絵文字");
  // いまの絵文字を、枠の中のボタン・選べる絵文字・見本に出す（空なら 👦👧 をうすく）
  function showEmoji() {
    const v = form.emoji.value.trim();
    $("emojiNow").textContent = v || "👦👧";
    $("emojiNow").classList.toggle("is-empty", !v);
    $("emojiBtn").setAttribute("aria-label", `絵文字を選ぶ（いま：${v || "なし"}）`);
    $("emojiPicker").querySelectorAll(".ls-picker-item").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === v)));
    emojiCustom.classList.toggle("is-selected", !!v && !EMOJI_CHOICES.includes(v));
    updateColorPreview();
  }
  // 絵文字を選ぶ（空なら 👦👧 になる）
  function setEmoji(v) {
    form.emoji.value = v;
    showEmoji();
  }
  $("emojiPicker").replaceChildren(
    ...EMOJI_CHOICES.map((e) => {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "ls-picker-item", textContent: e });
      b.addEventListener("click", () => {
        emojiCustom.value = "";
        setEmoji(e);
        // 選んだらたたむ（言葉を入れているあいだは開いたまま）
        if (document.activeElement !== $("revealLabel")) emojiPick ? emojiPick.close() : ($("emojiPicker").hidden = true);
      });
      return b;
    }),
    emojiCustom
  );
  emojiCustom.addEventListener("input", (e) => {
    e.stopPropagation();
    setEmoji(emojiCustom.value.trim());
  });
  showEmoji();
  let emojiPick = null;
  // Q キット（ui.js）は defer なので、読み終わってから
  document.addEventListener("DOMContentLoaded", () => {
    emojiPick = window.LineShareUI?.pickField?.({ field: $("labelField"), button: $("emojiBtn"), input: $("revealLabel"), picker: $("emojiPicker") }) || null;
    // Q キットが古い・読めないときは、押して開く・たたむだけ
    if (!emojiPick) $("emojiBtn").addEventListener("click", () => ($("emojiPicker").hidden = !$("emojiPicker").hidden));
    showEmoji(); // 前の作りかけ・リンクから入った絵文字も出す
  });

  form.addEventListener("change", e => {
    e.target.closest(".field")?.classList.remove("err");
    $("customBox").style.display = form.gender.value === "custom" ? "grid" : "none";
    $("twinsBox").style.display = form.gender.value === "twins" ? "block" : "none";
  });

  // バイトの並びを base64url の文字にする
  function bytesToB64url(bytes) {
    let bin = ""; bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /* ============ 短縮URL(v2)の生成 ============
   * ?p=<base64url> 1つにまとめる。形式は index.html の readV2 を参照
   * 性別は1文字コードなので男女で暗号文の長さが変わらず、パディング不要
   */
  const GENDER_CODES = { boy: "b", girl: "g", "twins-boys": "B", "twins-girls": "G", "twins-mixed": "M", twins: "T", custom: "c" };
  const PUB_SHORT = { due: "u", reveal: "r", dad: "f", mom: "m", title: "t", taps: "k" };
  const SECRET_SHORT = { gender: "g", name: "n", msg: "s", label: "l", emoji: "e", color: "c" };
  // 日時を数字だけにする（2026-12-24T19:00 → 202612241900）
  const compactDate = v => v.replace(/[-T:]/g, "");
  // 項目の名前を短い名前（map）に置きかえる
  const shorten = (obj, map) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [map[k], v]));

  // v2 の形（?p=）のリンクの中身を作る（合言葉があれば暗号にする）
  async function buildToken(pub, sec, pass) {
    // n バイトの乱数
    const rand = n => crypto.getRandomValues(new Uint8Array(n));
    const enc = new TextEncoder();
    const pubShort = shorten({ ...pub, ...(pub.due && { due: compactDate(pub.due) }), ...(pub.reveal && { reveal: compactDate(pub.reveal) }) }, PUB_SHORT);
    if (pubShort.k === "5") delete pubShort.k; // 既定値は省略
    const pubBytes = Object.keys(pubShort).length ? enc.encode(JSON.stringify(pubShort)) : new Uint8Array(0);
    const secShort = shorten({ ...sec, gender: GENDER_CODES[sec.gender] }, SECRET_SHORT);

    const keyBytes = pass ? null : rand(12);
    const password = pass || bytesToB64url(keyBytes);
    const salt = rand(8), iv = rand(12);
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    const aes = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, enc.encode(JSON.stringify(secShort))));

    const head = [2, keyBytes ? 1 : 0, pubBytes.length >> 8, pubBytes.length & 255];
    const all = new Uint8Array([...head, ...pubBytes, ...salt, ...iv, ...ct, ...(keyBytes || [])]);
    return bytesToB64url(all);
  }

  /* ============ 圧縮URL(v3)の生成 ============
   * #<base64url> に入れる(? より2文字短く、# 以降はサーバーにも送られない)。読み方は index.html の readV3
   * bytes = [0x30|合言葉あり][項目マスク][公開項目…][合言葉あり: salt 8 | なし: -][暗号文+tag 12][合言葉なし: 鍵 12]
   *   マスク: 1=予定日 2=発表日時 4=タップ回数 8=パパ 16=ママ 32=タイトル
   *   予定日=2020-01-01からの日数(2byte) 発表日時=同じく分(3byte、壁時計の時刻のまま) 文字列=長さ(可変長)+UTF-8
   * 秘密 = [性別番号(下3bit) | 1名前の有無<<3 | メッセージ<<4 | 表示テキスト<<5 | 絵文字<<6 | 色<<7][文字列…][色 RGB 3byte]
   * 鍵はリンクごとに使い捨てなので IV は固定(0)。合言葉なしは HKDF、ありは PBKDF2 で鍵を作る
   */
  const V3_EPOCH = Date.UTC(2020, 0, 1);
  const V3_GENDERS = ["boy", "girl", "twins-boys", "twins-girls", "twins-mixed", "twins", "custom"];
  const V3_INFO = new TextEncoder().encode("gender-reveal v3");
  // 数を可変長（7bit ずつ）で out に足す
  function pushVarint(out, n) { while (n >= 128) { out.push((n & 127) | 128); n >>>= 7; } out.push(n); }
  // 文字を「長さ＋UTF-8」で out に足す
  function pushStr(out, s) { const b = new TextEncoder().encode(s); pushVarint(out, b.length); out.push(...b); }

  // 範囲外(2020年より前・発表日時が2051年以降など)は null を返し、v2 で作る
  async function buildTokenV3(pub, sec, pass) {
    // n バイトの乱数
    const rand = n => crypto.getRandomValues(new Uint8Array(n));
    // 日時を数の並びにする（2026-12-24 → [2026, 12, 24]）
    const ymd = v => v.split(/[-T:]/).map(Number);
    const out = [0x30 | (pass ? 1 : 0), 0];
    if (pub.due) {
      const [y, m, d] = ymd(pub.due), days = (Date.UTC(y, m - 1, d) - V3_EPOCH) / 864e5;
      if (!(days >= 0 && days < 65536)) return null;
      out[1] |= 1; out.push(days >> 8, days & 255);
    }
    if (pub.reveal) {
      const [y, m, d, h, mi] = ymd(pub.reveal), mins = (Date.UTC(y, m - 1, d, h, mi) - V3_EPOCH) / 6e4;
      if (!(mins >= 0 && mins < 2 ** 24)) return null;
      out[1] |= 2; out.push(mins >> 16, (mins >> 8) & 255, mins & 255);
    }
    if (pub.taps && pub.taps !== "5") { out[1] |= 4; out.push(Number(pub.taps)); } // 既定の5回は省略
    [["dad", 8], ["mom", 16], ["title", 32]].forEach(([k, bit]) => { if (pub[k]) { out[1] |= bit; pushStr(out, pub[k]); } });

    const plain = [V3_GENDERS.indexOf(sec.gender)];
    [["name", 8], ["msg", 16], ["label", 32], ["emoji", 64]].forEach(([k, bit]) => { if (sec[k]) { plain[0] |= bit; pushStr(plain, sec[k]); } });
    if (sec.color) { plain[0] |= 128; plain.push(...sec.color.replace("#", "").match(/../g).map(h => parseInt(h, 16))); }

    let aes, salt = [], key = [];
    if (pass) {
      salt = rand(8);
      const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
      aes = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
        base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    } else {
      key = rand(12);
      const base = await crypto.subtle.importKey("raw", key, "HKDF", false, ["deriveKey"]);
      aes = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: V3_INFO },
        base, { name: "AES-GCM", length: 128 }, false, ["encrypt"]);
    }
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: new Uint8Array(12), tagLength: 96 }, aes, new Uint8Array(plain)));
    return bytesToB64url(new Uint8Array([...out, ...salt, ...ct, ...key]));
  }

  /* ============ LINE共有 ============ */
  // おくるカード（お知らせカード）にカード内容を渡して共有する
  const LINE_URI_MAX = 1000; // LINE の URI アクション上限
  const NEUTRAL_COLOR = "#9b7fd1"; // 性別が推測されない中間色

  // 「2月14日(日)」の形
  function fmtDue(v) {
    const [y, m, d] = v.split("-").map(Number);
    return `${y}年${m}月${d}日`;
  }
  // 発表ページを送るカード（おくるんのお知らせカード）のリンク。性別は書かない
  function buildFlexUrl(revealUrl, pub, hasPass) {
    const parents = [pub.dad, pub.mom].filter(Boolean).join(" & ");
    const lines = [
      parents ? `${parents} より` : "",
      pub.due ? `出産予定日：${fmtDue(pub.due)}` : "",
      "プレゼントを開けて確かめてね🎁",
      hasPass ? "🔑 合言葉は別で伝えるね" : "",
    ].filter(Boolean);
    const q = new URLSearchParams({
      headerTitle: pub.title || "ベビーの性別発表",
      title: "👶 男の子？女の子？",
      detail: lines.join("\n"),
      showDate: "false",
      theme: "custom",
      customColor: NEUTRAL_COLOR,
      bubbleSize: "giga",
      showAction: "true",
      actionLabel: "🎁 開けてみる",
      actionUrl: revealUrl,
    });
    q.set("from", "gender-reveal"); // おくるん側で、ジェンダーリビールから来たと数える（流入口）
    return window.OQRN ? OQRN.cardUrl(q) : "#"; // 電波なしなどで部品が読めないときは送れないだけ
  }

  const PUBLIC_KEYS = ["due", "reveal", "dad", "mom", "title", "taps"];
  const SECRET_KEYS = ["gender", "name", "msg", "label", "emoji", "color"];

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const miss = { fGender: !fd.get("gender"), twinsBox: fd.get("gender") === "twins" && !fd.get("twins") };
    Object.entries(miss).forEach(([id, bad]) => $(id).classList.toggle("err", bad));
    const first = Object.keys(miss).find(k => miss[k]);
    if (first) { $(first).scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    // 入れた欄のうち、中身のあるものだけを集める
    const pick = keys => keys.reduce((o, k) => {
      const v = (fd.get(k) || "").trim();
      if (v && (fd.get("gender") === "custom" || !["label", "emoji", "color"].includes(k))) o[k] = v;
      return o;
    }, {});
    const pub = pick(PUBLIC_KEYS), sec = pick(SECRET_KEYS);
    if (sec.gender === "twins") sec.gender = fd.get("twins"); // 双子は2人の性別で保存
    const url = new URL("./", location.href); // index.html は省略
    const pass = (fd.get("pass") || "").trim();
    const v3 = await buildTokenV3(pub, sec, pass);
    if (v3) url.hash = v3; // 圧縮形式(v3)。範囲外のときだけ従来の ?p= (v2)
    else url.searchParams.set("p", await buildToken(pub, sec, pass));
    $("url").textContent = url.href;
    $("open").href = url.href;
    $("lineFlex").href = buildFlexUrl(url.href, pub, !!(fd.get("pass") || "").trim());
    $("exampleText").textContent = buildExample(url.href, !!(fd.get("pass") || "").trim(), pub.reveal);
    $("lenWarn").style.display = url.href.length > LINE_URI_MAX ? "block" : "none";
    $("out").classList.add("show");
    $("out").scrollIntoView({ behavior: "smooth" });
  });

  // 送るときの例文。性別は書かない。合言葉そのものも書かない
  // "2026-12-24T19:00" → "12月24日(木) 19時"
  function fmtReveal(v) {
    const d = new Date(v);
    if (isNaN(d)) return "";
    return `${d.getMonth() + 1}月${d.getDate()}日(${"日月火水木金土"[d.getDay()]}) ${d.getHours()}時${d.getMinutes() ? d.getMinutes() + "分" : ""}`;
  }
  // 送るときの例文（性別は書かない）
  function buildExample(revealUrl, hasPass, reveal) {
    const when = reveal ? fmtReveal(reveal) : "";
    return [
      "👶 赤ちゃんの性別発表です！",
      "男の子かな？女の子かな？",
      "リンクからプレゼントを開けてみてね🎁",
      when ? `🕖 ${when}から開けられるよ` : "",
      hasPass ? "🔑 合言葉はあとで伝えるね" : "",
      revealUrl,
    ].filter(Boolean).join("\n");
  }
  // 例文は画面に全文出しているので、そのままコピー
  $("exampleCopy").onclick = () => LineShareUI.copy($("exampleText").textContent, { done: "📋 例文をコピーしました" });

  // はじめての人にだけ、使い方を3つ（Q キットの ui.js は defer なので、読み終わってから）
  document.addEventListener("DOMContentLoaded", () => {
    LineShareUI.firstTip(
      "babyq",
      ["性別を選んで「🎁 発表ページを作る」を押します", "合言葉を入れると、知っている人だけが答えを見られます", "「カードで送る」で家族や友だちへ。プレゼントを開けるまで性別はヒミツ"],
      form
    );
  });

  // ボタン名どおりリンクだけをコピー(見えない文を混ぜない)
  // 季節の絵文字をときどき（Q キットの season.js。読めていなければ付けない）
  $("copy").onclick = () => LineShareUI.copy($("url").textContent, { done: window.QSeason ? QSeason.decorate("🔗 リンクをコピーしました") : "🔗 リンクをコピーしました" });
})();
