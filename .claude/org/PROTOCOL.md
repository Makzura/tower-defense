# Company protocol

Every agent defined in `.claude/agents/` follows this. It is referenced from
each role file; the essentials are inlined there too, because a system prompt
is more reliably read than a linked document.

## The org chart

```
Diego  (owner)
└── Claude  (orchestrator, main session)
    ├── vera   — simulation & balance lead
    │   ├── ivan   — systems engineer
    │   └── nadia  — balance analyst
    ├── kaz    — rendering lead
    │   ├── otto   — GL engineer
    │   └── suki   — model smith
    └── rhea   — quality lead
        ├── milo   — test engineer
        └── petra  — archivist
```

Depth matters. The spawn-depth cap is 3 by default
(`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), and this chart uses all of it:
managers sit at depth 1, staff at depth 2, and any junior a staff member
spawns sits at depth 3 and **cannot spawn anyone further**. Enforcement is
silent — at the cap the `Agent` tool simply disappears from the toolset.

## Two channels, deliberately separate

**Authority flows up the chart.** A staff member returns work to their
manager. The manager reviews it and decides whether it is good enough to pass
to the orchestrator. Nothing reaches Diego that a manager rejected.

**Visibility flows straight to the root.** Any agent, at any depth, may
message `main` directly. Recipient resolution is a flat name lookup with no
tree concept, so a depth-3 junior reaches the orchestrator as easily as a
manager does. A stalled worker is visible immediately rather than being hidden
behind a busy manager.

## Names

Your name is your identity, your agent type, and your memory namespace. It is
permanent. Names are never recycled — the registry is last-write-wins, so
reusing a name silently orphans the previous holder's history.

Any agent may message any other by name. `main` is reserved for the
orchestrator.

## Reporting

**Status file — durable, survives crashes.** Append to
`.claude/org/status/<yourname>.jsonl`:

```json
{"agent":"ivan","t":"2026-08-11T14:47:25Z","phase":"damage pipeline","state":"working","note":"tracing mitigation order"}
```

`state` is one of `working`, `blocked`, `done`. Get the timestamp from
`date -u +%FT%TZ`. Write a line when you start, when you finish a phase, when
you are blocked, and whenever ~30 minutes have passed.

This file is the reliable channel. Two power cuts during the design of this
system took out everything held in memory; the files on disk survived both.

**Heartbeat — push, best-effort.** `SendMessage` to `main` with a one-line
summary, at most every ~30 minutes. Delivery is turn-gated: it lands when the
orchestrator next takes a turn, not instantly. Never block waiting on a reply.

**Pacing.** You cannot sleep for thirty minutes — foreground sleeps beyond about
60 seconds are SIGKILLed. Check `date -u +%s` between tool calls and heartbeat
once 1800 seconds have elapsed since your last one. Before starting anything
long, heartbeat first, and again when it returns.

## Memory

Your long-term memory is `.claude/agent-memory/<yourname>/`, committed to the
repo. You are rehired each session but you keep everything written here.

Record what you learn about **your own area** that is not already in
`AGENTS.md` and is not recoverable by reading the code: failure signatures,
dead ends and why they were dead, why a constant has the value it has, which
"obvious" test turned out to prove nothing. One fact per file, kebab-case
filename.

Do not duplicate `AGENTS.md` — point at it. Read your memory before you start.

## The constraints nobody may break

From `AGENTS.md`, which is the single source of truth for this project. These
come from the owner's requirements, not from taste:

- **No toolchain.** No npm, bundler, TypeScript, dev server, or build step.
- **Must run from `file://`.** Classic `<script>` tags only, never
  `type="module"`. No `fetch`, no `XMLHttpRequest`.
- **ES5 style.** `var`, `function`, prototype methods. Two-space indent,
  semicolons, double quotes.
- **`update()` never touches the DOM.** Simulation and rendering stay separate.
- **All distances are u.l.**, converted exactly once by `ul()` in `js/units.js`.
- **Visual claims need pixel evidence.** `getImageData` or `readPixels`, diffed.
  A screenshot glance proves nothing.

Read `AGENTS.md` before changing anything. Add a `CHANGELOG.md` entry for every
change you make.
