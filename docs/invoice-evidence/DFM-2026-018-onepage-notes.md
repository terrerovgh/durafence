# DFM-2026-018 one-page PDF candidate

Prepared for fix/one-page-pdf-DFM-2026-018 at verified base
e265ba6a7cf04e12651a6625b699c3d89c179b88. Patch only; Codex does not apply,
commit, publish, deploy or send mail.

## Layout contract

Both adapters feed renderOnePage in src/pdf/one-page.ts. measureOnePage is
a pure preflight using the same Helvetica metrics as rendering. It tries
the finite comfortable (9 pt), compact (8.5 pt) and dense (7.5 pt) body
profiles. Every text line is measured, wrapped and bounded. No successful
PDF has more than one Letter page, and no content is sliced, abbreviated
or replaced with a summary to make it fit.

A compact branded header and customer band sit above two columns. Native
7.5 pt dimension labels accompany a 248-point technical detail; actual
height, embedment, derived post length, spacing, rails and screws retain
their values. The compact scene reuses validated geometry from fenceScene
and reflows labels rather than scaling large-sheet text. Zero solid fence
has an explicit gate/accessory label. Public SVG stays unchanged.

The left column contains all materials and run/gate dimensions. The right
contains all priced rows, subtotals and applicable totals. Payment rows,
reversal references and unabridged notes, followed by customer terms, use
full width. Footers are measured too. Margins remain 40 pt; no fonts fall
below 7.5 pt. Duplicate public material/group notes are displayed once.
Public documents are titled ESTIMATE; private kind controls its title.
No billing, rate, tax, cents, schema, auth or storage policy changes.

## Overflow and delivery

PdfLayoutOverflowError exports code PDF_LAYOUT_OVERFLOW. Messages
PDF_OVERFLOW_EN and PDF_OVERFLOW_ES are static and contain no customer
data. All profiles must fit before the sole addPage, drawing or save.
Failure returns no bytes, partial file or continuation pages.

Public print closes its blank popup and displays the English error.
Public email returns 422 before address lookup, rate-limit consumption or
provider invocation. Generic PDF/cache failures no longer log raw errors.

Private preview and PDF GET return authenticated/no-store JSON 422 with a
Spanish message. Send checks prior idempotency outcomes, then builds the
complete PDF before reserving invoice_sends. Layout failure cannot reserve
a pending row or consume a send slot. Existing sent/pending outcomes,
atomic reservation and provider idempotency remain intact. Draft storage
and editing do not depend on PDF fit.

Private print opens its popup during the click gesture. Download/print
fetch and validate the saved-revision PDF response before creating a blob
or navigating; overflow closes the popup and surfaces the Spanish error.
The same backend builder supplies preview, print, download and email.

## Validation handoff

Tests added/updated cover one-page builders and both kinds; custom heights;
zero gates/two cameras; multiple runs/two gate types; discount, charge,
deposit, payments/reversal and terms; accessory/gate-only orders; extreme
drawing counts; complete safe text, non-Latin replacement and measured
text/graphic bounds, overlap and minimum fonts. Oversized 40-item,
4000-character term and 1000-payment cases require typed overflow with
zero addPage/save calls and unchanged input. Public/private API tests use
synthetic JWT/SQLite and mocked providers; private overflow must leave no
send ledger row, while the stored draft remains editable. Client helper
tests reject JSON overflow and HTML sessions before returning a blob.

- not_run: npm ci/test/build, Worker dry-run, PDFKit rendering and text
  extraction, real iPad/browser print/download tests and Grok review.
  Parent owns these checks through direct SSH. No native runtime probes,
  repair, installs, security/trust changes or actual mail by Codex.
- Source reads: assigned AGENTS.md and HERMES.md missing (CMD exit 1);
  canonical guidance already read. Branch/base verified via Git metadata
  reads, without invoking Git or changing trust.
- Patch readback and hunk reconstruction are structural checks only, not
  evidence that Node/browser tests passed.

Parent must inspect normal and dense profiles at actual size, verify all
supplied text in generated PDFs and test the iPad popup/error path. The
standard-font safe replacement policy remains; a full Unicode font and
translation of customer content are outside this task.
