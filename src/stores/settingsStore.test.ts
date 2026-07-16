import { beforeEach, describe, expect, it } from "vitest";
import { getAuthHeaders, getEffectiveApiBaseUrl } from "../config/env";
import {
  SETTINGS_STORAGE_KEY,
  clearApiToken,
  clearSettingsForTests,
  loadSettings,
  saveSettings,
} from "./settingsStore";

describe("settingsStore", () => {
  beforeEach(() => {
    clearSettingsForTests();
  });

  it("persists connection prefs under fiscalflow.settings.v1", () => {
    saveSettings({
      apiBaseUrl: "http://localhost:8000",
      apiToken: "secret-token",
      documentPollIntervalMs: 2000,
    });

    expect(loadSettings()).toEqual({
      apiBaseUrl: "http://localhost:8000",
      apiToken: "secret-token",
      documentPollIntervalMs: 2000,
    });
    expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}")).toMatchObject({
      apiToken: "secret-token",
    });
  });

  it("feeds getAuthHeaders and api base immediately after save", () => {
    expect(getAuthHeaders()).toEqual({});
    expect(getEffectiveApiBaseUrl()).toBe("");

    saveSettings({ apiBaseUrl: "http://127.0.0.1:8000", apiToken: "abc" });
    expect(getAuthHeaders()).toEqual({ Authorization: "Bearer abc" });
    expect(getEffectiveApiBaseUrl()).toBe("http://127.0.0.1:8000");

    clearApiToken();
    expect(getAuthHeaders()).toEqual({});
    expect(getEffectiveApiBaseUrl()).toBe("http://127.0.0.1:8000");
  });

  it("rejects non-positive poll intervals", () => {
    saveSettings({ documentPollIntervalMs: -1 });
    expect(loadSettings().documentPollIntervalMs).toBeNull();
    saveSettings({ documentPollIntervalMs: 750 });
    expect(loadSettings().documentPollIntervalMs).toBe(750);
  });
});
