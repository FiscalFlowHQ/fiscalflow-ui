import { describe, expect, it } from "vitest";
import { fileNameFromPath, isTauri } from "./tauri";

describe("tauri helpers", () => {
  it("isTauri is false under Vitest/jsdom", () => {
    expect(isTauri()).toBe(false);
  });

  it("fileNameFromPath handles posix and windows separators", () => {
    expect(fileNameFromPath("/Users/me/book.xlsx")).toBe("book.xlsx");
    expect(fileNameFromPath("C:\\Users\\me\\book.xlsx")).toBe("book.xlsx");
    expect(fileNameFromPath("book.xlsx")).toBe("book.xlsx");
  });
});
