import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "../../utils/supabase/client";
import {
  Users,
  UserCheck,
  FolderKanban,
  Calendar,
  Settings,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Search,
  ChevronRight,
  ChevronDown,
  Building2,
  ExternalLink,
  AlignJustify,
  LayoutGrid,
  Table,
} from "lucide-react";

// ─── Supabase client ──────────────────────────────────────────────────────────

// ─── DB Types ─────────────────────────────────────────────────────────────────

interface DbEmployee { id: number; name: string; notes: string | null; active: boolean; }
interface DbRole { id: number; role_name: string; }
interface DbEmployeeRole { id: number; employee_id: number; role_id: number; }
interface DbProject { id: number; project_name: string; client: string; start_date: string; end_date: string; status: string; timeline_link: string | null; miro_link: string | null; }
interface DbPhase { id: number; phase_group: string; phase_name: string; phase_order: number; }
interface DbProjectPhase { id: number; project_id: number; phase_id: number; start_date: string; end_date: string; }
interface DbAssignment { id: number; employee_id: number; project_phase_id: number; role_id: number; remarks: string | null; }

// ─── UI (joined) Types ────────────────────────────────────────────────────────

interface UIEmployee { id: number; name: string; notes: string | null; active: boolean; roles: DbRole[]; }
interface UIAssignment { id: number; employee: UIEmployee; role: DbRole; remarks: string | null; }
interface UIProjectPhase { id: number; project_id: number; phase: DbPhase; start_date: string; end_date: string; assignments: UIAssignment[]; }
interface UIProject { id: number; project_name: string; client: string; start_date: string; end_date: string; status: string; timeline_link: string | null; miro_link: string | null; color: string; projectPhases: UIProjectPhase[]; }

type View = "all" | "role" | "project" | "timeline" | "manage";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_COLORS = [
  "#0ea5e9",
  "#f59e0b",
  "#8b5cf6",
  "#22c55e",
  "#f43f5e",
  "#06b6d4",
  "#f97316",
];

const ROLE_PALETTES = [
  { bg: "#dbeafe", text: "#1d4ed8" },
  { bg: "#dcfce7", text: "#15803d" },
  { bg: "#ffedd5", text: "#c2410c" },
  { bg: "#f3e8ff", text: "#7e22ce" },
  { bg: "#cffafe", text: "#0e7490" },
  { bg: "#ffe4e6", text: "#be123c" },
  { bg: "#fef9c3", text: "#a16207" },
  { bg: "#e0f2fe", text: "#0369a1" },
];

const roleColor = (roleId: number) => ROLE_PALETTES[(roleId - 1) % ROLE_PALETTES.length];
const projectColor = (projectId: number) => PROJECT_COLORS[(projectId - 1) % PROJECT_COLORS.length];

// ─── Data loading ─────────────────────────────────────────────────────────────

const loadAllData = async (): Promise<{
  employees: UIEmployee[];
  projects: UIProject[];
  roles: DbRole[];
  phases: DbPhase[];
}> => {
  const [empRes, rolesRes, erRes, projRes, phasesRes, ppRes, assignRes] = await Promise.all([
    supabase.from("employees").select("*").order("name"),
    supabase.from("roles").select("*").order("id"),
    supabase.from("employee_roles").select("*"),
    supabase.from("projects").select("*").order("start_date"),
    supabase.from("phases").select("*").order("phase_order"),
    supabase.from("project_phases").select("*"),
    supabase.from("assignments").select("*"),
  ]);

  const dbEmployees: DbEmployee[] = empRes.data ?? [];
  const dbRoles: DbRole[] = rolesRes.data ?? [];
  const dbEmployeeRoles: DbEmployeeRole[] = erRes.data ?? [];
  const dbProjects: DbProject[] = projRes.data ?? [];
  const dbPhases: DbPhase[] = phasesRes.data ?? [];
  const dbProjectPhases: DbProjectPhase[] = ppRes.data ?? [];
  const dbAssignments: DbAssignment[] = assignRes.data ?? [];

  // Build role map
  const roleMap = new Map<number, DbRole>(dbRoles.map((r) => [r.id, r]));

  // Build UIEmployees
  const uiEmployees: UIEmployee[] = dbEmployees.map((emp) => {
    const roles = dbEmployeeRoles
      .filter((er) => er.employee_id === emp.id)
      .map((er) => roleMap.get(er.role_id))
      .filter(Boolean) as DbRole[];
    return { ...emp, roles };
  });

  const empMap = new Map<number, UIEmployee>(uiEmployees.map((e) => [e.id, e]));
  const phaseMap = new Map<number, DbPhase>(dbPhases.map((p) => [p.id, p]));

  // Build UIProjects
  const uiProjects: UIProject[] = dbProjects.map((proj) => {
    const projectPhases = dbProjectPhases
      .filter((pp) => pp.project_id === proj.id)
      .map((pp) => {
        const phase = phaseMap.get(pp.phase_id);
        if (!phase) return null;
        const assignments: UIAssignment[] = dbAssignments
          .filter((a) => a.project_phase_id === pp.id)
          .map((a) => {
            const employee = empMap.get(a.employee_id);
            const role = roleMap.get(a.role_id);
            if (!employee || !role) return null;
            return { id: a.id, employee, role, remarks: a.remarks ?? null };
          })
          .filter(Boolean) as UIAssignment[];
        return {
          id: pp.id,
          project_id: pp.project_id,
          phase,
          start_date: pp.start_date,
          end_date: pp.end_date,
          assignments,
        } as UIProjectPhase;
      })
      .filter(Boolean) as UIProjectPhase[];

    // Sort by phase_order
    projectPhases.sort((a, b) => a.phase.phase_order - b.phase.phase_order);

    return {
      ...proj,
      color: projectColor(proj.id),
      projectPhases,
    };
  });

  return { employees: uiEmployees, projects: uiProjects, roles: dbRoles, phases: dbPhases };
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const fmt = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const fmtShort = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-SG", {
    month: "short",
    year: "2-digit",
  });

const durationText = (start: string, end: string) => {
  const days = Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 86400000
  );
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m > 0 ? `${y}y ${m}mo` : `${y}y`;
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const avatarColor = (name: string) => {
  const palette = [
    "#0ea5e9", "#f59e0b", "#8b5cf6", "#22c55e",
    "#f43f5e", "#06b6d4", "#f97316", "#a855f7",
    "#ec4899", "#84cc16",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
};

// ─── Small UI Components ──────────────────────────────────────────────────────

const Avatar = ({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) => {
  const cls =
    size === "sm" ? "w-6 h-6 text-[10px]" : size === "lg" ? "w-10 h-10 text-sm" : "w-8 h-8 text-xs";
  return (
    <div
      className={`${cls} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 select-none`}
      style={{ backgroundColor: avatarColor(name), fontFamily: "DM Mono, monospace" }}
    >
      {getInitials(name)}
    </div>
  );
};

const RoleBadge = ({ role }: { role: DbRole }) => {
  const c = roleColor(role.id);
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded text-[16px] font-semibold leading-none"
      style={{
        backgroundColor: c.bg,
        color: c.text,
        fontFamily: "Barlow Condensed, sans-serif",
        fontWeight: 700,
        letterSpacing: "0.03em",
      }}
    >
      {role.role_name}
    </span>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    ONGOING: "bg-emerald-100 text-emerald-700",
    COMPLETED: "bg-sky-100 text-sky-700",
    PENDING: "bg-amber-100 text-amber-700",
  };
  const label: Record<string, string> = {
    ONGOING: "Ongoing",
    COMPLETED: "Completed",
    PENDING: "Pending",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold leading-none ${map[status] || "bg-slate-100 text-slate-600"}`}
      style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, letterSpacing: "0.03em" }}
    >
      {label[status] || status}
    </span>
  );
};

const RemarksText = ({ notes }: { notes: string | null }) =>
  notes ? (
    <p className="text-[12px] italic font-normal mt-1" style={{ color: "#64748b", fontFamily: "Inter, sans-serif" }}>
      Remarks: &ldquo;{notes}&rdquo;
    </p>
  ) : null;

const Modal = ({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ backgroundColor: "rgba(15,23,42,0.65)" }}
  >
    <div
      className={`bg-white rounded-lg shadow-2xl flex flex-col ${wide ? "w-full max-w-2xl" : "w-full max-w-md"} max-h-[90vh]`}
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <h2
          className="text-foreground"
          style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "1.2rem", letterSpacing: "0.01em" }}
        >
          {title}
        </h2>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
        >
          <X size={16} />
        </button>
      </div>
      <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
    </div>
  </div>
);

const ConfirmDelete = ({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ backgroundColor: "rgba(15,23,42,0.65)" }}
  >
    <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-6">
      <h3 className="text-foreground mb-2" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>
        Confirm Delete
      </h3>
      <p className="text-sm text-muted-foreground mb-5">
        Delete <strong className="text-foreground font-semibold">{name}</strong>? This action cannot be undone.
      </p>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded text-sm hover:bg-muted transition-colors">
          Cancel
        </button>
        <button onClick={onConfirm} className="px-4 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors">
          Delete
        </button>
      </div>
    </div>
  </div>
);

// ─── View: All Employees ──────────────────────────────────────────────────────

const DirectoryAllView = ({
  employees,
  projects,
}: {
  employees: UIEmployee[];
  projects: UIProject[];
}) => {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid" | "table">("grid");
  const [showPhaseNames, setShowPhaseNames] = useState(false);

  const sorted = useMemo(
    () =>
      [...employees]
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((e) => e.name.toLowerCase().includes(search.toLowerCase())),
    [employees, search]
  );

  const getInvolvement = (employeeId: number) => {
    const result: { project: UIProject; pp: UIProjectPhase; role: DbRole }[] = [];
    for (const project of projects) {
      for (const pp of project.projectPhases) {
        for (const a of pp.assignments) {
          if (a.employee.id === employeeId) result.push({ project, pp, role: a.role, remarks: a.remarks });
        }
      }
    }
    return result;
  };

  // Shared: group involvements by project → role → phase_group → phase_names[]
  const groupInvolvement = (involvements: ReturnType<typeof getInvolvement>) => {
    const grouped: Record<number, {
      project: UIProject;
      roles: Record<number, { role: DbRole; groups: Record<string, { start: string; end: string }>; remarks: string | null }>;
    }> = {};
    for (const inv of involvements) {
      const pid = inv.project.id; const rid = inv.role.id; const pg = inv.pp.phase.phase_group;
      if (inv.role.role_name === "Volume Operator" && pg === "Pre-production") continue;
      if (inv.role.role_name === "3D Artist" && pg === "Production") continue;
      if (!grouped[pid]) grouped[pid] = { project: inv.project, roles: {} };
      if (!grouped[pid].roles[rid]) grouped[pid].roles[rid] = { role: inv.role, groups: {}, remarks: inv.remarks ?? null };
      if (!grouped[pid].roles[rid].remarks && inv.remarks) grouped[pid].roles[rid].remarks = inv.remarks;
      const existing = grouped[pid].roles[rid].groups[pg];
      if (!existing) {
        grouped[pid].roles[rid].groups[pg] = { start: inv.pp.start_date, end: inv.pp.end_date };
      } else {
        if (inv.pp.start_date < existing.start) existing.start = inv.pp.start_date;
        if (inv.pp.end_date > existing.end) existing.end = inv.pp.end_date;
      }
    }
    return Object.values(grouped);
  };

  const InvolvementBlock = ({ involvements }: { involvements: ReturnType<typeof getInvolvement> }) => {
    const grouped = groupInvolvement(involvements);
    if (!grouped.length) return <span className="text-xs text-muted-foreground italic">No project assignments</span>;
    return (
      <div className="space-y-3">
        {grouped.map(({ project, roles, remarks }) => (
          <div key={project.id} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
              <span className="font-semibold text-sm text-foreground">{project.project_name}</span>
            </div>
            {Object.values(roles).map(({ role, groups, remarks }) => (
              <div key={role.id} className="pl-4 space-y-1">
                <RoleBadge role={role} />
                {showPhaseNames && Object.entries(groups).map(([groupName, { start, end }]) => (
                  <div key={groupName} className="flex items-center gap-2 pl-1 flex-wrap">
                    <span className="font-bold text-slate-600 text-[15px]" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>{groupName}</span>
                    <span className="text-[13px] font-bold text-slate-600" style={{ fontFamily: "DM Mono, monospace" }}>{fmt(start)} – {fmt(end)}</span>
                  </div>
                ))}
                <RemarksText notes={remarks} />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const viewButtons: { mode: "list" | "grid" | "table"; icon: React.ReactNode; label: string }[] = [
    { mode: "list", icon: <AlignJustify size={14} />, label: "List" },
    { mode: "grid", icon: <LayoutGrid size={14} />, label: "Grid" },
    { mode: "table", icon: <Table size={14} />, label: "Table" },
  ];

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative max-w-xs w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <span className="text-xs text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
          {sorted.length} of {employees.length}
        </span>
        <button
          onClick={() => setShowPhaseNames(p => !p)}
          className={`text-xs px-3 py-2 rounded border transition-colors ${showPhaseNames ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 bg-white"}`}
          style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 600, letterSpacing: "0.03em" }}
        >
          {showPhaseNames ? "Hide Phases" : "Show Phases"}
        </button>
        <div className="ml-auto flex items-center gap-1 bg-white border border-border rounded p-0.5">
          {viewButtons.map(({ mode, icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                viewMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
              style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 600, letterSpacing: "0.03em" }}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── LIST VIEW ── */}
      {viewMode === "list" && (
        <div className="space-y-2">
          {sorted.map((emp) => (
            <div key={emp.id} className="bg-white border border-border rounded-lg p-4 hover:border-slate-300 transition-colors">
              <div className="flex items-start gap-4">
                <Avatar name={emp.name} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-1.5">
                    <span className="font-bold text-foreground" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "1.05rem" }}>
                      {emp.name}
                    </span>
                    {!emp.active && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500" style={{ fontFamily: "DM Mono, monospace" }}>inactive</span>}
                    {emp.notes && <span className="text-xs text-muted-foreground italic truncate max-w-xs">{emp.notes}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {emp.roles.map((r) => <RoleBadge key={r.id} role={r} />)}
                  </div>
                  <InvolvementBlock involvements={getInvolvement(emp.id)} />
                </div>
              </div>
            </div>
          ))}
          {sorted.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">No humans match your search.</div>}
        </div>
      )}

      {/* ── GRID VIEW ── */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-3 gap-4">
          {sorted.map((emp) => {
            const involvements = getInvolvement(emp.id);
            const grouped = groupInvolvement(involvements);
            return (
              <div key={emp.id} className="bg-white border border-border rounded-lg p-4 hover:border-slate-300 transition-colors flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={emp.name} size="lg" />
                  <div className="min-w-0">
                    <div className="font-bold text-foreground leading-tight" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "1.05rem" }}>
                      {emp.name}
                    </div>
                    {!emp.active && <span className="text-[10px] text-slate-400" style={{ fontFamily: "DM Mono, monospace" }}>inactive</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {emp.roles.map((r) => <RoleBadge key={r.id} role={r} />)}
                </div>
                {emp.notes && <p className="text-xs text-muted-foreground italic">{emp.notes}</p>}
                {grouped.length > 0 ? (
                  <div className="space-y-2 pt-2 border-t border-border/50">
                    {grouped.map(({ project, roles, remarks }) => (
                      <div key={project.id}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                          <span className="text-xs font-semibold text-foreground truncate">{project.project_name}</span>
                        </div>
                        {Object.values(roles).map(({ role, groups, remarks: roleRemarks }) => (
                          <div key={role.id} className="pl-3.5 mb-1">
                            <RoleBadge role={role} />
                            {showPhaseNames && Object.entries(groups).map(([groupName, { start, end }]) => (
                              <div key={groupName} className="flex items-center gap-2 mt-0.5 pl-0.5 flex-wrap">
                                <span className="font-bold text-slate-600 text-[15px]" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>{groupName}</span>
                                <span className="text-[13px] font-bold text-slate-600" style={{ fontFamily: "DM Mono, monospace" }}>{fmt(start)} – {fmt(end)}</span>
                              </div>
                            ))}
                            <RemarksText notes={roleRemarks} />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic pt-2 border-t border-border/50">No assignments</p>
                )}
              </div>
            );
          })}
          {sorted.length === 0 && <div className="col-span-3 text-center py-12 text-muted-foreground text-sm">No humans match your search.</div>}
        </div>
      )}

      {/* ── TABLE VIEW ── */}
      {viewMode === "table" && (
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["NAME", "ROLES", "PROJECTS & PHASES"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-muted-foreground"
                    style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, letterSpacing: "0.07em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((emp, i) => {
                const grouped = groupInvolvement(getInvolvement(emp.id));
                return (
                  <tr key={emp.id} className={`hover:bg-muted/20 transition-colors ${i < sorted.length - 1 ? "border-b border-border/50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={emp.name} size="sm" />
                        <div>
                          <div className="font-semibold text-foreground">{emp.name}</div>
                          {!emp.active && <div className="text-[10px] text-slate-400" style={{ fontFamily: "DM Mono, monospace" }}>inactive</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {emp.roles.map((r) => <RoleBadge key={r.id} role={r} />)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {grouped.length > 0 ? (
                        <div className="space-y-2">
                          {grouped.map(({ project, roles, remarks }) => (
                            <div key={project.id}>
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                                <span className="text-xs font-semibold text-foreground">{project.project_name}</span>
                              </div>
                              {Object.values(roles).map(({ role, groups, remarks: roleRemarks }) => (
                                <div key={role.id} className="pl-3.5 mb-0.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <RoleBadge role={role} />
                                    {showPhaseNames && Object.entries(groups).map(([groupName, { start, end }]) => (
                                      <span key={groupName} className="w-full text-[13px] font-bold text-slate-600 block mt-0.5" style={{ fontFamily: "DM Mono, monospace" }}>
                                        {groupName}: {fmt(start)}–{fmt(end)}
                                      </span>
                                    ))}
                                  </div>
                                  <RemarksText notes={roleRemarks} />
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No assignments</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={3} className="text-center py-12 text-muted-foreground text-sm">No humans match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};

// ─── View: By Role ────────────────────────────────────────────────────────────

const DirectoryByRoleView = ({
  employees,
  projects,
  roles,
}: {
  employees: UIEmployee[];
  projects: UIProject[];
  roles: DbRole[];
}) => {
  const [collapsedRoles, setCollapsedRoles] = useState<Set<number>>(new Set());
  const [roleOrder, setRoleOrder] = useState<number[]>(() => roles.map(r => r.id));

  const ROLE_DISPLAY_ORDER = [
    "VP Producer",
    "VP Supervisor",
    "Technical Director",
    "VAD/3D Artist",
    "3D Artist",
    "Volume Operator",
  ];

  const roleGroups = useMemo(() => {
    const groups = roles.map((role) => ({
      role,
      emps: employees.filter((e) => e.roles.some((r) => r.id === role.id)),
    })).filter((g) => g.emps.length > 0);
    const ordered = roleOrder
      .map(id => groups.find(g => g.role.id === id))
      .filter(Boolean) as typeof groups;
    const remaining = groups.filter(g => !roleOrder.includes(g.role.id));
    const all = [...ordered, ...remaining];
    return all.sort((a, b) => {
      const ai = ROLE_DISPLAY_ORDER.indexOf(a.role.role_name);
      const bi = ROLE_DISPLAY_ORDER.indexOf(b.role.role_name);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [employees, roles, roleOrder]);

  const toggleRoleCollapse = (id: number) =>
    setCollapsedRoles(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const moveRole = (id: number, dir: -1 | 1) =>
    setRoleOrder(prev => {
      const ids = roleGroups.map(g => g.role.id);
      const idx = ids.indexOf(id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= ids.length) return prev;
      const arr = [...ids];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });

  const getInvolvementsInRole = (employeeId: number, roleId: number) => {
    const result: { project: UIProject; pp: UIProjectPhase }[] = [];
    for (const project of projects) {
      for (const pp of project.projectPhases) {
        for (const a of pp.assignments) {
          if (a.employee.id === employeeId && a.role.id === roleId) {
            result.push({ project, pp, remarks: a.remarks ?? null });
          }
        }
      }
    }
    return result;
  };

  return (
    <div className="space-y-5">
      {roleGroups.map(({ role, emps }) => {
        const c = roleColor(role.id);
        return (
          <div key={role.id} className="bg-white border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2 group" style={{ backgroundColor: c.bg + "cc" }}>
              {/* Reorder buttons */}
              <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button onClick={() => moveRole(role.id, -1)} className="leading-none hover:opacity-70" style={{ color: c.text }}>
                  <ChevronDown size={10} className="rotate-180" />
                </button>
                <button onClick={() => moveRole(role.id, 1)} className="leading-none hover:opacity-70" style={{ color: c.text }}>
                  <ChevronDown size={10} />
                </button>
              </div>
              {/* Collapse toggle */}
              <button
                onClick={() => toggleRoleCollapse(role.id)}
                className="flex items-center gap-2.5 flex-1 text-left"
              >
                <RoleBadge role={role} />
                <span className="text-xs" style={{ color: c.text, fontFamily: "DM Mono, monospace", opacity: 0.7 }}>
                  {emps.length} {emps.length === 1 ? "person" : "people"}
                </span>
                <ChevronDown
                  size={12}
                  className={`ml-auto transition-transform flex-shrink-0 ${collapsedRoles.has(role.id) ? "-rotate-90" : ""}`}
                  style={{ color: c.text, opacity: 0.6 }}
                />
              </button>
            </div>
            {!collapsedRoles.has(role.id) && <div className="divide-y divide-border">
              {emps.map((emp) => {
                const involvements = getInvolvementsInRole(emp.id, role.id);
                return (
                  <div key={emp.id} className="px-5 py-3 flex items-start gap-3">
                    <Avatar name={emp.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="font-bold text-sm text-foreground" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700 }}>
                          {emp.name}
                        </span>
                        {emp.roles.length > 1 && (
                          <span className="text-xs text-muted-foreground italic">
                            +{emp.roles.length - 1} other role{emp.roles.length > 2 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {involvements.length > 0 ? (
                        <div className="space-y-2">
                          {(() => {
                            // Group by project → phase_group → phase_names[]
                            const grouped: Record<number, {
                              project: typeof involvements[0]["project"];
                              groups: Record<string, string[]>;
                            }> = {};
                            for (const inv of involvements) {
                              const pid = inv.project.id;
                              const pg = inv.pp.phase.phase_group;
                              if (role.role_name === "Volume Operator" && pg === "Pre-production") continue;
                              if (role.role_name === "3D Artist" && pg === "Production") continue;
                              if (!grouped[pid]) grouped[pid] = { project: inv.project, groups: {} };
                              if (!grouped[pid].groups[pg]) grouped[pid].groups[pg] = [];
                              grouped[pid].groups[pg].push(inv.pp.phase.phase_name);
                            }
                            return Object.values(grouped).map(({ project, groups }) => (
                              <div key={project.id} className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                                  <span className="font-semibold text-sm text-foreground">{project.project_name}</span>
                                </div>
                                {Object.entries(groups).map(([groupName, phaseNames]) => (
                                  <div key={groupName} className="flex items-center gap-1.5 flex-wrap pl-4">
                                    <span className="text-xs text-muted-foreground font-medium flex-shrink-0">{groupName}:</span>
                                    {phaseNames.map((phaseName, pi) => (
                                      <span
                                        key={`${phaseName}-${pi}`}
                                        className="inline-flex items-center px-2 py-0.5 rounded text-[15px] font-semibold leading-none bg-slate-100 text-slate-600"
                                        style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, letterSpacing: "0.03em" }}
                                      >
                                        {phaseName}
                                      </span>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            ));
                          })()}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No current assignments in this role</span>
                      )}
                      <div className="pl-4"><RemarksText notes={involvements.find(inv => inv.remarks)?.remarks ?? null} /></div>
                    </div>
                  </div>
                );
              })}
            </div>}
          </div>
        );
      })}
    </div>
  );
};

// ─── View: By Project ─────────────────────────────────────────────────────────

const DirectoryByProjectView = ({
  employees,
  projects,
  roles,
  onAddAssignment,
  onRemoveAssignment,
}: {
  employees: UIEmployee[];
  projects: UIProject[];
  roles: DbRole[];
  onAddAssignment: (projectPhaseId: number, employeeId: number, roleId: number) => Promise<void>;
  onRemoveAssignment: (id: number) => Promise<void>;
  onCloseProject?: (id: number) => void;
}) => {
  const [expanded, setExpanded] = useState<Record<number, boolean>>(
    Object.fromEntries(projects.map((p) => [p.id, true]))
  );
  const [activePhase, setActivePhase] = useState<number | null>(null);
  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [addEmpId, setAddEmpId] = useState<number | "">("");
  const [addRoleId, setAddRoleId] = useState<number | "">("");
  const [confirmClose, setConfirmClose] = useState<{ id: number; name: string } | null>(null);

  // Group project phases by phase_group
  const groupPhases = (projectPhases: UIProjectPhase[]) => {
    const groups: Record<string, UIProjectPhase[]> = {};
    for (const pp of projectPhases) {
      if (!groups[pp.phase.phase_group]) groups[pp.phase.phase_group] = [];
      groups[pp.phase.phase_group].push(pp);
    }
    return groups;
  };

  const handleAdd = async (ppId: number) => {
    if (!addEmpId || !addRoleId) return;
    await onAddAssignment(ppId, addEmpId as number, addRoleId as number);
    setAddingFor(null);
    setAddEmpId("");
    setAddRoleId("");
  };

  return (
    <div className="space-y-5">
      {projects.map((proj) => {
        const phaseGroups = groupPhases(proj.projectPhases);
        return (
          <div key={proj.id} className="bg-white border border-border rounded-lg overflow-hidden">
            <button
              className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-muted/20 transition-colors"
              onClick={() => setExpanded((e) => ({ ...e, [proj.id]: !e[proj.id] }))}
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: proj.color }} />
              <div className="flex-1 min-w-0">
                {/* Row 1: project name + client */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-foreground" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "1.05rem" }}>
                    {proj.project_name}
                  </span>
                  <span className="text-xs text-muted-foreground">{proj.client}</span>
                </div>
                {/* Row 2: status + links */}
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <StatusBadge status={proj.status} size={14} />
                  {proj.timeline_link && (
                    <a
                      href={proj.timeline_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                    >
                      <ExternalLink size={11} /> Timeline
                    </a>
                  )}
                  {proj.miro_link && (
                    <a
                      href={proj.miro_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-violet-500 hover:text-violet-700 flex items-center gap-0.5"
                    >
                      <ExternalLink size={11} /> Miro
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                  {fmt(proj.start_date)} – {fmt(proj.end_date)}
                </span>
                {expanded[proj.id] ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
              </div>
            </button>

            {expanded[proj.id] && (
              <div className="border-t border-border divide-y divide-border/50">
                {Object.entries(phaseGroups).map(([group, phases]) => (
                  <div key={group} className="px-5 py-4">
                    {/* Group label + all phase pills in one row */}
                    <div className="flex items-center gap-2 flex-wrap mb-4">
                      <span
                        className="text-[15px] font-bold text-muted-foreground mr-1 flex-shrink-0"
                        style={{ fontFamily: "Barlow Condensed, sans-serif", letterSpacing: "0.08em" }}
                      >
                        {group.toUpperCase()}
                      </span>
                      {phases.map((pp) => {
                        const isActive = activePhase === pp.id;
                        return (
                          <button
                            key={pp.id}
                            onClick={() => {
                              setActivePhase(isActive ? null : pp.id);
                              setAddingFor(null);
                              setAddEmpId("");
                              setAddRoleId("");
                            }}
                            className="inline-flex flex-col items-start px-2.5 py-1 rounded transition-colors"
                            style={{
                              fontFamily: "Barlow Condensed, sans-serif",
                              fontWeight: 700,
                              letterSpacing: "0.03em",
                              backgroundColor: isActive ? proj.color : "#f1f5f9",
                              color: isActive ? "#ffffff" : "#475569",
                            }}
                          >
                            <span className="text-[15px] font-semibold leading-tight">{pp.phase.phase_name}</span>
                            <span
                              className="text-[13px] font-normal leading-tight mt-0.5"
                              style={{ opacity: isActive ? 0.85 : 0.6, fontFamily: "DM Mono, monospace", letterSpacing: 0 }}
                            >
                              {fmt(pp.start_date)} – {fmt(pp.end_date)}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Team summary — all employees across this group's phases */}
                    {(() => {
                      const teamMap: Record<number, {
                        employee: UIAssignment["employee"];
                        rolePhases: Record<number, { role: UIAssignment["role"]; phaseNames: string[] }>;
                      }> = {};
                      for (const pp of phases) {
                        for (const a of pp.assignments) {
                          if (!teamMap[a.employee.id]) teamMap[a.employee.id] = { employee: a.employee, rolePhases: {} };
                          if (!teamMap[a.employee.id].rolePhases[a.role.id])
                            teamMap[a.employee.id].rolePhases[a.role.id] = { role: a.role, phaseNames: [] };
                          teamMap[a.employee.id].rolePhases[a.role.id].phaseNames.push(pp.phase.phase_name);
                        }
                      }
                      const team = Object.values(teamMap);
                      if (!team.length) return (
                        <p className="text-xs text-muted-foreground italic mb-1">No assignments yet — click a phase to add people.</p>
                      );
                      return (
                        <div className="grid grid-cols-2 gap-2 mb-1">
                          {team.map(({ employee, rolePhases }) => (
                            <div key={employee.id} className="flex items-start gap-2.5">
                              <Avatar name={employee.name} size="sm" />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-semibold text-foreground" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700 }}>
                                  {employee.name}
                                </span>
                                <div className="mt-0.5 space-y-1">
                                  {Object.values(rolePhases).map(({ role }) => {
                                    const roleRemarks = phases.flatMap(pp => pp.assignments.filter(a => a.employee.id === employee.id && a.role.id === role.id)).find(a => a.remarks)?.remarks ?? null;
                                    return (
                                      <div key={role.id}>
                                        <RoleBadge role={role} />
                                        <RemarksText notes={roleRemarks} />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}


                    {/* Expanded phase detail — shown below pills when a phase is active */}
                    {phases.filter((pp) => activePhase === pp.id).map((pp) => (
                      <div key={pp.id} className="mt-4 pl-2 border-l-2" style={{ borderColor: proj.color }}>
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <span className="text-xs text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                            {fmt(pp.start_date)} – {fmt(pp.end_date)}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                            {durationText(pp.start_date, pp.end_date)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {pp.assignments.map((a) => (
                            <div key={a.id} className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-muted/30 text-xs">
                              <Avatar name={a.employee.name} size="sm" />
                              <span className="font-medium text-foreground">{a.employee.name}</span>
                              <span className="text-muted-foreground">·</span>
                              <RoleBadge role={a.role} />
                              <button
                                onClick={() => onRemoveAssignment(a.id)}
                                className="text-muted-foreground hover:text-red-500 ml-0.5 transition-colors"
                                title="Remove assignment"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          ))}
                        </div>
                        {addingFor === pp.id ? (
                          <div className="flex gap-2 mt-1">
                            <select
                              value={addEmpId}
                              onChange={(e) => setAddEmpId(Number(e.target.value))}
                              className="flex-1 border border-border rounded px-2 py-1.5 text-xs bg-white focus:outline-none"
                            >
                              <option value="">Select human...</option>
                              {employees.map((emp) => (
                                <option key={emp.id} value={emp.id}>{emp.name}</option>
                              ))}
                            </select>
                            <select
                              value={addRoleId}
                              onChange={(e) => setAddRoleId(Number(e.target.value))}
                              className="flex-1 border border-border rounded px-2 py-1.5 text-xs bg-white focus:outline-none"
                            >
                              <option value="">Select role...</option>
                              {roles.map((r) => (
                                <option key={r.id} value={r.id}>{r.role_name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleAdd(pp.id)}
                              disabled={!addEmpId || !addRoleId}
                              className="px-2.5 py-1.5 bg-primary text-primary-foreground rounded text-xs disabled:opacity-40 hover:opacity-90"
                            >
                              <Plus size={12} />
                            </button>
                            <button
                              onClick={() => { setAddingFor(null); setAddEmpId(""); setAddRoleId(""); }}
                              className="px-2.5 py-1.5 border border-border rounded text-xs hover:bg-muted"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setAddingFor(pp.id); setAddEmpId(""); setAddRoleId(""); }}
                            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                          >
                            <Plus size={11} /> Add assignment
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Close Project confirmation modal */}
      {confirmClose && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(15,23,42,0.6)" }}
          onClick={() => setConfirmClose(null)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className="text-foreground mb-1"
              style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "1.15rem" }}
            >
              Close Project
            </h3>
            <p className="text-sm text-muted-foreground mb-1">
              Are you sure you want to close{" "}
              <strong className="text-foreground font-semibold">{confirmClose.name}</strong>?
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              The project will be hidden from the Timeline. You can reopen it anytime via Manage → Projects.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmClose(null)}
                className="px-4 py-2 border border-border rounded text-sm hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { onCloseProject?.(confirmClose.id); setConfirmClose(null); }}
                className="px-4 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
                style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700 }}
              >
                Close Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── View: Timeline (Gantt) ───────────────────────────────────────────────────

const TimelineView = ({ projects }: { projects: UIProject[] }) => {
  const [viewMode, setViewMode] = useState<"gantt" | "calendar">("gantt");
  const [hoveredPP, setHoveredPP] = useState<number | null>(null);
  const [calMonth, setCalMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [hiddenProjects, setHiddenProjects] = useState<Set<number>>(new Set());
  const toggleCalProject = (id: number) =>
    setHiddenProjects(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const { minDate, totalMs, months } = useMemo(() => {
    const allTs = projects.flatMap((p) => [
      new Date(p.start_date).getTime(),
      new Date(p.end_date).getTime(),
      ...p.projectPhases.flatMap((pp) => [
        new Date(pp.start_date).getTime(),
        new Date(pp.end_date).getTime(),
      ]),
    ]);
    if (!allTs.length) return { minDate: new Date(), totalMs: 1, months: [] };

    const min = new Date(Math.min(...allTs));
    const max = new Date(Math.max(...allTs));
    // 2-month padding on each side
    min.setMonth(min.getMonth() - 2, 1);
    max.setMonth(max.getMonth() + 3, 1);

    const ms: { date: Date; label: string }[] = [];
    const cur = new Date(min);
    while (cur <= max) {
      ms.push({
        date: new Date(cur),
        label: cur.toLocaleDateString("en-SG", { month: "short", year: "2-digit" }),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return { minDate: min, totalMs: max.getTime() - min.getTime(), months: ms };
  }, [projects]);

  const pct = (d: string) =>
    ((new Date(d).getTime() - minDate.getTime()) / totalMs) * 100;
  const todayPct = ((new Date().getTime() - minDate.getTime()) / totalMs) * 100;

  const LABEL_W = 200;

  // Calendar helpers
  const { calDays, firstMonday } = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [
      ...Array(firstDow).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const fm = new Date(year, month, 1 - firstDow);
    return { calDays: cells, firstMonday: fm };
  }, [calMonth]);

  const weeks = useMemo(() => {
    const ws = [];
    for (let i = 0; i < calDays.length; i += 7) ws.push(calDays.slice(i, i + 7));
    return ws;
  }, [calDays]);

  const getPhaseSpanInWeek = (pp: UIProjectPhase, weekMon: Date) => {
    const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const weekSun = addDays(weekMon, 6);
    const wMonStr = localDateStr(weekMon);
    const wSunStr = localDateStr(weekSun);
    if (pp.end_date < wMonStr || pp.start_date > wSunStr) return null;
    const clampedStart = pp.start_date >= wMonStr ? pp.start_date : wMonStr;
    const clampedEnd = pp.end_date <= wSunStr ? pp.end_date : wSunStr;
    const startCol = Math.round((new Date(clampedStart + "T00:00:00").getTime() - weekMon.getTime()) / 86400000);
    const endCol = Math.round((new Date(clampedEnd + "T00:00:00").getTime() - weekMon.getTime()) / 86400000);
    return { startCol, endCol, startsHere: pp.start_date >= wMonStr, endsHere: pp.end_date <= wSunStr };
  };

  const localDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const phasesForDay = (day: Date) => {
    const d = localDateStr(day);
    const result: { pp: UIProjectPhase; proj: UIProject }[] = [];
    for (const proj of projects) {
      for (const pp of proj.projectPhases) {
        if (pp.start_date <= d && pp.end_date >= d) result.push({ pp, proj });
      }
    }
    return result;
  };

  const today = localDateStr(new Date());

  const [collapsedProjects, setCollapsedProjects] = useState<Set<number>>(new Set());
  const [projectOrder, setProjectOrder] = useState<number[]>(() => projects.map(p => p.id));

  // Keep order in sync when projects list changes
  const orderedProjects = useMemo(() => {
    const ordered = projectOrder
      .map(id => projects.find(p => p.id === id))
      .filter(Boolean) as UIProject[];
    const newProjs = projects.filter(p => !projectOrder.includes(p.id));
    return [...ordered, ...newProjs];
  }, [projects, projectOrder]);

  const toggleCollapse = (id: number) =>
    setCollapsedProjects(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const moveProject = (id: number, dir: -1 | 1) =>
    setProjectOrder(prev => {
      const ids = [...prev.filter(x => projects.find(p => p.id === x)), ...projects.filter(p => !prev.includes(p.id)).map(p => p.id)];
      const idx = ids.indexOf(id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= ids.length) return prev;
      const arr = [...ids];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-white border border-border rounded p-0.5">
          {([["gantt", "Gantt"], ["calendar", "Calendar"]] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-1.5 rounded text-xs font-semibold transition-colors ${viewMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}`}
              style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, letterSpacing: "0.03em" }}
            >
              {label}
            </button>
          ))}
        </div>
        {viewMode === "gantt" && (
          <button
            onClick={() => {
              const allIds = orderedProjects.map(p => p.id);
              const allCollapsed = allIds.every(id => collapsedProjects.has(id));
              setCollapsedProjects(allCollapsed ? new Set() : new Set(allIds));
            }}
            className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 bg-white transition-colors"
            style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 600, letterSpacing: "0.03em" }}
          >
            {orderedProjects.every(p => collapsedProjects.has(p.id)) ? "Expand All" : "Collapse All"}
          </button>
        )}
        {viewMode === "calendar" && (
          <div className="flex items-center gap-2">
            <button onClick={() => setCalMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="p-1.5 rounded hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight size={14} className="rotate-180" />
            </button>
            <span className="text-sm font-semibold text-foreground min-w-[120px] text-center" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "1rem" }}>
              {calMonth.toLocaleDateString("en-SG", { month: "long", year: "numeric" })}
            </span>
            <button onClick={() => setCalMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="p-1.5 rounded hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── CALENDAR VIEW ── */}
      {viewMode === "calendar" && (
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          {/* Project toggles */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium mr-1" style={{ fontFamily: "Barlow Condensed, sans-serif", letterSpacing: "0.04em" }}>SHOW:</span>
            {projects.map(p => {
              const hidden = hiddenProjects.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleCalProject(p.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold transition-all"
                  style={{
                    fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, letterSpacing: "0.02em",
                    borderColor: hidden ? "#e2e8f0" : p.color,
                    backgroundColor: hidden ? "transparent" : p.color + "18",
                    color: hidden ? "#94a3b8" : p.color,
                    opacity: hidden ? 0.5 : 1,
                  }}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: hidden ? "#cbd5e1" : p.color }} />
                  {p.project_name}
                </button>
              );
            })}
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/30">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
              <div key={d} className="py-2 text-center text-xs font-bold text-muted-foreground" style={{ fontFamily: "Barlow Condensed, sans-serif", letterSpacing: "0.06em" }}>
                {d}
              </div>
            ))}
          </div>

          {/* Week rows */}
          {weeks.map((week, wi) => {
            const weekMon = new Date(firstMonday.getFullYear(), firstMonday.getMonth(), firstMonday.getDate() + wi * 7);
            const weekPhases = projects
              .filter(p => !hiddenProjects.has(p.id))
              .flatMap(proj => proj.projectPhases.map(pp => ({ pp, proj })))
              .map(({ pp, proj }) => ({ pp, proj, span: getPhaseSpanInWeek(pp, weekMon) }))
              .filter(x => x.span !== null)
              .sort((a, b) => a.span!.startCol - b.span!.startCol);
            const rowHeight = Math.max(60, 30 + weekPhases.length * 22 + 6);
            return (
              <div key={wi} className="relative border-b border-border/40 last:border-0" style={{ minHeight: `${rowHeight}px` }}>
                {/* Day numbers */}
                <div className="grid grid-cols-7">
                  {week.map((day, di) => {
                    const isToday = day ? localDateStr(day) === today : false;
                    const isCurrentMonth = day ? day.getMonth() === calMonth.getMonth() : false;
                    return (
                      <div key={di} className={`border-r border-border/20 last:border-0 pt-1.5 px-2 ${isToday ? "bg-amber-50" : !isCurrentMonth ? "bg-muted/10" : ""}`}>
                        {day && (
                          <span
                            className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-amber-500 text-white" : isCurrentMonth ? "text-foreground" : "text-muted-foreground/40"}`}
                            style={{ fontFamily: "DM Mono, monospace" }}
                          >
                            {day.getDate()}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Phase bars */}
                <div className="absolute inset-x-0" style={{ top: "28px" }}>
                  {weekPhases.map(({ pp, proj, span }, idx) => {
                    const left = (span!.startCol / 7) * 100;
                    const width = ((span!.endCol - span!.startCol + 1) / 7) * 100;
                    const spanCols = span!.endCol - span!.startCol + 1;
                    const firstDayPct = (1 / spanCols) * 100;
                    const rStart = span!.startsHere ? "4px" : "0";
                    const rEnd = span!.endsHere ? "4px" : "0";
                    return (
                      <div
                        key={`${proj.id}-${pp.id}-${wi}`}
                        className="absolute"
                        style={{ top: `${idx * 22}px`, left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)`, height: "18px" }}
                        title={`${proj.project_name} — ${pp.phase.phase_name} (${fmt(pp.start_date)} → ${fmt(pp.end_date)})`}
                      >
                        {/* Light continuation bar — full width */}
                        <div
                          className="absolute inset-0 flex items-center"
                          style={{
                            backgroundColor: proj.color + "38",
                            borderRadius: `${rStart} ${rEnd} ${rEnd} ${rStart}`,
                          }}
                        >
                          {!span!.startsHere && (
                            <span className="px-1.5 text-[10px] font-semibold truncate leading-none" style={{ color: proj.color, fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700 }}>
                              {pp.phase.phase_name}
                            </span>
                          )}
                        </div>
                        {/* Full-colour cap — start day only */}
                        {span!.startsHere && (
                          <div
                            className="absolute inset-y-0 flex items-center overflow-hidden"
                            style={{
                              left: 0,
                              width: `${firstDayPct}%`,
                              minWidth: "2px",
                              backgroundColor: proj.color,
                              borderRadius: `4px ${spanCols === 1 ? "4px 4px" : "0 0"} 4px`,
                            }}
                          >
                            <span className="px-1.5 text-white text-[10px] font-semibold truncate leading-none" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700 }}>
                              {pp.phase.phase_name}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── GANTT VIEW ── */}
      {viewMode === "gantt" && <div className="bg-white border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: `${LABEL_W + months.length * 80}px` }}>
          {/* Month header */}

          {orderedProjects.map((proj) => (
            <div key={proj.id}>
              {/* Project header row */}
              <div className="flex items-center border-b border-border/50 group" style={{ minHeight: "36px", backgroundColor: "#f8fafc" }}>
                <div className="flex-shrink-0 px-3 flex items-center gap-1.5" style={{ width: `${LABEL_W}px` }}>
                  {/* Reorder buttons */}
                  <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => moveProject(proj.id, -1)} className="text-muted-foreground hover:text-foreground leading-none" style={{ lineHeight: 1 }}>
                      <ChevronDown size={10} className="rotate-180" />
                    </button>
                    <button onClick={() => moveProject(proj.id, 1)} className="text-muted-foreground hover:text-foreground leading-none" style={{ lineHeight: 1 }}>
                      <ChevronDown size={10} />
                    </button>
                  </div>
                  {/* Collapse toggle */}
                  <button onClick={() => toggleCollapse(proj.id)} className="flex items-center gap-1.5 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: proj.color }} />
                    <span className="font-bold text-xs text-foreground truncate" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, letterSpacing: "0.02em" }}>
                      {proj.project_name}
                    </span>
                    <ChevronDown size={11} className={`flex-shrink-0 text-muted-foreground transition-transform ${collapsedProjects.has(proj.id) ? "-rotate-90" : ""}`} />
                  </button>
                </div>
                <div className="flex-1 relative" style={{ height: "36px" }}>
                  {todayPct >= 0 && todayPct <= 100 && (
                    <div className="absolute top-0 bottom-0 w-px z-10" style={{ left: `${todayPct}%`, backgroundColor: "#ef4444" }} />
                  )}
                  {months.map((_, i) => (
                    <div key={i} className="absolute top-0 bottom-0 w-px border-l border-border/30" style={{ left: `${(i / months.length) * 100}%` }} />
                  ))}
                </div>
              </div>

              {/* Phase rows */}
              {!collapsedProjects.has(proj.id) && proj.projectPhases.map((pp) => {
                const left = pct(pp.start_date);
                const width = pct(pp.end_date) - left;
                const isHovered = hoveredPP === pp.id;

                return (
                  <div
                    key={pp.id}
                    className="flex items-center border-b border-border/30 hover:bg-muted/10 transition-colors"
                    style={{ minHeight: "44px" }}
                  >
                    <div className="flex-shrink-0 px-4 pl-8 flex items-center" style={{ width: `${LABEL_W}px` }}>
                      <span className="text-xs text-muted-foreground truncate">{pp.phase.phase_name}</span>
                    </div>
                    <div
                      className="flex-1 relative"
                      style={{ height: "44px" }}
                      onMouseLeave={() => setHoveredPP(null)}
                    >
                      {months.map((_, i) => (
                        <div key={i} className="absolute top-0 bottom-0 border-l border-border/20" style={{ left: `${(i / months.length) * 100}%` }} />
                      ))}
                      {todayPct >= 0 && todayPct <= 100 && (
                        <div className="absolute top-0 bottom-0 w-px z-10" style={{ left: `${todayPct}%`, backgroundColor: "#ef444460" }} />
                      )}
                      {/* Bar + label — text inside if wide enough, outside if too narrow */}
                      {(() => {
                        const tooNarrow = width < 6;
                        return (
                          <>
                            <div
                              className="absolute top-1/2 -translate-y-1/2 rounded cursor-pointer transition-all duration-100 flex items-center"
                              style={{
                                left: `${Math.max(0, left)}%`,
                                width: `${Math.max(width, 0.3)}%`,
                                height: isHovered ? "28px" : "22px",
                                backgroundColor: proj.color,
                                opacity: isHovered ? 1 : 0.82,
                                zIndex: 5,
                                overflow: tooNarrow ? "visible" : "hidden",
                              }}
                              onMouseEnter={() => setHoveredPP(pp.id)}
                            >
                              {!tooNarrow && (
                                <span className="px-2 text-white text-[11px] font-semibold truncate" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700 }}>
                                  {pp.phase.phase_name}
                                </span>
                              )}
                            </div>
                            {tooNarrow && (
                              <span
                                className="absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold whitespace-nowrap pointer-events-none"
                                style={{
                                  left: `calc(${Math.max(0, left) + Math.max(width, 0.3)}% + 4px)`,
                                  color: "#475569",
                                  fontFamily: "Barlow Condensed, sans-serif",
                                  fontWeight: 700,
                                  zIndex: 6,
                                }}
                              >
                                {pp.phase.phase_name}
                              </span>
                            )}
                          </>
                        );
                      })()}
                      {isHovered && (
                        <div
                          className="absolute z-30 rounded shadow-xl text-xs pointer-events-none"
                          style={{
                            left: `${Math.min(Math.max(left, 0), 60)}%`,
                            top: "calc(100% + 6px)",
                            minWidth: "220px",
                            backgroundColor: "#0f172a",
                            color: "#f8fafc",
                            padding: "10px 12px",
                          }}
                        >
                          <div className="font-bold mb-0.5" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "0.9rem" }}>
                            {pp.phase.phase_name}
                          </div>
                          <div className="mb-2 opacity-60" style={{ fontFamily: "DM Mono, monospace" }}>
                            {fmt(pp.start_date)} → {fmt(pp.end_date)}
                          </div>
                          <div className="font-semibold mb-1 opacity-70 text-[10px] tracking-wider" style={{ fontFamily: "Barlow Condensed, sans-serif", letterSpacing: "0.08em" }}>
                            TEAM ({pp.assignments.length})
                          </div>
                          {pp.assignments.map((a) => (
                            <div key={a.id} className="opacity-80 mb-0.5">
                              {a.employee.name} · {a.role.role_name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="px-4 py-3 bg-muted/20 border-t border-border flex items-center gap-6 flex-wrap text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-px h-4 bg-red-400" />
              <span>Today ({new Date().toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" })})</span>
            </div>
            {orderedProjects.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5">
                <div className="w-5 h-3 rounded" style={{ backgroundColor: p.color }} />
                <span>{p.project_name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>}
    </div>
  );
};

// ─── Employee Form ────────────────────────────────────────────────────────────

const EmployeeForm = ({
  initial,
  allRoles,
  onSave,
  onCancel,
}: {
  initial?: UIEmployee;
  allRoles: DbRole[];
  onSave: (name: string, notes: string, active: boolean, roleIds: number[]) => void;
  onCancel: () => void;
}) => {
  const [name, setName] = useState(initial?.name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [roleIds, setRoleIds] = useState<number[]>(initial?.roles.map((r) => r.id) ?? []);

  const toggleRole = (id: number) =>
    setRoleIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const canSave = name.trim().length > 0;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Full Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jane Smith"
          className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Remarks</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
          rows={2}
          className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white resize-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="active-chk"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="rounded border-border"
        />
        <label htmlFor="active-chk" className="text-sm font-medium text-foreground">Active</label>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Roles</label>
        <div className="flex flex-wrap gap-2">
          {allRoles.map((r) => {
            const selected = roleIds.includes(r.id);
            const c = roleColor(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleRole(r.id)}
                className="px-2.5 py-1 rounded text-[12px] font-semibold border-2 transition-all"
                style={{
                  backgroundColor: selected ? c.bg : "transparent",
                  color: selected ? c.text : "#94a3b8",
                  borderColor: selected ? c.text + "60" : "#e2e8f0",
                  fontFamily: "Barlow Condensed, sans-serif",
                }}
              >
                {r.role_name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2 pt-2 justify-end border-t border-border mt-4">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded text-sm hover:bg-muted transition-colors">
          Cancel
        </button>
        <button
          onClick={() => { if (canSave) onSave(name.trim(), notes.trim(), active, roleIds); }}
          disabled={!canSave}
          className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {initial ? "Save Changes" : "Add Human"}
        </button>
      </div>
    </div>
  );
};

// ─── Project Form ─────────────────────────────────────────────────────────────

interface DateRange { start_date: string; end_date: string; }
interface PhaseInput { phase_id: number; ranges: DateRange[]; }
interface HumanAssignment { employee_id: number; role_id: number; phase_ids: number[]; remarks: string; }

const ProjectForm = ({
  initial,
  masterPhases,
  employees,
  onSave,
  onCancel,
}: {
  initial?: UIProject;
  masterPhases: DbPhase[];
  employees: UIEmployee[];
  onSave: (
    data: { project_name: string; client: string; status: string; start_date: string; end_date: string; timeline_link: string; miro_link: string },
    phaseInputs: { phase_id: number; start_date: string; end_date: string }[],
    humanAssignments: HumanAssignment[]
  ) => void;
  onCancel: () => void;
}) => {
  const [tab, setTab] = useState<"info" | "phases" | "humans">("info");
  const [projectName, setProjectName] = useState(initial?.project_name ?? "");
  const [client, setClient] = useState(initial?.client ?? "");
  const [status, setStatus] = useState(initial?.status ?? "PENDING");
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const [timelineLink, setTimelineLink] = useState(initial?.timeline_link ?? "");
  const [miroLink, setMiroLink] = useState(initial?.miro_link ?? "");

  const today = new Date().toISOString().split("T")[0];
  const later = new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];

  const buildInitialPhaseInputs = (): PhaseInput[] =>
    masterPhases.map((ph) => {
      // Collect all existing project_phases for this master phase
      const existingRanges = initial?.projectPhases
        .filter((pp) => pp.phase.id === ph.id)
        .map((pp) => ({ start_date: pp.start_date, end_date: pp.end_date })) ?? [];
      return {
        phase_id: ph.id,
        ranges: existingRanges.length > 0 ? existingRanges : [{ start_date: today, end_date: later }],
      };
    });

  const [phaseInputs, setPhaseInputs] = useState<PhaseInput[]>(buildInitialPhaseInputs);

  const updateRange = (phaseId: number, rangeIdx: number, updates: Partial<DateRange>) =>
    setPhaseInputs((prev) => prev.map((pi) =>
      pi.phase_id !== phaseId ? pi : {
        ...pi,
        ranges: pi.ranges.map((r, i) => i === rangeIdx ? { ...r, ...updates } : r),
      }
    ));

  const addRange = (phaseId: number) =>
    setPhaseInputs((prev) => prev.map((pi) =>
      pi.phase_id !== phaseId ? pi : { ...pi, ranges: [...pi.ranges, { start_date: today, end_date: later }] }
    ));

  const removeRange = (phaseId: number, rangeIdx: number) =>
    setPhaseInputs((prev) => prev.map((pi) =>
      pi.phase_id !== phaseId ? pi : { ...pi, ranges: pi.ranges.filter((_, i) => i !== rangeIdx) }
    ));

  const buildInitialHumanAssignments = (): HumanAssignment[] => {
    const map: Record<string, { employee_id: number; role_id: number; phase_ids: Set<number>; remarks: string }> = {};
    for (const pp of initial?.projectPhases ?? []) {
      for (const a of pp.assignments) {
        const key = `${a.employee.id}-${a.role.id}`;
        if (!map[key]) map[key] = { employee_id: a.employee.id, role_id: a.role.id, phase_ids: new Set(), remarks: a.remarks ?? "" };
        map[key].phase_ids.add(pp.phase.id);
        if (!map[key].remarks && a.remarks) map[key].remarks = a.remarks;
      }
    }
    return Object.values(map).map(({ employee_id, role_id, phase_ids, remarks }) => ({
      employee_id, role_id, phase_ids: [...phase_ids], remarks,
    }));
  };

  const [humanAssignments, setHumanAssignments] = useState<HumanAssignment[]>(buildInitialHumanAssignments);
  const [addEmpId, setAddEmpId] = useState<number | "">("");
  const [addRoleIds, setAddRoleIds] = useState<number[]>([]);

  const allPhaseIds = masterPhases.map(p => p.id);

  const addHuman = () => {
    if (!addEmpId || addRoleIds.length === 0) return;
    setHumanAssignments(prev => [
      ...prev,
      ...addRoleIds
        .filter(rid => !prev.some(ha => ha.employee_id === (addEmpId as number) && ha.role_id === rid))
        .map(rid => ({ employee_id: addEmpId as number, role_id: rid, phase_ids: [], remarks: "" })),
    ]);
    setAddEmpId(""); setAddRoleIds([]);
  };

  const removeHuman = (idx: number) =>
    setHumanAssignments(prev => prev.filter((_, i) => i !== idx));

  const togglePhaseForHuman = (idx: number, phaseId: number) =>
    setHumanAssignments(prev => prev.map((ha, i) => i !== idx ? ha : {
      ...ha,
      phase_ids: ha.phase_ids.includes(phaseId)
        ? ha.phase_ids.filter(id => id !== phaseId)
        : [...ha.phase_ids, phaseId],
    }));

  const addedEmployeeRoleKeys = new Set(humanAssignments.map(ha => `${ha.employee_id}-${ha.role_id}`));

  const canSave = projectName.trim().length > 0 && client.trim().length > 0;

  const grouped = useMemo(() => {
    const groups: Record<string, { phase: DbPhase; input: PhaseInput }[]> = {};
    for (const phase of masterPhases) {
      const input = phaseInputs.find((pi) => pi.phase_id === phase.id)!;
      if (!groups[phase.phase_group]) groups[phase.phase_group] = [];
      groups[phase.phase_group].push({ phase, input });
    }
    return groups;
  }, [masterPhases, phaseInputs]);

  const handleSave = () => {
    if (!canSave) return;
    const flatPhaseInputs = phaseInputs.flatMap(({ phase_id, ranges }) =>
      ranges.filter(r => r.start_date && r.end_date).map(({ start_date, end_date }) => ({ phase_id, start_date, end_date }))
    );
    onSave(
      { project_name: projectName.trim(), client: client.trim(), status, start_date: startDate, end_date: endDate, timeline_link: timelineLink.trim(), miro_link: miroLink.trim() },
      flatPhaseInputs,
      humanAssignments
    );
  };

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-0 mb-5 border-b border-border">
        {(["info", "phases", "humans"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm -mb-px border-b-2 transition-colors ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, letterSpacing: "0.03em" }}
          >
            {t === "info" ? "Project Info" : t === "phases" ? "Phases" : `Humans (${new Set(humanAssignments.map(ha => ha.employee_id)).size})`}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Project Name</label>
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className="w-full border border-border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Client</label>
            <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Director's Name - Client Company" className="w-full border border-border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border border-border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="ONGOING">Ongoing</option>
              <option value="PENDING">Pending</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border border-border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border border-border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Timeline Link (optional)</label>
            <input value={timelineLink} onChange={(e) => setTimelineLink(e.target.value)} placeholder="https://..." className="w-full border border-border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Miro Link (optional)</label>
            <input value={miroLink} onChange={(e) => setMiroLink(e.target.value)} placeholder="https://miro.com/..." className="w-full border border-border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>
      )}

      {tab === "phases" && (
        <div className="space-y-5">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="text-[10px] font-bold text-muted-foreground tracking-widest mb-2" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
                {group.toUpperCase()}
              </div>
              <div className="space-y-2">
                {items.map(({ phase, input }) => (
                  <div key={phase.id} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-foreground" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700 }}>
                        {phase.phase_name}
                      </span>
                      <button
                        onClick={() => addRange(phase.id)}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                        style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 600 }}
                      >
                        <Plus size={11} /> Add another duration
                      </button>
                    </div>
                    <div className="space-y-2">
                      {input.ranges.map((range, ri) => (
                        <div key={ri} className="flex items-center gap-2">
                          {input.ranges.length > 1 && (
                            <span className="text-[10px] text-muted-foreground w-4 text-right flex-shrink-0" style={{ fontFamily: "DM Mono, monospace" }}>
                              {ri + 1}
                            </span>
                          )}
                          <input
                            type="date"
                            value={range.start_date}
                            onChange={(e) => updateRange(phase.id, ri, { start_date: e.target.value })}
                            className="flex-1 border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <span className="text-xs text-muted-foreground flex-shrink-0">→</span>
                          <input
                            type="date"
                            value={range.end_date}
                            onChange={(e) => updateRange(phase.id, ri, { end_date: e.target.value })}
                            className="flex-1 border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          {input.ranges.length > 1 && (
                            <button
                              onClick={() => removeRange(phase.id, ri)}
                              className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "humans" && (
        <div className="space-y-4">
          {/* Add human row */}
          <div className="flex gap-2">
            <select
              value={addEmpId}
              onChange={(e) => { setAddEmpId(Number(e.target.value)); setAddRoleIds([]); }}
              className="flex-1 border border-border rounded px-2 py-2 text-sm bg-white focus:outline-none"
            >
              <option value="">Select human...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
            <div className="flex-1 border border-border rounded bg-white overflow-hidden disabled:opacity-50">
              {(employees.find(e => e.id === addEmpId)?.roles ?? [])
                .filter(r => !addedEmployeeRoleKeys.has(`${addEmpId}-${r.id}`))
                .map(r => {
                  const selected = addRoleIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={!addEmpId}
                      onClick={() => setAddRoleIds(prev =>
                        prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id]
                      )}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${selected ? "bg-primary/10" : "hover:bg-muted/50"}`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${selected ? "bg-primary border-primary" : "border-border"}`}>
                        {selected && <span className="text-white text-[10px] font-bold">✓</span>}
                      </span>
                      <span className={selected ? "text-foreground font-medium" : "text-muted-foreground"}>{r.role_name}</span>
                    </button>
                  );
                })}
              {!addEmpId && (
                <div className="px-3 py-2 text-sm text-muted-foreground italic">Select a human first</div>
              )}
              {addEmpId && (employees.find(e => e.id === addEmpId)?.roles ?? []).filter(r => !addedEmployeeRoleKeys.has(`${addEmpId}-${r.id}`)).length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground italic">All roles already added</div>
              )}
            </div>
            <button
              onClick={addHuman}
              disabled={!addEmpId || addRoleIds.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded text-sm hover:opacity-90 disabled:opacity-40"
              style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700 }}
            >
              <Plus size={13} /> Add {addRoleIds.length > 1 ? `(${addRoleIds.length})` : ""}
            </button>
          </div>

          {/* Added humans list */}
          {humanAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground italic text-center py-4">No humans assigned yet.</p>
          ) : (
            <div className="space-y-3">
              {humanAssignments.map((ha, idx) => {
                const emp = employees.find(e => e.id === ha.employee_id);
                const role = emp?.roles.find(r => r.id === ha.role_id);
                if (!emp || !role) return null;
                const phasesByGroup = masterPhases.reduce((acc, ph) => {
                  if (!acc[ph.phase_group]) acc[ph.phase_group] = [];
                  acc[ph.phase_group].push(ph);
                  return acc;
                }, {} as Record<string, DbPhase[]>);
                return (
                  <div key={idx} className="border border-border rounded-lg p-3">
                    <div className="flex items-center gap-2.5 mb-2">
                      <Avatar name={emp.name} size="sm" />
                      <span className="font-semibold text-sm text-foreground flex-1" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700 }}>{emp.name}</span>
                      <RoleBadge role={role} />
                      <button onClick={() => removeHuman(idx)} className="text-muted-foreground hover:text-red-500 transition-colors ml-1"><X size={13} /></button>
                    </div>
                    <div className="space-y-2">
                      {Object.entries(phasesByGroup).filter(([group]) => !(role.role_name === "Volume Operator" && group === "Pre-production")).map(([group, phases]) => (
                        <div key={group} className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-bold text-muted-foreground flex-shrink-0" style={{ fontFamily: "Barlow Condensed, sans-serif", letterSpacing: "0.06em" }}>{group}:</span>
                          {(() => {
                            const groupPhaseIds = phases.map(ph => ph.id);
                            const allActive = groupPhaseIds.every(id => ha.phase_ids.includes(id));
                            return (
                              <>
                                <button
                                  onClick={() => {
                                    if (allActive) {
                                      setHumanAssignments(prev => prev.map((a, i) => i !== idx ? a : { ...a, phase_ids: a.phase_ids.filter(id => !groupPhaseIds.includes(id)) }));
                                    } else {
                                      setHumanAssignments(prev => prev.map((a, i) => i !== idx ? a : { ...a, phase_ids: [...new Set([...a.phase_ids, ...groupPhaseIds])] }));
                                    }
                                  }}
                                  className="inline-flex items-center px-2.5 py-1 rounded text-[13px] font-semibold leading-none transition-colors border"
                                  style={{
                                    fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, letterSpacing: "0.03em",
                                    backgroundColor: allActive ? "#ef4444" : "#22c55e",
                                    color: "#ffffff",
                                    borderColor: allActive ? "#ef4444" : "#22c55e",
                                  }}
                                >
                                  {allActive ? "Deselect all" : "Select all"}
                                </button>
                                {phases.map(ph => {
                                  const active = ha.phase_ids.includes(ph.id);
                                  return (
                                    <button
                                      key={ph.id}
                                      onClick={() => togglePhaseForHuman(idx, ph.id)}
                                      className="inline-flex items-center px-2.5 py-1 rounded text-[13px] font-semibold leading-none transition-colors"
                                      style={{
                                        fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, letterSpacing: "0.03em",
                                        backgroundColor: active ? "#0f172a" : "#f1f5f9",
                                        color: active ? "#ffffff" : "#94a3b8",
                                      }}
                                    >
                                      {ph.phase_name}
                                    </button>
                                  );
                                })}
                              </>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                    {/* Remarks input */}
                    <div className="mt-2">
                      <textarea
                        value={ha.remarks}
                        onChange={(e) => setHumanAssignments(prev => prev.map((a, i) => i !== idx ? a : { ...a, remarks: e.target.value }))}
                        placeholder="Remarks (optional)..."
                        rows={2}
                        className="w-full border border-border rounded px-2.5 py-1.5 text-[13px] italic text-slate-500 bg-white focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                        style={{ fontFamily: "Inter, sans-serif" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 justify-end pt-4 mt-4 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded text-sm hover:bg-muted transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {initial ? "Save Changes" : "Add Project"}
        </button>
      </div>
    </div>
  );
};

// ─── View: Manage ─────────────────────────────────────────────────────────────

type ManageModal =
  | null
  | { type: "emp-add" }
  | { type: "emp-edit"; emp: UIEmployee }
  | { type: "proj-add" }
  | { type: "proj-edit"; proj: UIProject };

type DeleteTarget = { kind: "employee" | "project" | "role"; id: number; name: string } | null;

const ManageView = ({
  employees,
  projects,
  roles,
  masterPhases,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onAddProject,
  onUpdateProject,
  onDeleteProject,
  onAddRole,
  onDeleteRole,
  onUpdateRole,
  onCloseProject,
}: {
  employees: UIEmployee[];
  projects: UIProject[];
  roles: DbRole[];
  masterPhases: DbPhase[];
  onAddEmployee: (name: string, notes: string, active: boolean, roleIds: number[]) => Promise<void>;
  onUpdateEmployee: (id: number, name: string, notes: string, active: boolean, roleIds: number[]) => Promise<void>;
  onDeleteEmployee: (id: number) => Promise<void>;
  onAddProject: (
    data: { project_name: string; client: string; status: string; start_date: string; end_date: string; timeline_link: string; miro_link: string },
    phaseInputs: { phase_id: number; start_date: string; end_date: string }[],
    humanAssignments: HumanAssignment[]
  ) => Promise<void>;
  onUpdateProject: (
    id: number,
    data: { project_name: string; client: string; status: string; start_date: string; end_date: string; timeline_link: string; miro_link: string },
    phaseInputs: { phase_id: number; start_date: string; end_date: string }[],
    humanAssignments: HumanAssignment[]
  ) => Promise<void>;
  onDeleteProject: (id: number) => Promise<void>;
  onAddRole: (roleName: string) => Promise<void>;
  onDeleteRole: (id: number) => Promise<void>;
  onUpdateRole: (id: number, roleName: string) => Promise<void>;
  onCloseProject: (id: number) => void;
}) => {
  const [tab, setTab] = useState<"employees" | "projects" | "roles">("employees");
  const [modal, setModal] = useState<ManageModal>(null);
  const [del, setDel] = useState<DeleteTarget>(null);
  const [newRole, setNewRole] = useState("");
  const [editingRole, setEditingRole] = useState<{ id: number; name: string } | null>(null);

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="flex gap-0 mb-6 border-b border-border">
        {(["employees", "projects", "roles"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 -mb-px border-b-2 transition-colors ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "0.95rem", letterSpacing: "0.02em" }}
          >
            {t === "employees" ? `Humans (${employees.length})` : t === "projects" ? `Projects (${projects.length})` : `Roles (${roles.length})`}
          </button>
        ))}
      </div>

      {/* Employees tab */}
      {tab === "employees" && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setModal({ type: "emp-add" })}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:opacity-90 transition-opacity"
            >
              <Plus size={14} /> Add Human
            </button>
          </div>
          <div className="bg-white border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["NAME", "STATUS", "ROLES", "PROJECTS", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs text-muted-foreground"
                      style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, letterSpacing: "0.07em" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...employees].sort((a, b) => a.name.localeCompare(b.name)).map((emp, i, arr) => {
                  const empProjects = projects.filter((p) =>
                    p.projectPhases.some((pp) => pp.assignments.some((a) => a.employee.id === emp.id))
                  );
                  return (
                    <tr key={emp.id} className={`hover:bg-muted/20 transition-colors ${i < arr.length - 1 ? "border-b border-border/50" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={emp.name} size="sm" />
                          <span className="font-medium text-foreground">{emp.name}</span>
                          {emp.notes && <span className="text-xs text-muted-foreground italic truncate max-w-[120px]">{emp.notes}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${emp.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`} style={{ fontFamily: "DM Mono, monospace" }}>
                          {emp.active ? "active" : "inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {emp.roles.map((r) => <RoleBadge key={r.id} role={r} />)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {empProjects.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {empProjects.map((p) => (
                              <span key={p.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-muted/30 text-xs">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                                <span className="text-muted-foreground">{p.project_name}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => setModal({ type: "emp-edit", emp })} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => setDel({ kind: "employee", id: emp.id, name: emp.name })} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Projects tab */}
      {tab === "projects" && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setModal({ type: "proj-add" })}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:opacity-90 transition-opacity"
            >
              <Plus size={14} /> Add Project
            </button>
          </div>
          <div className="space-y-3">
            {projects.map((proj) => (
              <div key={proj.id} className="bg-white border border-border rounded-lg p-4 flex items-start gap-4">
                <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: proj.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-0.5">
                    <span className="font-bold text-foreground" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "1.05rem" }}>
                      {proj.project_name}
                    </span>
                    <StatusBadge status={proj.status} />
                    {proj.timeline_link && (
                      <a href={proj.timeline_link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5">
                        <ExternalLink size={11} /> Timeline
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">{proj.client}</div>
                  <div className="space-y-3 w-full">
                    {(() => {
                      const groups: Record<string, UIProjectPhase[]> = {};
                      for (const pp of proj.projectPhases) {
                        const g = pp.phase.phase_group;
                        if (!groups[g]) groups[g] = [];
                        groups[g].push(pp);
                      }
                      return Object.entries(groups).map(([group, phases]) => (
                        <div key={group}>
                          <div
                            className="text-[10px] font-bold text-muted-foreground mb-1.5"
                            style={{ fontFamily: "Barlow Condensed, sans-serif", letterSpacing: "0.07em" }}
                          >
                            {group.toUpperCase()}
                          </div>
                          <div className="space-y-1">
                            {phases.map((pp) => (
                              <div key={pp.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: proj.color }} />
                                  <span className="font-semibold text-foreground text-sm" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700 }}>
                                    {pp.phase.phase_name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span style={{ fontFamily: "DM Mono, monospace" }}>{fmtShort(pp.start_date)} – {fmtShort(pp.end_date)}</span>
                                  <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                                    {pp.assignments.length} {pp.assignments.length === 1 ? "person" : "people"}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setModal({ type: "proj-edit", proj })} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil size={13} />
                  </button>
                  {proj.status !== "CLOSED" && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Close "${proj.project_name}"?\n\nThis will hide it from the Timeline. You can reopen it by editing the project status.`)) {
                          onCloseProject(proj.id);
                        }
                      }}
                      className="px-2 py-1 rounded border border-border text-xs text-muted-foreground hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                      style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 600 }}
                    >
                      Close Project
                    </button>
                  )}
                  <button onClick={() => setDel({ kind: "project", id: proj.id, name: proj.project_name })} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Roles tab */}
      {tab === "roles" && (
        <div>
          <div className="bg-white border border-border rounded-lg overflow-hidden mb-4">
            {roles.map((role, i) => (
              <div key={role.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border/50" : ""}`}>
                <RoleBadge role={role} />
                {editingRole?.id === role.id ? (
                  <>
                    <input
                      autoFocus
                      value={editingRole.name}
                      onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editingRole.name.trim()) {
                          onUpdateRole(role.id, editingRole.name.trim());
                          setEditingRole(null);
                        }
                        if (e.key === "Escape") setEditingRole(null);
                      }}
                      className="flex-1 border border-border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      onClick={() => { if (editingRole.name.trim()) { onUpdateRole(role.id, editingRole.name.trim()); setEditingRole(null); } }}
                      className="p-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      <Check size={13} />
                    </button>
                    <button onClick={() => setEditingRole(null)} className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors">
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-foreground">{role.role_name}</span>
                    <button
                      onClick={() => setEditingRole({ id: role.id, name: role.role_name })}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDel({ kind: "role", id: role.id, name: role.role_name })}
                      className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            ))}
            {roles.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm italic">No roles yet.</div>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="New role name..."
              className="flex-1 border border-border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newRole.trim()) {
                  onAddRole(newRole.trim());
                  setNewRole("");
                }
              }}
            />
            <button
              onClick={() => { if (newRole.trim()) { onAddRole(newRole.trim()); setNewRole(""); } }}
              disabled={!newRole.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:opacity-90 disabled:opacity-40"
            >
              <Plus size={14} /> Add Role
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {modal?.type === "emp-add" && (
        <Modal title="Add Human" onClose={() => setModal(null)}>
          <EmployeeForm
            allRoles={roles}
            onSave={async (name, notes, active, roleIds) => {
              await onAddEmployee(name, notes, active, roleIds);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
      {modal?.type === "emp-edit" && (
        <Modal title="Edit Human" onClose={() => setModal(null)}>
          <EmployeeForm
            initial={modal.emp}
            allRoles={roles}
            onSave={async (name, notes, active, roleIds) => {
              await onUpdateEmployee(modal.emp.id, name, notes, active, roleIds);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
      {modal?.type === "proj-add" && (
        <Modal title="Add Project" onClose={() => setModal(null)} wide>
          <ProjectForm
            masterPhases={masterPhases}
            employees={employees}
            onSave={async (data, phaseInputs, humanAssignments) => {
              await onAddProject(data, phaseInputs, humanAssignments);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
      {modal?.type === "proj-edit" && (
        <Modal title="Edit Project" onClose={() => setModal(null)} wide>
          <ProjectForm
            initial={modal.proj}
            masterPhases={masterPhases}
            employees={employees}
            onSave={async (data, phaseInputs, humanAssignments) => {
              await onUpdateProject(modal.proj.id, data, phaseInputs, humanAssignments);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
      {del && (
        <ConfirmDelete
          name={del.name}
          onConfirm={async () => {
            if (del.kind === "employee") await onDeleteEmployee(del.id);
            else if (del.kind === "project") await onDeleteProject(del.id);
            else if (del.kind === "role") await onDeleteRole(del.id);
            setDel(null);
          }}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV: { view: View; label: string; icon: React.ReactNode; group: string }[] = [
  { view: "all", label: "All Humans", icon: <Users size={15} />, group: "Directory" },
  { view: "project", label: "By Project", icon: <FolderKanban size={15} />, group: "Directory" },
  { view: "role", label: "By Role", icon: <UserCheck size={15} />, group: "Directory" },
  { view: "timeline", label: "Timeline", icon: <Calendar size={15} />, group: "Planning" },
  { view: "manage", label: "Manage", icon: <Settings size={15} />, group: "Admin" },
];

const GROUPS = ["Directory", "Planning", "Admin"];

const VIEW_HEADER: Record<View, { title: string; subtitle: string }> = {
  all: { title: "All Humans", subtitle: "Alphabetical directory with project and phase assignments" },
  role: { title: "By Role", subtitle: "Humans grouped by their functional role" },
  project: { title: "By Project", subtitle: "Human assignments organised by project and phase" },
  timeline: { title: "Project Timeline", subtitle: "Gantt view — hover phases to see team" },
  manage: { title: "Manage", subtitle: "Add, edit, or remove humans, projects, and roles" },
};

const Sidebar = ({
  view,
  setView,
  empCount,
  ongoingCount,
  closedCount,
  inImsCount,
  missingCount,
}: {
  view: View;
  setView: (v: View) => void;
  empCount: number;
  ongoingCount: number;
  closedCount: number;
  inImsCount: number;
  missingCount: number;
}) => (
  <aside className="flex flex-col h-full flex-shrink-0" style={{ width: "280px", backgroundColor: "#0f172a" }}>
    <div className="px-5 py-6 flex items-center gap-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
      <div className="w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f59e0b" }}>
        <Building2 size={28} className="text-white" />
      </div>
      <div>
        <div className="flex flex-col leading-tight">
          <span className="text-white font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "1.4rem", letterSpacing: "0.04em" }}>Humans™ of</span>
          <span className="text-white font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "1.4rem", letterSpacing: "0.04em" }}>Anomalyst</span>
        </div>
        <div className="leading-none mt-1" style={{ color: "rgba(255,255,255,0.35)", fontFamily: "DM Mono, monospace", fontSize: "0.65rem", letterSpacing: "0.02em" }}>
          Manage your humans responsibly.
        </div>
      </div>
    </div>
    <div className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-3 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
      <div>
        <div className="text-white font-bold leading-none" style={{ fontFamily: "DM Mono, monospace", fontSize: "1.25rem" }}>{empCount}</div>
        <div className="mt-0.5" style={{ color: "rgba(255,255,255,0.35)", fontFamily: "Barlow Condensed, sans-serif", fontSize: "0.65rem", letterSpacing: "0.07em" }}>HUMANS</div>
      </div>
      <div>
        <div className="font-bold leading-none" style={{ fontFamily: "DM Mono, monospace", fontSize: "1.25rem", color: inImsCount > 0 ? "#34d399" : "rgba(255,255,255,0.3)" }}>{inImsCount}</div>
        <div className="mt-0.5" style={{ color: "rgba(255,255,255,0.35)", fontFamily: "Barlow Condensed, sans-serif", fontSize: "0.65rem", letterSpacing: "0.07em" }}>IN IMS</div>
      </div>
      <div>
        <div className="text-white font-bold leading-none" style={{ fontFamily: "DM Mono, monospace", fontSize: "1.25rem" }}>{ongoingCount}</div>
        <div className="mt-0.5" style={{ color: "rgba(255,255,255,0.35)", fontFamily: "Barlow Condensed, sans-serif", fontSize: "0.65rem", letterSpacing: "0.07em" }}>ONGOING PROJECTS</div>
      </div>
      <div>
        <div className="text-white font-bold leading-none" style={{ fontFamily: "DM Mono, monospace", fontSize: "1.25rem" }}>{closedCount}</div>
        <div className="mt-0.5" style={{ color: "rgba(255,255,255,0.35)", fontFamily: "Barlow Condensed, sans-serif", fontSize: "0.65rem", letterSpacing: "0.07em" }}>CLOSED PROJECTS</div>
      </div>
    </div>
    <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
      {GROUPS.map((group) => (
        <div key={group}>
          <div className="px-2 mb-1.5" style={{ color: "rgba(255,255,255,0.28)", fontFamily: "Barlow Condensed, sans-serif", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em" }}>
            {group.toUpperCase()}
          </div>
          {NAV.filter((n) => n.group === group).map((item) => {
            const active = view === item.view;
            return (
              <button
                key={item.view}
                onClick={() => setView(item.view)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all mb-0.5"
                style={{ backgroundColor: active ? "rgba(245,158,11,0.15)" : "transparent", color: active ? "#ffffff" : "rgba(255,255,255,0.45)" }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.8)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.45)"; }}
              >
                <span style={{ color: active ? "#f59e0b" : "inherit" }}>{item.icon}</span>
                <span style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: active ? 700 : 400, fontSize: "0.9rem", letterSpacing: "0.02em" }}>
                  {item.label}
                </span>
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#f59e0b" }} />}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  </aside>
);

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>("all");
  const [employees, setEmployees] = useState<UIEmployee[]>([]);
  const [projects, setProjects] = useState<UIProject[]>([]);
  const [roles, setRoles] = useState<DbRole[]>([]);
  const [masterPhases, setMasterPhases] = useState<DbPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshData = async () => {
    const result = await loadAllData();
    setEmployees(result.employees);
    setProjects(result.projects);
    setRoles(result.roles);
    setMasterPhases(result.phases);
  };

  useEffect(() => {
    loadAllData()
      .then((result) => {
        setEmployees(result.employees);
        setProjects(result.projects);
        setRoles(result.roles);
        setMasterPhases(result.phases);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load data:", err);
        setLoading(false);
      });
  }, []);

  const withSaveStatus = async (fn: () => Promise<void>) => {
    setSaveStatus("saving");
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    try {
      await fn();
      await refreshData();
      setSaveStatus("saved");
      savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
    }
  };

  // ── CRUD: Employees ──────────────────────────────────────────────────────────

  const addEmployee = (name: string, notes: string, active: boolean, roleIds: number[]) =>
    withSaveStatus(async () => {
      const { data, error } = await supabase.from("employees").insert({ name, notes: notes || null, active }).select().single();
      if (error) throw error;
      const empId = data.id;
      if (roleIds.length > 0) {
        const { error: erErr } = await supabase.from("employee_roles").insert(roleIds.map((role_id) => ({ employee_id: empId, role_id })));
        if (erErr) throw erErr;
      }
      await refreshData();
    });

  const updateEmployee = (id: number, name: string, notes: string, active: boolean, roleIds: number[]) =>
    withSaveStatus(async () => {
      const { error } = await supabase.from("employees").update({ name, notes: notes || null, active }).eq("id", id);
      if (error) throw error;
      // Find which roles are being removed
      const { data: oldRoles } = await supabase.from("employee_roles").select("role_id").eq("employee_id", id);
      const oldRoleIds = (oldRoles ?? []).map((r: { role_id: number }) => r.role_id);
      const removedRoleIds = oldRoleIds.filter(rid => !roleIds.includes(rid));
      // Delete assignments for removed roles
      if (removedRoleIds.length > 0) {
        const { error: aErr } = await supabase.from("assignments")
          .delete()
          .eq("employee_id", id)
          .in("role_id", removedRoleIds);
        if (aErr) throw aErr;
      }
      // Update employee_roles
      const { error: delErr } = await supabase.from("employee_roles").delete().eq("employee_id", id);
      if (delErr) throw delErr;
      if (roleIds.length > 0) {
        const { error: insErr } = await supabase.from("employee_roles").insert(roleIds.map((role_id) => ({ employee_id: id, role_id })));
        if (insErr) throw insErr;
      }
      await refreshData();
    });

  const deleteEmployee = (id: number) =>
    withSaveStatus(async () => {
      const { error: aErr } = await supabase.from("assignments").delete().eq("employee_id", id);
      if (aErr) throw aErr;
      const { error: erErr } = await supabase.from("employee_roles").delete().eq("employee_id", id);
      if (erErr) throw erErr;
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
      await refreshData();
    });

  // ── CRUD: Projects ───────────────────────────────────────────────────────────

  const addProject = (
    data: { project_name: string; client: string; status: string; start_date: string; end_date: string; timeline_link: string; miro_link: string },
    phaseInputs: { phase_id: number; start_date: string; end_date: string }[],
    humanAssignments: HumanAssignment[]
  ) =>
    withSaveStatus(async () => {
      const { data: proj, error } = await supabase
        .from("projects")
        .insert({ project_name: data.project_name, client: data.client, status: data.status, start_date: data.start_date, end_date: data.end_date, timeline_link: data.timeline_link || null, miro_link: data.miro_link || null })
        .select().single();
      if (error) throw error;
      if (phaseInputs.length > 0) {
        const { data: newPPs, error: ppErr } = await supabase.from("project_phases")
          .insert(phaseInputs.map((pi) => ({ project_id: proj.id, phase_id: pi.phase_id, start_date: pi.start_date, end_date: pi.end_date })))
          .select("id, phase_id");
        if (ppErr) throw ppErr;
        const assignRows = humanAssignments.flatMap(ha =>
          ha.phase_ids.flatMap((pid, phaseIdx) => (newPPs ?? []).filter(pp => pp.phase_id === pid).map(pp => ({ employee_id: ha.employee_id, project_phase_id: pp.id, role_id: ha.role_id, remarks: phaseIdx === 0 ? (ha.remarks || null) : null })))
        );
        if (assignRows.length > 0) { const { error: aErr } = await supabase.from("assignments").insert(assignRows); if (aErr) throw aErr; }
      }
      await refreshData();
    });

  const closeProject = (id: number) =>
    withSaveStatus(async () => {
      const { error } = await supabase.from("projects").update({ status: "CLOSED" }).eq("id", id);
      if (error) throw error;
      await refreshData();
    });

  const updateProject = (
    id: number,
    data: { project_name: string; client: string; status: string; start_date: string; end_date: string; timeline_link: string; miro_link: string },
    phaseInputs: { phase_id: number; start_date: string; end_date: string }[],
    humanAssignments: HumanAssignment[]
  ) =>
    withSaveStatus(async () => {
      const { error } = await supabase
        .from("projects")
        .update({ project_name: data.project_name, client: data.client, status: data.status, start_date: data.start_date, end_date: data.end_date, timeline_link: data.timeline_link || null, miro_link: data.miro_link || null })
        .eq("id", id);
      if (error) throw error;
      const { data: existingPPs, error: fetchErr } = await supabase.from("project_phases").select("id").eq("project_id", id);
      if (fetchErr) throw fetchErr;
      const ppIds = (existingPPs ?? []).map((pp: { id: number }) => pp.id);
      if (ppIds.length > 0) { const { error: aErr } = await supabase.from("assignments").delete().in("project_phase_id", ppIds); if (aErr) throw aErr; }
      const { error: ppDelErr } = await supabase.from("project_phases").delete().eq("project_id", id);
      if (ppDelErr) throw ppDelErr;
      if (phaseInputs.length > 0) {
        const { data: newPPs, error: ppInsErr } = await supabase.from("project_phases")
          .insert(phaseInputs.map((pi) => ({ project_id: id, phase_id: pi.phase_id, start_date: pi.start_date, end_date: pi.end_date })))
          .select("id, phase_id");
        if (ppInsErr) throw ppInsErr;
        const assignRows = humanAssignments.flatMap(ha =>
          ha.phase_ids.flatMap((pid, phaseIdx) => (newPPs ?? []).filter(pp => pp.phase_id === pid).map(pp => ({ employee_id: ha.employee_id, project_phase_id: pp.id, role_id: ha.role_id, remarks: phaseIdx === 0 ? (ha.remarks || null) : null })))
        );
        if (assignRows.length > 0) { const { error: aErr } = await supabase.from("assignments").insert(assignRows); if (aErr) throw aErr; }
      }
      await refreshData();
    });

  const deleteProject = (id: number) =>
    withSaveStatus(async () => {
      const { data: ppData, error: ppFetchErr } = await supabase.from("project_phases").select("id").eq("project_id", id);
      if (ppFetchErr) throw ppFetchErr;
      const ppIds = (ppData ?? []).map((pp: { id: number }) => pp.id);
      if (ppIds.length > 0) {
        const { error: aErr } = await supabase.from("assignments").delete().in("project_phase_id", ppIds);
        if (aErr) throw aErr;
      }
      const { error: ppErr } = await supabase.from("project_phases").delete().eq("project_id", id);
      if (ppErr) throw ppErr;
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
      await refreshData();
    });

  // ── CRUD: Assignments ────────────────────────────────────────────────────────

  const addAssignment = (projectPhaseId: number, employeeId: number, roleId: number) =>
    withSaveStatus(async () => {
      const { error } = await supabase.from("assignments").insert({ project_phase_id: projectPhaseId, employee_id: employeeId, role_id: roleId });
      if (error) throw error;
    });

  const removeAssignment = (id: number) =>
    withSaveStatus(async () => {
      const { error } = await supabase.from("assignments").delete().eq("id", id);
      if (error) throw error;
    });

  // ── CRUD: Roles ──────────────────────────────────────────────────────────────

  const addRole = (roleName: string) =>
    withSaveStatus(async () => {
      const { error } = await supabase.from("roles").insert({ role_name: roleName });
      if (error) throw error;
    });

  const deleteRole = (id: number) =>
    withSaveStatus(async () => {
      const { data: refs } = await supabase.from("employee_roles").select("id").eq("role_id", id).limit(1);
      if (refs && refs.length > 0) {
        throw new Error("Cannot delete role: it is still assigned to employees.");
      }
      const { error } = await supabase.from("roles").delete().eq("id", id);
      if (error) throw error;
    });

  const updateRole = (id: number, roleName: string) =>
    withSaveStatus(async () => {
      const { error } = await supabase.from("roles").update({ role_name: roleName }).eq("id", id);
      if (error) throw error;
    });

  const header = VIEW_HEADER[view];

  return (
    <div className="flex h-screen bg-background overflow-hidden" style={{ fontFamily: "Inter, sans-serif" }}>
      <Sidebar
        view={view}
        setView={setView}
        empCount={employees.length}
        ongoingCount={projects.filter(p => p.status !== "CLOSED").length}
        closedCount={projects.filter(p => p.status === "CLOSED").length}
        inImsCount={(() => {
          const today = new Date().toISOString().split("T")[0];
          const ids = new Set<number>();
          for (const proj of projects) {
            for (const pp of proj.projectPhases) {
              if (
                pp.phase.phase_group === "Production" &&
                pp.start_date <= today &&
                pp.end_date >= today
              ) {
                pp.assignments.forEach(a => ids.add(a.employee.id));
              }
            }
          }
          return ids.size;
        })()}
        missingCount={0}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex-shrink-0 bg-card border-b border-border px-8 py-4 flex items-center justify-between">
          <div>
            <h1
              className="text-foreground leading-none"
              style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "1.35rem", letterSpacing: "0.01em" }}
            >
              {view === "all" ? "All Humans" : header.title}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{header.subtitle}</p>
          </div>
          <div className="flex items-center gap-4">
            {saveStatus === "saving" && (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5" style={{ fontFamily: "DM Mono, monospace" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Saving…
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-xs text-emerald-600 flex items-center gap-1.5" style={{ fontFamily: "DM Mono, monospace" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-xs text-red-500 flex items-center gap-1.5" style={{ fontFamily: "DM Mono, monospace" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Save failed
              </span>
            )}
            <span className="text-xs text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
              {new Date().toLocaleDateString("en-SG", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
            </span>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-8">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-8 h-8 rounded-full border-2 border-border border-t-primary animate-spin" />
              <span className="text-sm text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                Loading from Supabase…
              </span>
            </div>
          )}
          {!loading && (
            <>
              {view === "all" && <DirectoryAllView employees={employees} projects={projects} />}
              {view === "role" && <DirectoryByRoleView employees={employees} projects={projects} roles={roles} />}
              {view === "project" && (
                <DirectoryByProjectView
                  employees={employees}
                  projects={projects}
                  roles={roles}
                  onAddAssignment={addAssignment}
                  onRemoveAssignment={removeAssignment}
                  onCloseProject={closeProject}
                />
              )}
              {view === "timeline" && <TimelineView projects={projects.filter(p => p.status !== "CLOSED")} />}
              {view === "manage" && (
                <ManageView
                  employees={employees}
                  projects={projects}
                  roles={roles}
                  masterPhases={masterPhases}
                  onAddEmployee={addEmployee}
                  onUpdateEmployee={updateEmployee}
                  onDeleteEmployee={deleteEmployee}
                  onAddProject={addProject}
                  onUpdateProject={updateProject}
                  onDeleteProject={deleteProject}
                  onCloseProject={closeProject}
                  onAddRole={addRole}
                  onDeleteRole={deleteRole}
                  onUpdateRole={updateRole}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
