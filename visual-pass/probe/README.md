# Writing a probe that cannot silently do nothing

This directory is the pixel-readback rigs. They drive the real game in headless
Chrome over CDP and read `#gl` or `#game` back. `cdp.js` and `serve.js` are
shared; everything else is one job's driver plus its injected page instrument.

**Read this before adding a rig.** The traps below cost whole runs, and every
one of them produced numbers a reviewer would have accepted.

---

## THE ONE THAT MATTERS: a driver step that silently does nothing

On 2026-08-14 four separate steps of one rig did nothing at all and the run
completed with a full table of plausible figures. **None was caught by looking
at the output. All four were caught by assertions.**

- A row selector returned quietly when its row was scrolled out of view. The
  click landed on empty space, the selection stayed where it was, and **two
  subjects of a walk sweep were captures of a different enemy filed under the
  right names** — with plausible deltas, a plausible wrap, and nothing in the
  output to say so.
- A "return to a clean screen" helper did not close a modal. With the modal up
  the wheel handler returns early, so nothing scrolled, so the click above
  missed.
- A state check read the canvas **without painting first**. The canvas holds the
  last frame *drawn*, so it answered about the state before the change and
  reported that a click which had worked had failed.
- A vacuity control clicked a row that was scrolled away and returned **0** —
  "a different subject looks different" scoring identical — sitting directly
  beside the result it was supposed to license.

**The rule.** Every step that works by *making something happen* must assert
that it happened, at the seam the code under test reads, and **throw** rather
than return a flag nobody checks. A step that can no-op is the same defect as a
control that cannot fail: it reads as rigour and establishes nothing.

In practice that means: after a click, assert the state moved; after opening a
panel, assert what it is showing (not merely that something is); after a
navigation, assert the thing you navigated away from is gone.

## Before reporting a mechanism, check it exists — and that it is running

**I had a remembered mechanism, it fit the observation, and I reported it
without asking what a world where it was false would look like.**

That is the whole rule, and it is not about git. It is the question this
directory already asks of a rendering claim — *what would a
broken-in-the-opposite-direction implementation photograph as?* — asked of an
explanation instead of an image. An explanation that fits the evidence is the
start of a check, not the end of one.

Three corollaries, each of which cost somebody a run today.

**A negative existential needs its search space stated, or it is not a finding.**
Correcting me, kaz read the post-commit hook and `git-sync.sh`, found no timer,
and wrote "there is no scheduler, no auto-commit, no daemon". The search was
bounded and the claim was universal. What he actually had — *the post-commit
path contains no timer* — was true, and was all he had. Say which space you
searched, every time.

**A true note about something that has since stopped being true is worse than a
wrong one, because it survives checking.** The mechanism I quoted was real, and
sat in my own notes as a live fact with no date beside it and no way to test it.
Nothing about reading it suggested it needed testing. **Date a claim, or write
the command that settles it beside the claim** — the second is better, because
it turns something you believe into something you can run:

    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Where-Object { $_.CommandLine -like '*autopush*' }

**Verify a correction as hard as the thing it corrects.** I checked kaz's
account instead of accepting it, which is how the still-live half surfaced; he
then checked mine independently and found two properties neither of us had
named. Neither pass was wasted.

---

The git-specific version, which is where all of that came from.

The same failure in a different instrument, and harder to see because the
instrument is a `git log` rather than a probe.

I reported that my uncommitted edit reached HEAD inside another agent's commit
**because something commits working-tree changes on a timer**. The observation
was true; the mechanism was not the reason. kaz checked it in four minutes —
read `.git/hooks/post-commit`, read `visual-pass/git-sync.sh`, grep his own
commits for the file — and none of it held. The real cause is duller and more
useful: **`git commit --only <path>` isolates by FILE, not by hunk.** It commits
the working-tree state of that path, so the other agent committing `gl-world.js`
correctly carried my uncommitted lines in the same file. They followed the
discipline exactly and it still swept me, because we were both writing one file.

So: *the log is reliable for any file with one writer, and cannot be made
reliable for a file with two.* `--only` is not the protection there; one writer
per file is.

**The half I got wrong is worth more than being right would have been.**
`visual-pass/autopush.js` **does** exist — it stages everything and commits
every 90 s, and `visual-pass/HANDOFF.md` lists it as the first of three
processes to start, "restart it after every reboot". My mistake was not
inventing a mechanism; it was quoting a real one **without checking it was
running**. It was not: zero processes. One `Get-Process` would have settled it,
and I never ran it because I was reading it out of my own notes, where it was
written as a live fact.

**A remembered mechanism is a claim about the past.** Before it explains
anything, check the code is there *and* that it is currently doing the thing.
Both halves — the first is the one that gets asked for, the second is the one
that actually catches you.

The stakes are why this is in the repo and not only in a notebook: "something is
committing on a timer" turns into "stop trusting the log", which is false,
expensive, and very hard to walk back once a team believes it.

## Solve in the page, not in the driver

Anything that reproduces the app's arithmetic must run **in the page, against
the live value**. A rate shipped over the wire as `+x.toFixed(6)` is one part in
10^6 — and through a `floor(a * b)` on a product in the thousands it lands on
the wrong side of the floor. That single rounding made a body "reach 3 of its 8
animation frames" and made a control that should read 0 read 28,277. Both look
like findings about the renderer. Neither was about the renderer.

Write the probe's arithmetic character for character as the code under test
writes it, on the same double.

## Controls

- **A control that cannot fail is worse than no control.** Show it failing in
  the same run: freeze the clock and the null is 0; unfreeze and the *same*
  control moves 30,361 px. Print both.
- **A zero is only evidence if something in the same run is non-zero.** An "is
  this warning absent" test needs the case where it is present.
- **Grep every reader of a flag before calling a flip a single-variable
  control.** This project has been bitten three times by a flag with two
  consumers, and the number reported was the sum of two effects.
- **Assert the two states differ in the variable under test**, at the seam the
  renderer reads — not at the one you set.

## Reading pixels

- `#gl` is bit-stable between consecutive draws. **`#game` is not** on the board
  (1,714 px over a full-screen bbox with nothing changed), so any `#game` figure
  must be an ROI with an ROI null beside it. On screens where the board never
  draws it *is* stable — measure that, do not assume it.
- `readPixels` rows are bottom-up; `getImageData` is top-down and ignores the
  context transform. Label every bbox with which space it is in.
- **Discard one rendered frame after any scene change.** The first frame after a
  change differs from the ones after it.
- Crop with the ROI you *report*. A picture and its table cropped differently
  means the table certifies a frame nobody published — a subject cut off in an
  image is invisible in a way the same error in a number is not.

## Naming and sharing

Several agents write here at once, sometimes into the same directory in the same
minute. **Prefix your files with your job, not with the subsystem** (`evx-*`,
`pop-*`, `hero-*`): `viewer-page.js` and `viewer-probe.js` are one job's, and a
second job that reached for the obvious name would have overwritten them.

**Never `git add` this directory.** Stage explicit paths, then assert
`git diff --cached --name-only` is exactly your list **in a separate tool call**
before committing — a check that shares a shell invocation with the action it
guards is not a check. Staging by directory once swept 26 files belonging to two
other agents.

## Housekeeping

Rigs that `git archive` a commit into `%TEMP%` must delete their extraction in a
`finally`; thirteen runs once filled the system disk, which does not present as
a disk error — it presents as a capture that silently fails somewhere else.
Kill only your own Chrome (filter on your profile path); there are usually 80+
belonging to the user and other agents.
