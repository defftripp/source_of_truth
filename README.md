# Codex Engineering Loop

This repository contains the explicitly invoked Global Launcher and the ticket
#18 new-project onboarding flow. It installs a self-contained, version-pinned
Project Runtime without choosing or rearranging the application's source layout.

## Install

From a checkout of this implementation branch, install the launcher through the
open `npx skills` ecosystem:

```text
npx skills add . --skill engineering-loop --agent codex --global --copy --yes
```

The installed user-facing entrypoint is `$engineering-loop`. Its metadata
disables model invocation, so ordinary engineering prompts must not start it.

## New-project onboarding

The launcher first performs the read-only readiness probe. For an unprepared new
Target Project, an explicit onboarding run is:

```text
node <installed-skill>/scripts/readiness.mjs --explicit --onboard --target <project>
```

Onboarding creates the hidden `.engineering/` Canonical Project Shell. It owns
runtime files, compact project state, verification registration, context, ADRs,
specs, plans, tickets, and runs. Existing application files and framework-native
layouts remain untouched.

The Project Runtime manifest schema `2` pins runtime `1.1.0`, SHA-256 hashes its
files, and records the ownership/protection policy that authorizes repair.
Legacy schema `1` / runtime `1.0.0` Prepared Projects remain diagnosable, but
their manifests do not grant automatic repair authority. The Upstream Adoption
Matrix pins source revisions and checksums and
records license, adoption decision, local delta, compatibility evidence, and an
upgrade procedure; adopted entries also identify the local artifact used for
checksum recomputation. A successful onboarding delegates to the installed runtime's
registered smoke and returns `PREPARED_PROJECT`.

Subsequent runs delegate only to the installed project-local runtime:

```text
node <installed-skill>/scripts/readiness.mjs --explicit --run --target <project>
```

Replacing the Global Launcher does not replace that pinned runtime.

## Runtime Doctor and repair

Diagnose a Prepared Project without changing its tree:

```text
node <installed-skill>/scripts/readiness.mjs --explicit --doctor --target <project>
```

Doctor validates the complete runtime manifest and ownership policy, recomputes
runtime and adopted-upstream checksums, verifies Prepared Project state and the
registered smoke check, and inspects non-terminal Run State Stores in every
registered worktree. Its result is `READY`, `DEGRADED`, or `BLOCKED`, with
per-file ownership, allowed repair action, durable frontier/checkpoint evidence,
and a separate diagnosis for Remote Checkpoint Sync problems. Missing evidence
never produces `READY`. The Global Launcher executes its own Doctor module and
treats every Target Project runtime file as untrusted data; mutable Target
Project code is never imported during diagnosis or repair.

Preview an eligible repair without mutation, then request it explicitly:

```text
node <installed-skill>/scripts/readiness.mjs --explicit --repair --dry-run --target <project>
node <installed-skill>/scripts/readiness.mjs --explicit --repair --target <project>
```

Automatic repair is limited to unprotected `PROJECT_RUNTIME` files that the
manifest declares generated and whose ownership metadata matches the committed
schema `2` `HEAD` manifest. Before any write, Doctor verifies that the destination and all
ancestors remain inside the real Target Project without links, and that the
declared `HEAD` Git blob deterministically materializes to the manifest
checksum. On Windows, a trusted System32 helper pins the root and destination
ancestors with native handles that deny rename/delete sharing, hashes the exact
regular, non-reparse staging file handle after confirming its final path inside
the staging root, and renames that same handle into the pinned destination
namespace. The renamed handle remains pinned through post-repair path and
checksum verification. Other platforms fail closed at a Human Gate because V1 has no
equivalent exact-source and pinned-namespace replacement primitive. The exact
Git HEAD and its committed ownership manifest are fixed
and rechecked before mutation. Doctor writes only validated bytes and
recomputes all evidence afterward. `USER_OWNED`, `LOCAL_OVERRIDE`, protected,
missing-source, unsafe-path, and target Doctor files without trusted ownership remain
byte-identical and stop at a Human Gate.
Repair does not advance a run: an unfinished run keeps its durable frontier and
the normal project-local Runtime resumes it without chat history. A resumable
diagnosis additionally proves the deterministic execution order, required Run
Artifact semantic contracts, committed immutable artifacts, and review hashes,
plus the registered worktree branch, durable HEAD, and real checkpoint commits.
Remote `PASS` evidence must also name the durable Human Gate commit when the
frontier is a graphless decision or DEEP manifest gate.
Terminal runs prove their committed READY_FOR_HUMAN state and result. A terminal
sync failure remains a resumable Remote Sync Human Gate bound to that readiness
commit. Future ticket contracts must match the latest durable checkpoint plan,
so working-tree edits cannot invent a frontier.
If a committed Human Gate, checkpoint, readiness, or terminal artifact proves
Remote Sync was enabled, deleting the current sync artifact produces the
blocking `REMOTE_SYNC_EVIDENCE_MISSING` diagnosis.
STANDARD decision gates and DEEP Migration
Manifest waiting/approval checkpoints are modeled explicitly; duplicate Run IDs
are blocking evidence.

## Managed Project Runtime upgrade

Preview an upgrade from the installed pinned runtime to the runtime shipped
beside the current Global Launcher:

```text
node <installed-skill>/scripts/readiness.mjs --explicit --upgrade --dry-run --target <project>
```

The preview is read-only. It rejects active non-terminal Engineering Runs,
validates the installed and candidate manifests plus Upstream Adoption
Matrices, reports the exact version and provenance diff, and runs no feature
work. A real upgrade reruns the same gates and executes the candidate smoke in
an isolated temporary Prepared Project before target mutation:

```text
node <installed-skill>/scripts/readiness.mjs --explicit --upgrade --target <project>
```

Removing a runtime path or overwriting a protected/local ownership boundary
returns `HUMAN_GATE` with a canonical hash-bound Migration Manifest. Only the
exact hash may authorize that scope:

```text
node <installed-skill>/scripts/readiness.mjs --explicit --upgrade --approve-hash <sha256> --target <project>
```

A successful transaction writes only declared runtime/state paths, creates a
local upgrade checkpoint commit, then requires a real Doctor result and
registered smoke `PASS`. It returns an external rollback token. Rollback
restores the prior runtime bytes and project state in a new local checkpoint
without changing Application Core files:

```text
node <installed-skill>/scripts/readiness.mjs --explicit --upgrade-rollback <upgrade-rollback-token> --target <project>
```

Upgrade never installs globally, starts a feature Engineering Run, pushes,
merges, force-pushes, or deploys.
Mutation fails closed unless the platform provides the handle-pinned namespace
transaction (currently trusted System32 Windows PowerShell); preview remains
read-only.

## Mode policy and FAST run contract

The installed Project Runtime accepts an explicit project-relative run request:

```text
node <project>/.engineering/runtime/engine.mjs --run-request <request.json>
```

The schema `1` request supplies a structured Task Profile with `scope`, `risk`,
`ambiguity`, `reversibility`, and an optional `hardToReverseProfile`. File count is not a policy input: a
small cross-file change remains FAST when the evidence is `LOCAL`, `LOW`,
`NONE`, and `EASY`. `MULTI_PART`, `MEDIUM`, `MATERIAL`, or `MODERATE` evidence
establishes at least a STANDARD floor; `SYSTEM`, `HIGH`, or `HARD` evidence
establishes a DEEP floor. `SECURITY`, `PAYMENTS`, `DESTRUCTIVE_MIGRATION`, and
`OTHER_HARD_TO_REVERSE` profiles also establish a DEEP floor regardless of the
generic evidence. Root may provide a `rootEscalation` to raise that mode
only when it records concise evidence, and can never select below the computed
hard floor.

Every request also names the `develop` Integration Branch and `main` Stable
Branch; declares an exact canonical POSIX, base-relative Application Core
`writeLease` (never `.engineering` or `.git`); and references only command IDs
already registered in `.engineering/verification/registry.json`. The request
contains no shell command text.

FAST references implementation, focused-test, Quality Review, and relevant
instrumental checks. Instrumental registry entries declare `requiredForFast`;
every required `test`, `typecheck`, `build`, and `observed-behavior` check must
be selected. STANDARD instead references research, Planner, Advisor, Worker,
ticket-verification, Spec Review, Quality Review, and the full relevant
instrumental checks. When a Solution Fitness trigger is active, it additionally
references separate registered `fitness-version`, `fitness-documentation`, and
`solution-fitness` commands. STANDARD checks may be inapplicable to FAST and
therefore declare `requiredForFast: false`.

Invocation output always includes the selected mode, deterministic hard floor,
brief rationale, and evidence without requesting routine confirmation. FAST
continues into execution. A DEEP request supplies the planned-run contract plus
required high-risk evidence IDs; it executes on an isolated `run/deep/*` branch.

DEEP uses the same state machine, ticket graph, bounded Worker, Root checkpoint,
durable local resume, independent review, instrumental verification, and Git
safety contracts as STANDARD. Before planning, research must link every required
high-risk fact to named domain boundaries. Root records the related decisions in
canonical `.engineering/CONTEXT.md` and `.engineering/adrs/` entries before the
Planner adds a dependency graph, migration contract, rollback plan, and
destructive Migration Manifest. The plan must reference exactly the researched
domain boundaries, and manifest source/destination paths must equal the Worker's
Write Lease. The runtime recomputes the manifest hash from the complete action
scope, durably pauses at the shared Human Gate, and resumes only when
`--human-answer` supplies that exact hash against the same request binding. Any
changed scope stops before Advisor and Worker.
Missing mandatory evidence produces terminal `BLOCKED`, never a degraded
success. A successful one-ticket DEEP run passes fresh Spec and Quality reviews,
reruns every selected instrumental check, and stops at `READY_FOR_HUMAN` with
`accepted: false`.

For a multi-ticket DEEP frontier, parallel execution is denied unless every
ticket declares a non-empty `contractIds` set and the runtime proves pairwise
disjoint Write Leases, contract IDs, and Worker worktree roots. Eligible Workers
start from the same accepted Root checkpoint in distinct detached worktrees and
may neither commit, integrate, nor delegate. Any missing proof, Write Lease
overlap, or contract overlap automatically selects sequential execution.

Root accepts isolated results one at a time without `git merge`, reruns the
ticket's targeted verification, and creates the next checkpoint only after that
verification passes. The complete batch is preflighted against one accepted
Root state before the first integration; pending results are revalidated before
each checkpoint. Runtime-owned stale Worker worktrees from an interrupted batch
are removed and verified before a deterministic relaunch.
`parallel-execution.json` preserves eligibility reasons,
Worker intervals and worktree roots, ordered Root integrations, targeted-check
status, checkpoint commits, and final full-verification ordering. A forbidden
Git action, out-of-lease result, divergence, or integration conflict creates
`corrective-work.json` with terminal `BLOCKED`; no result from that failed batch
is silently merged and the last accepted Root HEAD remains unchanged.
`develop` and `main` remain protected, and successful execution still stops at
`READY_FOR_HUMAN` with `accepted: false`.

The installed V1 runtime executes blockers-first STANDARD ticket graphs end to end.
STANDARD records evidence-backed repository facts, a spec-lite with falsifiable
acceptance criteria and testing seams, fully covered vertical Execution Tickets,
explicit blocking edges, and strict Advisor approval. Root deterministically
selects the lexicographically first open ticket whose blockers are complete. Each
Worker invocation sees only its ticket-specific durable Context Packet and
exclusive Write Lease, cannot commit through the command guard, and cannot
delegate subagents under its contract. The command guard also records and
rejects forbidden Git commands launched by a nested Worker process.
Root also rejects explicit subagent-attempt, partial-result, and
ticket/code-conflict findings, scope expansion, unrelated dirtiness, and
failing or stale targeted evidence. Every rejection restores the accepted
application state, creates bounded `worker-rejection.json` evidence without raw
Worker output, and terminates `BLOCKED` before a checkpoint. A corrected rerun
starts the same ticket with a fresh Context Packet and must earn fresh green
targeted evidence.

Before Worker execution, Planner and Advisor may perform at most two bounded
evaluation rounds. Advisor returns strict actionable `REVISE` findings for
unmapped acceptance criteria, missing verification, unsafe dependencies,
unsupported assumptions, or scope expansion. A corrected second-round plan may
continue; two unresolved rounds persist `advisor-rounds.json` and a Human Gate,
then terminate the Run State Store as `BLOCKED` with zero Worker executions.
Generic feedback and fabricated `APPROVED` results fail the Advisor schema.

If repository research leaves one real STANDARD decision unresolved, the run
stops before spec, planning, and Worker execution with one durable Human Gate.
`human-gate.json` records the evidence-backed fact IDs, one recommended answer,
and consequences for each alternative. Repository facts cannot be rephrased as
questions; Explorer marks every fact with the exhaustive decision IDs it
resolves. The waiting gate receives a Root checkpoint and, when sync is enabled,
can be restored by a fresh clone before any ticket exists. Reinvocation with the matching human answer resumes the same run;
the answer does not change request identity, while remote sync settings and all
other request fields remain immutable. Root updates `.engineering/CONTEXT.md`
idempotently and creates an ADR only for a surprising hard-to-reverse choice.

```text
node .engineering/runtime/engine.mjs --run-request request.json --human-answer DECISION-ID=answer
```

Root reruns targeted verification immediately before every ticket checkpoint,
records the graph, execution order, attempts, freshness evidence, and checkpoint
commits, then advances to the next frontier without another chat. A repeated
invocation with the same request resumes a non-terminal Run Branch/worktree,
validates its durable request binding and checkpoint, discards the partial
unverified slice, and retries the first admissible ticket. After the graph is
complete, independent Spec and Quality reviews run in fresh read-only processes
with distinct role packets. Both results must contain exact coverage, evidence,
unverified areas, and an explicit blocking-finding list; an empty or generic
PASS is rejected.

Each blocking finding becomes exactly one bounded corrective Execution Ticket
in the existing `ticket-graph.json`. The ticket records its immutable source
finding, blockers, Write Lease, context, and targeted verification contract.
Root executes corrections through the same deterministic frontier, Worker,
targeted verification, durable checkpoint, and resume machinery. No corrective
executor exists. Corrections are sequential unless DEEP's existing guarded
eligibility proof establishes disjoint leases, contracts, and worktrees.
`corrective-work.json` and graph review history preserve finding-to-ticket
links, while numbered rerun artifacts leave the original Spec and Quality
artifacts byte-identical.

After the last correction, both reviews run again before full relevant
instrumental verification. Final review and verification fingerprints must
match the last Application Core code state, and every ticket's non-superseded
lease must still match its targeted evidence. Failing tests, typecheck, build,
or observed behavior override a positive reviewer verdict. Missing reruns,
stale evidence, or any instrumental failure blocks readiness.

Solution Fitness is conditional, not routine ceremony. A planned request may
declare an explicit `fitness.triggers` matrix for repository precedent,
dependency API use, and substantial complexity. With all triggers false (or no
Fitness request), the runtime invokes no provider and creates no Fitness
artifact. With any trigger true, Root executes registered read-only providers
in this exact order:

1. detect the actually installed dependency version;
2. obtain matching primary documentation, preferring Context7 for
   version-sensitive evidence while accepting direct official documentation;
3. compare local repository patterns, documented built-ins, viable
   alternatives, measured complexity, and task fit;
4. validate the evidence-backed verdict.

Only the compact validated `solution-fitness.json` is durable. Provider payloads
and command inputs stay transient. Documentation for another version,
best-practice opinion without evidence, and any verdict without instrumental or
primary-source support are rejected fail-closed. A low-risk dependency evidence
gap is explicit `DEGRADED`. Context7 unavailability with sufficient official
primary evidence is also `DEGRADED`; missing mandatory primary evidence for any
high-risk trigger yields `BLOCKED`.

An intentionally custom solution receives a blocking finding when matching
primary documentation proves that the installed version has a simpler viable
built-in. That finding becomes a bounded corrective ticket through the same
loop as Spec and Quality findings. After correction, numbered Fitness, Spec,
and Quality artifacts are regenerated against the new code fingerprint before
full relevant verification. `PASS` and evidence-sufficient `DEGRADED` may reach
`READY_FOR_HUMAN`; neither implies `ACCEPTED`, merge, or push.

Capability discovery is also conditional. An ordinary FAST, STANDARD, or DEEP
run has no discovery or installation stage. Only a structured gap that names
the missing behavior, task evidence, and each inspected project/runtime
capability with a concrete insufficiency may enter qualification.

An already prepared project qualifies a quarantined candidate explicitly:

```text
node .engineering/runtime/engine.mjs --qualify-capability capability-request.json
```

The request evaluates the candidate's kind, verified HTTPS provenance and
source, license, immutable revision and checksum, permissions, lifecycle
scripts, instruction compatibility, maintenance evidence, conflicts, and exact
task fit. Unknown sources, conflicting instructions, lifecycle scripts,
excessive permissions, unresolved conflicts, or incomplete evidence return
`REJECTED` before installation. Candidate input is staged under
`.engineering/capability-candidates/<id>`; accepted files are copied only to
`.engineering/capabilities/<id>`, pinned in the project-local registry, and
checked by a non-executing package-content assertion resolved from the project
verification registry before publication. The candidate cannot supply its path
or expected content. That assertion is bound to the gap's verification
evidence; it does not claim to execute or prove the missing behavior. Candidate-provided
executable smoke is rejected, so qualification cannot make network or paid
probes. Doctor verifies the exact registered file manifest and rejects drift,
links, missing files, and undeclared files. A project-local lock serializes
qualification. A failed smoke restores the registry and project tree exactly;
an interrupted publish is recovered only from a journal matching the exact
registry and installed-file identities.

Global installation, credential access, write-enabled MCP, and paid probes are
never automatic. Any such request writes a bounded hash-bound artifact under
`.engineering/capabilities/human-gates/`, returns `HUMAN_GATE`, and performs no
external action.

## V1 qualification suite

Run the reproducible black-box qualification from the repository root:

```text
npm run qualify
```

The command invokes pinned public launcher/runtime tests for the mandatory
project-state fixtures, adversarial scenarios, and deterministic component
contracts. It writes only a bounded redacted report to
`.engineering/qualification/v1-report.json`; child stdout/stderr, raw provider
payloads, and chat transcripts are never persisted. Every mandatory result,
the Windows platform smoke, and the report deny-list scan must pass or the
command exits non-zero with `BLOCKED`. Linux execution is recorded as an
explicit V1 limitation rather than fabricated evidence. Each temporary
black-box repository emits only a bounded scan summary before cleanup; staged
Run Artifacts and checkpoint history are scanned, while pre-Git bootstrap
fixtures are recorded explicitly as `NOT_APPLICABLE`.

## V1 acceptance lifecycle

Run the real acceptance lifecycle from the repository root:

```text
npm run accept
```

The command prepares a temporary Target Project, classifies and executes a
STANDARD graph, interrupts after a durable remote checkpoint, resumes from a
fresh clone without chat history, converts one blocking review finding into a
controlled correction, reruns reviews and instrumental checks, and safely
synchronizes only the Run Branch. It writes a bounded report with
`manualReview: PENDING`, prints its SHA-256 review hash, and exits `2` at the
independent maintainer gate. After manually inspecting that exact report, the
maintainer binds the approval to the printed hash:

```text
node skills/engineering-loop/scripts/accept.mjs --target . --finalize-redaction <pending-report-hash>
```

Finalization refuses a changed report, reruns the automated deny-list, and
atomically records the manual review. The resulting report at
`.engineering/acceptance/v1-run-report.json` must terminate at
`READY_FOR_HUMAN` with `accepted: false`. Neither phase merges `develop` or
`main`, deploys, closes the parent specification, or marks the run `ACCEPTED`.

Remote Checkpoint Sync is off by default. A STANDARD request opts in explicitly:

```json
{
  "settings": {
    "remoteCheckpointSync": {
      "enabled": true,
      "remote": "origin"
    }
  }
}
```

When enabled, Root fetches remote state before each publication and pushes only
the exact current `run/standard/*` refspec. It never pushes `develop` or `main`,
never force-pushes, and never merges. Remote divergence or a rejected update
returns a non-terminal `HUMAN_GATE`, records the local and remote heads in
`remote-sync.json`, writes the shared `human-gate.json` contract, and leaves both
histories intact. On another machine, the
same request fetches a matching non-terminal remote Run Branch, validates its
request hash, base commit, Run State Store, and ticket graph, recreates the Run
worktree, and resumes the deterministic frontier without chat history.

Successful STANDARD work receives one Root-owned checkpoint per ticket and a terminal evidence
commit on `run/standard/*`, leaves `develop` and `main` untouched, and stops at
`READY_FOR_HUMAN` without automatic merge. Opt-in sync records compact
checkpoint evidence and does not change `accepted: false` or transition the run
to `ACCEPTED`.

The runtime requires a clean prepared Git repository, creates an isolated
`run/fast/*` branch and sibling worktree, and executes registered commands with
the worktree as their fixed working directory. FAST omits interview, spec, and
ticket planning, but requires the focused test, an evidence-bearing Quality
Review, and every relevant test, typecheck, build, or observed-behavior check to
pass. Quality Review persists compact evidence IDs rather than review output.
A reviewer PASS cannot override a failing instrumental check. Before staging,
the runtime rejects changes outside the exact Write Lease and generated Run
Artifacts, then applies an artifact filename/schema deny scan so source copies,
raw logs, secrets, command output, and chat transcripts cannot be committed as
run evidence.

Registry command IDs are unique compact evidence IDs, and every instrumental
entry explicitly declares whether it is required for FAST. External commands
receive a shadow Git directory, baseline-seeded index, and quarantined object
store: Git reads describe the real Run worktree, while ordinary Git writes can
change only disposable shadow refs, reflogs, index, and objects. Root checks the
shadow history together with the real Run Branch, protected refs, and original
Integration worktree branch/status after every command. Unauthorized changes
are restored to the exact captured clean baseline before a structured block;
only Root may stage or create Run Branch commits.
Changed paths are compared with the original Integration Branch commit, so a
command cannot hide an out-of-lease change in its own commit. Run Artifacts must
also match the exact stage-specific filename set and expected structured
content; missing or forged evidence blocks readiness.
Unexpected artifact files or directories are removed from the generated run
area before the runtime records a compact structured `BLOCKED` result. Durable
diff evidence stores structured base/head/file fields only; human-facing
command output such as `git diff --stat` is not committed.
After staging, the exact artifact set/content is verified from the Git index,
and every leased blob must still match the worktree content that verification
observed. Root commits use an isolated empty hooks path, and each committed tree
must equal the validated index tree, so clean filters or repository hooks cannot
replace validated evidence.

Successful work receives a Root-owned checkpoint commit and a terminal
evidence commit on the Run Branch. Compact structured artifacts are stored in
`.engineering/runs/<run-id>/`, and the command returns `READY_FOR_HUMAN` with
the aggregate diff. It never changes `develop` or `main`, reaches `ACCEPTED`, or
merges. It pushes only the current Run Branch when Remote Checkpoint Sync was
explicitly enabled. Failed instrumental verification returns `BLOCKED` and
keeps the release state unreachable.

## Legacy normalization proposal

For an existing Target Project, request a read-only Migration Manifest before
any normalization:

```text
node <installed-skill>/scripts/readiness.mjs --explicit --normalize --target <project>
```

The result is `NORMALIZATION_PROPOSED` with a complete inventory, detected
conventions and Application Core, explicit `KEEP`, `CREATE`, `MOVE`, `REWRITE`,
`DELETE`, and `PROTECT` action contracts, rollback guidance, and a deterministic
SHA-256 hash bound to the proposed action scope. Sensitive, ambiguous, and
deliberate local paths default to `PROTECT`. The command does not write the
manifest or otherwise modify the Target Project. Non-directory ancestor
conflicts suppress unsafe descendant `CREATE` actions and are recorded for
review.

## Apply and rollback a legacy migration

Save the exact proposed `manifest` object, review it, and approve its printed
hash explicitly:

```text
node <installed-skill>/scripts/readiness.mjs --explicit --apply-manifest <manifest.json> --approve-hash <sha256> --target <project>
```

Apply validates the manifest schema, canonical hash, current source hashes,
destinations, and complete action set before its first mutation. It executes
only listed `CREATE`, `MOVE`, `REWRITE`, and `DELETE` actions while enforcing
`KEEP` and `PROTECT` content hashes. Rewrite content is base64 encoded and its
SHA-256 digest participates in the manifest hash.

An optional one-time override document is passed with `--overrides <file>`. It
uses schema `1`, binds itself to the exact `manifestHash`, and lists exact
existing manifest paths plus replacement actions. It cannot introduce a
neighboring path. Successful application reruns readiness and installed-runtime
smoke, returns `PREPARED_PROJECT`, and includes a `rollbackToken`.

```text
node <installed-skill>/scripts/readiness.mjs --explicit --rollback <rollback-token> --target <project>
```

Rollback restores moved, rewritten, and deleted content and removes paths that
the manifest created. A post-apply readiness or smoke failure triggers the same
rollback automatically before returning failure.

## Readiness evidence

The launcher checks, without mutation:

1. the Target Project is an accessible directory;
2. `.engineering/` exists as a directory;
3. `.engineering/runtime/manifest.json` is valid JSON declaring
   supported `schemaVersion: 1` or `schemaVersion: 2` and a non-empty pinned
   `runtimeVersion`.

An empty project returns `ONBOARDING_REQUIRED` with exit code `0` without
mutation unless onboarding was explicitly selected.

## Verify

```text
npm install
npm run verify
```

The verification suite includes schema and checksum contracts, legacy layout
inventory and no-mutation checks, adversarial protection, new-project structure
preservation, black-box delegation and version isolation, metadata and
negative-invocation checks, an isolated real `npx skills` global-install smoke,
and a platform smoke. Windows is mandatory for V1.
