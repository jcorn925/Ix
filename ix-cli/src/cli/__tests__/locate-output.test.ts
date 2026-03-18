import { describe, it, expect } from "vitest";

/**
 * Tests for ix locate output structure.
 *
 * These verify that the JSON output contract is purely positional:
 * file, line range, containment, system path — no structural/risk/explanatory content.
 */

// Simulates the JSON output shape from locate for a symbol target
function makeSymbolOutput() {
  return {
    resolvedTarget: {
      id: "abc-123",
      kind: "class",
      name: "IxClient",
      path: "src/client/api.ts",
    },
    resolutionMode: "exact",
    lineRange: { start: 12, end: 206 },
    container: { kind: "file", name: "api.ts", id: "file-1" },
    systemPath: [
      { name: "CLI", kind: "system" },
      { name: "Client Layer", kind: "subsystem" },
      { name: "api.ts", kind: "file" },
      { name: "IxClient", kind: "class" },
    ],
    diagnostics: [],
  };
}

// Simulates the JSON output shape from locate for a file target
function makeFileOutput() {
  return {
    resolvedTarget: {
      id: "file-abc",
      kind: "file",
      name: "Node.scala",
      path: "memory-layer/src/main/scala/ix/memory/model/Node.scala",
    },
    resolutionMode: "exact",
    systemPath: [
      { name: "API", kind: "system" },
      { name: "Model / Db", kind: "subsystem" },
      { name: "Node.scala", kind: "file" },
    ],
    diagnostics: [],
  };
}

describe("locate: symbol target output", () => {
  it("contains file path", () => {
    const output = makeSymbolOutput();
    expect(output.resolvedTarget.path).toBe("src/client/api.ts");
  });

  it("contains line range", () => {
    const output = makeSymbolOutput();
    expect(output.lineRange).toEqual({ start: 12, end: 206 });
  });

  it("contains system path with multiple nodes", () => {
    const output = makeSymbolOutput();
    expect(output.systemPath.length).toBeGreaterThan(1);
    expect(output.systemPath[0]).toEqual({ name: "CLI", kind: "system" });
  });

  it("contains container", () => {
    const output = makeSymbolOutput();
    expect(output.container).toBeDefined();
    expect(output.container!.name).toBe("api.ts");
  });
});

describe("locate: file target output", () => {
  it("contains file path", () => {
    const output = makeFileOutput();
    expect(output.resolvedTarget.path).toContain("Node.scala");
  });

  it("contains system path", () => {
    const output = makeFileOutput();
    expect(output.systemPath.length).toBeGreaterThan(1);
  });

  it("has no container for file targets", () => {
    const output = makeFileOutput();
    expect((output as any).container).toBeUndefined();
  });

  it("has no lineRange for file targets", () => {
    const output = makeFileOutput();
    expect((output as any).lineRange).toBeUndefined();
  });
});

describe("locate: no-overlap regression", () => {
  const symbolOutput = makeSymbolOutput();
  const fileOutput = makeFileOutput();
  const allKeys = [
    ...Object.keys(symbolOutput),
    ...Object.keys(fileOutput),
  ];

  it("does not include callers", () => {
    expect(allKeys).not.toContain("callers");
    expect(allKeys).not.toContain("callerList");
  });

  it("does not include dependents", () => {
    expect(allKeys).not.toContain("dependents");
    expect(allKeys).not.toContain("directDependents");
    expect(allKeys).not.toContain("directImporters");
  });

  it("does not include members", () => {
    expect(allKeys).not.toContain("members");
    expect(allKeys).not.toContain("topImpactedMembers");
  });

  it("does not include risk or explanation fields", () => {
    expect(allKeys).not.toContain("riskSummary");
    expect(allKeys).not.toContain("riskLevel");
    expect(allKeys).not.toContain("riskCategory");
    expect(allKeys).not.toContain("atRiskBehavior");
    expect(allKeys).not.toContain("behaviorAtRisk");
    expect(allKeys).not.toContain("mostAffectedHint");
    expect(allKeys).not.toContain("nextStep");
  });
});

describe("locate: ambiguity handling", () => {
  it("null resolution produces diagnostics", () => {
    const output = {
      resolvedTarget: null,
      resolutionMode: "none",
      systemPath: null,
      diagnostics: ["No graph entity found."],
    };
    expect(output.resolvedTarget).toBeNull();
    expect(output.diagnostics.length).toBeGreaterThan(0);
  });

  it("resolution mode is preserved", () => {
    const output = makeSymbolOutput();
    expect(output.resolutionMode).toBe("exact");
  });
});
