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
left unchanged. Parallel timelines, worktree roots, eligibility reasons,
targeted checks, checkpoints, and final verification ordering are durable run
evidence. Protected Integration and Stable branches remain unchanged, and
success still terminates at READY_FOR_HUMAN.
