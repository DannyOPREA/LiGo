# Writes goRatingCases.json: expected values for GoRatingTest, computed by OGS's
# goratings @ 6cab309 (MIT, Copyright (c) 2020 online-go.com) itself, so the
# Scala port in modules/rating/src/main/GoRating.scala is checked against the
# original rather than against a second port.
#
#   mkdir -p /tmp/gor/util && cd /tmp/gor
#   base=https://raw.githubusercontent.com/online-go/goratings/6cab309
#   curl -sO $base/goratings/math/glicko2.py
#   (cd util && curl -sO $base/analysis/util/RatingMath.py && curl -sO $base/analysis/util/CLI.py)
#   touch util/__init__.py
#   python3 path/to/goRatingCases.py /tmp/gor > path/to/goRatingCases.json
#   (cd lila && node_modules/.bin/oxfmt modules/rating/src/test/resources/goRatingCases.json)
#
# The last step is the ui CI job's formatter (oxfmt formats JSON under lila/).
#
# The kyu/dan labels and LiGo's clamping to 25k-9d are ADR 0021's rule, written
# here independently of the Scala code. A label comes from the whole rating (the
# rating rounded down, as games and lobby entries keep it), so one player shows
# one rank everywhere (unit 5.5): a hair above a rank's fractional edge still
# shows the rank below until the rating reaches the next whole point.
import argparse, json, math, sys

sys.path.insert(0, sys.argv[1])
import glicko2 as g2  # noqa: E402
from util import RatingMath as rm  # noqa: E402

rm.configure_rating_to_rank(argparse.Namespace(ranks="log", a=525.0, c=23.15, d=0.0, p=1.0, m=100.0, b=9.0))


def label(rating, deviation):
    r = rm.rating_to_rank(math.floor(rating))
    name = f"{min(25, math.ceil(30 - r))}k" if r < 30 else f"{min(9, math.floor(r - 29))}d"
    return name + ("?" if deviation >= 110 else "")


def entry(t):
    return g2.Glicko2Entry(t[0], t[1], t[2])


def update(me, opp, won):
    e = g2.glicko2_update(entry(me), [(entry(opp), g2.WIN if won else g2.LOSS)])
    return [e.rating, e.deviation, e.volatility]


# rank edges: each rank's lower edge rating, and a hair either side
edges = [rm.rank_to_rating(r) for r in range(4, 41)]
ratings = sorted({400.0, 525.0, 1000.0, 1500.0, 1800.0, 1950.0, 2100.0, 2400.0, 2800.0, 4000.0}
                 | {round(e + d, 4) for e in edges for d in (-0.01, 0.01)})
ranks = [{"rating": x, "deviation": dev, "rank": rm.rating_to_rank(x), "label": label(x, dev)}
         for x in ratings for dev in (60.0, 200.0)]

handicap = [{"size": size, "rules": rules, "komi": komi, "handicap": hc,
             "rankDifference": rm.get_handicap_rank_difference(hc, size, komi, rules),
             "blackAdjustmentAt1500": rm.get_handicap_adjustment("black", 1500.0, hc, size, komi, rules)}
            for size in (9, 13, 19) for rules in ("japanese", "chinese")
            for komi in (0.5, 6.5, 7.5) for hc in (0, 1, 2, 5, 9)]

# the ratings memo's five one-game updates (me, opponent, did I win)
glicko = [{"me": me, "opponent": opp, "won": won, "after": update(me, opp, won)} for me, opp, won in [
    ((1500, 350, .06), (1500, 350, .06), True),
    ((1500, 200, .06), (1400, 30, .06), False),
    ((1500, 200, .06), (1550, 100, .06), True),
    ((1200, 80, .05), (1900, 60, .07), True),
    ((2100, 60, .06), (2000, 120, .06), False),
]]


def handicap_game(black, white, black_won, hc, size, komi, rules):
    # goratings' pattern: each player is updated against the opponent's
    # handicap-adjusted rating
    adj_w = rm.get_handicap_adjustment("white", white[0], hc, size, komi, rules)
    adj_b = rm.get_handicap_adjustment("black", black[0], hc, size, komi, rules)
    return {"black": black, "white": white, "blackWon": black_won, "handicap": hc, "size": size,
            "komi": komi, "rules": rules,
            "blackAfter": update(black, (white[0] + adj_w, white[1], white[2]), black_won),
            "whiteAfter": update(white, (black[0] + adj_b, black[1], black[2]), not black_won)}


r = rm.rank_to_rating
games = [
    # the memo's P3 game: 4.5k beats 0.5d with 4 stones
    handicap_game((r(25.5), 80, .06), (r(30.5), 80, .06), True, 4, 19, 0.5, "japanese"),
    handicap_game((r(25.5), 80, .06), (r(30.5), 80, .06), False, 4, 19, 0.5, "japanese"),
    handicap_game((r(25.5), 250, .06), (r(30.5), 250, .06), True, 5, 19, 0.5, "chinese"),
    handicap_game((r(24.5), 120, .06), (r(29.5), 90, .06), False, 2, 9, 0.5, "japanese"),
    handicap_game((r(20.5), 200, .06), (r(22.5), 150, .06), True, 0, 19, 6.5, "japanese"),
]

# one case per line, so a regenerated file diffs readably
out = {"source": "goratings @ 6cab309", "ranks": ranks, "handicap": handicap, "glicko": glicko,
       "handicapGames": games}
print("{")
for i, (k, v) in enumerate(out.items()):
    comma = "," if i < len(out) - 1 else ""
    if isinstance(v, list):
        print(f' "{k}": [\n' + ",\n".join("  " + json.dumps(x) for x in v) + f"\n ]{comma}")
    else:
        print(f' "{k}": {json.dumps(v)}{comma}')
print("}")
