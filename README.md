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

The Project Runtime manifest pins runtime `1.0.0` and SHA-256 hashes its owned
files. The Upstream Adoption Matrix pins source revisions and checksums and
records license, adoption decision, local delta, compatibility evidence, and an
upgrade procedure; adopted entries also identify the local artifact used for
checksum recomputation. A successful onboarding delegates to the installed runtime's
registered smoke and returns `PREPARED_PROJECT`.

Subsequent runs delegate only to the installed project-local runtime:

```text
node <installed-skill>/scripts/readiness.mjs --explicit --run --target <project>
```

Replacing the Global Launcher does not replace that pinned runtime.

## Mode policy and FAST run contract

The installed Project Runtime accepts an explicit project-relative run request:

```text
node <project>/.engineering/runtime/engine.mjs --run-request <request.json>
```

The schema `1` request supplies a structured Task Profile with `scope`, `risk`,
`ambiguity`, and `reversibility` evidence. File count is not a policy input: a
small cross-file change remains FAST when the evidence is `LOCAL`, `LOW`,
`NONE`, and `EASY`. `MULTI_PART`, `MEDIUM`, `MATERIAL`, or `MODERATE` evidence
establishes at least a STANDARD floor; `SYSTEM`, `HIGH`, or `HARD` evidence
establishes a DEEP floor. Root may provide a `rootEscalation` to raise that mode
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
instrumental checks. STANDARD checks may be inapplicable to FAST and therefore
declare `requiredForFast: false`.

Invocation output always includes the selected mode, deterministic hard floor,
brief rationale, and evidence without requesting routine confirmation. FAST
continues into execution. DEEP returns `MODE_SELECTED` without creating a Run
Branch because its execution lifecycle is a separate contract.

The installed V1 runtime executes blockers-first STANDARD ticket graphs end to end.
STANDARD records evidence-backed repository facts, a spec-lite with falsifiable
acceptance criteria and testing seams, fully covered vertical Execution Tickets,
explicit blocking edges, and strict Advisor approval. Root deterministically
selects the lexicographically first open ticket whose blockers are complete. Each
Worker invocation sees only its ticket-specific durable Context Packet and
exclusive Write Lease, cannot commit through the command guard, and cannot
delegate subagents under its contract.

Root reruns targeted verification immediately before every ticket checkpoint,
records the graph, execution order, attempts, freshness evidence, and checkpoint
commits, then advances to the next frontier without another chat. A repeated
invocation with the same request resumes a non-terminal Run Branch/worktree,
validates its durable request binding and checkpoint, discards the partial
unverified slice, and retries the first admissible ticket. After the graph is
complete, independent Spec and Quality reviews run in fresh read-only processes,
every selected instrumental check completes, and any lease drift since targeted
verification blocks readiness.

Successful STANDARD work receives one Root-owned checkpoint per ticket and a terminal evidence
commit on `run/standard/*`, leaves `develop` and `main` untouched, and stops at
`READY_FOR_HUMAN` without automatic merge.

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
the aggregate diff. It never changes `develop` or `main`, reaches `ACCEPTED`,
pushes, or merges. Failed instrumental verification returns `BLOCKED` and keeps
the release state unreachable.

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
   `schemaVersion: 1` and a non-empty pinned `runtimeVersion`.

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
