import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ArchitectureEditor,
  createRenameDraft,
  createRenameSession,
  getRenameDraftValidationMessage,
  updateRenameDraftName,
} from "./architecture-editor";
import type { ComponentId } from "../domain/identifiers";

describe("ArchitectureEditor", () => {
  it("server-renders only the stable loading shell", () => {
    const markup = renderToStaticMarkup(<ArchitectureEditor />);

    expect(markup).toContain("Loading saved workspace…");
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("Component name");
    expect(markup).not.toContain("architekt-diagram");
    expect(markup).not.toContain("react-flow");
  });

  it("starts a fresh draft when switching rename targets", () => {
    const apiId = "api" as ComponentId;
    const databaseId = "database" as ComponentId;
    const apiDraft = updateRenameDraftName(
      createRenameDraft(apiId, "API"),
      "Uncommitted API",
    );
    const databaseDraft = createRenameDraft(databaseId, "Database");

    expect(apiDraft).toEqual({
      componentId: apiId,
      name: "Uncommitted API",
      validationMessage: null,
    });
    expect(databaseDraft).toEqual({
      componentId: databaseId,
      name: "Database",
      validationMessage: null,
    });
  });

  it("keeps the rename origin with the single active rename session", () => {
    const apiId = "api" as ComponentId;
    const databaseId = "database" as ComponentId;
    const listSession = createRenameSession(apiId, "API", "list");
    const canvasSession = createRenameSession(databaseId, "Database", "canvas");

    expect(listSession).toEqual({
      draft: createRenameDraft(apiId, "API"),
      origin: "list",
    });
    expect(canvasSession).toEqual({
      draft: createRenameDraft(databaseId, "Database"),
      origin: "canvas",
    });
  });

  it("keeps raw rename input while validating whitespace with trim", () => {
    const apiId = "api" as ComponentId;
    const draft = createRenameDraft(apiId, "  Public API  ");
    const blankDraft = updateRenameDraftName(draft, " \t ");

    expect(draft.name).toBe("  Public API  ");
    expect(getRenameDraftValidationMessage(draft)).toBeNull();
    expect(getRenameDraftValidationMessage(blankDraft)).toBe(
      "Enter a component name.",
    );
  });
});
