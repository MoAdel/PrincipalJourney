# Enhancement Plan — The Principal Software Engineer Journey

> Derived from the Fellow/Dean evaluation (2026-10-10). Goal: close the gap from
> "top-decile where finished" to "top-0.1% uniformly." Ordered by impact ÷ effort.
> Each item has a concrete Definition of Done (DoD) so progress is gateable, not vibes.

---

## Guiding principle

The content is **Principal-grade where it is finished**. The curriculum is judged by its
**weakest, newest sprint** — so the priority is **uniformity and judgment-under-uncertainty**,
not more depth in the already-strong sprints (01–10).

Three themes drive every work item:
1. **Raise the floor** — make every sprint as complete as Sprint 01.
2. **Teach judgment, not answers** — derive numbers, predict before revealing, decide under uncertainty.
3. **Kill the "under construction" tells** — stale roadmap, numbering holes, thin foundation/capstone.

---

## Phase 0 — Hygiene & credibility fixes (days, not weeks)

Cheap, high-trust-impact. Do these first; a sharp reviewer cites them immediately.

- [x] **Regenerate `ROADMAP.md` from the actual 00–14 tree.**
      Currently lists 12 sprints, omits DevOps / AI / Frontend, uses old numbering.
      - DoD: roadmap matches on-disk sprint folders 1:1, including War Room companions.
- [x] **Promote `00-Foundation` to the `NN-` convention and expand.**
      Currently 3 named files (`Mindset.md`, `Environment.md`, `How-To-Study.md`) — breaks the scheme and is too thin to anchor "engineering mindset / RFC-reading discipline."
      - DoD: renamed to `01-…`, `02-…`, `03-…`; add RFC-reading discipline + mental-models chapters.
- [x] **Backfill or hide numbering holes in thin tracks** (`11-DevOps` 02→05; `13-Frontend` missing 05/07/10/11; `14-Principal-Review` missing 04/05/07/08).
      - DoD: either contiguous numbering, OR per-sprint `README.md` manifest drives dashboard navigation so holes are invisible.
- [x] **Add a build-sync CI gate for `content-db.js`.**
      The bundle is auto-generated and currently in sync, but nothing enforces a rebuild after edits.
      - DoD: a check hashes the `.md` set and fails if the bundle is stale.

---

## Phase 1 — Finish the dual track (highest-ROI single initiative)

**Problem:** the signature War Room pattern covers only **3 of 13** technical sprints
(01-WebAPI, 04-Database, 05-Concurrency). Sprints 02, 03, 06–10 have inline `Incident`
chapters but no full SEV-1 companion. Learners feel this as "the course got lazy after Sprint 5."

- [x] Author a `*-WarRoom/` companion for every remaining technical sprint, using the
      canonical arc (see template below).
      - Priority order: **02-Auth → 06-Messaging → 07-Distributed → 08-Cloud → 09-Observability → 03-Storage → 10-System-Design.**
      - DoD per sprint: ≥1 SEV-1 incident following the 6-part arc, ending in a reusable deliverable.

### Canonical War Room template (clone this)
```
# Incident: <evocative name>
> SEV-1 | Env: Prod K8s / ASP.NET Core 9 | Impact: <derived $ / users / SLO burn>
## 1. The 0X:XX AM Briefing      — partial signal only; one misleading metric
## 2. Diagnostic Turn            — 3 code/telemetry snippets; learner commits a hypothesis FIRST
## 3. Deep Internals & Root Cause — mechanics, not just the fix (2nd-order effects)
## 4. Refactor + Before/After Scoreboard
## 5. The Socratic Duel          — 3 aggressive ARB/CTO questions + Principal defenses
## 6. Deliverable: Blameless Post-Mortem (filled from the shared template)
```

---

## Phase 2 — Teach judgment under uncertainty

Separates "memorized the tutorial" from "thinks like a Principal."

- [x] **Replace asserted numbers with derived numbers (Fermi mode).**
      Every big figure (`$1.4M`, `p99 42ms`, `logical reads 42,850`) gets a `📐 Derive It`
      box showing the back-of-envelope, plus a "now change input X — does your decision change?" prompt.
      - DoD: every quantitative claim in War Rooms + Hands-On labs is either derived or labeled illustrative.
- [x] **Add a decision-procedure row to every mitigation table.**
      Not just "use `OPTIMIZE FOR UNKNOWN`" but "how I'd validate this in prod before committing, and the rollback if the distribution shifts."
      - DoD: each mitigation/trade-off table has a "Validation & Rollback" column.
- [x] **Elevate cost to a recurring defense axis** (not just FinOps sidebars).
      - DoD: ≥1 Socratic question per technical sprint of the form "this is correct and we're killing it because it costs $X — defend the 80%-good alternative."

---

## Phase 3 — Delivery-engine upgrades (`dashboard.html` + `content-db.js`)

Feature work, not new curriculum. Reuses the existing progressive-unlock machinery.

- [x] **Predict-before-reveal gate.** Collapsible section: learner commits a hypothesis,
      then the root cause unlocks. (Formalizes "inspect before scrolling.")
      - DoD: War Room section 2 is gated in the dashboard.
- [x] **Animated inline-SVG telemetry.** Render the latency/socket curves crossing the
      failure threshold instead of a static code fence.
      - DoD: ≥1 animated telemetry widget wired to a War Room.
- [x] **Spaced-retrieval quiz mode.** Resurface earlier sprints' Principal/Interview
      questions while the learner is deeper in; reuse the unlock dependency graph.
      - DoD: a flashcard/quiz view that pulls from existing `NN-Principal-Questions` chapters.
- [x] **Back-of-envelope calculator widget** to back the Fermi boxes.

---

## Phase 4 — Close the content blind spots (new sprints, existing taxonomy)

Ranked by how often each actually bites real Principals.

- [x] **New sprint: Zero-Downtime Data Evolution** — expand/contract migrations, backfilling
      billion-row tables without lock escalation (cross-links Sprint 04), dual-write cutover.
      War Room: "the online migration that locked the orders table on Black Friday."
- [x] **New sprint: Multi-Region & Disaster Recovery** — active-active vs active-passive,
      RPO/RTO, consistency sacrificed for 2-region writes (cross-links Sprint 07 CAP/PACELC).
- [x] **Deepen thin spots:** STRIDE/trust-boundary modeling + supply chain (SLSA/SBOM) in the
      security/DevOps tracks; a DATAS-GC *tuning-decision* deep dive (server vs workstation GC
      under cgroup limits — ties to the Exit-137 war room); `System.Threading.Channels` in Messaging.
- [x] **Strengthen the capstone (`14-Principal-Review`, currently the thinnest at 7 files)** —
      it must be where judgment *integrates*, so it needs the most scaffolding, not the least.
      Add influence-without-authority, the align-5-teams doc, disagree-and-commit, sunsetting a system.

---

## Phase 5 — War Room realism

Make the simulations unfold like real incidents.

- [x] **Partial information + a red herring + a timeline** — reveal one metric, let the learner
      form a wrong hypothesis, then reveal the next signal. Teach mis-diagnosis recovery.
- [x] **Executable diagnostic runbooks** — copy-pasteable command sequences
      (`kubectl describe pod`, `ss -s | grep timewait`, `dotnet-counters monitor …`), not quoted prose.
- [x] **Chaos-engineering repro labs** — a minimal `docker-compose` + load script that actually
      reproduces the failure (socket exhaustion, captive-dependency `ConcurrencyDetector` crash)
      and proves the fix holds. Wire to the existing Hands-On archetype.
- [x] **Canonical blameless post-mortem template** — one reusable artifact; every War Room ends
      by filling it out (timeline, impact, detection latency, 5-whys, owners, SLO/alert change).

---

## Shared assets to build once, reuse everywhere

- `templates/WARROOM-TEMPLATE.md` — the 6-part arc above.
- `templates/POSTMORTEM-TEMPLATE.md` — blameless post-mortem.
- `templates/ADR-TEMPLATE.md` — already implicit in WarRoom/01; extract it.
- A `📐 Derive It` box convention + the calculator widget.

---

## Sequencing summary

| Phase | Theme | Effort | Impact | When |
|---|---|---|---|---|
| 0 | Hygiene & credibility | Low | High (trust) | Now |
| 1 | Finish dual track | High | Highest (raises floor) | Next |
| 2 | Judgment under uncertainty | Medium | High (ceiling) | Parallel w/ 1 |
| 3 | Delivery engine | Medium | High (retention) | Parallel w/ 1 |
| 4 | Content blind spots | High | Medium-High | After floor is raised |
| 5 | War Room realism | Medium | High (per incident) | Folds into Phase 1 authoring |

**Rule of thumb:** do Phase 0 immediately, make Phase 1 the main thread, and fold Phases 2/3/5
into each War Room as you author it so quality compounds rather than requiring a later pass.
