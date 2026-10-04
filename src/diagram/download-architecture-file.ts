export function downloadArchitectureFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  let link: HTMLAnchorElement | null = null;
  let started = false;

  try {
    link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    started = true;
  } finally {
    link?.remove();
    if (started) {
      try {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        URL.revokeObjectURL(url);
      }
    } else {
      URL.revokeObjectURL(url);
    }
  }
}
