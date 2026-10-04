import type { DesignContext } from "./design-context";
import { getComponentKindLabel, getConnectionKindLabel } from "./architecture-kind-labels";
import { portableExportFilename } from "./portable-export-filename";
import type { ArchitectureComponent } from "../domain/architecture-component";
import type { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId } from "../domain/identifiers";

export type MarkdownArchitectureDocument = Readonly<{
  graph: ArchitectureGraph;
  designContext: DesignContext;
}>;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function singleLine(value: string): string {
  return normalizeNewlines(value).replace(/\n/g, " ");
}

function escapeMarkdown(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\\`*_{}\[\]()#+.!|~-]/g, "\\$&")
    .replace(/@/g, "&#64;");
}

function escapeNarrative(value: string): string {
  const lines = normalizeNewlines(value).split("\n");
  return lines.map((line) => {
    const escaped = escapeMarkdown(line).replace(/\t/g, "&#9;");
    return escaped.replace(/^ +| +$/g, (spaces) => "&#32;".repeat(spaces.length));
  }).map((line, index) => index > 0 && line !== "" && lines[index - 1] !== "" ? `\\\n${line}` : index > 0 ? `\n${line}` : line).join("");
}

function escapedSingleLine(value: string): string {
  return escapeMarkdown(singleLine(value));
}

function canonicalId(id: string): string {
  return escapeMarkdown(JSON.stringify(id));
}

function narrativeSection(value: string): string {
  return value === "" ? "Not provided." : escapeNarrative(value);
}

export function exportArchitectureMarkdown({ graph, designContext }: MarkdownArchitectureDocument): Readonly<{ filename: string; markdown: string }> {
  const components = [...graph.getComponents()].sort((left, right) =>
    compareStrings(singleLine(left.name), singleLine(right.name)) || compareStrings(left.id, right.id));
  const boundaries = [...graph.getBoundaries()].sort((left, right) =>
    compareStrings(singleLine(left.name), singleLine(right.name)) || compareStrings(left.id, right.id));
  const componentsById = new Map(components.map((component) => [component.id, component]));
  const componentOrder = new Map(components.map((component, index) => [component.id, index]));
  const nameCounts = new Map<string, number>();
  const nameAndKindCounts = new Map<string, number>();
  for (const component of components) {
    const name = singleLine(component.name);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    const key = JSON.stringify([name, component.kind]);
    nameAndKindCounts.set(key, (nameAndKindCounts.get(key) ?? 0) + 1);
  }

  function needsId(component: ArchitectureComponent): boolean {
    return (nameAndKindCounts.get(JSON.stringify([singleLine(component.name), component.kind])) ?? 0) > 1;
  }

  function componentReference(component: ArchitectureComponent): string {
    const name = escapedSingleLine(component.name);
    if ((nameCounts.get(singleLine(component.name)) ?? 0) === 1) return name;
    const kind = getComponentKindLabel(component.kind);
    return `${name} (${kind}${needsId(component) ? `, ID: ${canonicalId(component.id)}` : ""})`;
  }

  const boundaryNameCounts = new Map<string, number>();
  for (const boundary of boundaries) {
    const name = singleLine(boundary.name);
    boundaryNameCounts.set(name, (boundaryNameCounts.get(name) ?? 0) + 1);
  }

  const connections = [...graph.getConnections()].sort((left, right) =>
    (componentOrder.get(left.sourceComponentId) ?? -1) - (componentOrder.get(right.sourceComponentId) ?? -1) ||
    (componentOrder.get(left.targetComponentId) ?? -1) - (componentOrder.get(right.targetComponentId) ?? -1) ||
    compareStrings(left.kind, right.kind) || compareStrings(left.id, right.id));

  const componentLines = components.map((component) =>
    `- ${escapedSingleLine(component.name)}${needsId(component) ? ` (ID: ${canonicalId(component.id)})` : ""} — ${getComponentKindLabel(component.kind)}`);
  const boundarySections = boundaries.map((boundary) => {
    const name = escapedSingleLine(boundary.name);
    const displayName = (boundaryNameCounts.get(singleLine(boundary.name)) ?? 0) > 1
      ? `${name} (ID: ${canonicalId(boundary.id)})` : name;
    const members = [...boundary.memberComponentIds]
      .sort((left, right) => (componentOrder.get(left) ?? -1) - (componentOrder.get(right) ?? -1))
      .map((id: ComponentId) => {
        const member = componentsById.get(id);
        if (!member) throw new Error("Architecture boundary references an unknown component.");
        return `- ${componentReference(member)}`;
      });
    return `### ${displayName}\n\n${members.length > 0 ? members.join("\n") : "No members."}`;
  });
  const connectionLines = connections.map((connection) => {
    const source = componentsById.get(connection.sourceComponentId);
    const target = componentsById.get(connection.targetComponentId);
    if (!source || !target) throw new Error("Architecture connection references an unknown component.");
    return `- ${componentReference(source)} → ${componentReference(target)} — ${getConnectionKindLabel(connection.kind)}`;
  });

  const sections = [
    `# ${escapedSingleLine(designContext.title === "" ? "Untitled architecture" : designContext.title)}`,
    `## Overview\n\n- Components: ${components.length}\n- Connections: ${connections.length}\n- Boundaries: ${boundaries.length}\n\nDesign Brief prose is user-authored and unverified.`,
    `## Requirements and constraints\n\n${narrativeSection(designContext.requirementsAndConstraints)}`,
    `## Assumptions and open questions\n\n${narrativeSection(designContext.assumptionsAndOpenQuestions)}`,
    `## Decisions and tradeoffs\n\n${narrativeSection(designContext.decisionsAndTradeoffs)}`,
    `## Components\n\n${componentLines.length > 0 ? componentLines.join("\n") : "None modeled."}`,
    `## Boundaries\n\n${boundarySections.length > 0 ? boundarySections.join("\n\n") : "None modeled."}`,
    `## Connections\n\n${connectionLines.length > 0 ? connectionLines.join("\n") : "None modeled."}`,
  ];

  return {
    filename: portableExportFilename(designContext.title, "markdown"),
    markdown: `${sections.join("\n\n").replace(/\n+$/, "")}\n`,
  };
}
