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
