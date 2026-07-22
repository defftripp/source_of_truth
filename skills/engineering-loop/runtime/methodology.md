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
separate fresh read-only contexts, runs the full relevant instrumental checks,
and rejects evidence if any ticket's leased tree has changed since its targeted
verification. A successful run creates a terminal evidence commit on the
isolated Run Branch and stops at READY_FOR_HUMAN.

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
