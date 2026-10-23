// 発表のページのカレンダー：その月のマス（前後の月の日は muted）と、曜日の並び。週のはじまりは 0＝日曜（いままで）・1＝月曜
// 画面には触らない（index.html で描く。test/ で確かめる）
(function () {
  "use strict";

  // weekStart：0（日曜はじまり）か 1（月曜はじまり）
  function monthCells(year, month, weekStart = 0) {
    const lead = (new Date(year, month, 1).getDay() - weekStart + 7) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();
    const total = Math.ceil((lead + days) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const n = i - lead + 1;
      if (n < 1) return { day: prevDays + n, muted: true };
      if (n > days) return { day: n - days, muted: true };
      return { day: n, muted: false };
    });
  }

  // 曜日（0＝日〜6＝土）を、週のはじまりから並べる
  const weekdays = (weekStart = 0) => Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);

  window.RevealCalendar = { monthCells, weekdays };
})();
