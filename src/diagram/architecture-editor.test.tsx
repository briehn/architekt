import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArchitectureEditor } from "./architecture-editor";

describe("ArchitectureEditor", () => {
  it("server-renders only the stable loading shell", () => {
    const markup = renderToStaticMarkup(<ArchitectureEditor />);

    expect(markup).toContain("Loading saved workspace…");
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("Component name");
    expect(markup).not.toContain("architekt-diagram");
    expect(markup).not.toContain("react-flow");
  });
});
