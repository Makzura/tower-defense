---
name: team-comms-and-python-on-this-box
description: SendMessage to "kaz" fails; relay via "main". Bare python/python3 are Store stubs; use the Python312 path.
metadata:
  type: reference
---

**Messaging.** `SendMessage` to `kaz` returns `No agent named 'kaz' is reachable`.
`SendMessage` to `main` works and kaz receives relays through it — confirmed
working in both directions (he replied "received via main, since your sends to
me fail on the name"). If a direct send bounces, relay through `main` and say
who it is for; do not assume the message landed.

Consequence worth remembering: three of my replies silently never arrived, and
because my work was staged off-tree, kaz saw an unchanged `git status` and
reasonably concluded I had stalled. He reassigned the file. **A bounced send plus
off-tree work looks exactly like an idle agent.** Check the return value of every
`SendMessage`; it reports failure in the result, not by raising.

**Python.** `python` and `python3` on this box are Microsoft Store stubs — they
print "Python was not found" and exit 49 without running anything, which reads
like a broken script. Use either:

- `py` (the launcher, Python 3.12), or
- `C:\Users\Superuser\AppData\Local\Programs\Python\Python312\python.exe`

**Runtimes, for planning:** `siphon_idol.py` ~27s (six bodies, all gates),
`siphon_beam.py` ~8s. Both are idempotent — a second run leaves `git status`
clean, and that is the check to run before handing work over.
