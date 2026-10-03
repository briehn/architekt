import { useRef, useState, type FormEvent } from "react";
import type { ArchitectureBoundary } from "../domain/architecture-boundary";
import type { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId, ComponentId } from "../domain/identifiers";
import type { BoundaryEditResult } from "./boundary-workbench-actions";

type CreationProps = Readonly<{
  graph: ArchitectureGraph;
  initialMemberIds: readonly ComponentId[];
  disabled: boolean;
  onCreate(name: string, memberIds: readonly ComponentId[]): BoundaryEditResult;
  onCancel(): void;
}>;

const fieldClass = "h-9 min-w-0 w-full rounded-sm border border-border bg-surface px-2 text-sm text-text-primary outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring";
const actionClass = "h-9 rounded-sm bg-accent px-3 text-sm font-semibold text-surface hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-default disabled:bg-surface-subtle disabled:text-text-muted";
const quietButtonClass = "h-8 rounded-sm px-2 text-sm text-text-secondary hover:bg-chrome-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50";

export function getBoundaryDisplayName(boundary: ArchitectureBoundary, boundaries: readonly ArchitectureBoundary[]): string {
  return boundaries.some((other) => other.id !== boundary.id && other.name === boundary.name)
    ? `${boundary.name} (${boundary.id})`
    : boundary.name;
}

export function BoundaryCreationForm({ graph, initialMemberIds, disabled, onCreate, onCancel }: CreationProps) {
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<ComponentId>>(() => new Set(initialMemberIds));
  const [error, setError] = useState<string | null>(null);
  const components = graph.getComponents();
  const nameCounts = new Map<string, number>();
  for (const component of components) nameCounts.set(component.name, (nameCounts.get(component.name) ?? 0) + 1);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const result = onCreate(name, [...selectedIds]);
    if (!result.ok) setError(result.message);
  }

  return (
    <form className="flex min-h-0 flex-col gap-4" onSubmit={submit}>
      <div>
        <label className="mb-1 block text-sm font-medium text-text-primary" htmlFor="boundary-create-name">Name</label>
        <input aria-describedby={error ? "boundary-create-error" : undefined} aria-invalid={error ? true : undefined} autoFocus className={fieldClass} id="boundary-create-name" onChange={(event) => { setName(event.target.value); setError(null); }} type="text" value={name} />
      </div>
      <fieldset className="min-h-0">
        <legend className="text-sm font-medium text-text-primary">Initial members <span className="font-normal text-text-muted">(optional)</span></legend>
        <p className="mt-0.5 text-xs text-text-secondary">Selected components are checked. Grouped components cannot join during creation.</p>
        {components.length === 0 ? <p className="mt-2 text-sm text-text-muted">No components yet. Create an empty boundary now and add members later.</p> : (
          <div className="mt-2 max-h-64 overflow-y-auto border-y border-border/60 py-1">
            {components.map((component) => {
              const owner = graph.getBoundaryContainingComponent(component.id);
              const label = (nameCounts.get(component.name) ?? 0) > 1 ? `${component.name} (${component.id})` : component.name;
              return (
                <label className={`flex min-w-0 items-start gap-2 rounded-sm px-1 py-2 text-sm ${owner ? "text-text-muted" : "text-text-primary"}`} key={component.id}>
                  <input checked={selectedIds.has(component.id)} className="mt-0.5 size-4 shrink-0 accent-accent" disabled={disabled || owner !== undefined} onChange={(event) => {
                    const next = new Set(selectedIds);
                    if (event.target.checked) next.add(component.id); else next.delete(component.id);
                    setSelectedIds(next);
                    setError(null);
                  }} type="checkbox" />
                  <span className="min-w-0 break-words">{label}{owner ? <span className="block text-xs">In {owner.name}</span> : null}</span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
      {error ? <p className="text-sm text-danger" id="boundary-create-error" role="alert">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button className={actionClass} disabled={disabled} type="submit">Create boundary</button>
        <button className={quietButtonClass} onClick={onCancel} type="button">Cancel</button>
      </div>
    </form>
  );
}

type MembershipSelectProps = Readonly<{
  componentName: string;
  componentId: ComponentId;
  boundaries: readonly ArchitectureBoundary[];
  currentBoundaryId: BoundaryId | null;
  disabled: boolean;
  onChange(boundaryId: BoundaryId | null): void;
}>;

export function BoundaryMembershipSelect({ componentName, componentId, boundaries, currentBoundaryId, disabled, onChange }: MembershipSelectProps) {
  return (
    <select aria-label={`Boundary for ${componentName} (${componentId})`} className={`${fieldClass} flex-1 text-xs`} disabled={disabled} onChange={(event) => {
      const value = event.target.value;
      if (value === "") onChange(null);
      else {
        const boundary = boundaries.find((candidate) => candidate.id === value);
        if (boundary) onChange(boundary.id);
      }
    }} value={currentBoundaryId ?? ""}>
      <option value="">No boundary</option>
      {boundaries.map((boundary) => <option key={boundary.id} value={boundary.id}>{getBoundaryDisplayName(boundary, boundaries)}</option>)}
    </select>
  );
}

type DetailsProps = Readonly<{
  boundary: ArchitectureBoundary;
  graph: ArchitectureGraph;
  disabled: boolean;
  onBack(): void;
  onRename(name: string): BoundaryEditResult;
  onDelete(): BoundaryEditResult;
  onAssign(componentId: ComponentId): BoundaryEditResult;
  onRemove(componentId: ComponentId): BoundaryEditResult;
}>;

export function BoundaryDetails({ boundary, graph, disabled, onBack, onRename, onDelete, onAssign, onRemove }: DetailsProps) {
  const renameTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(boundary.name);
  const [candidateId, setCandidateId] = useState<ComponentId | "">("");
  const [error, setError] = useState<string | null>(null);
  const components = graph.getComponents();
  const members = components.filter((component) => boundary.memberComponentIds.includes(component.id));
  const candidates = components.filter((component) => !boundary.memberComponentIds.includes(component.id));

  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const result = onRename(name);
    if (result.ok) { setRenaming(false); setError(null); window.requestAnimationFrame(() => renameTriggerRef.current?.focus()); }
    else setError(result.message);
  }

  return (
    <div className="space-y-5">
      <button className={quietButtonClass} onClick={onBack} type="button">← Structure</button>
      <div>
        <h3 className="break-words text-base font-semibold text-text-primary">{boundary.name}</h3>
        <p className="text-xs text-text-secondary">{members.length} {members.length === 1 ? "member" : "members"}{members.length === 0 ? " · No canvas rectangle until a component joins" : ""}</p>
      </div>
      {renaming ? (
        <form className="space-y-2" onSubmit={rename}>
          <label className="block text-sm font-medium text-text-primary" htmlFor="boundary-rename-name">Boundary name</label>
          <input aria-describedby={error ? "boundary-details-error" : undefined} aria-invalid={error ? true : undefined} autoFocus className={fieldClass} id="boundary-rename-name" onChange={(event) => { setName(event.target.value); setError(null); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setName(boundary.name); setRenaming(false); setError(null); window.requestAnimationFrame(() => renameTriggerRef.current?.focus()); } }} value={name} />
          <div className="flex gap-2"><button className={actionClass} disabled={disabled} type="submit">Save name</button><button className={quietButtonClass} onClick={() => { setName(boundary.name); setRenaming(false); setError(null); window.requestAnimationFrame(() => renameTriggerRef.current?.focus()); }} type="button">Cancel</button></div>
        </form>
      ) : <button className={quietButtonClass} disabled={disabled} onClick={() => { setName(boundary.name); setRenaming(true); }} ref={renameTriggerRef} type="button">Rename boundary</button>}
      <section>
        <h4 className="text-sm font-semibold text-text-primary">Members</h4>
        {members.length === 0 ? <p className="mt-1 text-sm text-text-muted">No members yet.</p> : <ul className="mt-1 max-h-48 divide-y divide-border/60 overflow-y-auto" aria-label="Boundary members">{members.map((component) => <li className="flex min-w-0 items-center gap-2 py-1" key={component.id}><span className="min-w-0 flex-1 break-words text-sm text-text-primary">{component.name}</span><button aria-label={`Remove ${component.name} from ${boundary.name}`} className={quietButtonClass} disabled={disabled} onClick={() => { const result = onRemove(component.id); if (!result.ok) setError(result.message); }} type="button">Remove</button></li>)}</ul>}
      </section>
      {candidates.length > 0 ? <div className="space-y-2">
        <label className="block text-sm font-medium text-text-primary" htmlFor="boundary-add-member">Add or transfer component</label>
        <select className={fieldClass} id="boundary-add-member" onChange={(event) => setCandidateId(event.target.value as ComponentId | "")} value={candidateId}>
          <option value="">Choose component</option>
          {candidates.map((component) => { const owner = graph.getBoundaryContainingComponent(component.id); return <option key={component.id} value={component.id}>{component.name}{owner ? ` (in ${owner.name})` : ""}</option>; })}
        </select>
        <button className={actionClass} disabled={disabled || candidateId === ""} onClick={() => { if (candidateId === "") return; const result = onAssign(candidateId); if (result.ok) { setCandidateId(""); setError(null); } else setError(result.message); }} type="button">Add to boundary</button>
      </div> : null}
      {error ? <p className="text-sm text-danger" id="boundary-details-error" role="alert">{error}</p> : null}
      <div className="border-t border-border pt-3">
        <p className="text-xs text-text-secondary">Deleting this boundary keeps its components and connections. Undo restores the grouping.</p>
        <button className="mt-2 h-8 rounded-sm px-2 text-sm text-danger hover:bg-chrome-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50" disabled={disabled} onClick={() => { const result = onDelete(); if (!result.ok) setError(result.message); }} type="button">Delete boundary</button>
      </div>
    </div>
  );
}
