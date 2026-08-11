# Agent memory

One directory per employee, named for them. The runtime creates and loads
these automatically for any agent whose definition carries `memory: project`.

```
.claude/agent-memory/vera/
.claude/agent-memory/ivan/
...
```

**This is committed on purpose.** Employees are rehired each session — the
name registry is wiped when the process exits — but what they have learned
lives here and survives. An employee shows up on day one already knowing the
job. Committing it also means the company's knowledge is version-controlled
alongside the code it describes, and survives a machine failure. Two power
cuts during the design of this system took out everything held in memory;
files on disk survived both.

## What belongs here

Things learned about **one area** that are not already in `AGENTS.md` and are
not recoverable by reading the code:

- Failure signatures — what a broken thing looks like from outside
- Dead ends, and *why* they were dead
- Why a constant has the value it has, when the derivation is not obvious
- Which "obvious" test turned out to prove nothing

One fact per file, kebab-case filename.

## What does not belong here

- Anything already in `AGENTS.md`. Point at it instead. This project has
  already been burned once by two copies of the truth drifting apart — that
  is why `CLAUDE.md` is now a pointer rather than a duplicate.
- Anything recoverable from the code or from `git log`.
- Notes that only mattered during one task.

The org chart, the reporting protocol and the shared constraints live in
`.claude/org/PROTOCOL.md`. The role definitions are in `.claude/agents/`.
