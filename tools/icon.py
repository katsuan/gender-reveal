#!/usr/bin/env python3
"""ジェンダーリビール 〜BabyQ〜 のアイコン・ロゴ・OGP を作る。

英字は BabyQ（Baby＋Q。Q は「クイズ（Question）」：男の子？女の子？）。おくるん＝OQRN・キロっく＝kiloQ と同じく Q を絵にする。
アイコンはおくるんと同じ角の丸い四角に、男の子の青 → 女の子のピンクの横のグラデーション（index.html の --boy・--girl）。
白い輪の中に赤ちゃんの顔（耳と前髪のくるん。目は背景の色でくり抜く）、右下にしっぽを出して Q に見せる。
輪の中をのぞいて確かめる虫めがねにも見えるのは、「どっちかな？」と確かめるページなのでそのまま生かす。

  icon.svg・icon-32.png・apple-touch-icon.png・icon-512.png・icon-maskable-512.png … アイコン
  logo.svg        … 横長のロゴ「BabyQ」（B・a・b・y は Jua、Q はアイコンと同じ形）
  ogp-create.png  … 作成ページ（create.html）を共有したときの画像（1200×630）。
                    受け取る人の発表ページ（index.html）は、性別をヒミツにしたプレゼントの絵（ogp.png）のまま

使い方: python3 tools/icon.py（となりのおくるん（q-oqrn）の tools/brandkit.py を使う）
"""
from pathlib import Path

import brandkit_path  # noqa: F401（となりのおくるん（q-oqrn）の tools/brandkit.py を読めるようにする）
from brandkit import Brand, centered, polar, star

ROOT = Path(__file__).resolve().parent.parent
BRAND = Brand(light=(96, 170, 240), dark=(244, 128, 160), horizontal=True)

C = (46, 46)  # 輪の中心
R, RING_W = 24, 10.5  # 輪の半径（線の真ん中）・太さ
FACE = (46, 49)  # 顔の中心
# 前髪のくるん：額から上に伸びて、右回りに小さく巻く（半径を少しずつ小さく）
CURL = [(46, 39), (46, 35)] + [polar((48.6, 34.4), 180 + t, 2.6 - t / 360 * 1.1) for t in range(0, 300, 30)]
SHAPES = [
    {"t": "circle", "c": C, "r": R, "alpha": 0.16},  # 輪の内側（うっすら）
    {"t": "ring", "c": C, "r": R, "w": RING_W},
    # 顔・耳・前髪のくるん
    {"t": "circle", "c": FACE, "r": 11},
    {"t": "circle", "c": (FACE[0] - 11, FACE[1] + 1), "r": 3.6},
    {"t": "circle", "c": (FACE[0] + 11, FACE[1] + 1), "r": 3.6},
    {"t": "line", "p": CURL, "w": 2.8},
    # 目（背景の色でくり抜く）
    {"t": "circle", "c": (FACE[0] - 4.6, FACE[1] + 0.5), "r": 1.9, "fill": "bg"},
    {"t": "circle", "c": (FACE[0] + 4.6, FACE[1] + 0.5), "r": 1.9, "fill": "bg"},
    # Q のしっぽ（右下 45°。輪から続けて伸ばす）
    {"t": "line", "p": [polar(C, 45, R + 2), polar(C, 45, 41)], "w": 9},
]
# 外形（しっぽを含む）の真ん中をアイコンの真ん中にそろえ、Q の重心が片寄って見えないようにする（ロゴも同じ形を使う）
SHAPES, (_DX, _DY) = centered(SHAPES)
C = (C[0] + _DX, C[1] + _DY)
RING_OUTER = R + RING_W / 2


def decorate(d, s):
    """OGP の背景：うっすらハートと星"""
    for x, y, r, a in ((1070, 100, 16, 110), (1140, 330, 9, 90), (960, 560, 12, 100), (70, 90, 10, 90), (430, 570, 7, 80)):
        d.polygon([(px * s, py * s) for px, py in star((x, y), r, r * 0.3, points=4)], fill=(255, 255, 255, a))


def main():
    BRAND.write_icons(ROOT, SHAPES)
    logo, ratio = BRAND.logo_svg("BabyQ", SHAPES, C, RING_OUTER, "BabyQ（ジェンダーリビール）")
    (ROOT / "logo.svg").write_text(logo, encoding="utf-8")
    BRAND.write_ogp(
        ROOT / "ogp-create.png", SHAPES, "ジェンダーリビール", "BabyQ",
        ["赤ちゃんの性別を、プレゼントを", "開けて発表するページを作れる"], decorate, name_size=68,
        copy="赤ちゃんの秘密を、みんなの喜びに",
    )
    print(f"アイコン・logo.svg（高さ 28px なら幅 {28 * ratio:.0f}px）・ogp-create.png を書き出しました")


if __name__ == "__main__":
    main()
