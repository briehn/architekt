export type PortableExportFormat = "json" | "markdown" | "png";

const extensionByFormat = {
  json: "architekt.json",
  markdown: "md",
  png: "png",
} satisfies Record<PortableExportFormat, string>;

export function portableExportFilename(title: string, format: PortableExportFormat): string {
  const slug = Array.from(title.normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "-"))
    .slice(0, 60)
    .join("")
    .replace(/^-+|-+$/g, "");
  const safeName = slug === "" ? "architecture" : /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(slug) ? `architecture-${slug}` : slug;
  return `${safeName}.${extensionByFormat[format]}`;
}
