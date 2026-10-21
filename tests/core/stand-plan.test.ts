import { describe, expect, it } from "vitest";
import { findStand, isAnchor, standId, standInfo, standName, type StandNameStrings } from "../../src/core/stand-plan";
import type { StoredStand } from "../../src/vendor/kit/version-chain";

const s: StandNameStrings = {
  incoming: (n) => `Round ${n} – incoming`, outgoing: (n) => `Round ${n} – outgoing`, marked: (n) => `Round ${n} – marked`, release: (v) => `Release ${v}`,
  beforeBulk: "Before bulk decision", beforeKoda: "Before Koda round", manual: "Saved by hand",
};

describe("standName", () => {
  it("builds the names of § 9.2 from the strings", () => {
    expect(standName("incoming", 2, null, s)).toBe(s.incoming(2));
    expect(standName("outgoing", 2, null, s)).toBe("Round 2 – outgoing");
    expect(standName("marked", 2, null, s)).toBe("Round 2 – marked");
    expect(standName("release", 3, "v1", s)).toBe("Release v1");
    expect(standName("before-bulk", 1, null, s)).toBe("Before bulk decision");
    expect(standName("before-koda", 1, null, s)).toBe("Before Koda round");
  });

  it("uses a trimmed custom name only for manual stands", () => {
    expect(standName("manual", 1, null, s, "  Vor dem Umbau ")).toBe("Vor dem Umbau");
    expect(standName("manual", 1, null, s, "   ")).toBe("Saved by hand");
    expect(standName("incoming", 1, null, s, "Eigener Name")).toBe("Round 1 – incoming");
  });
});

describe("isAnchor", () => {
  it("is true for incoming, outgoing and release only", () => {
    expect(["incoming", "outgoing", "release"].every((r) => isAnchor(r as never))).toBe(true);
    expect(["before-bulk", "before-koda", "manual"].some((r) => isAnchor(r as never))).toBe(false);
  });
});

describe("standId / standInfo", () => {
  it("carries round and reason independent of the name's language", () => {
    expect(standId("before-bulk", 12, "ab12")).toBe("r12-before-bulk-ab12");
    expect(standInfo("r12-before-bulk-ab12")).toEqual({ reason: "before-bulk", round: 12 });
    expect(standInfo("r1-incoming-Zz09")).toEqual({ reason: "incoming", round: 1 });
  });

  it("returns null for ids that are not ours", () => {
    expect(standInfo("abc")).toBeNull();
    expect(standInfo("r1-sleeping-ab")).toBeNull();
    expect(standInfo("r1-incoming-")).toBeNull();
  });
});

describe("findStand", () => {
  const full = (id: string, time: string): StoredStand => ({ meta: { id, docId: "d", time, author: "a", parent: null, anchor: true, hash: "0".repeat(64) }, form: "full", text: "" });
  const stands = [full("r1-incoming-a", "2026-10-18T10:00:00Z"), full("r1-incoming-b", "2026-10-18T11:00:00Z"), full("r2-incoming-c", "2026-10-19T10:00:00Z"), full("r1-outgoing-d", "2026-10-18T12:00:00Z")];

  it("finds the latest stand of a reason in a round", () => {
    expect(findStand(stands, "incoming", 1)?.meta.id).toBe("r1-incoming-b");
    expect(findStand(stands, "incoming", 2)?.meta.id).toBe("r2-incoming-c");
    expect(findStand(stands, "incoming")?.meta.id).toBe("r2-incoming-c");
  });

  it("returns null when there is none", () => {
    expect(findStand(stands, "release")).toBeNull();
    expect(findStand(stands, "outgoing", 2)).toBeNull();
  });
});
