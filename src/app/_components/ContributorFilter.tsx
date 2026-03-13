"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Link2, X as XIcon, Users, Check, Layers, Plus } from "lucide-react";

const COLORS = [
  "#818cf8", "#a78bfa", "#f472b6", "#fb923c",
  "#34d399", "#60a5fa", "#f87171", "#4ade80",
  "#fbbf24", "#2dd4bf", "#e879f9", "#f97316",
  "#06b6d4", "#84cc16", "#ec4899", "#14b8a6",
  "#6366f1", "#8b5cf6", "#d946ef", "#0ea5e9",
];

export type UserGroup = {
  id: string;
  displayName: string;
  identities: string[];
};

export type ContributorSection = {
  id: string;
  label: string;
  members: string[]; // canonical contributor names
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(s: string) { return UUID_RE.test(s); }
function emailUsername(email: string) { return email.split("@")[0] ?? email; }

type Contributor = { name: string; email: string; commits: number; percentage: number };

type Props = {
  contributors: Contributor[];
  excluded: Set<string>;
  onToggle: (name: string) => void;
  onToggleMany: (names: string[], toExcluded: boolean) => void;
  onClear: () => void;
  onExcludeAll: () => void;
  nameAliases: Record<string, string>;
  onRename: (original: string, alias: string) => void;
  userGroups: UserGroup[];
  onSaveGroup: (group: UserGroup) => void;
  onDeleteGroup: (id: string) => void;
  sections: ContributorSection[];
  onSaveSection: (section: ContributorSection) => void;
  onDeleteSection: (id: string) => void;
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((n) => n[0]?.toUpperCase() ?? "").join("");
}
function getGroupForName(canonicalName: string, userGroups: UserGroup[]): UserGroup | undefined {
  return userGroups.find((g) => g.displayName === canonicalName);
}
function getIdentities(canonicalName: string, userGroups: UserGroup[]): string[] {
  const group = getGroupForName(canonicalName, userGroups);
  return group ? group.identities : [canonicalName];
}

export function ContributorFilter({
  contributors, excluded, onToggle, onToggleMany, onClear, onExcludeAll,
  nameAliases, onRename,
  userGroups, onSaveGroup, onDeleteGroup,
  sections, onSaveSection, onDeleteSection,
}: Props) {
  const noneExcluded = excluded.size === 0;

  // Rename contributor state
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Identity merge state
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set());
  const [mergeName, setMergeName] = useState("");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Section grouping state
  const [groupMode, setGroupMode] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [newSectionName, setNewSectionName] = useState("");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editSectionValue, setEditSectionValue] = useState("");

  // ── Rename helpers ───────────────────────────────────────────────────────────

  const startEdit = (name: string, fallbackDisplay: string) => {
    setEditingName(name);
    setEditValue(nameAliases[name] ?? fallbackDisplay);
  };
  const commitEdit = () => {
    if (editingName !== null) { onRename(editingName, editValue.trim()); setEditingName(null); }
  };
  const cancelEdit = () => setEditingName(null);

  // ── Merge helpers ────────────────────────────────────────────────────────────

  const toggleMergeMode = () => {
    setMergeMode((m) => !m);
    setMergeSelected(new Set());
    setMergeName("");
    if (!mergeMode) setGroupMode(false);
  };

  const toggleMergeSelect = (name: string, displayName: string) => {
    setMergeSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) { next.delete(name); }
      else { next.add(name); if (next.size === 1) setMergeName(displayName); }
      return next;
    });
  };

  const createGroup = () => {
    const name = mergeName.trim();
    if (!name || mergeSelected.size < 2) return;
    const allIdentities: string[] = [];
    for (const canonical of mergeSelected) allIdentities.push(...getIdentities(canonical, userGroups));
    const absorbedIds = new Set<string>();
    for (const canonical of mergeSelected) {
      const group = getGroupForName(canonical, userGroups);
      if (group) absorbedIds.add(group.id);
    }
    for (const id of absorbedIds) onDeleteGroup(id);
    onSaveGroup({ id: Date.now().toString(), displayName: name, identities: [...new Set(allIdentities)] });
    setMergeMode(false);
    setMergeSelected(new Set());
    setMergeName("");
  };

  const removeIdentityFromGroup = (group: UserGroup, identity: string) => {
    const remaining = group.identities.filter((id) => id !== identity);
    if (remaining.length <= 1) { onDeleteGroup(group.id); setExpandedGroup(null); }
    else { onSaveGroup({ ...group, identities: remaining }); }
  };

  // ── Section helpers ──────────────────────────────────────────────────────────

  const toggleGroupMode = () => {
    setGroupMode((g) => !g);
    setActiveSection(null);
    setNewSectionName("");
    if (!groupMode) setMergeMode(false);
  };

  const getSectionForContributor = (name: string): ContributorSection | undefined =>
    sections.find((s) => s.members.includes(name));

  const handleContributorInGroupMode = (cName: string) => {
    if (!activeSection) return;
    const section = sections.find((s) => s.id === activeSection);
    if (!section) return;
    if (section.members.includes(cName)) {
      // Remove from section
      onSaveSection({ ...section, members: section.members.filter((m) => m !== cName) });
    } else {
      // Move from any other section, then add here
      for (const s of sections) {
        if (s.id !== activeSection && s.members.includes(cName)) {
          onSaveSection({ ...s, members: s.members.filter((m) => m !== cName) });
        }
      }
      onSaveSection({ ...section, members: [...section.members, cName] });
    }
  };

  const createSection = () => {
    const label = newSectionName.trim();
    if (!label) return;
    const newSection: ContributorSection = { id: Date.now().toString(), label, members: [] };
    onSaveSection(newSection);
    setActiveSection(newSection.id);
    setNewSectionName("");
  };

  const toggleAllInSection = (section: ContributorSection) => {
    const sectionContributors = contributors.filter((c) => section.members.includes(c.name));
    // If all are already visible (none excluded) → deselect all.
    // If any are excluded → select all (include everything in this section).
    const noneExcluded = sectionContributors.every((c) => !excluded.has(c.name));
    onToggleMany(sectionContributors.map((c) => c.name), noneExcluded);
  };

  const commitSectionRename = (section: ContributorSection) => {
    const label = editSectionValue.trim();
    if (label) onSaveSection({ ...section, label });
    setEditingSection(null);
  };

  // ── Derived layout data ──────────────────────────────────────────────────────

  // Index contributors globally for stable color assignment
  const colorIndex = new Map(contributors.map((c, i) => [c.name, i]));

  const sectionedGroups = sections.map((s) => ({
    section: s,
    members: contributors.filter((c) => s.members.includes(c.name)),
  })).filter(({ members }) => members.length > 0);

  const ungrouped = contributors.filter((c) => !sections.some((s) => s.members.includes(c.name)));
  const hasSections = sectionedGroups.length > 0;

  // ── Pill renderer ────────────────────────────────────────────────────────────

  const renderPill = (c: Contributor) => {
    const i = colorIndex.get(c.name) ?? 0;
    const color = COLORS[i % COLORS.length]!;
    const isExcluded = excluded.has(c.name);
    const isEditing = editingName === c.name;
    const effectiveName = isUUID(c.name) && c.email ? emailUsername(c.email) : c.name;
    const displayName = nameAliases[c.name] ?? effectiveName;
    const tooltipText = c.email && c.email !== c.name ? `${c.name}\n${c.email}` : c.name;
    const identityGroup = getGroupForName(c.name, userGroups);
    const isGrouped = !!identityGroup;
    const isMergeSelected = mergeSelected.has(c.name);
    const isExpanded = expandedGroup === c.name;

    // Group mode visual state
    const inActiveSection = activeSection
      ? sections.find((s) => s.id === activeSection)?.members.includes(c.name) ?? false
      : false;
    const inOtherSection = !inActiveSection && !!getSectionForContributor(c.name);
    const cSection = getSectionForContributor(c.name);

    let pillClass = "";
    if (groupMode) {
      if (inActiveSection) {
        pillClass = "border-violet-500/60 bg-violet-500/15 opacity-100";
      } else if (inOtherSection) {
        pillClass = "border-white/[0.06] bg-transparent opacity-40";
      } else {
        pillClass = activeSection
          ? "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] opacity-80 hover:opacity-100"
          : "border-white/[0.08] bg-white/[0.04] opacity-60";
      }
    } else if (mergeMode) {
      pillClass = isMergeSelected
        ? "border-indigo-500/70 bg-indigo-500/15 opacity-100"
        : "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] opacity-70 hover:opacity-100";
    } else {
      pillClass = isExcluded
        ? "border-white/[0.06] bg-transparent opacity-35 hover:opacity-60"
        : "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] opacity-100";
    }

    return (
      <div key={c.name} className="relative">
        <button
          onClick={() => {
            if (isEditing) return;
            if (groupMode) { handleContributorInGroupMode(c.name); }
            else if (mergeMode) { toggleMergeSelect(c.name, displayName); }
            else { onToggle(c.name); }
          }}
          title={tooltipText}
          className={`flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border text-xs font-medium transition-all duration-200 group ${pillClass}`}
        >
          {/* Merge checkbox */}
          {mergeMode && (
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isMergeSelected ? "border-indigo-400 bg-indigo-500/30" : "border-white/20"}`}>
              {isMergeSelected && <Check className="w-2 h-2 text-indigo-300" />}
            </span>
          )}

          {/* Group mode checkbox */}
          {groupMode && activeSection && (
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${inActiveSection ? "border-violet-400 bg-violet-500/30" : "border-white/20"}`}>
              {inActiveSection && <Check className="w-2 h-2 text-violet-300" />}
            </span>
          )}

          {/* Avatar */}
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0"
            style={{
              background: (isExcluded && !mergeMode && !groupMode) ? "rgba(255,255,255,0.06)" : `${color}22`,
              color: (isExcluded && !mergeMode && !groupMode) ? "rgba(255,255,255,0.3)" : color,
            }}
          >
            {initials(displayName)}
          </span>

          {/* Name / inline edit */}
          {isEditing ? (
            <input
              autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
              }}
              onBlur={commitEdit}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent border-b border-indigo-400/50 outline-none text-white/80 text-xs w-24 min-w-0"
            />
          ) : (
            <>
              <span className={`transition-colors ${isExcluded && !mergeMode && !groupMode ? "text-white/30 line-through" : "text-white/70"}`}>
                {displayName}
              </span>

              {!mergeMode && !groupMode && (
                <>
                  <span
                    onClick={(e) => { e.stopPropagation(); startEdit(c.name, effectiveName); }}
                    className="opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity flex-shrink-0 cursor-pointer"
                    title="Rename display name"
                  >
                    <Pencil className="w-2.5 h-2.5 text-white/60" />
                  </span>
                  {isGrouped && (
                    <span
                      onClick={(e) => { e.stopPropagation(); setExpandedGroup(isExpanded ? null : c.name); }}
                      className="flex-shrink-0 cursor-pointer"
                      title={`${identityGroup.identities.length} identities merged — click to manage`}
                    >
                      <span className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold" style={{ background: `${color}25`, color }}>
                        <Users className="w-2.5 h-2.5" />
                        {identityGroup.identities.length}
                      </span>
                    </span>
                  )}
                </>
              )}

              {/* Section badge in group mode (shows which section this contributor belongs to) */}
              {groupMode && inOtherSection && cSection && (
                <span className="text-[9px] text-white/25 font-normal italic truncate max-w-[60px]">{cSection.label}</span>
              )}
            </>
          )}

          {!isExcluded && !isEditing && !groupMode && (
            <span className="text-white/25 font-normal">{c.percentage}%</span>
          )}
          {!isEditing && groupMode && !inOtherSection && (
            <span className="text-white/25 font-normal">{c.percentage}%</span>
          )}
        </button>

        {/* Identity group popover */}
        {isExpanded && identityGroup && !mergeMode && !groupMode && (
          <div
            className="absolute left-0 top-full mt-1 z-50 rounded-xl p-3 min-w-[220px] shadow-2xl border border-white/[0.12]"
            style={{ background: "rgba(14, 14, 26, 0.97)", backdropFilter: "blur(8px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/40 text-[10px] uppercase tracking-widest">Merged identities</span>
              <button onClick={() => setExpandedGroup(null)} className="text-white/20 hover:text-white/50 transition-colors">
                <XIcon className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-0.5">
              {identityGroup.identities.map((identity) => (
                <div key={identity} className="flex items-center justify-between gap-2 py-1 group/item">
                  <span className="text-white/55 text-xs font-mono truncate">{identity}</span>
                  <button
                    onClick={() => removeIdentityFromGroup(identityGroup, identity)}
                    className="opacity-0 group-hover/item:opacity-100 text-white/20 hover:text-red-400/80 transition-all flex-shrink-0"
                    title="Remove from group"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => { onDeleteGroup(identityGroup.id); setExpandedGroup(null); }}
              className="mt-3 text-red-400/40 hover:text-red-400/70 text-[10px] transition-colors"
            >
              Dissolve group
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── JSX ───────────────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.28, ease: [0.23, 1, 0.32, 1] }}
      className="glass rounded-2xl px-5 py-4"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-white/40 text-xs font-medium uppercase tracking-widest">
          Filter contributors
        </span>
        <div className="flex items-center gap-3">
          {!mergeMode && !groupMode && (
            <>
              <button
                onClick={toggleGroupMode}
                className="flex items-center gap-1 text-white/25 hover:text-violet-300 text-xs transition-colors"
                title="Organize contributors into named sections"
              >
                <Layers className="w-3 h-3" />
                Group
              </button>
              <button
                onClick={toggleMergeMode}
                className="flex items-center gap-1 text-white/25 hover:text-indigo-300 text-xs transition-colors"
                title="Merge contributors into a single user"
              >
                <Link2 className="w-3 h-3" />
                Merge
              </button>
            </>
          )}
          {groupMode && (
            <button onClick={toggleGroupMode} className="text-violet-400/80 hover:text-violet-300 text-xs font-medium transition-colors">
              Done
            </button>
          )}
          {mergeMode && (
            <button onClick={toggleMergeMode} className="text-white/40 hover:text-white/70 text-xs transition-colors">
              Cancel
            </button>
          )}
          {!mergeMode && !groupMode && (
            <button
              onClick={noneExcluded ? onExcludeAll : onClear}
              className="text-indigo-400/70 hover:text-indigo-300 text-xs transition-colors"
            >
              {noneExcluded ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>
      </div>

      {/* ── Merge mode hint ── */}
      {mergeMode && (
        <p className="text-white/30 text-xs mb-3">
          Select 2 or more contributors to consolidate into one user
        </p>
      )}

      {/* ── Group mode: section tab bar ── */}
      {groupMode && (
        <div className="mb-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id === activeSection ? null : s.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                  activeSection === s.id
                    ? "bg-violet-500/20 border-violet-500/40 text-violet-200"
                    : "bg-white/[0.04] border-white/[0.08] text-white/40 hover:text-white/70"
                }`}
              >
                {s.label}
                <span className="text-white/25">{s.members.length}</span>
                <span
                  onClick={(e) => { e.stopPropagation(); onDeleteSection(s.id); if (activeSection === s.id) setActiveSection(null); }}
                  className="text-white/15 hover:text-red-400/60 transition-colors"
                  title="Delete section"
                >
                  <XIcon className="w-2.5 h-2.5" />
                </span>
              </button>
            ))}
            {/* New section input */}
            <div className="flex items-center gap-1">
              <input
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createSection()}
                placeholder="New section…"
                className="bg-white/[0.04] border border-white/[0.08] focus:border-violet-500/50 rounded-lg px-2.5 py-1 text-xs text-white/70 placeholder:text-white/20 outline-none w-28 transition-colors"
              />
              <button
                onClick={createSection}
                disabled={!newSectionName.trim()}
                className="text-white/30 hover:text-violet-300 disabled:opacity-30 transition-colors"
                title="Create section"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <p className="text-white/25 text-[11px]">
            {activeSection
              ? <>Click contributors to add / remove from <em className="text-violet-300/70 not-italic font-medium">{sections.find((s) => s.id === activeSection)?.label}</em></>
              : "Select a section above, then click contributors to assign them"}
          </p>
        </div>
      )}

      {/* ── Contributors body ── */}
      {hasSections && !mergeMode ? (
        // Sectioned view
        <div className="space-y-1">
          {sectionedGroups.map(({ section, members }) => {
            const allExcluded = members.every((c) => excluded.has(c.name));
            const someExcluded = members.some((c) => excluded.has(c.name));
            const noneExcluded = !someExcluded;

            return (
              <div key={section.id}>
                {/* Section divider */}
                <div className="flex items-center gap-2 py-1.5">
                  {editingSection === section.id ? (
                    <input
                      autoFocus
                      value={editSectionValue}
                      onChange={(e) => setEditSectionValue(e.target.value)}
                      onBlur={() => commitSectionRename(section)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitSectionRename(section);
                        if (e.key === "Escape") setEditingSection(null);
                      }}
                      className="bg-transparent border-b border-violet-400/50 outline-none text-white/60 text-xs w-32"
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingSection(section.id); setEditSectionValue(section.label); }}
                      className="text-white/35 text-xs hover:text-white/60 transition-colors font-medium whitespace-nowrap"
                      title="Click to rename"
                    >
                      {section.label}
                    </button>
                  )}
                  <div className="flex-1 h-px bg-white/[0.07]" />
                  <span className="text-white/20 text-[10px] tabular-nums">{members.length}</span>
                  <button
                    onClick={() => toggleAllInSection(section)}
                    className={`text-[10px] font-medium transition-colors whitespace-nowrap ${
                      noneExcluded
                        ? "text-white/25 hover:text-white/55"
                        : "text-indigo-400/70 hover:text-indigo-300"
                    }`}
                    title={noneExcluded ? "Deselect all in this group" : "Select all in this group"}
                  >
                    {noneExcluded ? "deselect all" : "select all"}
                  </button>
                  {!groupMode && (
                    <button
                      onClick={() => onDeleteSection(section.id)}
                      className="text-white/15 hover:text-red-400/60 transition-colors"
                      title="Remove section (contributors become ungrouped)"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {/* Section pills */}
                <div className="flex flex-wrap gap-2 pb-1">
                  {members.map((c) => renderPill(c))}
                </div>
              </div>
            );
          })}

          {/* Ungrouped section */}
          {ungrouped.length > 0 && (
            <div>
              <div className="flex items-center gap-2 py-1.5">
                <span className="text-white/18 text-[10px] italic">ungrouped</span>
                <div className="flex-1 h-px bg-white/[0.04]" />
                {!groupMode && (() => {
                  const ungroupedNoneExcluded = ungrouped.every((c) => !excluded.has(c.name));
                  return (
                    <button
                      onClick={() => onToggleMany(ungrouped.map((c) => c.name), ungroupedNoneExcluded)}
                      className={`text-[10px] font-medium transition-colors whitespace-nowrap ${
                        ungroupedNoneExcluded
                          ? "text-white/25 hover:text-white/55"
                          : "text-indigo-400/70 hover:text-indigo-300"
                      }`}
                      title={ungroupedNoneExcluded ? "Deselect all ungrouped" : "Select all ungrouped"}
                    >
                      {ungroupedNoneExcluded ? "deselect all" : "select all"}
                    </button>
                  );
                })()}
              </div>
              <div className="flex flex-wrap gap-2 pb-1">
                {ungrouped.map((c) => renderPill(c))}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Flat view (no sections yet, or merge mode)
        <div className="flex flex-wrap gap-2">
          {contributors.map((c) => renderPill(c))}
        </div>
      )}

      {/* ── Merge action bar ── */}
      {mergeMode && mergeSelected.size >= 2 && (
        <div className="mt-3 flex items-center gap-2">
          <input
            value={mergeName}
            onChange={(e) => setMergeName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createGroup()}
            placeholder="Display name for merged user…"
            className="flex-1 bg-white/[0.05] border border-white/[0.10] focus:border-indigo-500/60 rounded-lg px-2.5 py-1.5 text-white/80 text-xs placeholder:text-white/20 outline-none transition-colors"
          />
          <button
            onClick={createGroup}
            disabled={!mergeName.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/25 hover:bg-indigo-500/40 disabled:opacity-30 text-indigo-300 text-xs font-medium transition-all flex-shrink-0"
          >
            <Link2 className="w-3 h-3" />
            Merge {mergeSelected.size}
          </button>
        </div>
      )}

      {!mergeMode && !groupMode && !noneExcluded && (
        <p className="text-white/20 text-xs mt-3">
          {excluded.size} contributor{excluded.size !== 1 ? "s" : ""} hidden from charts
        </p>
      )}
    </motion.div>
  );
}
