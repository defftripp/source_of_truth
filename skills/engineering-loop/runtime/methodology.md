# Adopted methodology

The Project Runtime keeps implementation work bounded by explicit acceptance
criteria, verifies behavior at public seams, and stops before human acceptance.

STANDARD begins with evidence-backed repository research, then creates a
spec-lite and one minimal vertical Execution Ticket. Every acceptance criterion
must map to that ticket and to registered verification before an evidence-bearing
Advisor APPROVED result can release one bounded Worker. The Worker receives only
its Context Packet and exact Write Lease; Root remains the sole committer.

Root reruns ticket verification, executes Spec Review and Quality Review in
separate fresh read-only contexts, runs the full relevant instrumental checks,
and rejects evidence if the leased tree has changed since ticket verification.
A successful run creates Root-owned checkpoint and terminal evidence commits on
an isolated Run Branch and stops at READY_FOR_HUMAN.
