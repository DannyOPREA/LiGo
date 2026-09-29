# Build-vs-buy: tsumego (Go problem) content

- Unit: 8.1 (Phase 8, tsumego). Status: **Decided: option D** ([ADR 0024](../decisions/0024-tsumego-content-generated-plus-classics.md)), by Claude under the owner's 2026-09-28 delegation, on this memo's recommendation. The owner may overrule it.
- This is a licence *reading*, not legal advice. I am not a lawyer; the owner is UK-based and should treat every "OK" below as "no problem found by Claude", not "cleared".
- Evidence: web pages fetched on 2026-09-29, plus shallow git clones of `sanderland/tsumego`, `tasuki/tsumego`, `tasuki/tsumego-web`, `kovarex/tsumego-hero`, `gogameguru/go-problems`, `benjaminmantle/baduk-study-material`, `frank99-owl/go-daily` and `online-go/online-go.com` in a scratch dir.
- **Cloud network limit.** These hosts are blocked from the cloud, so I could not read their own pages: online-go.com, forums.online-go.com, goproblems.com, tsumego-hero.com, tsumego.com, tsumego.tasuki.org, senseis.xmp.net, u-go.net, homepages.cwi.nl, katagotraining.org, wikipedia.org, commons.wikimedia.org, archive.org, dl.ndl.go.jp, arxiv.org, legislation.gov.uk. Anything about them is marked **UNCHECKED** and rests on a search-result snippet at best. GitHub was reachable, and OGS's ToS text lives in its GitHub repo, so that one is checked.

## Capability

The trainer (unit 8.7) needs **at least 200 puzzles**, each with a solution tree, a spread of difficulty that
suits kyu players, playable on a phone, and **provenance recorded on every puzzle** (PLAN §3.1, §8, §5 units
8.1 and 8.4). PLAN §3.1 "Avoid" and §8 say: no problems from modern books. The rule in PLAN line 135 and
COPYING.md line 114 says: "Non-commercial and unclear licences are rejected." The lesson in
logs/tsumego.md adds that the UK/EU database right can protect a modern digitisation even of old positions.

## The legal ideas in plain English

1. **Copyright in a puzzle position.** A pre-1900 book is long out of copyright. A modern book, and a modern
   person's *new* puzzle, is protected. Whether a bare Go position is creative enough to be protected at all
   is arguable, and I have not settled it; do not lean on "positions are facts".
2. **Database right (UK/EU).** A *collection* is protected if someone made a substantial investment in
   collecting, checking or presenting it, even if every item is old. The UK rule is in the Copyright and Rights
   in Databases Regulations 1997, reg. 13: it lasts 15 years from completion or first publication, and it stops
   others extracting or re-using all or a substantial part. Source (search snippet of the Regulations, page itself
   blocked, so UNCHECKED): https://www.legislation.gov.uk/uksi/1997/3032 and
   https://www.gov.uk/guidance/sui-generis-database-rights . A 2006-2018 digitisation of the classics could still be
   inside its 15 years, and a big revision may restart the clock; I cannot tell.
3. **"Sweat of the brow".** Under current UK/EU thinking, hard work alone does not create copyright; the
   work must be the author's own intellectual creation. A faithful transcription of a diagram is unlikely to
   earn its own copyright, which is good (we owe nobody) and bad (we cannot claim one either). This is
   general knowledge, not something I fetched: UNCHECKED.
4. **Practical upshot.** Copying a modern digitisation puts us near the database right. Transcribing from
   a pre-1900 edition ourselves, or generating positions ourselves, does not depend on anyone else's
   collection. That is the logic behind the PLAN's rule.

## What was checked, source by source

| Source | Exact licence or terms found | Where | Verdict |
|---|---|---|---|
| OGS puzzles (online-go.com) | ToS text: "Online-Go.com does not claim ownership of any Content you submit". Submitting grants **Online-Go.com** a "perpetual, irrevocable, and fully sublicensable license to use, distribute, reproduce, modify ... such Content". The grant runs to OGS, not to the public. Site page itself blocked | `src/views/docs/legal.tsx` in https://github.com/online-go/online-go.com (master, commit 2026-09-28); site page https://online-go.com/docs/terms-of-service UNCHECKED | **No licence for us.** Authors keep copyright, OGS holds the licence. Only OGS itself could reuse them, which matters for the handoff (below) |
| goproblems.com | No terms page could be read. A user forum thread titled "Go problems have no copyrights!" exists, which is an opinion, not a licence | https://www.goproblems.com/forum/viewtopic.php?t=1190 (title only, from search); site blocked | **No licence found, cannot use** |
| tsumego-hero.com | Code repo: `composer.json` says `"license": "proprietary"`; no LICENSE file. Its About page credits named problem creators (e.g. 7,421 problems by one user, 1,351 by another) and has no data licence | https://github.com/kovarex/tsumego-hero (master); site blocked | **No licence found, cannot use** |
| sanderland/tsumego (data) | LICENSE is MIT, which says "Code is Copyright 2020 Sander Land and/or other authors ..."; `CONTRIBUTORS` thanks "Original Tsumego authors" and "TsumegoDojo for collecting many of the original files". `problems/` holds directories named after modern books ("Cho Chikun Encyclopedia", "Hashimoto Utaro Tsumego", "Lee Changho Tesuji", "Great Tesuji Encyclopedia"). Open issue #6 asks whether that data is original; no reply | https://raw.githubusercontent.com/sanderland/tsumego/master/LICENSE , `.../CONTRIBUTORS` , https://github.com/sanderland/tsumego/issues/6 | **Code MIT only. Data is modern-book content, cannot use** |
| tasuki "Tsumego Collections" (Brunner) | No LICENSE file in `tasuki/tsumego` or `tasuki/tsumego-web`. Site footer: "(c) Vit 'tasuki' Brunner". Its FAQ answers "Is it legal publishing problem collections like this?" with "I hope so (I am not publishing solutions, only board positions and most of the authors have been dead for quite a while)". The Lee Chang-ho set is scraped from goproblems.com (`scripts/download.sh`). The FAQ says the classics come from Uli Goertz's u-go.net/classic | `faq.html.haml` in https://github.com/tasuki/tsumego-web ; https://github.com/tasuki/tsumego | **No licence found, cannot use** (also a modern digitisation, so database right applies) |
| Sensei's Library | Search snippets say content is under the "Open Content License", on the SLCopyright page. Page blocked, terms not read. Open Content License is not one of the families in COPYING.md | https://senseis.xmp.net/?SLCopyright (UNCHECKED, snippet via https://senseis.xmp.net/?topic=766 ) | **UNCHECKED, not recommended.** Also many diagrams are copied from books |
| Wikimedia Commons / Wikisource / Wikibooks | Searches found no tsumego problem collection there (Commons NDL uploads exist for other books). Sites blocked | https://commons.wikimedia.org/wiki/Category:National_Diet_Library (snippet) | **Nothing found. UNCHECKED** |
| gogameguru/go-problems | LICENSE at repo root: **CC BY-NC-SA 4.0**. 422 SGFs (140 easy, 140 intermediate, 140 hard, 2 other) with solution trees, "Correct" comments, 19x19 (one 13x13), by David Ormerod with An Younggil (8 dan pro) | https://github.com/gogameguru/go-problems (master, LICENSE + README) | **Excellent content, but NonCommercial: rejected by our own rule.** See "policy exception" below |
| baduk-study-material | Own text CC0. The problem files are flagged by the repo itself as "Grey" (community rebuilds from modern books); the classics are its copies of the tasuki set | https://github.com/benjaminmantle/baduk-study-material (`LICENSE.md`, `docs/provenance.md`) | **Not a licence for the problems, cannot use** |
| go-daily | PolyForm Perimeter 1.0.1 (source-available, restricts competing products) | https://github.com/frank99-owl/go-daily (`LICENSE`) | **Not open, cannot use** |
| tsumegobench | 20 SGFs from GoProblems "remain attributed to their listed GoProblems authors"; no licence stated | https://github.com/adum/tsumegobench | **No licence found, cannot use** |
| TsuGO benchmark (paper) | Says it curates *Xuanxuan Qijing* and others from "public tsumego materials". Licence and data not read (arXiv blocked) | https://arxiv.org/html/2608.13221v1 (snippet) | **UNCHECKED** |
| CC0 or CC-BY tsumego datasets (GitHub, Kaggle, Hugging Face) | Searched; **none found**. Hugging Face had one 80-problem set from a modern book (Maeda), licence not shown | search only | **None exist that I could find** |
| KataGo the program | LICENSE is MIT | https://raw.githubusercontent.com/lightvector/KataGo/master/LICENSE | OK to run |
| KataGo networks | Search snippet of katagotraining.org: the "Neural Network License" covers the kata1 networks "with a few exceptions"; the oldest "g170" networks are **CC0**. I could not read the terms | https://katagotraining.org/network_license/ (UNCHECKED; blocked) | Terms of kata1 unknown; g170 said to be CC0 |
| KataGo training game data | No licence statement found | https://katagotraining.org/ (blocked) | **No licence found, do not use** |
| Public-domain game records (e.g. CWI "Database of Go games", Dosaku 153 games, Shusaku 470) | Games are facts, but the collection is a database. Site says nothing I could read about a licence | https://homepages.cwi.nl/~aeb/go/games/ (blocked; snippet only) | **UNCHECKED**; GoGoD and Go4Go stay excluded by the PLAN |

## Public-domain classics, transcribed by us

The tasuki booklets' prefaces give the problem counts (from `books/content/*.tex` in
https://github.com/tasuki/tsumego ; the counts and difficulty words are Brunner's, not independently checked).

| Book | Year | Problems | Difficulty | Original-edition scan |
|---|---|---|---|---|
| *Xuanxuan Qijing* (Gengen Gokyo) | 1347/1349 | 347 in Brunner's set (more in other versions) | "fairly difficult ... unless you are a top amateur, some might be difficult" | Not found. Chinese texts exist on shidianguji.com and shuge.org, licences UNCHECKED |
| *Guanzi Pu* | 1660 | 1,473 per a search snippet quoting Sensei's, UNCHECKED; Brunner drops it for many duplicates and variations | Hard | Not found; Wikidata has an entry (Q11452099) |
| *Igo Hatsuyoron* | 1713 | 183 | "insanely difficult"; not for our players | Not found |
| *Gokyo Shumyo* | 1812 (Brunner says 1822; ja.wikipedia snippet says 1812) | 520: living 103, killing 71, ko 90, capturing races 96, oiotoshi 40, connecting 74, various 46 | Not stated by Brunner; practical patterns. I can't say how many suit kyu | National Diet Library digital collection has vol. 4 (https://dl.ndl.go.jp/info:ndljp/pid/861152, blocked, UNCHECKED). NDL's help text says items marked "Internet publication (protection period expired)" are free to use, from a search snippet |
| *Genran* and others | | Nothing found in this session | | Not researched |

Findings for the memo's questions:
- **Kyu suitability is the weak spot.** Every classic here is aimed at strong players or is untested for
  kyu. They give a dan-level tail, not the 200-puzzle beginner base.
- **Positions only.** Even the community SGFs of these classics carry no solutions (the baduk-study-material
  README says "Positions only (no solution moves)"). Solutions are in the original books, in Chinese or
  Japanese, which we would have to read and enter ourselves.
- **Scan licence.** I found no confirmed scan with a stated licence. NDL's own rule (search snippet) is the most
  promising; someone must open the item page and read its rights line before we rely on it.
- **Effort (my estimate, not measured).** About 200 hand transcriptions from woodblock-print diagrams, each
  with a checked solution, is many sessions of Claude reading page images, with a real error rate. It also needs
  the owner to add dl.ndl.go.jp and a scan host to the cloud allowlist. A KataGo legality check catches
  impossible positions but not a misread stone that is still legal.
- **Copying the SGF shortcut is not OK for us.** Using Brunner's SGFs (a modern digitisation, no licence, a
  copyright line and "I hope so") is exactly the database-right case the lesson warns about. I would not even
  use them as a cross-check without the owner's yes.

## Provenance recorded on every puzzle

`source_kind` (transcribed, generated or licensed dataset) · work title and year · edition, publisher and
library ID · problem number and section · **URL of the scan and the page or leaf** · the scan's stated rights
line and date checked · transcriber (person or Claude model, session) and verifier · puzzle licence (
MIT for our own work, ADR 0007 and ADR 0024) · for generated puzzles: generator version, seed, KataGo version and network name and
sha256 · date created. Phase 9's credits page is built from these fields.

## Candidates

| Option | Licence | Reaches 200 with kyu spread? | Effort | OGS handoff | Ladder rung |
|---|---|---|---|---|---|
| A. Use an existing collection as-is: OGS, goproblems, tsumego-hero, tasuki, sanderland | None found, or ToS granting only OGS | Count yes, licence no | Low | None; OGS already owns its own | Rung 1 blocked by licence |
| B. gogameguru/go-problems as-is | CC BY-NC-SA 4.0 | **Yes**: 422, 140 easy, with solution trees | Low (an SGF reader exists from 7.2) | Poor: OGS offers paid memberships (UNCHECKED, from general knowledge), so NC data is hard for it to take, and ShareAlike travels with it | Rung 1, blocked by our own NC rule |
| C. Our transcriptions of Gokyo Shumyo, *Xuanxuan Qijing*, Guanzi Pu from original scans | Ours; our puzzle files are MIT (ADR 0007) | Count yes; **kyu spread doubtful**, dan-level | **High** (many sessions, needs allowlist, errors) | Good: clean provenance | Rung 6 custom (manual) |
| D. **Positions we generate and solve by exact search (KataGo as a second opinion), then our own reading of a few classics** | Ours (MIT, ADR 0007); the KataGo engine is MIT; network licence to be read | **Yes** if the generator is built; spread set by shape size and outside strength | **Medium** (a generator and checker in `tools/puzzles`, more than glue) | Good: OGS gets the script and the data with no strings | Rung 6 custom, needs approval |

## Recommendation

**Option D, in two steps, and Claude proceeds on this unless the owner objects.**

1. **Bulk (8.4's 200+):** a small generator in `tools/puzzles` that builds our own life-and-death positions
   from a catalogue of textbook eye-space shapes (three in a row, bent three, bulky five, and so on)
   in corner, edge and centre, plus varied outside stones for difficulty. Each is solved by exhaustive
   search of the small region using goban-engine's checked play (the rules already replayed by 1.8), with
   KataGo as an independent second opinion, and the solution tree (right answers, refutations, ko marked) is built
   from the search. Only puzzles where both agree are kept. Everything is our own work, recorded as
   `source_kind = generated` with the seed and versions. The basic eye shapes are common Go knowledge; no book's diagrams are copied, and each position is built by the generator.
2. **Dan-level tail:** a modest number (say 20 to 40) hand-transcribed from *Gokyo Shumyo* (living and killing
   sections) once NDL's scan is open to the cloud, with the scan's rights line checked. This shows the
   provenance system working on real classics without betting the 200 on it.

**Runner-up: Option B, gogameguru's set, if the owner changes the rule.** It has the best content and
would hit 200 in one session, but it is CC BY-NC-SA. Our existing rule rejects non-commercial data, the same
rule that removed lichess's CC BY-NC-SA pieces; ShareAlike would also bind derived puzzle files. Claude will not
take it without the owner rewriting that rule.

**Why not C alone:** it is legally the cleanest, but it is the most work, gives mostly dan-level problems,
and a misread diagram would slip past. It stays in as the small tail.

## What each choice commits LiGo to

- D: writing and maintaining a generator and checker (small, MIT, handed to OGS with the data). Puzzles are
  repetitive by nature, so the trainer is best for eye-shape reading, not for varied book-style tesuji.
- The generator's KataGo check on the cloud's tiny test network is weak. Trust comes mostly from the exact
  search; a stronger net on the owner's box (once pinned in 4.6) tightens it.
- B: an NC-SA data folder with its own COPYING.md entry, and no clean donation of that data to OGS.
- C: cloud allowlist changes and a long transcription queue.

## What the owner must decide

1. Accept D (generator plus a small classic tail) as the plan for 8.2 to 8.4? Claude's default is yes.
2. Keep the rule that non-commercial data is rejected, or allow an exception for gogameguru's CC BY-NC-SA
   set as a clearly separate data pack? (Claude's default: keep the rule.)
3. Allowlist `dl.ndl.go.jp` (and one Chinese scan host) for the cloud, so the classic tail can be read?
4. May Claude use Brunner's SGFs to cross-check our transcriptions (comparison only, never copied into the
   set)? Default: no.
5. Read the licence of the KataGo networks and training data on katagotraining.org (from the owner's machine,
   linked to unit 4.6). Prefer the g170 (CC0) networks for generating if the kata1 terms restrict output.
6. Optional: someone with a lawyer's eye on the UK database-right and NDL rights lines. Claude cannot settle these.

## Not verified

The OGS site, goproblems, tsumego-hero, Sensei's Library, Wikimedia and Wikibooks pages, the KataGo network
licence text, the NDL item rights line, and every claim tagged UNCHECKED, because the hosts are blocked from
this cloud session. No scan licence was confirmed for any classic.
