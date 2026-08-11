---
name: siphon-tier-key-case-split
description: The Siphon's tier keys exist in three incompatible cases across code and generated data, and a lookup miss falls through to a plausible-looking fallback
metadata:
  type: project
---

Three spellings of the same eleven bodies:

- `gl-world.js:377 siphonGroup()` — `"base"`, `"a1".."a5"`, `"b1".."b5"`,
  **lowercase**. This is what the renderer actually draws with.
- `SiphonBeamSpec.originByTier` — `"base"`, `"A1".."A5"`, `"B1".."B5"`,
  **uppercase**.
- `tools/blender/siphon_origins.json` — lowercase, and **no b rows at all**.

**Why it matters:** index a table with the wrong case and every lookup misses,
every miss falls back to the old static value, the beam still starts somewhere
plausible, and a capture passes while nothing new is in use. Same shape of
failure as a silent fallback.

**How to apply:** index per-body tables with `siphonGroup()`'s key (mirrored as
`SiphonFXBeam.bodyKey`), never with `originByTier`'s, and never re-derive from
`tiers(tower).a >= 3` — that answers "hands or ring", not "which body".
Make a miss LOUD (warn once, naming the key and the keys present) except on a
b body, where absence is a contract: the b1..b5 bodies come from
`siphon_abyss.py`, which never writes the origins file, and a B-path Siphon
pours from the hands.

**Frame counts differ per generator.** `siphon_idol.py` ships 25 frames for
`siphon-a5` (measured in game); `siphon_abyss.py` ships 4 for b1..b5. A "total"
origins table covering both would therefore trip a frame-count mismatch check.

`python` and `python3` on this box are Microsoft Store stubs that exit 49
without running — use `py`.

Related: [[siphon-origin-plumbing]].
