// ジェンダーリビール（BabyQ）：発表のページ（index.html）の入口。URL の中身は js/link.js、カレンダーのマスは js/calendar.js
// 読まれるところ：index.html（いちばん最後。js/link.js・js/calendar.js のあと）
(() => {
  "use strict";

  /* ================= 設定 ================= */
  const DEFAULT_TAPS = 5, MAX_TAPS = 20;
  const PREGNANCY_DAYS = 280;
  // lead: 発表直前の一言 / label: 発表テキスト
  const GENDERS = {
    boy:            { lead: "生まれてくるのは…",   label: "男の子",         emoji: "👦💙",   color: "--boy",  deep: "--boy-deep" },
    girl:           { lead: "生まれてくるのは…",   label: "女の子",         emoji: "👧🩷",   color: "--girl", deep: "--girl-deep" },
    "twins-boys":   { lead: "なんと双子ちゃん！", label: "男の子ふたり！", emoji: "👦👦💙", color: "--boy",  deep: "--boy-deep" },
    "twins-girls":  { lead: "なんと双子ちゃん！", label: "女の子ふたり！", emoji: "👧👧🩷", color: "--girl", deep: "--girl-deep" },
    "twins-mixed":  { lead: "なんと双子ちゃん！", label: "男の子と女の子！", emoji: "👦💙👧🩷", color: "--gold", deep: "--gold-deep" },
    twins:          { lead: "なんと…",           label: "双子ちゃん！",   emoji: "👶👶",   color: "--gold", deep: "--gold-deep" },
    surprise:       { lead: "それは…",           label: "ヒミツ！",       emoji: "🤫✨",   color: "--gold", deep: "--gold-deep" },
  };
  // URL の中身を読む部分は params.js（RevealParams）
  const R = window.RevealParams;

  /* ============ URLの見た目を短くする ============
   * 開いた直後にアドレスバーから ?p=... や #... を消す(見た目のため)。
   * 中身は sessionStorage に置き、同じタブで再読み込みしても表示できるようにする。
   * 共有ボタン類は消す前の元のURL(SHARE_URL)を使う。
   */
  const STORE_KEY = "gender-reveal:search";
  let SEARCH = location.search || location.hash; // v3 は # 側に入っている
  try {
    if (SEARCH) sessionStorage.setItem(STORE_KEY, SEARCH);
    else SEARCH = sessionStorage.getItem(STORE_KEY) || "";
  } catch (_) { /* 保存できない環境ではURLを消さない */ }
  const SHARE_URL = location.origin + location.pathname + SEARCH;
  try {
    if (SEARCH && (location.search || location.hash) && sessionStorage.getItem(STORE_KEY) === SEARCH) {
      history.replaceState(null, "", location.pathname);
    }
  } catch (_) {}
  // 開いたままのタブで別の #リンク を開くと再読み込みされず前の中身のままになるので、読み直す
  addEventListener("hashchange", () => { if (location.hash) location.reload(); });

  // 名前や予定日が入ったページは、検索に出さない
  if (SEARCH) document.head.append(Object.assign(document.createElement("meta"), { name: "robots", content: "noindex" }));
  const P = R.readParams(SEARCH);
  // タップ回数(?taps=) 1〜20、未指定は5
  const TAPS_TO_OPEN = Math.min(MAX_TAPS, Math.max(1, parseInt(P.taps, 10) || DEFAULT_TAPS));

  /* ============ 復号(AES-GCM) ============ */
  const needsPass = !!P.secret && !P.secret.key;
  // 合言葉（なければ鍵）で答えを開いて、P に入れる。合言葉がちがうと投げる
  async function decryptSecret(pass) {
    const { v, salt, iv, ct, key } = P.secret;
    if (v === 3) {
      let aes;
      if (key) {
        const base = await crypto.subtle.importKey("raw", key, "HKDF", false, ["deriveKey"]);
        aes = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("gender-reveal v3") },
          base, { name: "AES-GCM", length: 128 }, false, ["decrypt"]);
      } else {
        const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
        aes = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
          base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      }
      const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(12), tagLength: 96 }, aes, ct));
      R.applySecret(P, R.readV3Secret(plain), 3);
      return;
    }
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(key || pass), "PBKDF2", false, ["deriveKey"]);
    const aes = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aes, ct);
    R.applySecret(P, JSON.parse(new TextDecoder().decode(plain)), v);
  }

  // "2027-02-14" や "2026-12-24T19:00" を日時にする（読めなければ null）
  function parseDate(s) {
    if (!s) return null;
    const d = new Date(/T/.test(s) ? s : s + "T00:00:00");
    return isNaN(d) ? null : d;
  }
  const due = parseDate(P.due);
  const revealAt = parseDate(P.reveal);

  /* ============ ユーティリティ ============ */
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  // CSS の変数の値を読む
  const cssVar = n => getComputedStyle(root).getPropertyValue(n).trim();
  // 同じ日か
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  // 2けたにそろえる
  const pad = n => String(n).padStart(2, "0");
  // 「2027年2月14日」の形
  const fmtDate = d => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  // 画面表示用: 曜日つき「10月10日(土)」、時刻は「19時」「19時30分」
  const fmtDateW = d => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${"日月火水木金土"[d.getDay()]})`;
  // 「19時」「19時30分」の形
  const fmtTime = d => `${d.getHours()}時${d.getMinutes() ? d.getMinutes() + "分" : ""}`;
  // その日の 0 時
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // HTML に入れる文字にする
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // ms ミリ秒待つ
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // カスタム色
  if (P.boyColor) root.style.setProperty("--boy", P.boyColor);
  if (P.girlColor) root.style.setProperty("--girl", P.girlColor);

  /* ============ ヘッダー ============ */
  if (P.title) $("title").textContent = P.title;
  const parents = [P.dad, P.mom].filter(Boolean);
  $("names").textContent = parents.length ? `${parents.join(" & ")} ファミリー` : "";

  /* ============ カウントダウン ============ */
  function diffParts(target) {
    let ms = Math.max(0, target - Date.now());
    const d = Math.floor(ms / 864e5); ms -= d * 864e5;
    const h = Math.floor(ms / 36e5); ms -= h * 36e5;
    const m = Math.floor(ms / 6e4); ms -= m * 6e4;
    const s = Math.floor(ms / 1e3);
    return { d, h, m, s, done: target - Date.now() <= 0 };
  }
  // 発表までの残り（日・時・分・秒）を描く。過ぎていたら doneText を出して true
  function renderCountdown(el, target, doneText) {
    const p = diffParts(target);
    if (p.done) { el.innerHTML = `<div class="cd-done">${doneText}</div>`; return true; } // qcheck-ok: W1 doneText は決まった文字だけ
    el.innerHTML = `<div class="countdown">
      <div class="cd-cell"><div class="cd-num">${p.d}</div><div class="cd-unit">日</div></div>
      <div class="cd-cell"><div class="cd-num">${pad(p.h)}</div><div class="cd-unit">時間</div></div>
      <div class="cd-cell"><div class="cd-num">${pad(p.m)}</div><div class="cd-unit">分</div></div>
      <div class="cd-cell"><div class="cd-num">${pad(p.s)}</div><div class="cd-unit">秒</div></div></div>`;
    return false;
  }

  // 妊娠の進み（いま何か月・何週）のバーを描く
  function renderProgress() {
    if (!due) { $("progress").style.display = "none"; return; }
    const start = new Date(due.getTime() - PREGNANCY_DAYS * 864e5);
    const elapsed = Math.floor((Date.now() - start) / 864e5);
    const ratio = Math.min(1, Math.max(0, elapsed / PREGNANCY_DAYS));
    const w = Math.floor(elapsed / 7);
    const month = Math.min(10, Math.floor(w / 4) + 1); // 妊娠○か月(4週=1か月の数え方)
    $("weekText").textContent = elapsed < 0 ? "" : (elapsed >= PREGNANCY_DAYS ? "予定日を迎えました 🎉" : `いま 妊娠${month}か月(${w}週)`);
    requestAnimationFrame(() => {
      $("barFill").style.width = (ratio * 100) + "%";
      $("barBaby").style.left = Math.min(96, Math.max(4, ratio * 100)) + "%";
    });
  }

  // 予定日まで「あと何日」と、発表のロックを描きなおす（1秒ごと）
  function tick() {
    if (due) {
      // 予定日までは秒まで動かさず「あと○日」だけ
      const days = Math.round((startOfDay(due) - startOfDay(new Date())) / 864e5);
      $("dueLabel").textContent = "赤ちゃんに会えるまで";
      $("dueCountdown").innerHTML = days > 0 ? `<div class="days-left">あと<b>${days}</b>日</div><div class="due-sub">出産予定日 <span class="nowrap">${fmtDateW(due)}</span></div>`
        : `<div class="cd-done">${days === 0 ? "今日が予定日です 👶" : "予定日を迎えました 👶🎉"}</div>`;
    } else {
      $("dueCard").style.display = "none";
    }
    updateLock();
  }

  /* ============ 発表ロック ============ */
  // 発表までの流れ(何をすればいいか)を番号つきで
  const steps = [
    "下の🎁ボタンを押す",
    ...(needsPass ? ["パパ・ママから聞いた合言葉を入れる"] : []),
    `大きな🎁を${TAPS_TO_OPEN}回トントン押す`,
    "赤ちゃんの性別が出ます 🎉",
  ];
  $("steps").innerHTML = steps.map((s, i) => `<li><span class="n">${i + 1}</span>${esc(s)}</li>`).join("");

  let lockedPrev = null;
  // 発表の時間まではボタンを押せないようにし、時間になったら押せるようにする
  function updateLock() {
    const btn = $("startBtn");
    if (!P.gender && !P.secret) {
      btn.disabled = true;
      $("revealLabel").textContent = "";
      $("revealCountdown").innerHTML = "";
      $("steps").style.display = "none";
      $("lockNote").innerHTML = `性別が設定されていません。<br><a href="create.html" style="color:var(--girl-deep);font-weight:700">作成ページ</a>からURLを作ってください`;
      return;
    }
    const locked = !!revealAt && revealAt > Date.now();
    if (locked) {
      btn.disabled = true;
      // qcheck-ok: W1 日付から作った数字だけ
      $("revealLabel").innerHTML = `発表は<br><span class="nowrap">${fmtDateW(revealAt)} ${fmtTime(revealAt)}</span>から`;
      renderCountdown($("revealCountdown"), revealAt, "");
      $("revealCountdown").style.marginBottom = "16px";
    }
    if (locked === lockedPrev) return; // 以下は切り替わったときだけ
    lockedPrev = locked;
    if (locked) {
      btn.textContent = "🔒 まだ開けられません";
      $("lockNote").innerHTML = "時間になるとボタンが押せます。<br>その頃に、またこのページを開いてね。";
    } else {
      btn.disabled = false;
      btn.textContent = "🎁 押して発表を見る";
      $("revealLabel").textContent = revealAt ? "🎉 発表の時間です！" : "発表の見かた";
      $("revealCountdown").innerHTML = "";
      $("revealCountdown").style.marginBottom = "0";
      $("lockNote").textContent = "";
    }
  }

  /* ============ カレンダー ============ */
  const today = new Date();
  let calY, calM;
  calY = today.getFullYear(); calM = today.getMonth(); // ジャンプピルの先頭「今日」の月から
  // ジャンプピル: 今日 → (発表日) → 予定日 を日付順に。過去の日は出さない
  const isAhead = d => d && startOfDay(d) > startOfDay(today);
  const jumps = [
    { label: "今日", dot: "today", date: today },
    isAhead(revealAt) && { label: "発表日", dot: "rv", date: revealAt },
    isAhead(due) && { label: "予定日", dot: "due", date: due },
  ].filter(Boolean).sort((a, b) => a.date - b.date);

  // 週のはじまり：1＝月曜（既定）・0＝日曜。Q ツール共通の設定（line-share/shared/week-start.js の qlove:weekStart）を先に見る。
  // まだないときは、前に BabyQ で選んだ値（babyq:weekStart）。共通の部品が読めないときも、BabyQ の値で動く
  const WEEK_KEY = "babyq:weekStart";
  let weekStart = 1;
  try { const own = localStorage.getItem(WEEK_KEY); if (own === "0" || own === "1") weekStart = Number(own); } catch (_) {}
  if (window.QWeekStart) weekStart = QWeekStart.get(weekStart);

  // いまの月のカレンダー（週のはじまりに合わせて）を描く
  function renderCal() {
    $("calTitle").textContent = `${calY}年 ${calM + 1}月`;
    const grid = $("calGrid");
    const DOW = "日月火水木金土";
    let html = RevealCalendar.weekdays(weekStart).map(w => `<div class="cal-dow${w === 0 ? " sun" : w === 6 ? " sat" : ""}">${DOW[w]}</div>`).join("");
    const todayMid = startOfDay(today);
    for (const cell of RevealCalendar.monthCells(calY, calM, weekStart)) {
      if (cell.muted) {
        html += `<div class="cal-day muted">${cell.day}</div>`;
        continue;
      }
      const d = new Date(calY, calM, cell.day);
      const cls = ["cal-day"];
      if (d < todayMid) cls.push("past");
      if (sameDay(d, today)) cls.push("today");
      if (revealAt && sameDay(d, revealAt)) cls.push("reveal-day");
      if (due && sameDay(d, due)) cls.push("due");
      html += `<div class="${cls.join(" ")}">${cell.day}</div>`;
    }
    $("calWeek").textContent = weekStart ? "日曜はじまりにする" : "月曜はじまりにする";
    grid.innerHTML = html;
    // その日がいま見ている月か
    const inView = d => d && d.getFullYear() === calY && d.getMonth() === calM;
    document.querySelectorAll("#calLegend .legend-btn").forEach(b => b.classList.toggle("current", inView(jumps[b.dataset.i].date)));
  }
  $("calWeek").onclick = () => {
    weekStart = weekStart ? 0 : 1;
    try { localStorage.setItem(WEEK_KEY, String(weekStart)); } catch (_) {}
    window.QWeekStart?.set(weekStart); // ほかの Q ツールも同じ週のはじまりで開く
    renderCal();
  };
  $("calPrev").onclick = () => { calM--; if (calM < 0) { calM = 11; calY--; } renderCal(); };
  $("calNext").onclick = () => { calM++; if (calM > 11) { calM = 0; calY++; } renderCal(); };
  // 凡例タップでその日の月へジャンプ
  const jumpTo = d => { calY = d.getFullYear(); calM = d.getMonth(); renderCal(); };
  // 「›」は次のピルとひとまとまりにして、折り返しても行末に矢印だけ残らないように
  $("calLegend").innerHTML = jumps.map((j, i) =>
    `<span class="legend-item">${i ? '<span class="legend-arrow" aria-hidden="true">›</span>' : ""}` +
    `<button type="button" class="legend-btn" data-i="${i}"><i class="dot ${j.dot}"></i>${j.label}</button></span>`).join("");
  if (jumps.length < 2) $("calLegend").style.display = "none"; // 「今日」だけならボタン不要
  $("calLegend").onclick = e => { const b = e.target.closest(".legend-btn"); if (b) jumpTo(jumps[b.dataset.i].date); };
  // カレンダーが苦手な人向けに、日付を文字でも並べる(日付順)
  // 出産予定日は同じカードの上部に書いてあるので、ここは発表日だけ
  $("keyDates").innerHTML = revealAt ? `<div><span>🎁 発表</span><b>${fmtDateW(revealAt)} ${fmtTime(revealAt)}</b></div>` : "";
  if (!revealAt) $("keyDates").style.display = "none";
  // 予定日も発表日もなければ、カレンダーに見せるものがないのでカードごと隠す
  if (!due && !revealAt) $("calCard").style.display = "none";

  /* ============ 飾りの絵文字 ============ */
  // 男の子系と女の子系は必ず同じ数だけ使い、どちらかに偏って見えないようにする
  const BOY_EMOJI = ["👦", "💙", "🚙", "🧢"];         // 青系
  const GIRL_EMOJI = ["👧", "🩷", "🎈", "🎀"];        // 赤・ピンク系
  const NEUTRAL_EMOJI = ["👶", "🐣", "🧸", "⭐", "✨", "💫", "🍼"]; // 青でも赤でもない
  // 配列をまぜて返す
  const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);

  /* ============ 背景バルーン ============ */
  (function floaters() {
    // 男の子系3・女の子系3・中性4 をランダムに選んで混ぜる
    const items = shuffle([...shuffle(BOY_EMOJI).slice(0, 3), ...shuffle(GIRL_EMOJI).slice(0, 3), ...shuffle(NEUTRAL_EMOJI).slice(0, 4)]);
    const box = $("floaters");
    for (let i = 0; i < items.length; i++) {
      const s = document.createElement("span");
      s.className = "floater";
      s.textContent = items[i];
      s.style.left = Math.random() * 100 + "%";
      s.style.fontSize = 18 + Math.random() * 22 + "px";
      s.style.animationDuration = 12 + Math.random() * 14 + "s";
      s.style.animationDelay = -Math.random() * 20 + "s";
      box.appendChild(s);
    }
  })();

  /* ============ サウンド(Web Audio 合成) ============ */
  let ac = null;
  // 音を出す設定か
  const soundOn = () => $("soundOn").checked;
  // 音の準備（AudioContext）
  function audio() { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); return ac; }
  // 音を1つ鳴らす（高さ・長さ・音色・大きさ・鳴りはじめ）
  function tone(freq, dur = .15, type = "sine", vol = .2, when = 0) {
    if (!soundOn()) return;
    const c = audio(), t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur);
  }
  // 心音「ドクン、ドクン」: 低いサイン波の2連打を1秒周期で
  function heartbeat(beats) {
    if (!soundOn()) return;
    const c = audio();
    for (let i = 0; i < beats; i++) {
      [0, 0.18].forEach((off, k) => {
        const t = c.currentTime + i * 1.0 + off;
        const o = c.createOscillator(), g = c.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(k ? 70 : 85, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(k ? 0.35 : 0.5, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.22);
      });
    }
  }
  // 発表のときのファンファーレ
  function fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, .35, "triangle", .22, i * .12));
    [784, 1047, 1319].forEach(f => tone(f, 1.2, "triangle", .12, .55));
  }

  /* ============ 紙吹雪 ============ */
  const cv = $("confetti"), ctx = cv.getContext("2d");
  let parts = [], raf = null;
  // キャンバスは実際の表示サイズ(clientWidth/Height)に合わせる。スマホでツールバーが出入りすると
  // innerHeight だけ変わって resize が来ないことがあるので、visualViewport の変化でも合わせ直す
  function resize() {
    cv.width = cv.clientWidth * devicePixelRatio; cv.height = cv.clientHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  addEventListener("resize", resize); window.visualViewport?.addEventListener("resize", resize); resize();
  // 画面の高さではなくキャンバス全体を消す(一部だけ消し残して紙吹雪が帯状に残るのを防ぐ)
  function clearAll() { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.restore(); }
  // 紙ふぶきを1回はじけさせる
  function burst(colors, count = 180, origin = { x: innerWidth / 2, y: innerHeight * .45 }) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
      parts.push({
        x: origin.x, y: origin.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - .5) * .3,
        c: colors[i % colors.length], life: 0, max: 160 + Math.random() * 80, shape: Math.random() < .25 ? "c" : "r",
      });
    }
    if (!raf) loop();
  }
  // 紙ふぶきを secs 秒ふらせる
  function rain(colors, secs = 4) {
    const end = Date.now() + secs * 1000;
    (function drop() {
      for (let i = 0; i < 6; i++) parts.push({
        x: Math.random() * innerWidth, y: -20, vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 3,
        w: 6 + Math.random() * 5, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - .5) * .2,
        c: colors[Math.floor(Math.random() * colors.length)], life: 0, max: 400, shape: Math.random() < .25 ? "c" : "r",
      });
      if (!raf) loop();
      if (Date.now() < end && stage.classList.contains("show")) setTimeout(drop, 60);
    })();
  }
  // 紙ふぶきを1こま進めて描く（残りがあれば続ける）
  function loop() {
    clearAll();
    parts = parts.filter(p => p.life < p.max && p.y < cv.clientHeight + 40);
    for (const p of parts) {
      p.life++; p.vy += .18; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      ctx.globalAlpha = Math.min(1, (p.max - p.life) / 40);
      if (p.shape === "c") { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r)));
      ctx.restore();
    }
    raf = parts.length ? requestAnimationFrame(loop) : null;
    if (!raf) clearAll();
  }

  /* ============ 演出シーケンス ============ */
  const stage = $("stage"), gift = $("gift");
  let taps = 0, busy = false;

  // プレゼントの画面をはじめの形に戻す
  function resetStage() {
    taps = 0; busy = false;
    stage.className = "stage show";
    gift.className = "gift idle"; gift.style.display = "";
    gift.style.setProperty("--grow", 1);
    $("hint").textContent = "プレゼントを指で押してね";
    $("remain").innerHTML = `あと <b>${TAPS_TO_OPEN}</b> 回`; // qcheck-ok: W1 数字だけ
    $("remain").style.display = "";
    $("taps").style.display = "";
    $("taps").innerHTML = Array.from({ length: TAPS_TO_OPEN }, () => '<i class="tap-dot"></i>').join("");
    $("heart").style.display = "none";
    $("result").className = "result";
    document.body.classList.remove("revealed");
    root.style.removeProperty("--reveal"); root.style.removeProperty("--reveal-deep");
  }

  // タップ回数に関わらず進み具合に応じてヒントを出す
  const tapHints = ["ん？ 何か入ってる…", "ゴソゴソ…", "もうちょっと！", "ドキドキ…"];
  // タップの回数に合わせた声かけ
  const hintFor = n => n >= TAPS_TO_OPEN ? "" : tapHints[Math.min(tapHints.length - 1, Math.floor((n - 1) / TAPS_TO_OPEN * tapHints.length))];
  // タップしたところをキラッと光らせる
  function sparkle(x, y) {
    const r = gift.getBoundingClientRect();
    ["✨", "⭐", "💫", "✨"].forEach((e, i) => {
      const sp = document.createElement("span");
      sp.className = "spark"; sp.textContent = e;
      const a = (Math.PI * 2 * i) / 4 + Math.random() * .6;
      sp.style.left = (x - r.left) + "px"; sp.style.top = (y - r.top) + "px";
      sp.style.setProperty("--dx", Math.cos(a) * 60 + "px");
      sp.style.setProperty("--dy", Math.sin(a) * 60 + "px");
      gift.appendChild(sp);
      setTimeout(() => sp.remove(), 700);
    });
  }
  // プレゼントの後ろから絵文字が飛び出す。1回ごとに男の子系/女の子系を同数にし、残りは中性
  // (2個 → 男1女1 / 3個 → 男1女1中1 / 5個 → 男2女2中1)
  const pick = a => a[Math.floor(Math.random() * a.length)];
  // プレゼントから絵文字を count こ飛び出させる
  function popOut(count) {
    const k = Math.floor(count / 2);
    const items = shuffle([
      ...shuffle(BOY_EMOJI).slice(0, k), ...shuffle(GIRL_EMOJI).slice(0, k),
      ...Array.from({ length: count - k * 2 }, () => pick(NEUTRAL_EMOJI)),
    ]);
    for (const emoji of items) {
      const sp = document.createElement("span");
      sp.className = "pop";
      sp.textContent = emoji;
      const a = (-170 + Math.random() * 160) * Math.PI / 180; // 主に上〜斜め方向へ
      const dist = 150 + Math.random() * 40; // 箱(約170px)の外まで出す
      sp.style.setProperty("--dx", Math.cos(a) * dist + "px");
      sp.style.setProperty("--dy", Math.sin(a) * dist + "px");
      sp.style.setProperty("--rot", (Math.random() - .5) * 60 + "deg");
      sp.style.fontSize = 22 + Math.random() * 10 + "px";
      sp.style.animationDelay = Math.random() * 120 + "ms";
      gift.appendChild(sp);
      setTimeout(() => sp.remove(), 1600);
    }
  }
  gift.addEventListener("click", async e => {
    if (busy || taps >= TAPS_TO_OPEN) return;
    taps++;
    gift.classList.remove("idle");
    gift.style.setProperty("--grow", 1 + (taps / TAPS_TO_OPEN) * 0.35); // タップごとに少しずつ膨らむ
    sparkle(e.clientX || innerWidth / 2, e.clientY || innerHeight / 2);
    popOut(taps >= TAPS_TO_OPEN ? 5 : taps / TAPS_TO_OPEN < 0.5 ? 2 : 3); // 前半2個・後半3個・最後5個
    const left = TAPS_TO_OPEN - taps;
    $("remain").innerHTML = left ? `あと <b>${left}</b> 回` : "";
    document.querySelectorAll(".tap-dot").forEach((d, i) => d.classList.toggle("on", i < taps));
    gift.classList.remove("shake-1", "shake-2", "shake-3"); void gift.offsetWidth;
    gift.classList.add(taps >= TAPS_TO_OPEN ? "shake-3" : taps / TAPS_TO_OPEN < 0.5 ? "shake-1" : "shake-2");
    tone(300 + taps * 90, .12, "square", .08);
    if (navigator.vibrate) navigator.vibrate(30 + taps * 15);
    $("hint").textContent = hintFor(taps);
    if (taps >= TAPS_TO_OPEN) {
      busy = true; gift.classList.add("busy");
      await sleep(750);
      gift.classList.add("open");
      await climax();
    }
  });

  // 最後のタップのあと、ためてから発表する
  async function climax() {
    await sleep(600);
    if (!stage.classList.contains("show")) return; // 途中で「もどる」された
    // 暗転 + 心音
    stage.classList.add("dark");
    gift.style.display = "none"; $("taps").style.display = "none"; $("remain").style.display = "none";
    $("hint").textContent = "運命の瞬間…";
    $("heart").style.display = "block";
    heartbeat(2);
    await sleep(2000);
    $("heart").style.display = "none";
    $("hint").textContent = "";
    reveal();
  }

  // 答えを見せる（色・文字・紙ふぶき・すくすくへのリンク）
  function reveal() {
    const g = GENDERS[P.gender] || { lead: "生まれてくるのは…", label: P.label || "？", emoji: P.emoji || "🎉", color: "--gold", deep: "--gold-deep" };
    const color = P.color || cssVar(g.color), deep = P.color || cssVar(g.deep);
    root.style.setProperty("--reveal", color);
    root.style.setProperty("--reveal-deep", deep);
    stage.className = "stage show done";
    stage.style.background = `radial-gradient(circle at 50% 40%, #fff 0%, color-mix(in srgb, ${color} 35%, #fff) 80%)`;
    document.body.classList.add("revealed");

    $("lead").textContent = P.lead || g.lead;
    $("answer").textContent = P.label || g.label;
    $("answer").classList.toggle("long", $("answer").textContent.length > 5);
    $("answerEmoji").textContent = P.emoji || g.emoji;
    $("answerEmoji").classList.toggle("many", Array.from($("answerEmoji").textContent).length > 3);
    $("babyName").textContent = P.name || ""; // 入力どおりに表示(「ちゃん」は付けない)
    $("msg").textContent = P.msg || "";
    // 結果のスクショにも予定日までの日数が残るように
    const daysLeft = due ? Math.round((startOfDay(due) - startOfDay(new Date())) / 864e5) : null;
    $("resultDue").innerHTML = daysLeft > 0 ? `赤ちゃんに会えるまで あと<b>${daysLeft}</b>日`
      : daysLeft === 0 ? "今日が出産予定日です 👶" : "";
    $("result").classList.add("show");
    // すくすくへ：予定日がまだ先なら、予定日と名前（発表のあとなので見せてよい）を渡す
    const suqsuq = R.suqsuqUrl(P, daysLeft);
    if (suqsuq) $("suqsuqBtn").href = suqsuq;
    $("suqsuqBtn").hidden = !suqsuq;

    const palette = /boy/.test(P.gender) ? [color, deep, "#ffffff", "#bfe3ff", cssVar("--gold")]
      : /girl/.test(P.gender) ? [color, deep, "#ffffff", "#ffd6e5", cssVar("--gold")]
      : [cssVar("--boy"), cssVar("--girl"), cssVar("--gold"), "#fff"];
    fanfare();
    if (navigator.vibrate) navigator.vibrate([100, 50, 200]);
    burst(palette, 220);
    setTimeout(() => burst(palette, 120, { x: innerWidth * .2, y: innerHeight * .6 }), 400);
    setTimeout(() => burst(palette, 120, { x: innerWidth * .8, y: innerHeight * .6 }), 700);
    setTimeout(() => rain(palette, 5), 900);
    busy = false;
  }

  $("startBtn").onclick = async () => {
    if ($("startBtn").disabled) return;
    if (soundOn()) audio().resume?.(); // iOS 対策: ユーザー操作で解禁
    if (P.secret) {
      if (needsPass) { openPass(); return; }
      try { await decryptSecret(); } catch (e) { LineShareUI.ask({ title: "発表を開けませんでした", text: "リンクが途中で切れていないか、見てみてね。", ok: "閉じる", cancel: null }); return; }
    }
    stage.style.background = "";
    resetStage();
  };

  /* ============ 合言葉モーダル ============ */
  function openPass() {
    $("passModal").classList.add("show");
    $("passErr").textContent = "";
    $("passInput").value = "";
    setTimeout(() => $("passInput").focus(), 50);
  }
  $("passCancel").onclick = () => $("passModal").classList.remove("show");
  $("passBox").onsubmit = async e => {
    e.preventDefault();
    const box = $("passBox");
    try {
      await decryptSecret($("passInput").value.trim());
      $("passModal").classList.remove("show");
      stage.style.background = "";
      resetStage();
    } catch (_) {
      $("passErr").textContent = "合言葉がちがうようです。もう一度入れてみてね";
      box.classList.remove("shake-1"); void box.offsetWidth; box.classList.add("shake-1");
    }
  };
  // 最初の画面 → 発表前のトップ(カレンダー)へ戻る
  function closeStage() {
    stage.className = "stage";
    stage.style.background = "";
    document.body.classList.remove("revealed");
    root.style.removeProperty("--reveal"); root.style.removeProperty("--reveal-deep");
    parts = [];
    scrollTo({ top: 0, behavior: "smooth" });
  }
  $("replayBtn").onclick = closeStage;
  $("stageClose").onclick = closeStage;
  // もう一度見る → プレゼントからやり直し(誰かに見せるとき用)
  $("againBtn").onclick = () => { parts = []; stage.style.background = ""; resetStage(); };

  // おくるカード（お知らせカード）にカード内容を渡して共有。create.html と同じ中立的なカード
  const NEUTRAL_COLOR = "#9b7fd1";
  // 家族にも送るカード（おくるんのお知らせカード）のリンク。性別は書かない
  function buildFlexUrl() {
    const parents = [P.dad, P.mom].filter(Boolean).join(" & ");
    const lines = [
      parents ? `${parents} より` : "",
      due ? `出産予定日：${fmtDate(due)}` : "",
      "プレゼントを開けて確かめてね🎁",
      needsPass ? "🔑 開けるには合言葉が必要です" : "",
    ].filter(Boolean);
    const q = new URLSearchParams({
      headerTitle: P.title || "ベビーの性別発表",
      title: "👶 男の子？女の子？",
      detail: lines.join("\n"),
      showDate: "false",
      theme: "custom",
      customColor: NEUTRAL_COLOR,
      bubbleSize: "giga",
      showAction: "true",
      actionLabel: "🎁 開けてみる",
      actionUrl: SHARE_URL,
    });
    q.set("from", "gender-reveal"); // おくるん側で、ジェンダーリビールから来たと数える（流入口）
    // おくるんの部品が読めない（電波なしなど）ときも、ページの準備は止めない（送るボタンだけ使えない）
    return window.OQRN ? OQRN.cardUrl(q) : "#";
  }
  $("lineFlexBtn").href = buildFlexUrl();
  // 送るときの例文。性別は書かない(転送先へのネタバレ防止)
  $("exampleText").textContent = [
    "👶 赤ちゃんの性別発表です！",
    "男の子かな？女の子かな？",
    "リンクからプレゼントを開けてみてね🎁",
    revealAt && revealAt > Date.now() ? `🕖 ${revealAt.getMonth() + 1}月${revealAt.getDate()}日(${"日月火水木金土"[revealAt.getDay()]}) ${fmtTime(revealAt)}から開けられるよ` : "",
    needsPass ? "🔑 開けるには合言葉が必要です" : "",
    SHARE_URL,
  ].filter(Boolean).join("\n");
  $("exampleCopy").onclick = async () => {
    const text = $("exampleText").textContent;
    try { await navigator.clipboard.writeText(text); $("exampleCopy").textContent = "コピーしました！"; }
    catch (_) { LineShareUI.ask({ title: "長押ししてコピーしてね", input: text, readonly: true, ok: "閉じる", cancel: null }); }
  };
  // ボタン名どおりリンクだけをコピー(見えない文を混ぜない)
  /* ============ 画像で保存 ============ */
  // 発表後の画面と同じ内容を 1080×1350 の画像に描き直す（画面をそのまま写すとスマホで崩れやすいため）
  $("snapBtn").onclick = async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const W = 1080, H = 1350;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const FONT = cssVar("--font");
    const color = cssVar("--reveal"), deep = cssVar("--reveal-deep");
    const ink = cssVar("--ink"), soft = cssVar("--ink-soft");
    // 画像の文字の書体（大きさ・太さ）
    const font = (size, weight = 800) => `${weight} ${size}px ${FONT}`;
    // 幅に収まるまで小さくして1行で描く
    const fit = (text, y, size, { weight = 800, fill = ink, min = 24, maxWidth = W - 200 } = {}) => {
      if (!text) return;
      let s = size;
      ctx.font = font(s, weight);
      while (s > min && ctx.measureText(text).width > maxWidth) { s -= 2; ctx.font = font(s, weight); }
      ctx.fillStyle = fill; ctx.textAlign = "center"; ctx.fillText(text, W / 2, y, maxWidth);
    };
    // 発表の画面と同じく、中心が白で外側が結果の色のグラデーション（色は白に寄せて薄める）
    const light = (hex, amount) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex);
      if (!m) return "#f3ecff";
      const n = parseInt(m[1], 16);
      // 色の1つの成分（R・G・B）を白に寄せる
      const ch = (shift) => Math.round(255 - (255 - ((n >> shift) & 255)) * amount);
      return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
    };
    const g = ctx.createRadialGradient(W / 2, H * .4, 0, W / 2, H * .4, H * .8);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, light(color, .35));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    fit(P.title || "ベビーの性別発表", 150, 52, { fill: soft });
    const parents = [P.dad, P.mom].filter(Boolean).join(" & ");
    fit(parents ? `${parents} より` : "", 215, 36, { weight: 700, fill: soft });
    fit($("lead").textContent, 340, 56, { weight: 700 });
    fit($("answer").textContent, 520, 150, { fill: deep });
    ctx.font = font(170, 400); ctx.textAlign = "center"; ctx.fillStyle = ink;
    ctx.fillText($("answerEmoji").textContent, W / 2, 740, W - 160);
    fit($("babyName").textContent, 880, 72, { fill: deep });
    const msg = $("msg").textContent;
    // メッセージは2行まで（長いときは区切って詰める）
    if (msg) {
      ctx.font = font(40, 700);
      const lines = [];
      let line = "";
      for (const ch of Array.from(msg)) {
        if (ch === "\n" || ctx.measureText(line + ch).width > W - 220) { lines.push(line); line = ch === "\n" ? "" : ch; }
        else line += ch;
      }
      lines.push(line);
      lines.slice(0, 2).forEach((l, i) => fit(l, 980 + i * 56, 40, { weight: 700 }));
    }
    fit($("resultDue").textContent, 1150, 44, { fill: deep });
    const now = new Date();
    fit(`${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ・ ベビーの性別発表`, H - 60, 26, { weight: 700, fill: soft });

    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const url = URL.createObjectURL(blob);
    const file = new File([blob], "gender-reveal.png", { type: "image/png" });
    const sheet = document.createElement("div");
    sheet.className = "snap-sheet";
    sheet.innerHTML = `<div class="snap-card" role="dialog" aria-modal="true" aria-label="画像で保存"><img alt="発表の画像"><p>画像を長押しすると保存できます。</p><div class="snap-actions"></div><button class="pill" type="button">閉じる</button></div>`;
    sheet.querySelector("img").src = url;
    const actions = sheet.querySelector(".snap-actions");
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      const share = Object.assign(document.createElement("button"), { type: "button", className: "pill primary", textContent: "📤 共有・保存" });
      share.onclick = () => navigator.share({ files: [file] }).catch(() => {});
      actions.append(share);
    }
    actions.append(Object.assign(document.createElement("a"), { className: "pill", href: url, download: file.name, textContent: "⬇️ ダウンロード" }));
    // 画像の窓を閉じて、画像の URL を片づける
    const close = () => { sheet.remove(); URL.revokeObjectURL(url); };
    sheet.querySelector(".snap-card > button").onclick = close;
    sheet.addEventListener("click", (e) => { if (e.target === sheet) close(); });
    document.body.append(sheet);
  };

  $("shareBtn").onclick = async () => {
    try { await navigator.clipboard.writeText(SHARE_URL); $("shareBtn").textContent = "コピーしました！"; }
    catch (_) { LineShareUI.ask({ title: "長押ししてコピーしてね", input: SHARE_URL, readonly: true, ok: "閉じる", cancel: null }); }
  };
  // ステージ外(結果画面)でESCで閉じる
  addEventListener("keydown", e => { if (e.key === "Escape" && !busy) stage.className = "stage"; });

  /* ============ 初期化 ============ */
  renderProgress();
  renderCal();
  tick();
  setInterval(tick, 1000);
})();
