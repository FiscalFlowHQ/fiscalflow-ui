export function getBadgeClass(cat: string, status: string): string {
  if (status === "resolved" || status === "auto_fixed") return "badge-resolved";
  if (cat.includes("REF")) return "badge-ref";
  if (cat.includes("N/A") || cat.includes("NA")) return "badge-na";
  if (cat.includes("MISSING")) return "badge-missing";
  if (cat.includes("DIV")) return "badge-div";
  if (cat.includes("EXTERNAL")) return "badge-external";
  return "badge-ref";
}

export function esc(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function trunc(s: string, n: number): string {
  return s.length > n ? s.substring(0, n) + "..." : s;
}
