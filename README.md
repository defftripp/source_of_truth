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

Replacing the Global Launcher does not replace that pinned runtime. The full
task lifecycle belongs to later tickets.

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
