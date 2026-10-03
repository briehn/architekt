import { useEffect, useRef, useState, type ChangeEvent } from "react";

import type { ArchitectureEditorState } from "./architecture-editor-state";
import {
  parsePortableArchitectureDocument,
  PORTABLE_ARCHITECTURE_DOCUMENT_MAX_BYTES,
  type PortableDocumentPreview,
} from "../persistence/portable-architecture-document";
import { getDesignBriefTitle } from "./design-brief-workbench";

type ImportState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "error"; message: string }
  | { status: "preview"; state: ArchitectureEditorState; preview: PortableDocumentPreview; fileName: string };

type PortableDocumentImportPanelProps = Readonly<{
  replaceDisabledReason: string | null;
  hasVoiceWork: boolean;
  onCancel(): void;
  onReplace(state: ArchitectureEditorState): void;
}>;

function importErrorMessage(error: "file-too-large" | "invalid-json" | "unsupported-version" | "invalid-document"): string {
  switch (error) {
    case "file-too-large": return "This file is too large. Choose an Architekt JSON file under 2 MiB.";
    case "invalid-json": return "This file is not valid JSON.";
    case "unsupported-version": return "This Architekt document version is not supported.";
    case "invalid-document": return "This Architekt document is invalid. Your current document is unchanged.";
  }
}

export function PortableDocumentImportPanel({ replaceDisabledReason, hasVoiceWork, onCancel, onReplace }: PortableDocumentImportPanelProps) {
  const [importState, setImportState] = useState<ImportState>({ status: "idle" });
  const requestVersion = useRef(0);
  useEffect(() => () => { requestVersion.current += 1; }, []);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const version = ++requestVersion.current;
    if (file.size > PORTABLE_ARCHITECTURE_DOCUMENT_MAX_BYTES) {
      setImportState({ status: "error", message: importErrorMessage("file-too-large") });
      return;
    }
    setImportState({ status: "reading" });
    try {
      const bytes = await file.arrayBuffer();
      if (version !== requestVersion.current) return;
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const parsed = parsePortableArchitectureDocument(text);
      setImportState(parsed.ok
        ? { status: "preview", state: parsed.state, preview: parsed.preview, fileName: file.name }
        : { status: "error", message: importErrorMessage(parsed.error) });
    } catch {
      if (version === requestVersion.current) {
        setImportState({ status: "error", message: "Could not read this file as UTF-8 JSON. Your current document is unchanged." });
      }
    }
  }

  return (
    <div className="portable-document-import">
      <p className="text-xs leading-5 text-text-secondary">Choose an Architekt JSON document. It will be checked before anything changes.</p>
      <label className="design-brief-label" htmlFor="portable-document-file">Choose Architekt JSON file</label>
      <input accept=".json,.architekt.json,application/json" className="portable-document-file" id="portable-document-file" onChange={(event) => { void chooseFile(event); }} type="file" />
      <p className="text-xs text-text-muted">Maximum file size: 2 MiB. Current and supported older Architekt documents are accepted.</p>
      {importState.status === "reading" ? <p className="text-xs text-text-secondary" role="status">Checking document…</p> : null}
      {importState.status === "error" ? <p className="text-sm text-danger" role="alert">{importState.message}</p> : null}
      {importState.status === "preview" ? (
        <section aria-label="Import preview" className="portable-document-preview">
          <h3 className="text-sm font-semibold text-text-primary">Ready to import</h3>
          <p className="mt-1 min-w-0 break-words text-xs text-text-muted">Selected file: {importState.fileName}</p>
          <p className="mt-2 min-w-0 break-words text-sm font-semibold text-text-primary">{getDesignBriefTitle(importState.state.designContext)}</p>
          <dl className="portable-document-details">
            <div><dt>Components</dt><dd>{importState.preview.componentCount}</dd></div>
            <div><dt>Connections</dt><dd>{importState.preview.connectionCount}</dd></div>
            <div><dt>Boundaries</dt><dd>{importState.preview.boundaryCount}</dd></div>
            <div><dt>Design Brief</dt><dd>{importState.preview.hasDesignBrief ? "Has content" : "Empty"}</dd></div>
          </dl>
          {importState.preview.sourceVersion < 5 ? <p className="mt-2 text-xs text-text-secondary">Version {importState.preview.sourceVersion} will be migrated to the current document format.</p> : null}
          <p className="mt-3 text-xs leading-5 text-text-secondary">Replace the current architecture document, including its Design Brief, diagram, boundaries, and positions. You can Undo this replacement.</p>
          {hasVoiceWork ? <p className="mt-2 text-xs text-text-secondary">Replacing also discards your current voice recording or transient transcript.</p> : null}
          {replaceDisabledReason ? <p className="mt-2 text-xs text-text-secondary" role="status">{replaceDisabledReason}</p> : null}
          <div className="design-brief-actions mt-3">
            <button className="design-brief-primary" disabled={replaceDisabledReason !== null} onClick={() => onReplace(importState.state)} type="button">Replace document</button>
            <button className="design-brief-secondary" onClick={onCancel} type="button">Cancel import</button>
          </div>
        </section>
      ) : (
        <button className="design-brief-secondary" onClick={onCancel} type="button">Cancel import</button>
      )}
    </div>
  );
}
