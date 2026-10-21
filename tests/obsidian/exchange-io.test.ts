import { beforeEach, describe, expect, it, vi } from "vitest";
import { TFile } from "../vendor/kit/obsidian-mock";
import { takeOverFlow, sendBack } from "../../src/obsidian/exchange-io";
import { readDocMeta } from "../../src/core/doc-meta";
import { splitDoc } from "../../src/core/meta-zone";
import { harness, settle } from "./helpers";

const shared = vi.hoisted(() => ({ calls: [] as Array<{ fileName: string; text: string }> }));
vi.mock("../../src/vendor/kit-obsidian/share-export", () => ({
  SHARE_EXPORT_STRINGS_DE: {}, SHARE_EXPORT_STRINGS_EN: {},
  shareExport: (_app: unknown, bytes: Uint8Array, opts: { fileName: string }) => { shared.calls.push({ fileName: opts.fileName, text: new TextDecoder().decode(bytes) }); return Promise.resolve({ outcome: "shared", path: "x" }); },
}));

const note = (body: string, round: number): string => `---\ndiachronic-id: d1\ndiachronic-round: ${round}\ndiachronic-status: in-review\ndiachronic-participants: [Johannes]\n---\n${body}`;
const SENT = note("Wir schreiben Ihnen gerne.\n", 2);
const BACK_MARKED = note("Wir schreiben Ihnen {++sehr ++}gerne.\n", 3);

async function setup(current: string = SENT) {
  const h = harness(current);
  h.notes.set("brief.md", current);
  h.notes.set("brief (1).md", "");
  await h.stands.add("d1", SENT, { reason: "outgoing", author: "Johannes", round: 2, version: null });
  h.log.length = 0;
  return { ...h, target: new TFile("brief.md"), incomingFile: new TFile("brief (1).md") };
}

beforeEach(() => { shared.calls.length = 0; });

describe("takeOverFlow", () => {
  it("takes over: stand first, then the note, then the incoming stand, then the copy to the trash", async () => {
    const h = await setup();
    await takeOverFlow(h.deps, h.incomingFile, h.target, BACK_MARKED);
    expect(h.ui.confirm).toHaveBeenCalledTimes(1);
    expect(h.log).toEqual(["stand:manual", "write", "stand:incoming"]);
    expect(h.editor.getValue()).toBe(BACK_MARKED);
    expect(h.trashed).toEqual(["brief (1).md"]);
    const chain = await h.stands.load("d1");
    expect(chain.map((s) => s.meta.name)).toEqual(expect.arrayContaining(["Round 3 – incoming", "Before taking over round 3"]));
  });

  it("refuses to take over when both sides changed, shows the difference and writes nothing", async () => {
    const h = await setup();
    h.editor.setValue(SENT.replace("gerne", "ganz gerne"));
    await takeOverFlow(h.deps, h.incomingFile, h.target, BACK_MARKED);
    expect(h.ui.showDiff).toHaveBeenCalledTimes(1);
    expect(h.ui.confirm).not.toHaveBeenCalled();
    expect(h.log).toEqual([]);
    expect(h.trashed).toEqual([]);
    expect(h.editor.getValue()).toContain("ganz gerne");
  });

  it("writes nothing when the user declines", async () => {
    const h = await setup();
    h.ui.confirm.mockResolvedValue(false);
    await takeOverFlow(h.deps, h.incomingFile, h.target, BACK_MARKED);
    expect(h.log).toEqual([]);
    expect(h.trashed).toEqual([]);
  });

  it("offers to mark free changes of the sender as suggestions and does so on yes", async () => {
    const h = await setup();
    const free = note("Wir mailen Ihnen gerne.\n", 3);
    h.ui.askComment.mockResolvedValue("Anna");
    await takeOverFlow(h.deps, h.incomingFile, h.target, free);
    expect(h.ui.confirm).toHaveBeenCalledTimes(2);
    const parts = splitDoc(h.editor.getValue());
    expect(parts.ok && parts.parts.body).toContain("{~~schreiben~>mailen~~}");
    expect(parts.ok && parts.parts.entries.map((e) => e.author)).toEqual(["Anna"]);
  });

  it("does not offer a comparison when the sender only added marks", async () => {
    const h = await setup();
    await takeOverFlow(h.deps, h.incomingFile, h.target, BACK_MARKED);
    expect(h.ui.confirm).toHaveBeenCalledTimes(1);
    expect(h.ui.askComment).not.toHaveBeenCalled();
  });

  it("needs the author's name first", async () => {
    const h = await setup();
    const bare = harness(SENT, { authorName: "" });
    bare.notes.set("brief.md", SENT);
    await takeOverFlow(bare.deps, h.incomingFile, h.target, BACK_MARKED);
    expect(bare.ui.confirm).not.toHaveBeenCalled();
    expect(bare.deps.openSettings).toHaveBeenCalled();
  });
});

describe("sendBack", () => {
  async function tracked() {
    const text = note("Wir mailen Ihnen gerne.\n", 1);
    const h = harness(text);
    h.notes.set("brief.md", text);
    await h.stands.add("d1", note("Wir schreiben Ihnen gerne.\n", 1), { reason: "incoming", author: "Johannes", round: 1, version: null });
    h.log.length = 0;
    return h;
  }

  it("counts the round up, stores the outgoing stand and shares the bytes of the note", async () => {
    const text = note("Wir schreiben Ihnen gerne.\n", 1);
    const h = harness(text);
    await h.stands.add("d1", text, { reason: "incoming", author: "Johannes", round: 1, version: null });
    h.log.length = 0;
    const doc = h.deps.doc();
    if (!doc) throw new Error("setup");
    await sendBack(h.deps, doc);
    await settle();
    expect(readDocMeta(h.editor.getValue())?.round).toBe(2);
    expect(h.log).toEqual(["write", "stand:outgoing"]);
    expect(shared.calls).toHaveLength(1);
    expect(shared.calls[0]?.fileName).toBe("brief.md");
    expect(shared.calls[0]?.text).toBe(h.editor.getValue());
    expect((await h.stands.load("d1")).some((s) => s.meta.name === "Round 2 – outgoing")).toBe(true);
  });

  it("does not send while there are unmarked changes", async () => {
    vi.stubGlobal("createFragment", () => ({ createDiv: () => ({ createDiv: () => ({ createEl: () => ({ addEventListener() {} }) }), createEl: () => ({ addEventListener() {} }) }) }));
    const h = await tracked();
    const doc = h.deps.doc();
    if (!doc) throw new Error("setup");
    await sendBack(h.deps, doc);
    await settle();
    expect(shared.calls).toHaveLength(0);
    expect(readDocMeta(h.editor.getValue())?.round).toBe(1);
    vi.unstubAllGlobals();
  });
});

describe("releaseCommand", () => {
  const body = (extra: string) => `Brief an Frau Berger. ${extra}\n`;
  const withBody = (b: string) => `---\ndiachronic-id: d1\ndiachronic-round: 2\ndiachronic-status: in-review\n---\n${b}`;

  it("stores the current text, writes the released text, then stores it as the release stand", async () => {
    const { releaseCommand } = await import("../../src/obsidian/commands");
    const text = withBody(body("{==Satz==}{>>Jo: ok<<}"));
    const h = harness(text);
    const doc = h.deps.doc();
    if (!doc) throw new Error("setup");
    await releaseCommand(h.deps, doc);
    expect(h.log).toEqual(["stand:manual", "write", "stand:release"]);
    const meta = readDocMeta(h.editor.getValue());
    expect(meta).toMatchObject({ version: "v1", status: "released" });
    expect(h.editor.getValue()).toContain("Brief an Frau Berger. Satz\n");
    expect((await h.stands.load("d1")).map((s) => s.meta.name)).toEqual(expect.arrayContaining(["v1", "Before release"]));
  });

  it("does not release while changes are open", async () => {
    const { releaseCommand } = await import("../../src/obsidian/commands");
    const h = harness(withBody(body("{++neu++}")));
    const doc = h.deps.doc();
    if (!doc) throw new Error("setup");
    await releaseCommand(h.deps, doc);
    expect(h.ui.confirm).not.toHaveBeenCalled();
    expect(h.log).toEqual([]);
  });
});
