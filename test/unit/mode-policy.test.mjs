import assert from "node:assert/strict";
import test from "node:test";
import {
  TASK_PROFILE_EVIDENCE_FIELDS,
  classifyTaskProfile,
} from "../../skills/engineering-loop/runtime/mode-policy.mjs";

const cases = [
  {
    name: "local low-risk reversible work selects FAST",
    task: taskEvidence(),
    mode: "FAST",
  },
  {
    name: "a small cross-file task remains FAST when its evidence is local",
    task: taskEvidence({ summary: "Adjust two local modules" }),
    mode: "FAST",
  },
  {
    name: "a multi-part feature selects STANDARD",
    task: taskEvidence({ scope: "MULTI_PART" }),
    mode: "STANDARD",
  },
  {
    name: "medium risk establishes a STANDARD floor",
    task: taskEvidence({ risk: "MEDIUM" }),
    mode: "STANDARD",
  },
  {
    name: "material ambiguity establishes a STANDARD floor",
    task: taskEvidence({ ambiguity: "MATERIAL" }),
    mode: "STANDARD",
  },
  {
    name: "moderate reversibility establishes a STANDARD floor",
    task: taskEvidence({ reversibility: "MODERATE" }),
    mode: "STANDARD",
  },
  {
    name: "system-wide work selects DEEP",
    task: taskEvidence({ scope: "SYSTEM" }),
    mode: "DEEP",
  },
  {
    name: "high risk selects DEEP",
    task: taskEvidence({ risk: "HIGH" }),
    mode: "DEEP",
  },
  {
    name: "hard-to-reverse work selects DEEP",
    task: taskEvidence({ reversibility: "HARD" }),
    mode: "DEEP",
  },
];

for (const fixture of cases) {
  test(fixture.name, () => {
    const profile = classifyTaskProfile(fixture.task);
    assert.equal(profile.selectedMode, fixture.mode);
    assert.equal(profile.routineConfirmationRequired, false);
  });
}

test("the public policy contract excludes file count from Task Profile evidence", () => {
  assert.deepEqual(TASK_PROFILE_EVIDENCE_FIELDS, [
    "scope",
    "risk",
    "ambiguity",
    "reversibility",
  ]);
  assert.ok(!TASK_PROFILE_EVIDENCE_FIELDS.some((field) => /file|count/iu.test(field)));
});

test("Root can raise the mode when the Task Profile records concise evidence", () => {
  const profile = classifyTaskProfile(taskEvidence(), {
    mode: "STANDARD",
    evidence: ["The change coordinates a public contract rollout."],
  });

  assert.equal(profile.hardFloor, "FAST");
  assert.equal(profile.selectedMode, "STANDARD");
  assert.deepEqual(profile.rootEscalation, {
    mode: "STANDARD",
    evidence: ["The change coordinates a public contract rollout."],
  });
  assert.match(profile.rationale, /STANDARD.*public contract rollout/iu);
});

test("Root cannot raise the mode without recorded evidence", () => {
  assert.throws(
    () => classifyTaskProfile(taskEvidence(), { mode: "STANDARD", evidence: [] }),
    /evidence/iu,
  );
});

test("Root escalation must raise the mode above the deterministic hard floor", () => {
  assert.throws(
    () => classifyTaskProfile(taskEvidence(), {
      mode: "FAST",
      evidence: ["Repeat the deterministic floor."],
    }),
    /must raise.*above.*FAST.*hard floor/iu,
  );
});

test("a requested mode below the hard floor is rejected as a silent downgrade", () => {
  assert.throws(
    () => classifyTaskProfile(taskEvidence({ risk: "HIGH" }), {
      mode: "STANDARD",
      evidence: ["Prefer a shorter workflow."],
    }),
    /below.*DEEP.*hard floor/iu,
  );
});

test("unsupported Task Profile evidence is rejected instead of defaulting to FAST", () => {
  assert.throws(
    () => classifyTaskProfile(taskEvidence({ risk: "UNKNOWN" })),
    /task\.risk/iu,
  );
});

function taskEvidence(overrides = {}) {
  return {
    summary: "Apply a clear local change",
    scope: "LOCAL",
    risk: "LOW",
    ambiguity: "NONE",
    reversibility: "EASY",
    ...overrides,
  };
}
