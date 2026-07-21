/** @typedef {"FAST" | "STANDARD" | "DEEP"} RunMode */
/** @typedef {"scope" | "risk" | "ambiguity" | "reversibility"} TaskEvidenceField */
/** @typedef {{ mode?: unknown, evidence?: unknown }} RootEscalation */

/** @type {readonly TaskEvidenceField[]} */
export const TASK_PROFILE_EVIDENCE_FIELDS = Object.freeze([
  "scope",
  "risk",
  "ambiguity",
  "reversibility",
]);

const MODES = Object.freeze(["FAST", "STANDARD", "DEEP"]);
const ALLOWED_EVIDENCE = Object.freeze({
  scope: Object.freeze(["LOCAL", "MULTI_PART", "SYSTEM"]),
  risk: Object.freeze(["LOW", "MEDIUM", "HIGH"]),
  ambiguity: Object.freeze(["NONE", "MATERIAL"]),
  reversibility: Object.freeze(["EASY", "MODERATE", "HARD"]),
});

/**
 * @param {{ scope?: unknown, risk?: unknown, ambiguity?: unknown, reversibility?: unknown }} task
 * @param {RootEscalation | undefined} [rootEscalation]
 */
export function classifyTaskProfile(task, rootEscalation) {
  for (const field of TASK_PROFILE_EVIDENCE_FIELDS) {
    if (!ALLOWED_EVIDENCE[field].includes(/** @type {never} */ (task[field]))) {
      throw new Error(`task.${field} must be supported Task Profile evidence.`);
    }
  }
  /** @type {RunMode} */
  let hardFloor = "FAST";
  if (task.scope === "SYSTEM" || task.risk === "HIGH" || task.reversibility === "HARD") {
    hardFloor = "DEEP";
  } else if (
    task.scope === "MULTI_PART" ||
    task.risk === "MEDIUM" ||
    task.ambiguity === "MATERIAL" ||
    task.reversibility === "MODERATE"
  ) {
    hardFloor = "STANDARD";
  }
  /** @type {RunMode} */
  let selectedMode = hardFloor;
  /** @type {{ mode: RunMode, evidence: string[] } | undefined} */
  let recordedEscalation;
  if (rootEscalation !== undefined) {
    if (!MODES.includes(/** @type {never} */ (rootEscalation.mode))) {
      throw new Error("rootEscalation.mode must be FAST, STANDARD, or DEEP.");
    }
    const requestedMode = /** @type {RunMode} */ (rootEscalation.mode);
    const requestedRank = MODES.indexOf(requestedMode);
    const hardFloorRank = MODES.indexOf(hardFloor);
    if (requestedRank < hardFloorRank) {
      throw new Error(`rootEscalation.mode cannot be below the ${hardFloor} hard floor.`);
    }
    if (requestedRank === hardFloorRank) {
      throw new Error(`rootEscalation.mode must raise the mode above the ${hardFloor} hard floor.`);
    }
    if (!isConciseEvidence(rootEscalation.evidence)) {
      throw new Error("A Root mode escalation requires concise recorded evidence.");
    }
    selectedMode = requestedMode;
    recordedEscalation = {
      mode: requestedMode,
      evidence: /** @type {string[]} */ (rootEscalation.evidence),
    };
  }
  const rationale = recordedEscalation
    ? `${selectedMode} selected above the ${hardFloor} hard floor: ${recordedEscalation.evidence.join(" ")}`
    : `${selectedMode} is the hard floor for ${TASK_PROFILE_EVIDENCE_FIELDS.map((field) => `${field}=${task[field]}`).join(", ")}.`;
  return {
    schemaVersion: 1,
    selectedMode,
    hardFloor,
    routineConfirmationRequired: false,
    rationale,
    taskEvidence: Object.fromEntries(
      TASK_PROFILE_EVIDENCE_FIELDS.map((field) => [field, task[field]]),
    ),
    ...(recordedEscalation ? { rootEscalation: recordedEscalation } : {}),
  };
}

/** @param {unknown} value @returns {value is string[]} */
function isConciseEvidence(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 3 &&
    value.every(
      (entry) =>
        typeof entry === "string" &&
        entry.trim().length > 0 &&
        entry.length <= 160 &&
        !/[\r\n]/u.test(entry),
    )
  );
}
