# DFM-2026-014 drawing candidate

Prepared against the assigned drawing worktree, base supplied as
cbc3a89f324945c5267ed33bd9ac505c64e4cdf2. The patch is not applied by Codex.

## Design

A pure 532 x 470 fence scene (220 pt high without a fence) drives public SVG and both pdf-lib
documents. All dimension values come from the order: requested height,
post spacing, configured embedment and derived post length. Above-grade and
embedment proportions are illustrative, explicitly marked NOT TO SCALE.
Concrete has no diameter dimension. Pickets, posts and rails have distinct
fills. Picket and fastener patterns are representative; at most 24 pickets,
8 rails and 48 fasteners are drawn, with the actual rail count retained.

Financial content remains first. A full-width Letter technical appendix
uses 9 pt minimum detail labels and 40 pt margins. Gate widths/heights and
run lengths appear in a paginated schedule; no plan, swing or site angle
is inferred. Zero solid fence produces an explicit accessory/gate sheet.
The public form supplies no embedment control, so its existing 2 ft
embedment is explicitly identified. Public gate heights are not inferred.

Public Print / Save PDF now opens the same local PDF builder used by the
email attachment. Browser print fallback also uses the shared SVG at full
width. Invoice print/email already use buildInvoicePdf. No email delivery,
price, material/billing model, job setup, auth, API or migration code changes.

## Validation handoff

Seven new node:test cases in src/drawing/fence-scene.test.ts cover dimension
truth, finite/bounded geometry, no fence/all openings, gate schedules,
SVG parity, measured PDF text bounds and synthetic PDF generation. The
existing npm test list gains this file; existing tests are retained.

- not_run: npm test and npm run build. Parent runs them directly through
  SSH; the task prohibits repeating native runtime diagnosis/repair.
- not_run: actual rendered PDF inspection and iPad/browser interaction.
- Source read failures: assigned-worktree AGENTS.md and HERMES.md missing,
  CMD exit 1. Canonical AGENTS.md/HERMES.md and assigned README were read.
- apply_patch artifact write failed. CMD artifact writing is the authorized
  fallback; no sandbox/security/trust change is part of this candidate.

## Remaining checks

Generate synthetic estimates at heights 3/6/8/12 and invoice cases with
0.1/5000 ft spacing, 100 rails, zero/multiple/standalone gates, two cameras,
multiple runs, zero solid fence and non-Latin names. Inspect every Letter
page at actual size, including financial continuations and footer numbering.
Check iPad popup handling and PDF save/print. Confirm SVG layout in both
fit modes and independent Grok review before integration/publication.

Non-Latin PDF characters use the existing safe replacement policy because
the bundled standard fonts cannot represent all scripts. No structural
approval or code-compliance claim is made.
