import { isTauri as coreIsTauri } from "@tauri-apps/api/core";

/** True when running inside the Tauri webview (dev or packaged). */
export function isTauri(): boolean {
  try {
    return coreIsTauri();
  } catch {
    return false;
  }
}

export function fileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? "databook.xlsx";
}

/**
 * Native Excel picker (Tauri). Returns `null` if cancelled or not in Tauri.
 * Reads bytes via the fs plugin and builds a browser `File` for `uploadDocument`.
 */
export async function pickDatabookFile(): Promise<File | null> {
  if (!isTauri()) return null;

  const { open } = await import("@tauri-apps/plugin-dialog");
  const { readFile } = await import("@tauri-apps/plugin-fs");

  const selected = await open({
    multiple: false,
    title: "Choose Excel databook",
    filters: [
      {
        name: "Excel databook",
        extensions: ["xlsx", "xls", "xlsm", "xlsb"],
      },
    ],
  });

  if (selected == null) return null;
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path || typeof path !== "string") return null;

  const bytes = await readFile(path);
  const name = fileNameFromPath(path);
  return new File([bytes], name, {
    type: mimeForDatabook(name),
  });
}

function mimeForDatabook(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".xlsm")) {
    return "application/vnd.ms-excel.sheet.macroEnabled.12";
  }
  if (lower.endsWith(".xlsb")) {
    return "application/vnd.ms-excel.sheet.binary.macroEnabled.12";
  }
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}
