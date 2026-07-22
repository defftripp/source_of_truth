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

Once the graph is complete, Root executes Spec Review and Quality Review in
separate fresh read-only contexts, runs the full relevant instrumental checks,
and rejects evidence if any ticket's leased tree has changed since its targeted
verification. A successful run creates a terminal evidence commit on the
isolated Run Branch and stops at READY_FOR_HUMAN.
