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

## FAST run contract

The installed Project Runtime accepts an explicit project-relative run request:

```text
node <project>/.engineering/runtime/engine.mjs --run-request <request.json>
```

The schema `1` request describes a `LOCAL`, `LOW` risk, unambiguous, easily
reversible task; names the `develop` Integration Branch and `main` Stable
Branch; declares an exact canonical POSIX, base-relative Application Core
`writeLease` (never `.engineering` or `.git`); and references
implementation, focused-test, Quality Review, and full relevant-check IDs
already registered in `.engineering/verification/registry.json`. Instrumental
registry entries use `requiredForFast: true`; every required `test`, `typecheck`,
`build`, and `observed-behavior` check must be present in the request. The
request contains no shell command text. Other task profiles are rejected by the
current FAST-only contract.

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
