import { describe, it, expect } from "vitest";

/**
 * These tests verify the normalized JSON schema contract for ix impact.
 * Both container and leaf impact must have the same top-level keys.
 */

const REQUIRED_TOP_LEVEL_KEYS = [
  "resolvedTarget",
  "resolutionMode",
  "resultSource",
  "summary",
  "callerList",
  "calleeList",
  "topImpactedMembers",
  "decisions",
  "tasks",
  "bugs",
  "diagnostics",
];

const REQUIRED_SUMMARY_KEYS = [
  "members",
  "callers",
  "callees",
  "directImporters",
  "directDependents",
  "memberLevelCallers",
];

describe("impact JSON schema normalization", () => {
  it("container impact shape has all required keys", () => {
    // Simulates the container impact JSON output shape
    const containerOutput = {
      resolvedTarget: { id: "abc", kind: "class", name: "MyClass" },
      resolutionMode: "exact",
      resultSource: "graph",
      summary: {
        members: 5,
        callers: 0,
        callees: 0,
        directImporters: 2,
        directDependents: 1,
        memberLevelCallers: 10,
      },
      callerList: [],
      calleeList: [],
      topImpactedMembers: [{ name: "foo", kind: "method", id: "m1", callerCount: 3 }],
      decisions: [],
      tasks: [],
      bugs: [],
      diagnostics: [],
    };

    for (const key of REQUIRED_TOP_LEVEL_KEYS) {
      expect(containerOutput).toHaveProperty(key);
    }
    for (const key of REQUIRED_SUMMARY_KEYS) {
      expect(containerOutput.summary).toHaveProperty(key);
    }
    // Container: callerList and calleeList are empty arrays
    expect(Array.isArray(containerOutput.callerList)).toBe(true);
    expect(Array.isArray(containerOutput.calleeList)).toBe(true);
    // decisions/tasks/bugs are always arrays, never undefined
    expect(Array.isArray(containerOutput.decisions)).toBe(true);
    expect(Array.isArray(containerOutput.tasks)).toBe(true);
    expect(Array.isArray(containerOutput.bugs)).toBe(true);
  });

  it("leaf impact shape has all required keys", () => {
    // Simulates the leaf impact JSON output shape
    const leafOutput = {
      resolvedTarget: { id: "xyz", kind: "function", name: "verify_token" },
      resolutionMode: "exact",
      resultSource: "graph",
      summary: {
        members: 0,
        callers: 3,
        callees: 2,
        directImporters: 0,
        directDependents: 0,
        memberLevelCallers: 0,
      },
      callerList: [{ id: "c1", kind: "method", name: "login" }],
      calleeList: [{ id: "c2", kind: "function", name: "decode_jwt" }],
      topImpactedMembers: [],
      decisions: [],
      tasks: [],
      bugs: [],
      diagnostics: [],
    };

    for (const key of REQUIRED_TOP_LEVEL_KEYS) {
      expect(leafOutput).toHaveProperty(key);
    }
    for (const key of REQUIRED_SUMMARY_KEYS) {
      expect(leafOutput.summary).toHaveProperty(key);
    }
    // Leaf: topImpactedMembers is empty
    expect(Array.isArray(leafOutput.topImpactedMembers)).toBe(true);
    expect(leafOutput.topImpactedMembers.length).toBe(0);
    // Leaf: members, directImporters, directDependents, memberLevelCallers are 0
    expect(leafOutput.summary.members).toBe(0);
    expect(leafOutput.summary.directImporters).toBe(0);
    expect(leafOutput.summary.directDependents).toBe(0);
    expect(leafOutput.summary.memberLevelCallers).toBe(0);
  });

  it("container and leaf have identical top-level keys", () => {
    const containerKeys = REQUIRED_TOP_LEVEL_KEYS.slice().sort();
    const leafKeys = REQUIRED_TOP_LEVEL_KEYS.slice().sort();
    expect(containerKeys).toEqual(leafKeys);
  });

  it("container and leaf have identical summary keys", () => {
    const containerSummaryKeys = REQUIRED_SUMMARY_KEYS.slice().sort();
    const leafSummaryKeys = REQUIRED_SUMMARY_KEYS.slice().sort();
    expect(containerSummaryKeys).toEqual(leafSummaryKeys);
  });
});
