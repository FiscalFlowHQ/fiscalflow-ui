import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSessionsForTests,
  createLocalSession,
  loadSessions,
  patchSession,
  removeSession,
  touchOpened,
  upsertSession,
} from "./sessionStore";
import { SESSIONS_STORAGE_KEY } from "../types/session";

describe("sessionStore", () => {
  beforeEach(() => {
    clearSessionsForTests();
  });

  it("persists sessions across load/save", () => {
    const a = createLocalSession("thread-a", "Alpha");
    const b = createLocalSession("thread-b", "Beta");
    upsertSession(a);
    upsertSession(b);

    expect(loadSessions()).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(SESSIONS_STORAGE_KEY) ?? "[]")).toHaveLength(2);
  });

  it("touchOpened moves a session to the front", async () => {
    upsertSession({
      ...createLocalSession("old"),
      lastOpenedAt: "2020-01-01T00:00:00.000Z",
    });
    upsertSession({
      ...createLocalSession("new"),
      lastOpenedAt: "2021-01-01T00:00:00.000Z",
    });
    expect(loadSessions()[0].threadId).toBe("new");

    await new Promise((r) => setTimeout(r, 2));
    touchOpened("old");
    expect(loadSessions()[0].threadId).toBe("old");
  });

  it("patchSession updates documentRef and status fields", () => {
    upsertSession(createLocalSession("t1"));
    patchSession("t1", {
      documentRef: "doc-xyz",
      lastRunStatus: "completed",
      paused: false,
    });
    expect(loadSessions()[0]).toMatchObject({
      documentRef: "doc-xyz",
      lastRunStatus: "completed",
      paused: false,
    });
  });

  it("removeSession deletes only local metadata", () => {
    upsertSession(createLocalSession("t1"));
    upsertSession(createLocalSession("t2"));
    removeSession("t1");
    expect(loadSessions().map((s) => s.threadId)).toEqual(["t2"]);
  });
});
