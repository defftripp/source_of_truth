import path from "node:path";

/**
 * Parallel DEEP execution is an opt-in proof over the complete frontier.
 * Missing or overlapping claims always fall back to sequential execution.
 *
 * @param {{ ticketId: string, writeLease: string[], contractIds: string[], worktree: string }[]} claims
 */
export function evaluateDeepParallelEligibility(claims) {
  /** @type {Record<string, any>[]} */
  const reasons = [];
  if (!Array.isArray(claims) || claims.length < 2) {
    return sequential([{
      kind: "INSUFFICIENT_FRONTIER",
      values: Array.isArray(claims) ? claims.map((claim) => claim?.ticketId).filter(Boolean) : [],
    }]);
  }

  const ordered = [...claims].sort((left, right) =>
    compareText(left?.ticketId ?? "", right?.ticketId ?? "")
  );
  const ticketIds = new Set();
  for (const claim of ordered) {
    if (!isClaimId(claim?.ticketId) || ticketIds.has(claim.ticketId)) {
      reasons.push({
        kind: "UNPROVEN_TICKET",
        ticketId: claim?.ticketId ?? null,
        values: [],
      });
    } else {
      ticketIds.add(claim.ticketId);
    }
    if (!isUniqueTextList(claim?.writeLease)) {
      reasons.push({
        kind: "UNPROVEN_WRITE_LEASE",
        ticketId: claim?.ticketId ?? null,
        values: Array.isArray(claim?.writeLease) ? claim.writeLease : [],
      });
    }
    if (!isUniqueTextList(claim?.contractIds)) {
      reasons.push({
        kind: "UNPROVEN_CONTRACT",
        ticketId: claim?.ticketId ?? null,
        values: Array.isArray(claim?.contractIds) ? claim.contractIds : [],
      });
    }
    if (typeof claim?.worktree !== "string" || claim.worktree.trim().length === 0) {
      reasons.push({
        kind: "UNPROVEN_WORKTREE",
        ticketId: claim?.ticketId ?? null,
        values: [],
      });
    }
  }

  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const left = ordered[leftIndex];
      const right = ordered[rightIndex];
      addOverlap(
        reasons,
        "WRITE_LEASE_OVERLAP",
        left,
        right,
        left.writeLease,
        right.writeLease,
        normalizedPortableIdentity,
      );
      addOverlap(
        reasons,
        "CONTRACT_OVERLAP",
        left,
        right,
        left.contractIds,
        right.contractIds,
        normalizedPortableIdentity,
      );
      if (
        typeof left.worktree === "string" &&
        typeof right.worktree === "string" &&
        normalizedWorktree(left.worktree) === normalizedWorktree(right.worktree)
      ) {
        reasons.push({
          kind: "WORKTREE_OVERLAP",
          leftTicketId: left.ticketId,
          rightTicketId: right.ticketId,
          values: [left.worktree],
        });
      }
    }
  }

  return reasons.length === 0
    ? { eligible: true, execution: "PARALLEL", reasons: [] }
    : sequential(reasons);
}

/** @param {Record<string, any>[]} reasons */
function sequential(reasons) {
  return { eligible: false, execution: "SEQUENTIAL", reasons };
}

/**
 * @param {Record<string, any>[]} reasons
 * @param {string} kind
 * @param {Record<string, any>} left
 * @param {Record<string, any>} right
 * @param {string[]} leftValues
 * @param {string[]} rightValues
 * @param {(value: string) => string} normalize
 */
function addOverlap(reasons, kind, left, right, leftValues, rightValues, normalize) {
  if (!Array.isArray(leftValues) || !Array.isArray(rightValues)) {
    return;
  }
  const rightSet = new Set(rightValues.map(normalize));
  const values = [
    ...new Set(leftValues.filter((value) => rightSet.has(normalize(value)))),
  ].sort(compareText);
  if (values.length > 0) {
    reasons.push({
      kind,
      leftTicketId: left.ticketId,
      rightTicketId: right.ticketId,
      values,
    });
  }
}

/** @param {string} worktree */
function normalizedWorktree(worktree) {
  const resolved = path.resolve(worktree);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** @param {string} value */
function normalizedPortableIdentity(value) {
  return value.normalize("NFC").toLowerCase();
}

/** @param {unknown} value */
function isUniqueTextList(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    new Set(value).size === value.length &&
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0)
  );
}

/** @param {unknown} value */
function isClaimId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);
}

/** @param {string} left @param {string} right */
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
