# Adopted methodology

The Project Runtime keeps implementation work bounded by explicit acceptance
criteria, verifies behavior at public seams, and stops before human acceptance.

STANDARD begins with evidence-backed repository research, then creates a
spec-lite and one or more vertical Execution Tickets with explicit blocking
edges. Every acceptance criterion maps to exactly one ticket and registered
verification before an evidence-bearing Advisor APPROVED result releases the
graph. Root chooses the lexicographically first open ticket whose blockers are
complete. Each Worker invocation receives only that ticket's Context Packet and
exclusive Write Lease; Root remains the sole committer.

Planner and Advisor have at most two evaluation rounds. Advisor `REVISE`
findings are strict, actionable, and evidence-bound: unmapped acceptance,
missing verification, unsafe dependencies, unsupported assumptions, and scope
leaks cannot become approval. A corrected second round may proceed; a second
unresolved round records the findings in a Human Gate and terminates `BLOCKED`
before Worker execution.

When repository research leaves one real product decision unresolved, STANDARD
persists exactly one `human-gate.json` after `research.json` and before spec,
planning, or Worker execution. The question carries one recommendation and the
consequence of every alternative. Facts explicitly resolved by repository
evidence fail the question audit instead of being asked; every research fact
must provide an exhaustive (possibly empty) list of decision IDs it resolves.
A human answer is
mutable resume input and is excluded from the request binding; task evidence,
repository branches, contracts, commands, Write Lease, and Remote Checkpoint
Sync settings remain immutable. Root resumes the same Run Branch, records the
answer once in `CONTEXT.md`, and creates an ADR only when the decision is both
hard to reverse and surprising.

The waiting decision gate itself is a Root-owned checkpoint. With Remote
Checkpoint Sync enabled, that checkpoint is published to the Run Branch before
the pause, so a fresh clone can validate the gate, recreate the worktree, accept
the transient answer, and continue without a ticket graph or chat history.

Root reruns targeted verification immediately before every ticket checkpoint,
persists the graph, evidence, execution order, attempts, and checkpoint commits,
then advances to the next frontier without another chat. Non-terminal state is
written atomically in the Run worktree. After a process restart, Root validates
the request binding and durable graph, discards the partial unverified slice,
and retries the first admissible frontier ticket.

Remote Checkpoint Sync is disabled unless the run request explicitly enables
`settings.remoteCheckpointSync` and names a Git remote. When enabled, Root
fetches before publication and pushes an exact current-Run-Branch refspec only
when the observed remote head is an ancestor of the verified local checkpoint.
It never targets the Integration or Stable branch, never force-pushes, and
never merges. A rejected or divergent update records a compact blocker and
stops at a non-terminal Human Gate with both histories intact. A fresh machine
may fetch a matching non-terminal Run Branch, validate its request hash, base
commit, state, and ticket graph, then recreate the local worktree and continue
the deterministic frontier without chat history.

Decision and remote-divergence pauses share the same durable Human Gate schema
and non-terminal report contract. Remote sync retains its compatible blocker and
sync evidence fields while exposing the same single-question structure.

Runtime Doctor is a separate deterministic diagnosis/repair contract. Diagnosis
and repair dry-run recompute manifest, ownership, checksum, Prepared Project,
Run State Store, frontier, checkpoint, and Remote Checkpoint Sync evidence
without mutation. READY requires complete evidence; repairable drift and a
resumable unfinished run are DEGRADED; missing evidence, forbidden ownership,
and sync Human Gates are BLOCKED.

Runtime manifest schema 2 pins runtime 1.1.0 and carries the explicit
ownership/protection policy required for automatic repair. Schema 1 / runtime
1.0.0 Prepared Projects remain readable and may be READY when their legacy
evidence is complete, but their missing ownership policy cannot authorize an
automatic write.

An explicit repair first validates every proposed write against the manifest.
Only unprotected PROJECT_RUNTIME files declared generated may use the declared
HEAD Git blob, the ownership metadata must match the committed HEAD manifest,
and the deterministic materialized bytes must independently match the manifest
SHA-256 before writing. Every destination ancestor must remain a real directory
inside the Target Project. Replacement bytes are staged in a sibling directory
whose filesystem device matches the Target Project; open handles pin every
destination ancestor while manifest, path, and content identities are rechecked
immediately before the rename, then path/checksum evidence is checked again
afterward. On Windows, the trusted System32 helper keeps the root and ancestors
pinned with native handles that deny rename/delete sharing, opens and hashes the
exact regular, non-reparse staging file handle after confirming its final path
inside the staging root, and renames that same handle into the pinned destination
namespace. That renamed handle remains pinned until the post-repair path and
checksum verification completes. The exact HEAD ownership contract is fixed and
rechecked after pinning. Other platforms fail closed before mutation because the V1
runtime does not expose an equivalent exact-source and pinned-namespace
replacement primitive.
USER_OWNED, LOCAL_OVERRIDE, protected, unsafe-path, and target Doctor files
without trusted ownership are never executed or repaired automatically. The
Global Launcher executes its own Doctor module instead of importing mutable
Target Project code.
Post-repair evidence is recomputed from disk. Repair never advances run state:
the durable graph and checkpoint frontier remain owned by the normal resume
lifecycle, which continues without chat history. Resumability requires the
engine's deterministic execution order, required Run Artifact semantic
contracts, committed immutable artifacts, review hashes, registered worktree
branch, durable HEAD, and real ordered checkpoint commits. STANDARD decision
gates and DEEP Migration Manifest
waiting/approval checkpoints remain resumable; duplicate Run IDs are blocking
evidence. Remote PASS for either Human Gate also proves the durable gate commit,
not only the preceding ticket checkpoint list. Terminal runs prove their
readiness commit, state, and result; terminal sync failures keep that commit as
the resumable Remote Sync frontier. Immutable ticket contracts in the working
graph must match the latest durable checkpoint graph.
When a durable Human Gate, checkpoint, readiness, or terminal artifact proves
Remote Sync was enabled, the corresponding current `remote-sync.json` is
required; absence is a blocking sync problem.

Once the graph is complete, Root executes Spec Review and Quality Review in
separate fresh read-only contexts with different role packets. Every result
must declare complete requirement coverage, concrete evidence, unverified
areas, and blocking findings; a generic or empty PASS is invalid. Tests,
typecheck, build, and observed behavior always outrank reviewer verdicts.

Before those reviews, Root runs Solution Fitness only when an explicit trigger
matrix records repository precedent, dependency API use, or substantial
complexity. Ordinary local work has no Fitness artifact and invokes no Fitness
provider. Triggered checks use three registered read-only commands in a fixed
order: detect the actually installed dependency version, obtain matching
primary documentation, then compare the solution with local patterns,
documented built-ins, viable alternatives, measured complexity, and task fit.
Context7 is the preferred provider for version-sensitive evidence; direct
official documentation is also primary evidence. Provider I/O is transient and
only the compact validated `solution-fitness.json` is durable.

The deterministic Fitness contract performs no network calls. It rejects
documentation for a different installed version, abstract best-practice claims,
and any PASS, DEGRADED, or BLOCKED verdict unsupported by instrumental or
primary-source evidence. A simpler viable built-in or an evidence-backed task
misfit blocks an intentionally custom solution. A low-risk dependency evidence
gap is explicit DEGRADED; missing mandatory primary evidence for any high-risk
trigger blocks fail-closed. Context7 unavailability is DEGRADED when sufficient
official primary evidence remains, including for high-risk work. DEGRADED never
substitutes for missing mandatory high-risk evidence.

Each blocking finding is mapped one-to-one to a bounded corrective Execution
Ticket containing its immutable source finding, blockers, Write Lease, context,
and targeted verification contract. Root appends those tickets to the same
durable graph and executes them through the existing deterministic frontier,
Worker, targeted verification, and checkpoint lifecycle. Corrections carry no
parallel proof by default, so DEEP serializes them unless the guarded
eligibility contract independently proves disjoint leases, contracts, and
worktrees. Original review artifacts remain byte-identical; graph review
history links every finding to its corrective ticket.

After the last correction, Root reruns triggered Solution Fitness and fresh Spec
and Quality reviews, then runs every full relevant instrumental check. Fitness,
review, and verification code fingerprints must match the final Application
Core after the last checkpoint; stale evidence is BLOCKED. A successful run
creates a terminal evidence commit on the isolated Run Branch and stops at
READY_FOR_HUMAN.

DEEP is a hard floor for security, payments, destructive migrations, and other
explicitly hard-to-reverse profiles. It extends this same planned-run state
machine rather than introducing another executor. Repository research must link
all mandatory high-risk evidence to domain boundaries. Root then persists the
related decisions in canonical `.engineering/CONTEXT.md` and
`.engineering/adrs/` records before specification and planning.

Before Advisor approval, the DEEP Planner must provide the ticket dependency
graph, migration preconditions and postconditions, rollback triggers, rollback
steps and verification, plus a destructive Migration Manifest. The plan's domain
references must exactly match the researched boundaries, and the manifest's
source/destination paths must exactly match the Worker Write Lease. Human
approval uses the shared durable Human Gate: the run checkpoints the proposed
scope, pauses, and resumes only for the exact canonical manifest action hash
bound to the same request. Missing high-risk evidence blocks the run; an
incomplete plan is REVISE; and changed destructive scope
blocks before Advisor or Worker. Successful DEEP work uses the inherited Worker
guard, Root checkpoints, durable local resume, independent reviews, final
instrumental verification, and READY_FOR_HUMAN terminal gate.

A multi-ticket DEEP frontier is parallel only after the dedicated eligibility
validator proves that every Worker has a distinct worktree and that all declared
Write Leases and contract IDs are pairwise disjoint. Missing contract claims or
any overlap selects the existing sequential executor automatically. Eligible
Workers start together from one accepted checkpoint in detached worktrees.
They receive bounded packets, cannot commit, integrate, or spawn subagents, and
return uncommitted leased results to Root.

Root validates the complete batch before accepting any result, then applies
each result in deterministic ticket order without merging. It reruns targeted
verification before each Root-owned checkpoint and runs full relevant
verification only after the final accepted integration. Pending results are
revalidated against their common accepted base before a checkpoint; interrupted
runtime-owned Worker worktrees are discarded and verified absent before the
batch is relaunched. Worker authority
violations and divergent, conflicting, or out-of-lease results create BLOCKED
corrective work; silent merge is forbidden and the accepted integration HEAD is
left unchanged. The same fail-closed contract applies to sequential STANDARD
Workers, explicit subagent-attempt or partial-result findings, ticket/code
conflicts, unrelated dirty state, and failing or stale targeted evidence.
Rejection evidence contains only ticket IDs, a bounded reason, and the accepted
HEAD; it never stores raw Worker output or transcripts. A corrected rerun uses a
fresh Context Packet before the same ticket can earn a checkpoint. Parallel
timelines, worktree roots, eligibility reasons,
targeted checks, checkpoints, and final verification ordering are durable run
evidence. Protected Integration and Stable branches remain unchanged, and
success still terminates at READY_FOR_HUMAN.

## Project Runtime upgrade

Runtime upgrade is a separate explicit launcher operation, never a phase inside
an active feature Engineering Run. The launcher compares the committed
installed runtime and Upstream Adoption Matrix with its own pinned candidate,
validates every candidate checksum and provenance field, and runs compatibility
plus the registered smoke in an isolated temporary Prepared Project before
target mutation.

Removal and ownership-boundary rewrites produce the shared canonical
hash-bound Migration Manifest and stop at a Human Gate. An accepted
non-conflicting or exactly approved upgrade writes only declared runtime and
project-state paths, records a local checkpoint commit, and requires Doctor and
smoke PASS afterward. Its external rollback journal contains only runtime/state
bytes and restores them in a new checkpoint; Application Core paths, feature
run state, global installations, remote refs, merges, and deployment are
outside upgrade authority.
Mutation fails closed when the platform lacks the trusted handle-pinned
namespace transaction; read-only candidate inspection remains available.
