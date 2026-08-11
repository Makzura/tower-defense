---
name: stage-generator-work-offtree
description: Tune Blender generators in a scratchpad copy, never in the live tree, because an autopush watchdog commits every 90s
metadata:
  type: feedback
---

When tuning a generator in `tools/blender/`, copy the script **and `td_mesh.py`**
into the scratchpad and iterate there. Only write to `TD_0.5.0/` once the build
is green. `td_mesh.OUTPUT_DIR` is derived from `td_mesh.py`'s own location, so a
scratchpad copy writes its models and its JSON into the scratchpad automatically
— no flag or monkeypatch needed.

**Why:** an autopush watchdog commits and pushes every 90 seconds. These
generators fail by `raise SystemExit` on a gate, so a half-tuned amplitude is a
*broken build* pushed to GitHub, not a private work-in-progress. Kaz confirmed
this explicitly after the fact: "Staging off-tree so a failing gate could never
land in an autopush window was also the right call and I should have told you to
do it."

**How to apply:** any change to `siphon_idol.py`, `siphon_abyss.py`,
`tower_warbringer.py` or similar where you expect to iterate on a numeric
amplitude against a gate. Not needed for a change you can reason to be exact
(e.g. reading a constant from JSON instead of retyping it) — verify those by
checking the generated output is byte-identical instead.

**The cost to know about:** work staged off-tree is invisible to everyone else.
`git status` showing a file unchanged reads as "that agent has not started". Say
out loud that you are staging, and roughly when you expect to land. See
[[team-comms-and-python-on-this-box]].
