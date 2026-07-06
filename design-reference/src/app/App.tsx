import { useState, useEffect } from "react";
import {
  Calendar, Sparkles, CheckSquare, Inbox, Users,
  Video, BookOpen, FileText, Activity, Settings, Moon,
  Search, Plus, ArrowLeft, ArrowUpRight, Paperclip,
  Flag, Archive, Send, ChevronRight, ChevronDown, ChevronUp,
  X, Check, Clock, Link2, Trash2, Edit2,
  BellOff, UserCircle, AlertTriangle, MoreHorizontal, RotateCcw,
  LayoutDashboard, Bell, Zap, BookMarked, Columns3, List,
  ExternalLink, MessageSquare, Paperclip as PaperclipIcon,
} from "lucide-react";
import mainstMark from "../imports/mainst-mark-dark.png";
import mainstMarkLight from "../imports/mainst-mark-light.png";

// ── Tokens — light & dark ────────────────────────────────────
const DARK_T = {
  navy:      "#0B1117",
  navySurf:  "#111821",
  slate:     "#1C2433",
  slateUp:   "#243040",
  slateHi:   "#2D3A4F",
  ivory:     "#F2F2EE",
  ivory2:    "rgba(242,242,238,0.65)",
  ivory3:    "rgba(242,242,238,0.38)",
  ivory4:    "rgba(242,242,238,0.15)",
  sg:        "#36B3A6",
  sg400:     "#5CC6BB",
  sgSoft:    "rgba(54,179,166,0.10)",
  sgBorder:  "rgba(54,179,166,0.22)",
  coolGray:  "#A6ADB4",
  border:    "rgba(166,173,180,0.13)",
  border2:   "rgba(166,173,180,0.22)",
  warn:      "#E0A458",
  warnSoft:  "rgba(224,164,88,0.12)",
  danger:    "#D8695C",
  dangerSoft:"rgba(216,105,92,0.12)",
  info:      "#5C9CD8",
  infoSoft:  "rgba(92,156,216,0.12)",
  meritRed:  "#D8695C",
  meritSoft: "rgba(216,105,92,0.12)",
};

const LIGHT_T = {
  navy:      "#F2F2EE",             // page background — ivory
  navySurf:  "#FFFFFF",             // nav + header surfaces — white
  slate:     "#FFFFFF",             // cards — white
  slateUp:   "#F0F0EB",             // hover — warm off-white
  slateHi:   "#E5E5DF",             // selected
  ivory:     "#0B1117",             // primary text — midnight navy
  ivory2:    "rgba(11,17,23,0.68)", // secondary text
  ivory3:    "rgba(11,17,23,0.40)", // muted text
  ivory4:    "rgba(11,17,23,0.08)", // very muted / ghost
  sg:        "#2A9084",             // sea glass press (legible on white)
  sg400:     "#36B3A6",
  sgSoft:    "rgba(42,144,132,0.09)",
  sgBorder:  "rgba(42,144,132,0.25)",
  coolGray:  "#6B7480",
  border:    "rgba(11,17,23,0.09)",
  border2:   "rgba(11,17,23,0.16)",
  warn:      "#B86B20",             // darker amber for light bg
  warnSoft:  "rgba(184,107,32,0.10)",
  danger:    "#B84D42",             // darker red for light bg
  dangerSoft:"rgba(184,77,66,0.09)",
  info:      "#3A78C4",
  infoSoft:  "rgba(58,120,196,0.10)",
  meritRed:  "#B84D42",
  meritSoft: "rgba(184,77,66,0.09)",
};

// Mutable — reassigned by App before each render tree
let T = DARK_T;

// ── Types ────────────────────────────────────────────────────
interface Pathway {
  key: string; label: string; color: string; bg: string; count: number;
}
interface Thread {
  key: string; subject: string; who: string; accountName: string | null;
  summary: string | null; lastAtISO: string; count: number;
  unread: boolean; needsAction: boolean; reviewed: boolean;
  replied: boolean; hasAttachments: boolean; flagged: boolean;
  snoozedUntil: string | null; priority: "high" | null;
  pathway: string | null; lastDirection: "inbound" | "outbound";
  participants: { name: string; email: string; type: "external" | "internal" }[];
}
interface Folder { key: string; label: string; count: number; group: "top" | "pathway" }

// ── Pathway palette options ───────────────────────────────────
const PALETTE_OPTIONS = [
  { color: T.danger,   bg: T.dangerSoft },
  { color: T.sg,       bg: T.sgSoft },
  { color: T.warn,     bg: T.warnSoft },
  { color: T.info,     bg: T.infoSoft },
  { color: "#9B7CC4",  bg: "rgba(155,124,196,0.12)" },
  { color: "#7BAD72",  bg: "rgba(123,173,114,0.12)" },
  { color: T.coolGray, bg: "rgba(166,173,180,0.10)" },
];

const DEFAULT_PATHWAYS: Pathway[] = [
  { key: "needs-reply",   label: "Needs reply",   color: T.danger,   bg: T.dangerSoft,  count: 12 },
  { key: "quote-request", label: "Quote",          color: T.sg,       bg: T.sgSoft,      count: 9  },
  { key: "quality-pcn",  label: "Quality / PCN",  color: T.warn,     bg: T.warnSoft,    count: 4  },
  { key: "logistics",    label: "Logistics",      color: T.info,     bg: T.infoSoft,    count: 8  },
  { key: "fyi",          label: "FYI",            color: T.coolGray, bg: "rgba(166,173,180,0.10)", count: 17 },
  { key: "noise",        label: "Noise",          color: T.coolGray, bg: "rgba(166,173,180,0.08)", count: 10 },
];

// ── Mock data ─────────────────────────────────────────────────
const ACCT_COLORS: Record<string, string> = {
  "ReCurve Medical": T.info, "Biotronik": "#9B7CC4",
  "Intuitive Surgical": T.warn, "Merit Medical": T.meritRed,
  "Stryker": T.sg, "Flex": "#7BAD72", "Microsoft": T.coolGray,
};
function acctColor(name: string): string {
  if (ACCT_COLORS[name]) return ACCT_COLORS[name];
  const p = [T.info, "#9B7CC4", T.sg, "#7BAD72", T.warn];
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return p[h % p.length];
}
function initials(name: string): string {
  return name.replace(/@.*/, "").split(/[\s._@-]+/).filter(Boolean)
    .slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}
function rel(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now"; if (m < 60) return `${m}m`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

const INIT_THREADS: Thread[] = [
  {
    key: "tiger-syringe", subject: "Tiger (RegenTX) Custom 3ml Syringe Kit — Program Plan & Schedule",
    who: "avillarrealberain@rtxpartnersllc.com", accountName: "ReCurve Medical",
    summary: "Customer thanked Jordan for the Tiger custom syringe kit program plan and schedule details.",
    lastAtISO: new Date(Date.now() - 1.5*3600000).toISOString(),
    count: 3, unread: true, needsAction: true, reviewed: false, replied: false,
    hasAttachments: false, flagged: false, snoozedUntil: null,
    priority: null, pathway: "quote-request", lastDirection: "inbound",
    participants: [
      { name: "A. Villarreal", email: "avillarrealberain@rtxpartnersllc.com", type: "external" },
      { name: "Jordan", email: "jordan@merit.com", type: "internal" },
    ],
  },
  {
    key: "po-136107", subject: "Purchase Order - 136107",
    who: "madeline.ellis@merit.com", accountName: "Merit Medical",
    summary: "Madeline Ellis confirms PO 136107 was processed under confirmation number 15236956 for Luis.",
    lastAtISO: new Date(Date.now() - 2*3600000).toISOString(),
    count: 1, unread: true, needsAction: false, reviewed: false, replied: false,
    hasAttachments: true, flagged: false, snoozedUntil: null,
    priority: null, pathway: "logistics", lastDirection: "inbound",
    participants: [
      { name: "Madeline Ellis", email: "madeline.ellis@merit.com", type: "internal" },
      { name: "Jordan", email: "jordan@merit.com", type: "internal" },
    ],
  },
  {
    key: "stryker-pv", subject: "Stryker PV Quote Request 7/1/26",
    who: "susette.sit@merit.com", accountName: "Stryker",
    summary: "Stryker acquired Inari Medical and will process their quote, copying Jordan as the new BDM contact.",
    lastAtISO: new Date(Date.now() - 3*3600000).toISOString(),
    count: 4, unread: true, needsAction: true, reviewed: false, replied: false,
    hasAttachments: true, flagged: false, snoozedUntil: null,
    priority: null, pathway: "quote-request", lastDirection: "inbound",
    participants: [
      { name: "Susette Sit", email: "susette.sit@merit.com", type: "internal" },
      { name: "Aman Dhah", email: "aman.dhah@stryker.com", type: "external" },
      { name: "Jordan", email: "jordan@merit.com", type: "internal" },
    ],
  },
  {
    key: "biotronik-po", subject: "[EXT] RE: BIOTRONIK PO 2700286",
    who: "yessennia.perry@merit.com", accountName: "Biotronik",
    summary: "Biotronik confirmed 280 units on PO 2700286; Merit noted one item completes around July 10th.",
    lastAtISO: new Date(Date.now() - 3.2*3600000).toISOString(),
    count: 3, unread: false, needsAction: false, reviewed: false, replied: true,
    hasAttachments: false, flagged: false, snoozedUntil: null,
    priority: null, pathway: "logistics", lastDirection: "outbound",
    participants: [
      { name: "Jimmy Rudig", email: "Jimmy.Rudig@biotronik.com", type: "external" },
      { name: "Yessennia Perry", email: "yessennia.perry@merit.com", type: "internal" },
      { name: "Jordan", email: "jordan@merit.com", type: "internal" },
    ],
  },
  {
    key: "stopcock-scr", subject: "RESPONSE NEEDED: Stopcock & Syringe CH Rep SCR",
    who: "Julio.TangHon@intusurg.com", accountName: "Intuitive Surgical",
    summary: "Intuitive Surgical shares SCR update on stopcock/syringe label change ECN and implementation timeline.",
    lastAtISO: new Date(Date.now() - 4.2*3600000).toISOString(),
    count: 2, unread: true, needsAction: true, reviewed: false, replied: false,
    hasAttachments: false, flagged: true, snoozedUntil: null,
    priority: "high", pathway: "quality-pcn", lastDirection: "inbound",
    participants: [
      { name: "Julio Tang Hon", email: "Julio.TangHon@intusurg.com", type: "external" },
      { name: "Jordan", email: "jordan@merit.com", type: "internal" },
      { name: "Chad R.", email: "chad.r@merit.com", type: "internal" },
    ],
  },
  {
    key: "unmapped-sender", subject: "RE: Product Availability — Radial Access Kit",
    who: "purchasing@newcustomer-med.com", accountName: null,
    summary: "Purchasing department at New Customer Med asking about lead times and MOQ for the radial access kit line.",
    lastAtISO: new Date(Date.now() - 5*3600000).toISOString(),
    count: 1, unread: true, needsAction: true, reviewed: false, replied: false,
    hasAttachments: false, flagged: false, snoozedUntil: null,
    priority: null, pathway: null, lastDirection: "inbound",
    participants: [
      { name: "purchasing@newcustomer-med.com", email: "purchasing@newcustomer-med.com", type: "external" },
      { name: "Jordan", email: "jordan@merit.com", type: "internal" },
    ],
  },
  {
    key: "flex-order", subject: "PO# J34131617 // Merit Medical Order Confirmation",
    who: "hilda.alvarez@flex.com", accountName: "Flex",
    summary: "Hilda thanks Jordan for clarifying pricing details on PO J34131617 order confirmation.",
    lastAtISO: new Date(Date.now() - 5.5*3600000).toISOString(),
    count: 1, unread: true, needsAction: false, reviewed: false, replied: false,
    hasAttachments: false, flagged: false, snoozedUntil: null,
    priority: null, pathway: "fyi", lastDirection: "inbound",
    participants: [
      { name: "Hilda Alvarez", email: "hilda.alvarez@flex.com", type: "external" },
      { name: "Jordan", email: "jordan@merit.com", type: "internal" },
    ],
  },
  {
    key: "pa-failed", subject: "1 of your flow(s) have failed",
    who: "PowerAutomateNoReply@microsoft.com", accountName: "Microsoft",
    summary: "Automated Power Automate notification reports the flow 'HC: capture received' failed 12 times.",
    lastAtISO: new Date(Date.now() - 29*3600000).toISOString(),
    count: 1, unread: false, needsAction: false, reviewed: false, replied: false,
    hasAttachments: false, flagged: false, snoozedUntil: null,
    priority: null, pathway: "noise", lastDirection: "inbound",
    participants: [
      { name: "Power Automate", email: "PowerAutomateNoReply@microsoft.com", type: "external" },
    ],
  },
];

const FOLDERS: Folder[] = [
  { key: "attention", label: "Needs attention", count: 37, group: "top" },
  { key: "sent",     label: "Sent",            count: 8,  group: "top" },
  { key: "flagged",  label: "Flagged",          count: 7,  group: "top" },
  { key: "reviewed", label: "Reviewed",         count: 11, group: "top" },
  { key: "all",      label: "All mail",         count: 54, group: "top" },
  { key: "archived", label: "Archived",         count: 1,  group: "top" },
];

// primary = shown prominently; secondary = shown smaller below separator
const NAV: { key: string; label: string; Icon: React.ComponentType<any>; tier: "primary"|"secondary"|"bottom" }[] = [
  { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard, tier: "primary" },
  { key: "inbox",     label: "Inbox",     Icon: Inbox,           tier: "primary" },
  { key: "accounts",  label: "Accounts",  Icon: BookMarked,      tier: "primary" },
  { key: "meetings",  label: "Meetings",  Icon: Video,           tier: "primary" },
  { key: "today",     label: "Today",     Icon: Calendar,        tier: "secondary" },
  { key: "ask",       label: "Ask",       Icon: Sparkles,        tier: "secondary" },
  { key: "tasks",     label: "Tasks",     Icon: CheckSquare,     tier: "secondary" },
  { key: "contacts",  label: "Contacts",  Icon: Users,           tier: "secondary" },
  { key: "quote",     label: "Quote",     Icon: FileText,        tier: "secondary" },
  { key: "library",   label: "Library",   Icon: BookOpen,        tier: "secondary" },
  { key: "branding",  label: "Branding",  Icon: Zap,             tier: "bottom" },
  { key: "activity",  label: "Activity",  Icon: Bell,            tier: "bottom" },
  { key: "settings",  label: "Settings",  Icon: Settings,        tier: "bottom" },
];

// ── Responsive hook ───────────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
}

const MOBILE_NAV = [
  { key: "dashboard", label: "Home",    Icon: LayoutDashboard },
  { key: "inbox",     label: "Inbox",   Icon: Inbox },
  { key: "accounts",  label: "Accounts",Icon: BookMarked },
  { key: "today",     label: "Today",   Icon: Calendar },
  { key: "more",      label: "More",    Icon: MoreHorizontal },
];

// ── Mobile shell ──────────────────────────────────────────────
function MobileApp({ threads, pathways, setPathways, patchThread, archiveThread, snoozeThread, assignPathway, bulkAction, toggleCheck, checkedKeys, setCheckedKeys }: {
  threads: Thread[]; pathways: Pathway[]; setPathways: (p: Pathway[]) => void;
  patchThread: (k: string, p: Partial<Thread>) => void;
  archiveThread: (k: string) => void;
  snoozeThread: (k: string, u: string) => void;
  assignPathway: (k: string, pw: string | null) => void;
  bulkAction: (a: string) => void;
  toggleCheck: (k: string, e: React.MouseEvent) => void;
  checkedKeys: Set<string>; setCheckedKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const [activeNav,    setActiveNav]    = useState("dashboard");
  const [activeFolder, setActiveFolder] = useState("attention");
  const [selectedKey,  setSelectedKey]  = useState<string | null>(null);
  const [showFolders,  setShowFolders]  = useState(false);
  const [showPathwayMgr, setShowPathwayMgr] = useState(false);

  const thread = threads.find(t => t.key === selectedKey) ?? null;
  const pwMap  = Object.fromEntries(pathways.map(p => [p.key, p]));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: T.navy, color: T.ivory, fontFamily: "'Inter',sans-serif", fontSize: 14, overflow: "hidden", transition: "background 0.2s, color 0.2s" }}>
      {/* Content area */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
        {activeNav === "inbox" ? (
          <>
            {/* Thread detail — full screen slide */}
            {thread ? (
              <div style={{ position: "absolute", inset: 0, background: T.slate, zIndex: 10, overflowY: "auto", transform: "translateX(0)", transition: "transform 0.25s ease" }}>
                <ThreadDetail
                  thread={thread} pathways={pathways} pwMap={pwMap}
                  onClose={() => { setSelectedKey(null); }}
                  onPatchThread={(p) => patchThread(thread.key, p)}
                  onAssignPathway={(pw) => assignPathway(thread.key, pw)}
                  onArchive={() => archiveThread(thread.key)}
                />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                {/* Mobile inbox header */}
                <div style={{ padding: "12px 16px 10px", background: T.navySurf, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                  <button onClick={() => setShowFolders(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: T.ivory, padding: 0 }}>
                    <span style={{ fontFamily: "'Sohne','Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 16 }}>
                      {[...FOLDERS, ...pathways.map(p=>({key:p.key,label:p.label}))].find(f=>f.key===activeFolder)?.label ?? "Inbox"}
                    </span>
                    <ChevronDown size={14} color={T.ivory3} />
                  </button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setShowPathwayMgr(true)} style={{ background: "none", border: "none", cursor: "pointer", color: T.ivory3, padding: 4 }}>
                      <Edit2 size={16} />
                    </button>
                    <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "none", background: T.sg, color: T.navy, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      <Plus size={12} /> New
                    </button>
                  </div>
                </div>
                {checkedKeys.size > 0 && (
                  <BulkBar count={checkedKeys.size} pathways={pathways} onAction={bulkAction} onClear={() => setCheckedKeys(new Set())} />
                )}
                <ThreadList
                  threads={threads} pathways={pwMap} selectedKey={selectedKey} checkedKeys={checkedKeys}
                  onSelect={(k) => { setSelectedKey(k); patchThread(k, { unread: false }); }}
                  onToggleCheck={toggleCheck}
                  onArchive={archiveThread}
                  onSnooze={snoozeThread}
                  onAssignPathway={assignPathway}
                  onFlagToggle={(k) => patchThread(k, { flagged: !threads.find(t=>t.key===k)?.flagged })}
                  onLinkAccount={(k) => patchThread(k, { accountName: "New Customer Med" })}
                />
              </div>
            )}

            {/* Folder bottom sheet */}
            {showFolders && (
              <div style={{ position: "absolute", inset: 0, zIndex: 20 }}>
                <div onClick={() => setShowFolders(false)} style={{ position: "absolute", inset: 0, background: "rgba(11,17,23,0.6)", backdropFilter: "blur(2px)" }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: T.slate, borderRadius: "16px 16px 0 0", padding: "12px 16px 32px", border: `1px solid ${T.border2}` }}>
                  <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border2, margin: "0 auto 16px" }} />
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.ivory3, marginBottom: 8 }}>Folders</div>
                  {FOLDERS.map(f => (
                    <button key={f.key} onClick={() => { setActiveFolder(f.key); setShowFolders(false); }}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 12px", borderRadius: 9, border: "none", background: activeFolder === f.key ? T.sgSoft : "transparent", color: activeFolder === f.key ? T.sg : T.ivory2, fontSize: 14, fontWeight: activeFolder === f.key ? 600 : 400, cursor: "pointer", marginBottom: 2 }}>
                      {f.label}
                      <span style={{ fontSize: 12, color: activeFolder === f.key ? T.sg : T.ivory3 }}>{f.count}</span>
                    </button>
                  ))}
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.ivory3, margin: "12px 0 8px" }}>Pathways</div>
                  {pathways.map(pw => (
                    <button key={pw.key} onClick={() => { setActiveFolder(pw.key); setShowFolders(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 12px", borderRadius: 9, border: "none", background: activeFolder === pw.key ? T.sgSoft : "transparent", color: activeFolder === pw.key ? pw.color : T.ivory2, fontSize: 14, fontWeight: activeFolder === pw.key ? 600 : 400, cursor: "pointer", marginBottom: 2 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: pw.color, flexShrink: 0 }} />
                      {pw.label}
                      <span style={{ marginLeft: "auto", fontSize: 12, color: activeFolder === pw.key ? pw.color : T.ivory3 }}>{pw.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pathway manager */}
            {showPathwayMgr && (
              <div style={{ position: "absolute", inset: 0, zIndex: 30 }}>
                <PathwayManager pathways={pathways} onChange={setPathways} onClose={() => setShowPathwayMgr(false)} />
              </div>
            )}
          </>
        ) : (
          <div style={{ flex: 1, overflowY: "auto" }}><ViewContent nav={activeNav} /></div>
        )}
      </div>

      {/* Bottom tab bar */}
      <nav style={{ display: "flex", background: T.navySurf, borderTop: `1px solid ${T.border}`, flexShrink: 0, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {MOBILE_NAV.map(({ key, label, Icon }) => {
          const active = activeNav === key;
          return (
            <button key={key} onClick={() => { setActiveNav(key); setSelectedKey(null); }}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 0 8px", border: "none", background: "transparent", color: active ? T.sg : T.ivory3, cursor: "pointer", position: "relative" }}>
              {active && <span style={{ position: "absolute", top: 0, left: "25%", right: "25%", height: 2, borderRadius: "0 0 2px 2px", background: T.sg }} />}
              <Icon size={20} strokeWidth={active ? 2.2 : 1.7} />
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{label}</span>
              {key === "inbox" && <span style={{ position: "absolute", top: 8, right: "calc(50% - 14px)", width: 6, height: 6, borderRadius: "50%", background: T.sg }} />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────
export default function App() {
  const [activeNav,    setActiveNav]    = useState("dashboard");
  const [activeFolder, setActiveFolder] = useState("attention");
  const [selectedKey,  setSelectedKey]  = useState<string | null>(null);
  const [threads,      setThreads]      = useState<Thread[]>(INIT_THREADS);
  const [pathways,     setPathways]     = useState<Pathway[]>(DEFAULT_PATHWAYS);
  const [checkedKeys,  setCheckedKeys]  = useState<Set<string>>(new Set());
  const [showPathwayMgr, setShowPathwayMgr] = useState(false);
  const [navCollapsed,    setNavCollapsed]    = useState(false);
  const [folderCollapsed, setFolderCollapsed] = useState(false);
  const [isDark,          setIsDark]          = useState(true);

  // Assign theme tokens before rendering — all children re-read T on each render
  T = isDark ? DARK_T : LIGHT_T;
  const toggleTheme = () => setIsDark(v => !v);

  const thread = threads.find(t => t.key === selectedKey) ?? null;

  function handleNavClick(k: string) {
    setActiveNav(k); setSelectedKey(null);
    setNavCollapsed(true);     // collapse nav on navigate
    setFolderCollapsed(false); // reset folder when switching sections
  }

  function handleSelectThread(k: string) {
    setSelectedKey(k); patchThread(k, { unread: false });
    setFolderCollapsed(true);  // tuck folder away when reading a thread
  }

  function handleCloseThread() {
    setSelectedKey(null);
    setFolderCollapsed(false); // restore folder when going back
  }

  function patchThread(key: string, patch: Partial<Thread>) {
    setThreads(ts => ts.map(t => t.key === key ? { ...t, ...patch } : t));
  }

  function archiveThread(key: string) {
    patchThread(key, { reviewed: true, needsAction: false });
    if (selectedKey === key) setSelectedKey(null);
    setCheckedKeys(s => { const n = new Set(s); n.delete(key); return n; });
  }

  function snoozeThread(key: string, until: string) {
    patchThread(key, { snoozedUntil: until, needsAction: false });
    if (selectedKey === key) setSelectedKey(null);
  }

  function assignPathway(key: string, pathway: string | null) {
    patchThread(key, { pathway, needsAction: false });
  }

  function bulkAction(action: "archive" | "reviewed" | string) {
    checkedKeys.forEach(k => {
      if (action === "archive") archiveThread(k);
      else if (action === "reviewed") patchThread(k, { reviewed: true, needsAction: false });
      else assignPathway(k, action);
    });
    setCheckedKeys(new Set());
  }

  function toggleCheck(key: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    setCheckedKeys(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const pwMap  = Object.fromEntries(pathways.map(p => [p.key, p]));
  const mobile = useIsMobile();

  // ── Mobile branch ──
  if (mobile) return (
    <MobileApp
      threads={threads} pathways={pathways} setPathways={setPathways}
      patchThread={patchThread}
      archiveThread={archiveThread}
      snoozeThread={snoozeThread}
      assignPathway={assignPathway}
      bulkAction={bulkAction}
      toggleCheck={toggleCheck}
      checkedKeys={checkedKeys}
      setCheckedKeys={setCheckedKeys}
    />
  );

  // ── Desktop branch ──
  return (
    <div style={{ display: "flex", height: "100vh", background: T.navy, color: T.ivory, fontFamily: "'Inter', sans-serif", fontSize: 14, overflow: "hidden", transition: "background 0.2s, color 0.2s" }}>
      <Sidebar activeNav={activeNav} collapsed={navCollapsed} isDark={isDark} onNav={handleNavClick} onToggle={() => setNavCollapsed(v => !v)} onThemeToggle={toggleTheme} />

      {activeNav === "inbox" ? (
        <div style={{ flex: 1, display: "flex", minWidth: 0, position: "relative" }}>
          <FolderSidebar
            folders={FOLDERS} pathways={pathways} active={activeFolder}
            collapsed={folderCollapsed}
            onSelect={(k) => { setActiveFolder(k); setSelectedKey(null); }}
            onManagePathways={() => setShowPathwayMgr(true)}
            onToggle={() => setFolderCollapsed(v => !v)}
          />
          <div style={{ flex: thread ? "0 0 360px" : 1, display: "flex", flexDirection: "column", minWidth: 0, borderRight: thread ? `1px solid ${T.border}` : "none", transition: "flex 0.2s ease" }}>
            <InboxHeader folder={activeFolder} />
            {checkedKeys.size > 0 && (
              <BulkBar count={checkedKeys.size} pathways={pathways} onAction={bulkAction} onClear={() => setCheckedKeys(new Set())} />
            )}
            <ThreadList
              threads={threads} pathways={pwMap} selectedKey={selectedKey} checkedKeys={checkedKeys}
              onSelect={handleSelectThread}
              onToggleCheck={toggleCheck}
              onArchive={archiveThread}
              onSnooze={snoozeThread}
              onAssignPathway={assignPathway}
              onFlagToggle={(k) => patchThread(k, { flagged: !threads.find(t=>t.key===k)?.flagged })}
              onLinkAccount={(k) => patchThread(k, { accountName: "New Customer Med" })}
            />
          </div>
          {thread && (
            <ThreadDetail
              thread={thread} pathways={pathways} pwMap={pwMap}
              onClose={handleCloseThread}
              onPatchThread={(patch) => patchThread(thread.key, patch)}
              onAssignPathway={(pw) => assignPathway(thread.key, pw)}
              onArchive={() => archiveThread(thread.key)}
            />
          )}

          {/* Pathway manager overlay */}
          {showPathwayMgr && (
            <PathwayManager
              pathways={pathways} onChange={setPathways}
              onClose={() => setShowPathwayMgr(false)}
            />
          )}
        </div>
      ) : (
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          <ViewContent nav={activeNav} />
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────
function Sidebar({ activeNav, collapsed, isDark, onNav, onToggle, onThemeToggle }: { activeNav: string; collapsed: boolean; isDark: boolean; onNav: (k: string) => void; onToggle: () => void; onThemeToggle: () => void }) {
  const w = collapsed ? 52 : 220;
  const primary   = NAV.filter(n => n.tier === "primary");
  const secondary = NAV.filter(n => n.tier === "secondary");
  const bottom    = NAV.filter(n => n.tier === "bottom");

  function NavBtn({ key_, label, Icon, active }: { key_: string; label: string; Icon: React.ComponentType<any>; active: boolean }) {
    return (
      <button onClick={() => onNav(key_)} title={collapsed ? label : undefined}
        style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: collapsed ? 0 : 9, padding: collapsed ? "9px 0" : "7px 10px", borderRadius: 8, border: "none", cursor: "pointer", width: "100%", fontWeight: active ? 600 : 400, background: active ? T.sgSoft : "transparent", color: active ? T.sg : T.ivory2, transition: "background 0.12s, color 0.12s" }}>
        <span style={{ position: "absolute", left: 0, top: "22%", bottom: "22%", width: 2.5, borderRadius: 2, background: T.sg, opacity: active ? 1 : 0 }} />
        <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
        {!collapsed && <span style={{ whiteSpace: "nowrap", fontSize: 13 }}>{label}</span>}
        {key_ === "inbox" && !collapsed && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: active ? T.sg : T.ivory3, background: active ? T.sgSoft : T.ivory4, padding: "1px 6px", borderRadius: 10 }}>37</span>}
        {key_ === "inbox" && collapsed && <span style={{ position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: "50%", background: T.sg }} />}
        {key_ === "activity" && !collapsed && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: active ? T.sg : T.danger, background: active ? T.sgSoft : T.dangerSoft, padding: "1px 6px", borderRadius: 10 }}>3</span>}
      </button>
    );
  }

  return (
    <aside style={{ width: w, flexShrink: 0, background: T.navySurf, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", padding: collapsed ? "16px 6px" : "18px 10px 16px", overflowY: "auto", overflowX: "hidden", transition: "width 0.22s ease, padding 0.22s ease" }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", paddingBottom: 18, paddingLeft: collapsed ? 0 : 6, gap: 8, minHeight: 44 }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, overflow: "hidden" }}>
            <img src={isDark ? mainstMarkLight : mainstMark} alt="" style={{ height: 26, width: "auto", flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: "'Sohne','Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: "0.05em", color: T.ivory, whiteSpace: "nowrap" }}>MAIN ST.</div>
              <div style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: "0.16em", color: T.ivory3, textTransform: "uppercase", marginTop: 2, whiteSpace: "nowrap" }}>Command Center</div>
            </div>
          </div>
        )}
        {collapsed && <img src={isDark ? mainstMarkLight : mainstMark} alt="" style={{ height: 24, width: "auto" }} />}
        <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", color: T.ivory3, padding: 4, borderRadius: 6, display: "flex", alignItems: "center", flexShrink: 0 }}>
          <ChevronRight size={13} style={{ transform: collapsed ? "none" : "rotate(180deg)", transition: "transform 0.22s ease" }} />
        </button>
      </div>

      {/* Primary nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {primary.map(({ key, label, Icon }) => <NavBtn key_={key} key={key} label={label} Icon={Icon} active={activeNav === key} />)}
      </nav>

      {/* Separator + secondary nav */}
      <div style={{ margin: "10px 0", borderTop: `1px solid ${T.border}` }} />
      {!collapsed && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.ivory3, padding: "0 10px 6px" }}>Tools</div>}
      <nav style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
        {secondary.map(({ key, label, Icon }) => <NavBtn key_={key} key={key} label={label} Icon={Icon} active={activeNav === key} />)}
      </nav>

      {/* Bottom */}
      <div style={{ paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
        {bottom.map(({ key, label, Icon }) => <NavBtn key_={key} key={key} label={label} Icon={Icon} active={activeNav === key} />)}
        <button onClick={onThemeToggle} title={collapsed ? (isDark ? "Light mode" : "Dark mode") : undefined}
          style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 8, width: "100%", padding: collapsed ? "9px 0" : "7px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", color: T.ivory3, fontSize: 12, transition: "color 0.15s" }}>
          <Moon size={13} strokeWidth={1.8} style={{ opacity: isDark ? 1 : 0.5 }} />
          {!collapsed && (isDark ? "Light mode" : "Dark mode")}
        </button>
      </div>
    </aside>
  );
}


// ── Folder sidebar ────────────────────────────────────────────
function FolderSidebar({ folders, pathways, active, collapsed, onSelect, onManagePathways, onToggle }: { folders: Folder[]; pathways: Pathway[]; active: string; collapsed: boolean; onSelect: (k: string) => void; onManagePathways: () => void; onToggle: () => void }) {
  const w = collapsed ? 28 : 186;
  return (
    <div style={{ width: w, flexShrink: 0, background: T.navy, borderRight: `1px solid ${T.border}`, overflowY: collapsed ? "hidden" : "auto", overflowX: "hidden", display: "flex", flexDirection: "column", transition: "width 0.22s ease", position: "relative" }}>
      {collapsed ? (
        /* Collapsed: just a clickable arrow strip */
        <button onClick={onToggle} title="Show folders"
          style={{ position: "absolute", inset: 0, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChevronRight size={13} color={T.ivory3} />
        </button>
      ) : (
        <div style={{ padding: "14px 8px 8px", flex: 1, display: "flex", flexDirection: "column" }}>
          <nav style={{ marginBottom: 4 }}>
            {folders.map(f => <FolderBtn key={f.key} f={f} active={active === f.key} onSelect={onSelect} />)}
          </nav>
          <div style={{ padding: "10px 8px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.ivory3 }}>Pathways</span>
            <button onClick={onManagePathways} style={{ background: "none", border: "none", cursor: "pointer", color: T.ivory3, fontSize: 10, padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center", gap: 3 }} title="Manage pathways">
              <Edit2 size={10} /> Manage
            </button>
          </div>
          <nav style={{ flex: 1 }}>
            {pathways.map(f => <FolderBtn key={f.key} f={{ key: f.key, label: f.label, count: f.count, group: "pathway" }} active={active === f.key} onSelect={onSelect} dot dotColor={f.color} />)}
          </nav>
          <button onClick={onManagePathways} style={{ display: "flex", alignItems: "center", gap: 5, width: "100%", padding: "6px 8px", marginTop: 4, borderRadius: 7, border: `1px dashed ${T.border2}`, background: "transparent", color: T.ivory3, fontSize: 12, cursor: "pointer" }}>
            <Plus size={11} /> Add pathway
          </button>
          <button onClick={onToggle} title="Collapse folders"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, width: "100%", padding: "7px 4px", marginTop: 6, borderTop: `1px solid ${T.border}`, background: "transparent", border: "none", color: T.ivory3, fontSize: 10.5, cursor: "pointer" }}>
            <ChevronRight size={11} style={{ transform: "rotate(180deg)" }} /> Hide
          </button>
        </div>
      )}
    </div>
  );
}

function FolderBtn({ f, active, onSelect, dot, dotColor }: { f: Folder; active: boolean; onSelect: (k: string) => void; dot?: boolean; dotColor?: string }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={() => onSelect(f.key)} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "6px 8px", borderRadius: 7, border: "none", cursor: "pointer", background: active ? T.sgSoft : hov ? T.ivory4 : "transparent", color: active ? T.sg : T.ivory2, fontSize: 12.5, fontWeight: active ? 600 : 400, textAlign: "left", transition: "all 0.12s" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
        {dot && <span style={{ width: 5.5, height: 5.5, borderRadius: "50%", background: dotColor ?? T.coolGray, flexShrink: 0 }} />}
        {f.label}
      </span>
      {f.count > 0 && <span style={{ fontSize: 10.5, color: active ? T.sg : T.ivory3, fontVariantNumeric: "tabular-nums" }}>{f.count}</span>}
    </button>
  );
}

// ── Bulk action bar ───────────────────────────────────────────
function BulkBar({ count, pathways, onAction, onClear }: { count: number; pathways: Pathway[]; onAction: (a: string) => void; onClear: () => void }) {
  const [showPw, setShowPw] = useState(false);
  return (
    <div style={{ padding: "8px 16px", background: T.slateUp, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: T.sg, marginRight: 4 }}>{count} selected</span>
      <BulkBtn label="Mark reviewed" icon={<Check size={11} />} onClick={() => onAction("reviewed")} />
      <BulkBtn label="Archive" icon={<Archive size={11} />} onClick={() => onAction("archive")} />
      <div style={{ position: "relative" }}>
        <BulkBtn label="Assign pathway" icon={<ChevronDown size={11} />} onClick={() => setShowPw(v => !v)} />
        {showPw && (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: T.slate, border: `1px solid ${T.border2}`, borderRadius: 8, padding: 4, zIndex: 50, minWidth: 160 }}>
            {pathways.map(pw => (
              <button key={pw.key} onClick={() => { onAction(pw.key); setShowPw(false); }}
                style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "6px 10px", border: "none", background: "transparent", color: T.ivory2, fontSize: 12, cursor: "pointer", borderRadius: 6, textAlign: "left" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: pw.color, flexShrink: 0 }} />
                {pw.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button onClick={onClear} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: T.ivory3, display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "4px 6px", borderRadius: 6 }}>
        <X size={12} /> Clear
      </button>
    </div>
  );
}
function BulkBtn({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, border: `1px solid ${T.border2}`, background: "transparent", color: T.ivory2, fontSize: 11.5, cursor: "pointer", fontWeight: 500 }}>
      {icon} {label}
    </button>
  );
}

// ── Inbox header ──────────────────────────────────────────────
function InboxHeader({ folder }: { folder: string }) {
  const all = [...FOLDERS, ...DEFAULT_PATHWAYS.map(p => ({ key: p.key, label: p.label, count: p.count, group: "pathway" as const }))];
  const f = all.find(x => x.key === folder);
  return (
    <div style={{ padding: "14px 20px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, background: T.navySurf }}>
      <div>
        <div style={{ fontFamily: "'Sohne','Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em", color: T.ivory }}>{f?.label ?? "Inbox"}</div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.ivory3, marginTop: 2 }}>MERIT OEM · LIVE FIREHOSE</div>
      </div>
      <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: T.sg, color: T.navy, fontSize: 12, fontWeight: 700 }}>
        <Plus size={13} strokeWidth={2.5} /> New email
      </button>
    </div>
  );
}

// ── Thread list ───────────────────────────────────────────────
function ThreadList({ threads, pathways, selectedKey, checkedKeys, onSelect, onToggleCheck, onArchive, onSnooze, onAssignPathway, onFlagToggle, onLinkAccount }:
  { threads: Thread[]; pathways: Record<string, Pathway>; selectedKey: string | null; checkedKeys: Set<string>; onSelect: (k: string) => void; onToggleCheck: (k: string, e: React.MouseEvent) => void; onArchive: (k: string) => void; onSnooze: (k: string, until: string) => void; onAssignPathway: (k: string, pw: string | null) => void; onFlagToggle: (k: string) => void; onLinkAccount: (k: string) => void }) {
  const [q, setQ] = useState("");
  const filtered = q.trim() ? threads.filter(t => [t.subject, t.who, t.accountName, t.summary].some(s => s?.toLowerCase().includes(q.toLowerCase()))) : threads;
  const cutoff = new Date(Date.now() - 24 * 3600000);
  const today = filtered.filter(t => new Date(t.lastAtISO) > cutoff);
  const older = filtered.filter(t => new Date(t.lastAtISO) <= cutoff);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "10px 16px 8px", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.ivory3 }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search mail…" style={{ width: "100%", padding: "7px 10px 7px 30px", borderRadius: 8, border: `1px solid ${T.border2}`, background: "rgba(255,255,255,0.04)", color: T.ivory, fontSize: 12.5, outline: "none", boxSizing: "border-box" }} />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {today.length > 0 && <ThreadGroup label="Today" threads={today} pathways={pathways} selectedKey={selectedKey} checkedKeys={checkedKeys} onSelect={onSelect} onToggleCheck={onToggleCheck} onArchive={onArchive} onSnooze={onSnooze} onAssignPathway={onAssignPathway} onFlagToggle={onFlagToggle} onLinkAccount={onLinkAccount} />}
        {older.length > 0 && <ThreadGroup label="Yesterday" threads={older} pathways={pathways} selectedKey={selectedKey} checkedKeys={checkedKeys} onSelect={onSelect} onToggleCheck={onToggleCheck} onArchive={onArchive} onSnooze={onSnooze} onAssignPathway={onAssignPathway} onFlagToggle={onFlagToggle} onLinkAccount={onLinkAccount} />}
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: T.ivory3, fontSize: 13 }}>No threads found</div>}
      </div>
    </div>
  );
}

function ThreadGroup(props: { label: string; threads: Thread[]; pathways: Record<string, Pathway>; selectedKey: string | null; checkedKeys: Set<string>; onSelect: (k: string) => void; onToggleCheck: (k: string, e: React.MouseEvent) => void; onArchive: (k: string) => void; onSnooze: (k: string, until: string) => void; onAssignPathway: (k: string, pw: string | null) => void; onFlagToggle: (k: string) => void; onLinkAccount: (k: string) => void }) {
  return (
    <div>
      <div style={{ padding: "10px 20px 4px", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: T.ivory3 }}>{props.label}</div>
      {props.threads.map((t, i) => <ThreadRow key={t.key} thread={t} pathways={props.pathways} selected={t.key === props.selectedKey} checked={props.checkedKeys.has(t.key)} anyChecked={props.checkedKeys.size > 0} first={i === 0} onSelect={props.onSelect} onToggleCheck={props.onToggleCheck} onArchive={props.onArchive} onSnooze={props.onSnooze} onAssignPathway={props.onAssignPathway} onFlagToggle={props.onFlagToggle} onLinkAccount={props.onLinkAccount} />)}
    </div>
  );
}

// ── Thread row ────────────────────────────────────────────────
function ThreadRow({ thread: t, pathways, selected, checked, anyChecked, first, onSelect, onToggleCheck, onArchive, onSnooze, onAssignPathway, onFlagToggle, onLinkAccount }:
  { thread: Thread; pathways: Record<string, Pathway>; selected: boolean; checked: boolean; anyChecked: boolean; first: boolean; onSelect: (k: string) => void; onToggleCheck: (k: string, e: React.MouseEvent) => void; onArchive: (k: string) => void; onSnooze: (k: string, until: string) => void; onAssignPathway: (k: string, pw: string | null) => void; onFlagToggle: (k: string) => void; onLinkAccount: (k: string) => void }) {
  const [hov, setHov] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [showPathwayPop, setShowPathwayPop] = useState(false);
  const color = acctColor(t.accountName ?? t.who);
  const pw = t.pathway ? pathways[t.pathway] : null;

  const showActions = hov || checked || anyChecked;
  const isUnmapped = !t.accountName;

  let bg = "transparent";
  if (selected) bg = T.slateHi;
  else if (hov || checked) bg = T.slateUp;

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => { setHov(false); setShowSnooze(false); setShowPathwayPop(false); }}
      style={{ position: "relative", borderTop: first ? "none" : `1px solid ${T.border}` }}>
      {/* Priority stripe */}
      {(t.priority === "high" || t.flagged) && <span style={{ position: "absolute", left: 0, top: "18%", bottom: "18%", width: 2.5, borderRadius: 2, background: t.priority === "high" ? T.danger : T.warn, zIndex: 1 }} />}

      <div onClick={() => onSelect(t.key)} style={{ display: "flex", gap: 11, padding: "11px 12px 11px 20px", background: bg, cursor: "pointer", transition: "background 0.1s" }}>
        {/* Checkbox */}
        <div onClick={(e) => onToggleCheck(t.key, e)} style={{ width: 16, flexShrink: 0, display: "flex", alignItems: "flex-start", paddingTop: 10, opacity: showActions ? 1 : 0, transition: "opacity 0.12s" }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${checked ? T.sg : T.border2}`, background: checked ? T.sg : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.12s" }}>
            {checked && <Check size={9} color={T.navy} strokeWidth={3} />}
          </span>
        </div>

        {/* Avatar */}
        <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, marginTop: 1, background: isUnmapped ? T.slate : color, border: isUnmapped ? `1.5px dashed ${T.border2}` : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: isUnmapped ? T.ivory3 : "#fff", opacity: t.reviewed ? 0.5 : 1 }}>
          {isUnmapped ? "?" : initials(t.accountName ?? t.who)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Row 1: sender + state badges + time */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              {/* Three-state indicators */}
              {t.unread && !t.reviewed && <span title="Unread" style={{ width: 5.5, height: 5.5, borderRadius: "50%", background: T.sg, flexShrink: 0 }} />}
              {t.needsAction && !t.reviewed && <span title="Needs action" style={{ width: 5.5, height: 5.5, borderRadius: "50%", background: T.warn, flexShrink: 0 }} />}
              <span style={{ fontSize: 12.5, fontWeight: t.unread && !t.reviewed ? 700 : 500, color: t.reviewed ? T.ivory3 : T.ivory, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.accountName ?? t.who.replace(/@.*/, "")}
              </span>
              {t.count > 1 && <span style={{ fontSize: 10, fontWeight: 600, color: T.ivory3, background: "rgba(255,255,255,0.07)", borderRadius: 10, padding: "1px 5px", flexShrink: 0 }}>{t.count}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {/* Hover quick actions */}
              {hov && !checked && (
                <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {/* Pathway assign */}
                  <div style={{ position: "relative" }}>
                    <QuickBtn icon={<Sparkles size={11} />} title="Assign pathway" active={showPathwayPop} onClick={() => setShowPathwayPop(v => !v)} />
                    {showPathwayPop && (
                      <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: T.slate, border: `1px solid ${T.border2}`, borderRadius: 8, padding: 4, zIndex: 50, minWidth: 150 }}>
                        {Object.values(pathways).map(pw2 => (
                          <button key={pw2.key} onClick={() => { onAssignPathway(t.key, pw2.key); setShowPathwayPop(false); }}
                            style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "6px 10px", border: "none", background: t.pathway === pw2.key ? T.slateUp : "transparent", color: t.pathway === pw2.key ? pw2.color : T.ivory2, fontSize: 12, cursor: "pointer", borderRadius: 6, textAlign: "left" }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: pw2.color, flexShrink: 0 }} />
                            {pw2.label}
                          </button>
                        ))}
                        <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 4, paddingTop: 4 }}>
                          <button onClick={() => { onAssignPathway(t.key, null); setShowPathwayPop(false); }} style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "6px 10px", border: "none", background: "transparent", color: T.ivory3, fontSize: 12, cursor: "pointer", borderRadius: 6 }}>
                            <X size={10} /> Clear pathway
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <QuickBtn icon={<Flag size={11} />} title={t.flagged ? "Unflag" : "Flag"} active={t.flagged} onClick={() => onFlagToggle(t.key)} />
                  {/* Snooze */}
                  <div style={{ position: "relative" }}>
                    <QuickBtn icon={<BellOff size={11} />} title="Snooze" active={showSnooze} onClick={() => setShowSnooze(v => !v)} />
                    {showSnooze && (
                      <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: T.slate, border: `1px solid ${T.border2}`, borderRadius: 8, padding: 4, zIndex: 50, minWidth: 160 }}>
                        {[
                          { label: "Tomorrow morning", offset: 16 * 3600000 },
                          { label: "This Friday",      offset: 3 * 24 * 3600000 },
                          { label: "Next Monday",      offset: 5 * 24 * 3600000 },
                          { label: "In two weeks",     offset: 14 * 24 * 3600000 },
                        ].map(opt => (
                          <button key={opt.label} onClick={() => { onSnooze(t.key, new Date(Date.now() + opt.offset).toISOString()); setShowSnooze(false); }}
                            style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "6px 10px", border: "none", background: "transparent", color: T.ivory2, fontSize: 12, cursor: "pointer", borderRadius: 6, textAlign: "left" }}>
                            <Clock size={11} color={T.ivory3} /> {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <QuickBtn icon={<Archive size={11} />} title="Archive" onClick={() => onArchive(t.key)} />
                </div>
              )}
              <span style={{ fontSize: 10.5, color: T.ivory3, fontVariantNumeric: "tabular-nums" }}>{rel(t.lastAtISO)}</span>
            </div>
          </div>

          {/* Row 2: subject */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
            {t.lastDirection === "outbound" && <ArrowUpRight size={10} color={T.sg} style={{ flexShrink: 0 }} />}
            <span style={{ fontSize: 12, color: (t.unread && !t.reviewed) ? T.ivory2 : T.ivory3, fontWeight: (t.unread && !t.reviewed) ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}</span>
          </div>

          {/* Row 3: AI summary */}
          {t.summary && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 5, marginTop: 3 }}>
              <Sparkles size={10} color={T.sg} style={{ flexShrink: 0, marginTop: 1.5 }} />
              <span style={{ fontSize: 11, color: T.ivory3, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>{t.summary}</span>
            </div>
          )}

          {/* Row 4: chips + unmapped link account */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6, alignItems: "center" }}>
            {t.priority === "high" && <Chip label="High" color={T.danger} bg={T.dangerSoft} bold />}
            {pw && <Chip label={pw.label} color={pw.color} bg={pw.bg} />}
            {t.accountName
              ? <Chip label={t.accountName} color={color} bg={color + "28"} />
              : <button onClick={e => { e.stopPropagation(); onLinkAccount(t.key); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 20, border: `1px dashed ${T.border2}`, background: "transparent", color: T.ivory3, fontSize: 10, cursor: "pointer", fontWeight: 500 }}>
                  <Link2 size={9} /> Link account
                </button>
            }
            {t.reviewed && <Chip label="✓ Reviewed" color={T.sg} bg={T.sgSoft} />}
            {t.replied  && <Chip label="Replied"    color={T.sg400} bg={T.sgSoft} />}
            {t.flagged  && <Chip label="Flagged"    color={T.warn}  bg={T.warnSoft} />}
            {t.snoozedUntil && <Chip label="Snoozed" color={T.coolGray} bg="rgba(166,173,180,0.1)" />}
            {t.hasAttachments && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 20, background: "rgba(166,173,180,0.08)", color: T.ivory3, fontSize: 10, fontWeight: 500 }}><Paperclip size={8.5} /> Attachment</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickBtn({ icon, title, active, onClick }: { icon: React.ReactNode; title: string; active?: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} title={title} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${active || hov ? T.border2 : "transparent"}`, background: active ? T.slateUp : "transparent", color: active ? T.sg : T.ivory3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.1s" }}>
      {icon}
    </button>
  );
}

// ── Thread detail ─────────────────────────────────────────────
function ThreadDetail({ thread: t, pathways, pwMap, onClose, onPatchThread, onAssignPathway, onArchive }:
  { thread: Thread; pathways: Pathway[]; pwMap: Record<string, Pathway>; onClose: () => void; onPatchThread: (p: Partial<Thread>) => void; onAssignPathway: (pw: string | null) => void; onArchive: () => void }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [showRecipientReview, setShowRecipientReview] = useState(false);
  const color = acctColor(t.accountName ?? t.who);
  const externalParticipants = t.participants.filter(p => p.type === "external");
  const internalParticipants = t.participants.filter(p => p.type === "internal");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.slate, minWidth: 0, overflowY: "auto" }}>
      {/* Header */}
      <div style={{ padding: "14px 24px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexShrink: 0, background: T.navySurf }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: T.ivory3, fontSize: 11.5, cursor: "pointer", marginBottom: 7, padding: 0 }}>
            <ArrowLeft size={12} /> Inbox
          </button>
          <div style={{ fontFamily: "'Sohne','Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 14.5, color: T.ivory, lineHeight: 1.35 }}>{t.subject}</div>
          <div style={{ fontSize: 11, color: T.ivory3, marginTop: 4 }}>{t.count} message{t.count !== 1 ? "s" : ""} · {t.who}</div>
        </div>
        <div style={{ display: "flex", gap: 5, flexShrink: 0, marginTop: 24 }}>
          {[{ label: "Forward", Icon: Send }, { label: "Flag", Icon: Flag }, { label: "Archive", Icon: Archive }].map(({ label, Icon: I }) => (
            <button key={label} onClick={label === "Archive" ? onArchive : undefined}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, border: `1px solid ${T.border2}`, background: "transparent", color: T.ivory2, fontSize: 11.5, cursor: "pointer" }}>
              <I size={11} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Participant map */}
        <ParticipantMap external={externalParticipants} internal={internalParticipants} />

        {/* Three-state legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}` }}>
          <StateTag dot={T.sg} label="Unread" sublabel="clears on open" />
          <StateTag dot={T.warn} label="Needs action" sublabel="AI-flagged, explicit" />
          <StateTag dot={T.sg} label="Reviewed" check sublabel="manual mark" />
          <button onClick={() => onPatchThread({ reviewed: true, needsAction: false, unread: false })}
            style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 7, border: "none", background: T.sg, color: T.navy, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
            Mark reviewed
          </button>
        </div>

        {/* AI Summary */}
        <div style={{ padding: "12px 16px", borderRadius: 10, background: T.sgSoft, border: `1px solid ${T.sgBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Sparkles size={12} color={T.sg} />
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.sg }}>AI Summary</span>
          </div>
          <p style={{ fontSize: 12.5, color: T.ivory2, lineHeight: 1.65, margin: 0 }}>{t.summary}</p>
        </div>

        {/* Cross-customer playbook — backlog item B */}
        {(t.pathway === "quality-pcn" || t.pathway === "quote-request") && (
          <PlaybookPanel pathway={t.pathway} />
        )}

        {/* Manual action composer — backlog item D */}
        <ActionComposer thread={t} />

        {/* Triage bar */}
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.ivory3, marginRight: 2 }}>Triage</span>
          {pathways.map(pw => {
            const isActive = t.pathway === pw.key;
            return (
              <button key={pw.key} onClick={() => onAssignPathway(isActive ? null : pw.key)}
                style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${isActive ? pw.color : T.border2}`, background: isActive ? pw.bg : "transparent", color: isActive ? pw.color : T.ivory3, fontSize: 11, cursor: "pointer", fontWeight: isActive ? 600 : 400, transition: "all 0.12s" }}>
                {pw.label}
              </button>
            );
          })}
        </div>

        {/* Messages */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <MessageCard
            initials_={initials(t.who)} name={t.who} to="Jordan"
            time={rel(t.lastAtISO)} type="external" color={color}
            body="Hi Jordan, thank you for sending over the program plan and schedule. We appreciate the quick turnaround on this. We've reviewed everything internally and have a few follow-up questions about the MOQ minimums and whether a blanket PO would be more appropriate for the volume we're projecting."
            signature="Best regards,&#10;Alex Villarreal | Director of Procurement&#10;RTX Partners LLC | avillarrealberain@rtxpartnersllc.com&#10;&#10;CONFIDENTIALITY NOTICE: This message is for the designated recipient only and may contain privileged, proprietary, or otherwise private information."
          />
          <div style={{ marginLeft: 20 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.ivory3, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ height: 1, flex: 1, background: T.border }} />
              Internal thread
              <span style={{ height: 1, flex: 1, background: T.border }} />
            </div>
            <MessageCard
              initials_="JR" name="Jordan (you)" to="Chad R."
              time="2h ago" type="internal" color={T.meritRed}
              body="Chad — can you handle the MOQ question? I'll follow up on lead times once we have the BOM confirmed from our side. They're projecting ~400 units/quarter which puts us in blanket PO territory."
              signature=""
            />
          </div>
        </div>

        {/* Reply composer */}
        <div style={{ borderRadius: 10, border: `1px solid ${T.border2}`, background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
          <button onClick={() => setReplyOpen(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 14px", border: "none", background: "transparent", color: T.ivory2, fontSize: 12.5, fontWeight: 500, cursor: "pointer", textAlign: "left" }}>
            <span>Reply to {t.accountName ?? t.who.replace(/@.*/, "")}</span>
            <ChevronRight size={14} color={T.ivory3} style={{ transform: replyOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
          </button>
          {replyOpen && (
            <ReplyComposer
              thread={t}
              externalCount={externalParticipants.length}
              onRequestSend={() => setShowRecipientReview(true)}
            />
          )}
        </div>
      </div>

      {/* Recipient review modal */}
      {showRecipientReview && (
        <RecipientReviewModal
          thread={t}
          onConfirm={() => { setShowRecipientReview(false); setReplyOpen(false); }}
          onCancel={() => setShowRecipientReview(false)}
        />
      )}
    </div>
  );
}

// ── Participant map ───────────────────────────────────────────
function ParticipantMap({ external, internal }: { external: Thread["participants"]; internal: Thread["participants"] }) {
  return (
    <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.ivory3 }}>External</span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {external.map(p => (
            <span key={p.email} title={p.email} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 20, background: T.dangerSoft, border: `1px solid ${T.danger}22` }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.danger, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: T.ivory2, fontWeight: 500 }}>{p.name.split(" ")[0]}</span>
            </span>
          ))}
        </div>
      </div>
      <div style={{ width: 1, height: 20, background: T.border, flexShrink: 0 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.ivory3 }}>Internal</span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {internal.map(p => (
            <span key={p.email} title={p.email} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 20, background: T.sgSoft, border: `1px solid ${T.sg}22` }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.sg, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: T.ivory2, fontWeight: 500 }}>{p.name.split(" ")[0]}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Message card ──────────────────────────────────────────────
function MessageCard({ initials_, name, to, time, type, color, body, signature }:
  { initials_: string; name: string; to: string; time: string; type: "external" | "internal"; color: string; body: string; signature: string }) {
  const [expanded, setExpanded] = useState(false);
  const [sigOpen,  setSigOpen]  = useState(false);
  const isInternal = type === "internal";
  const truncate = body.length > 200 && !expanded;
  return (
    <div style={{ borderRadius: 10, overflow: "hidden", border: isInternal ? `1px solid ${T.sgBorder}` : `1px solid ${T.border}`, background: isInternal ? "rgba(54,179,166,0.04)" : "rgba(255,255,255,0.02)" }}>
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: isInternal ? `1px solid ${T.sgBorder}` : `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, color: "#fff" }}>{initials_}</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.ivory }}>{name}</div>
            <div style={{ fontSize: 10.5, color: T.ivory3 }}>to {to}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: isInternal ? T.sgSoft : "rgba(166,173,180,0.12)", color: isInternal ? T.sg : T.coolGray, fontWeight: 600 }}>
            {isInternal ? "Internal" : "External"}
          </span>
          <span style={{ fontSize: 10.5, color: T.ivory3, fontVariantNumeric: "tabular-nums" }}>{time}</span>
        </div>
      </div>
      <div style={{ padding: "10px 14px" }}>
        <p style={{ fontSize: 12.5, color: T.ivory2, lineHeight: 1.7, margin: 0 }}>
          {truncate ? body.slice(0, 200) + "…" : body}
        </p>
        {body.length > 200 && (
          <button onClick={() => setExpanded(v => !v)} style={{ background: "none", border: "none", color: T.sg, fontSize: 11.5, cursor: "pointer", padding: "4px 0 0", fontWeight: 500 }}>
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
        {signature && (
          <div style={{ marginTop: 8 }}>
            <button onClick={() => setSigOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: T.ivory3, fontSize: 11, cursor: "pointer", padding: 0 }}>
              {sigOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {sigOpen ? "Hide signature" : "Signature & quoted text"}
            </button>
            {sigOpen && (
              <pre style={{ marginTop: 8, padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, fontSize: 10.5, color: T.ivory3, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                {signature}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reply composer ────────────────────────────────────────────
function ReplyComposer({ thread, externalCount, onRequestSend }: { thread: Thread; externalCount: number; onRequestSend: () => void }) {
  const [aiPrompt, setAiPrompt] = useState("");
  const [body, setBody] = useState("");
  return (
    <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 0 8px", borderBottom: `1px solid ${T.border}`, marginBottom: 8 }}>
        <Sparkles size={11} color={T.sg} />
        <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Draft with AI — describe tone or context…"
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: T.ivory2, fontSize: 12, fontStyle: aiPrompt ? "normal" : "italic" }} />
        {aiPrompt && (
          <button style={{ padding: "3px 8px", borderRadius: 5, border: "none", background: T.sgSoft, color: T.sg, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Generate</button>
        )}
      </div>
      <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Start typing your reply…"
        style={{ width: "100%", minHeight: 80, padding: "8px 10px", borderRadius: 7, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.ivory2, fontSize: 12.5, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box" }} />
      {externalCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, padding: "6px 10px", borderRadius: 7, background: T.warnSoft, border: `1px solid ${T.warn}33` }}>
          <AlertTriangle size={12} color={T.warn} />
          <span style={{ fontSize: 11, color: T.warn, fontWeight: 500 }}>This thread includes {externalCount} external recipient{externalCount > 1 ? "s" : ""}. Review before sending.</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <div style={{ fontSize: 11, color: T.ivory3 }}>
          To: {thread.participants.map(p => p.name.split(" ")[0]).join(", ")}
        </div>
        <button onClick={onRequestSend} style={{ padding: "7px 16px", borderRadius: 7, border: "none", background: T.sg, color: T.navy, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          Review & send
        </button>
      </div>
    </div>
  );
}

// ── Cross-customer playbook panel (Backlog B) ─────────────────
const PLAYBOOK_DATA: Record<string, { title: string; account: string; date: string; summary: string; docs: string[] }[]> = {
  "quality-pcn": [
    { title:"Balt MEX Facility PN Review", account:"Balt", date:"2026-06-20", summary:"Handled facility transfer PCN; regulatory submitted via Merit quality portal. Timeline: 6 weeks.", docs:["PCN_Balt_K04-01258_MEX"] },
    { title:"Stryker Inari PCN Integration", account:"Stryker", date:"2025-11-14", summary:"Post-acquisition PCN filed for Inari Medical product line. Regulatory template reused.", docs:["ISO_13485_Cert_2026"] },
  ],
  "quote-request": [
    { title:"Tiger 3ml Syringe Kit Quote", account:"ReCurve Medical", date:"2026-06-26", summary:"Custom kit quoted with NRE. Blanket PO structure proposed for >400 units/quarter.", docs:["Tiger_06.26.26_Cust3ML"] },
    { title:"Stryker PV Quote 2025 Q4", account:"Stryker", date:"2025-12-10", summary:"PV quote for vascular products. Pricing model reused for Q1 follow-up.", docs:[] },
  ],
};
function PlaybookPanel({ pathway }: { pathway: string }) {
  const [open, setOpen] = useState(false);
  const items = PLAYBOOK_DATA[pathway] ?? [];
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${T.warn}33`, background: T.warnSoft+"44", overflow: "hidden" }}>
      <button onClick={() => setOpen(v=>!v)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer" }}>
        <Zap size={13} color={T.warn} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.warn }}>Prior work on similar topics — {items.length} references</span>
        <ChevronRight size={13} color={T.warn} style={{ marginLeft: "auto", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(item => (
            <div key={item.title} style={{ padding: "10px 12px", borderRadius: 8, background: T.slate, border: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: acctColor(item.account)+"28", color: acctColor(item.account), fontWeight: 700 }}>{item.account}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.ivory }}>{item.title}</span>
                <span style={{ marginLeft: "auto", fontSize: 10.5, color: T.ivory3 }}>{item.date}</span>
              </div>
              <p style={{ fontSize: 12, color: T.ivory2, lineHeight: 1.55, margin: "0 0 6px" }}>{item.summary}</p>
              {item.docs.length > 0 && (
                <div style={{ display: "flex", gap: 5 }}>
                  {item.docs.map(d => <span key={d} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: T.sgSoft, color: T.sg, fontWeight: 500 }}>{d}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Action composer (Backlog D) ───────────────────────────────
function ActionComposer({ thread: t }: { thread: Thread }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create"|"link">("create");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("med");
  const [added, setAdded] = useState(false);
  const relatedTasks = ALL_TASKS.filter(tk => tk.account === t.accountName);

  function submit() {
    if (title.trim()) { setAdded(true); setOpen(false); setTitle(""); }
  }

  return (
    <div>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9, border: `1px solid ${T.border2}`, background: "transparent", color: T.ivory2, fontSize: 12.5, cursor: "pointer", width: "100%" }}>
          <Plus size={13} color={T.sg} /> Add action from this thread
          {added && <span style={{ marginLeft: "auto", fontSize: 10.5, color: T.sg }}>✓ 1 added</span>}
        </button>
      ) : (
        <div style={{ padding: "14px 16px", borderRadius: 10, background: T.slate, border: `1px solid ${T.sgBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.ivory }}>Add action</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: T.ivory3 }}><X size={14} /></button>
          </div>
          {/* Mode toggle */}
          <div style={{ display: "flex", borderRadius: 8, border: `1px solid ${T.border2}`, overflow: "hidden", marginBottom: 12 }}>
            {[{k:"create" as const,label:"Create task"},{k:"link" as const,label:"Link to existing"}].map(({k,label})=>(
              <button key={k} onClick={() => setMode(k)} style={{ flex: 1, padding: "6px", border: "none", background: mode===k ? T.sg : "transparent", color: mode===k ? T.navy : T.ivory2, fontSize: 12, fontWeight: mode===k ? 700 : 400, cursor: "pointer" }}>{label}</button>
            ))}
          </div>

          {mode === "create" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title…" style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border2}`, background: "rgba(255,255,255,0.04)", color: T.ivory, fontSize: 13, outline: "none" }} />
              <div style={{ display: "flex", gap: 8 }}>
                <input type="date" value={due} onChange={e => setDue(e.target.value)} style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border2}`, background: "rgba(255,255,255,0.04)", color: T.ivory, fontSize: 12.5, outline: "none" }} />
                <select value={priority} onChange={e => setPriority(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border2}`, background: T.slate, color: T.ivory2, fontSize: 12.5, outline: "none" }}>
                  {["high","med","low"].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              {t.accountName && <div style={{ fontSize: 11.5, color: T.sg }}>→ Will be linked to {t.accountName}</div>}
              <button onClick={submit} style={{ padding: "8px", borderRadius: 8, border: "none", background: T.sg, color: T.navy, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Create task</button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 11, color: T.ivory3, marginBottom: 8 }}>Open tasks for {t.accountName ?? "this thread"}</div>
              {relatedTasks.length === 0
                ? <div style={{ fontSize: 12.5, color: T.ivory3 }}>No open tasks found for this account.</div>
                : relatedTasks.map(tk => (
                  <button key={tk.id} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.ivory2, fontSize: 12.5, cursor: "pointer", marginBottom: 5, textAlign: "left" }}>
                    <Link2 size={12} color={T.sg} style={{ flexShrink: 0 }} /> {tk.title}
                  </button>
                ))
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Recipient review modal ────────────────────────────────────
function RecipientReviewModal({ thread, onConfirm, onCancel }: { thread: Thread; onConfirm: () => void; onCancel: () => void }) {
  const external = thread.participants.filter(p => p.type === "external");
  const internal = thread.participants.filter(p => p.type === "internal");
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(11,17,23,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: T.slate, border: `1px solid ${T.border2}`, borderRadius: 14, padding: 24, maxWidth: 420, width: "90%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: T.warnSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle size={16} color={T.warn} />
          </div>
          <div>
            <div style={{ fontFamily: "'Sohne','Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.ivory }}>Review recipients</div>
            <div style={{ fontSize: 11, color: T.ivory3, marginTop: 2 }}>Confirm before sending to external parties</div>
          </div>
        </div>
        {external.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.danger, marginBottom: 6 }}>External ({external.length})</div>
            {external.map(p => (
              <div key={p.email} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, background: T.dangerSoft, marginBottom: 4 }}>
                <UserCircle size={14} color={T.danger} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.ivory }}>{p.name}</div>
                  <div style={{ fontSize: 10.5, color: T.ivory3 }}>{p.email}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {internal.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.sg, marginBottom: 6 }}>Internal ({internal.length})</div>
            {internal.map(p => (
              <div key={p.email} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, background: T.sgSoft, marginBottom: 4 }}>
                <UserCircle size={14} color={T.sg} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.ivory }}>{p.name}</div>
                  <div style={{ fontSize: 10.5, color: T.ivory3 }}>{p.email}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${T.border2}`, background: "transparent", color: T.ivory2, fontSize: 13, cursor: "pointer", fontWeight: 500 }}>Edit recipients</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: T.sg, color: T.navy, fontSize: 13, cursor: "pointer", fontWeight: 700 }}>Confirm & send</button>
        </div>
      </div>
    </div>
  );
}

// ── Pathway manager ───────────────────────────────────────────
function PathwayManager({ pathways, onChange, onClose }: { pathways: Pathway[]; onChange: (p: Pathway[]) => void; onClose: () => void }) {
  const [local, setLocal] = useState<Pathway[]>(pathways);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addColor, setAddColor] = useState(PALETTE_OPTIONS[0]);

  function rename(key: string, label: string) {
    setLocal(ps => ps.map(p => p.key === key ? { ...p, label } : p));
    setEditingKey(null);
  }
  function recolor(key: string, opt: typeof PALETTE_OPTIONS[0]) {
    setLocal(ps => ps.map(p => p.key === key ? { ...p, color: opt.color, bg: opt.bg } : p));
  }
  function remove(key: string) {
    setLocal(ps => ps.filter(p => p.key !== key));
  }
  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...local];
    [next[idx-1], next[idx]] = [next[idx], next[idx-1]];
    setLocal(next);
  }
  function moveDown(idx: number) {
    if (idx === local.length - 1) return;
    const next = [...local];
    [next[idx], next[idx+1]] = [next[idx+1], next[idx]];
    setLocal(next);
  }
  function addPathway() {
    if (!addLabel.trim()) return;
    const key = addLabel.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    setLocal(ps => [...ps, { key, label: addLabel.trim(), color: addColor.color, bg: addColor.bg, count: 0 }]);
    setAddLabel(""); setAdding(false);
  }

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(11,17,23,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", zIndex: 100 }}>
      <div style={{ width: 380, height: "100%", background: T.slate, borderLeft: `1px solid ${T.border2}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ padding: "20px 20px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'Sohne','Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 15, color: T.ivory }}>Manage Pathways</div>
            <div style={{ fontSize: 11, color: T.ivory3, marginTop: 2 }}>Add, rename, reorder, or delete triage categories</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.ivory3, padding: 4 }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
          {local.map((pw, idx) => (
            <div key={pw.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}` }}>
              {/* Reorder */}
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <button onClick={() => moveUp(idx)} style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? T.ivory4 : T.ivory3, padding: 1 }}><ChevronUp size={12} /></button>
                <button onClick={() => moveDown(idx)} style={{ background: "none", border: "none", cursor: idx === local.length-1 ? "default" : "pointer", color: idx === local.length-1 ? T.ivory4 : T.ivory3, padding: 1 }}><ChevronDown size={12} /></button>
              </div>

              {/* Color picker */}
              <div style={{ display: "flex", gap: 3 }}>
                {PALETTE_OPTIONS.map(opt => (
                  <button key={opt.color} onClick={() => recolor(pw.key, opt)} style={{ width: 12, height: 12, borderRadius: "50%", background: opt.color, border: `2px solid ${pw.color === opt.color ? T.ivory : "transparent"}`, cursor: "pointer", padding: 0 }} />
                ))}
              </div>

              {/* Label */}
              {editingKey === pw.key ? (
                <input autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") rename(pw.key, newLabel); if (e.key === "Escape") setEditingKey(null); }}
                  onBlur={() => rename(pw.key, newLabel || pw.label)}
                  style={{ flex: 1, background: T.slateUp, border: `1px solid ${T.sg}`, borderRadius: 6, padding: "4px 8px", color: T.ivory, fontSize: 13, outline: "none" }} />
              ) : (
                <span style={{ flex: 1, fontSize: 13, color: T.ivory, fontWeight: 500 }}>{pw.label}</span>
              )}

              <span style={{ fontSize: 10.5, color: T.ivory3, fontVariantNumeric: "tabular-nums", minWidth: 24, textAlign: "right" }}>{pw.count}</span>

              <button onClick={() => { setEditingKey(pw.key); setNewLabel(pw.label); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: T.ivory3, padding: 3 }}><Edit2 size={12} /></button>
              <button onClick={() => remove(pw.key)}
                style={{ background: "none", border: "none", cursor: "pointer", color: T.ivory3, padding: 3 }}><Trash2 size={12} /></button>
            </div>
          ))}

          {/* Add new */}
          {adding ? (
            <div style={{ padding: "12px", borderRadius: 9, background: T.sgSoft, border: `1px solid ${T.sgBorder}`, display: "flex", flexDirection: "column", gap: 8 }}>
              <input autoFocus value={addLabel} onChange={e => setAddLabel(e.target.value)} placeholder="Pathway name…"
                onKeyDown={e => { if (e.key === "Enter") addPathway(); if (e.key === "Escape") setAdding(false); }}
                style={{ background: T.slateUp, border: `1px solid ${T.border2}`, borderRadius: 7, padding: "7px 10px", color: T.ivory, fontSize: 13, outline: "none" }} />
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: T.ivory3 }}>Color:</span>
                {PALETTE_OPTIONS.map(opt => (
                  <button key={opt.color} onClick={() => setAddColor(opt)} style={{ width: 16, height: 16, borderRadius: "50%", background: opt.color, border: `2px solid ${addColor.color === opt.color ? T.ivory : "transparent"}`, cursor: "pointer", padding: 0 }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={addPathway} style={{ flex: 1, padding: "7px", borderRadius: 7, border: "none", background: T.sg, color: T.navy, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add pathway</button>
                <button onClick={() => setAdding(false)} style={{ padding: "7px 12px", borderRadius: 7, border: `1px solid ${T.border2}`, background: "transparent", color: T.ivory2, fontSize: 12, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", borderRadius: 9, border: `1px dashed ${T.border2}`, background: "transparent", color: T.ivory3, fontSize: 13, cursor: "pointer", width: "100%" }}>
              <Plus size={13} /> Add new pathway
            </button>
          )}
        </div>

        <div style={{ padding: "14px 16px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${T.border2}`, background: "transparent", color: T.ivory2, fontSize: 13, cursor: "pointer" }}>Discard</button>
          <button onClick={() => { onChange(local); onClose(); }} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: T.sg, color: T.navy, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Save changes</button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────
function Chip({ label, color, bg, bold }: { label: string; color: string; bg: string; bold?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 20, background: bg, color, fontSize: 10, fontWeight: bold ? 700 : 500, lineHeight: 1.7 }}>{label}</span>
  );
}

function StateTag({ dot, label, sublabel, check }: { dot: string; label: string; sublabel: string; check?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {check
        ? <Check size={10} color={dot} />
        : <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.ivory2 }}>{label}</div>
        <div style={{ fontSize: 10, color: T.ivory3 }}>{sublabel}</div>
      </div>
    </div>
  );
}

function PlaceholderView({ label, Icon }: { label: string; Icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: T.navySurf, height: "100%" }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: T.sgSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={22} strokeWidth={1.6} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.ivory2 }}>{label}</div>
      <div style={{ fontSize: 12, color: T.ivory3 }}>Not shown in this prototype</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VIEW CONTENT ROUTER
// ═══════════════════════════════════════════════════════════════
function ViewContent({ nav }: { nav: string }) {
  switch (nav) {
    case "dashboard": return <DashboardView />;
    case "today":    return <TodayView />;
    case "ask":      return <AskView />;
    case "tasks":    return <TasksView />;
    case "accounts": return <AccountsView />;
    case "contacts": return <ContactsView />;
    case "meetings": return <MeetingsView />;
    case "library":  return <LibraryView />;
    case "quote":    return <QuoteView />;
    case "branding": return <BrandingView />;
    case "activity": return <ActivityView />;
    case "settings": return <SettingsView />;
    default: return <PlaceholderView label={nav} Icon={FileText} />;
  }
}

// ── Shared view shell ─────────────────────────────────────────
function ViewShell({ title, sub, actions, children }: { title: string; sub?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100%", background: T.navySurf }}>
      <div style={{ padding: "24px 32px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: "'Sohne','Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 22, color: T.ivory, margin: 0, letterSpacing: "-0.02em" }}>{title}</h1>
          {sub && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: T.ivory3 }}>{sub}</p>}
        </div>
        {actions && <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{actions}</div>}
      </div>
      <div style={{ padding: "20px 32px 40px" }}>{children}</div>
    </div>
  );
}

function SgBtn({ label, icon, small, outline }: { label: string; icon?: React.ReactNode; small?: boolean; outline?: boolean }) {
  return (
    <button style={{ display: "flex", alignItems: "center", gap: 5, padding: small ? "5px 10px" : "7px 14px", borderRadius: 8, border: outline ? `1px solid ${T.border2}` : "none", background: outline ? "transparent" : T.sg, color: outline ? T.ivory2 : T.navy, fontSize: small ? 11.5 : 12.5, fontWeight: 600, cursor: "pointer" }}>
      {icon}{label}
    </button>
  );
}

// ── SHARED TASK DATA ──────────────────────────────────────────
const TODAY_TASKS = [
  { id:1, title:"Send updated quote to ReCurve Medical — Custom 3ml Kit", account:"ReCurve Medical", due:"2026-06-28", priority:"high", status:"Open", overdue:true, waiting:false },
  { id:2, title:"Follow up on Stryker PV quote request 7/1", account:"Stryker", due:"2026-06-30", priority:"high", status:"Open", overdue:true, waiting:false },
  { id:3, title:"Review Biotronik PO 2700286 delivery timeline", account:"Biotronik", due:"2026-07-01", priority:"med", status:"Open", overdue:true, waiting:false },
  { id:4, title:"Submit Q3 forecast to OEM leadership", account:null, due:"2026-07-01", priority:"med", status:"Open", overdue:true, waiting:false },
  { id:5, title:"Respond to Intuitive Surgical SCR stopcock ECN", account:"Intuitive Surgical", due:"2026-07-01", priority:"high", status:"Open", overdue:true, waiting:false },
  { id:6, title:"Send biocompatibility packet to Nectero", account:"Nectero", due:"2026-07-02", priority:"med", status:"Open", overdue:false, waiting:false },
  { id:7, title:"Confirm Balt order confirmation #14598", account:"Balt", due:"2026-07-02", priority:"low", status:"Waiting", overdue:false, waiting:true },
  { id:8, title:"Update Aust Manufacturing contact roster", account:"Aust Manufacturing", due:"2026-07-02", priority:"low", status:"Open", overdue:false, waiting:false },
];

// ── DASHBOARD ─────────────────────────────────────────────────
function DashboardView() {
  const [askQ, setAskQ] = useState("");
  const [commits, setCommits] = useState<number[]>([1,2,5]); // task ids committed today
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});

  const overdueTasks = TODAY_TASKS.filter(t => t.overdue);
  const todayTasks   = TODAY_TASKS.filter(t => !t.overdue);
  const committedTasks = TODAY_TASKS.filter(t => commits.includes(t.id));

  function toggleCommit(id: number) {
    setCommits(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  }

  return (
    <div style={{ minHeight: "100%", background: T.navySurf }}>
      {/* Header */}
      <div style={{ padding: "28px 32px 20px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: "'Sohne','Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 26, color: T.ivory, margin: 0, letterSpacing: "-0.02em" }}>{greeting}, Jordan.</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: T.ivory3 }}>{today}</p>
          </div>
          {/* Floating Ask bar */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", background: T.slate, border: `1px solid ${T.border2}`, borderRadius: 12, padding: "8px 12px", minWidth: 320 }}>
            <Sparkles size={14} color={T.sg} />
            <input value={askQ} onChange={e => setAskQ(e.target.value)} placeholder="Ask anything about your work…" style={{ flex: 1, background: "none", border: "none", outline: "none", color: T.ivory, fontSize: 13 }} />
            {askQ && <button style={{ padding: "4px 10px", borderRadius: 7, border: "none", background: T.sg, color: T.navy, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Ask</button>}
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 32px 40px", display: "grid", gridTemplateColumns: "1fr 1fr 300px", gap: 16 }}>
        {/* TODAY'S COMMITS */}
        <div style={{ gridColumn: "1", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.ivory3 }}>Today's commits</span>
            <span style={{ fontSize: 11, color: T.sg, fontWeight: 600 }}>{committedTasks.filter(t => false).length}/{committedTasks.length} done</span>
          </div>

          {/* Committed tasks */}
          {committedTasks.map(t => (
            <DashTaskCard key={t.id} task={t} />
          ))}

          {/* Add from today's queue */}
          <div style={{ padding: "10px 14px", borderRadius: 10, border: `1px dashed ${T.border2}`, background: "transparent" }}>
            <div style={{ fontSize: 11, color: T.ivory3, marginBottom: 8 }}>Add from queue ({todayTasks.filter(t => !commits.includes(t.id)).length} available)</div>
            {todayTasks.filter(t => !commits.includes(t.id)).slice(0,3).map(t => (
              <button key={t.id} onClick={() => toggleCommit(t.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 0", background: "none", border: "none", cursor: "pointer", color: T.ivory2, fontSize: 12.5, textAlign: "left" }}>
                <Plus size={12} color={T.sg} style={{ flexShrink: 0 }} /> {t.title.slice(0, 48)}…
              </button>
            ))}
          </div>

          {/* Overdue debt — collapsed */}
          <details style={{ padding: "10px 14px", borderRadius: 10, background: T.dangerSoft, border: `1px solid ${T.danger}33` }}>
            <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: T.danger, listStyle: "none", display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={12} /> {overdueTasks.length} overdue tasks in backlog
            </summary>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
              {overdueTasks.map(t => (
                <div key={t.id} style={{ fontSize: 12, color: T.danger, padding: "4px 0", borderTop: `1px solid ${T.danger}22` }}>
                  {t.title.slice(0, 50)}… <span style={{ color: T.danger, opacity: 0.6 }}>({t.due})</span>
                </div>
              ))}
            </div>
          </details>
        </div>

        {/* INBOX + ACCOUNTS column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Inbox snapshot */}
          <div style={{ padding: "14px 16px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.ivory3, marginBottom: 10 }}>Inbox</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[{label:"Needs attention",val:"37",color:T.danger},{label:"Flagged",val:"7",color:T.warn},{label:"Needs reply",val:"12",color:T.sg}].map(s=>(
                <div key={s.label} style={{ textAlign: "center", padding: "8px", borderRadius: 8, background: T.slateUp }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: "'Sohne','Plus Jakarta Sans',sans-serif" }}>{s.val}</div>
                  <div style={{ fontSize: 10, color: T.ivory3, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: T.ivory3 }}>Top threads needing reply:</div>
            {INIT_THREADS.filter(t=>t.needsAction).slice(0,3).map(t=>(
              <div key={t.key} style={{ display: "flex", gap: 8, padding: "6px 0", borderTop: `1px solid ${T.border}`, alignItems: "center" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: acctColor(t.accountName ?? t.who), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{initials(t.accountName ?? t.who)}</div>
                <span style={{ fontSize: 12, color: T.ivory2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject.slice(0,40)}…</span>
                <span style={{ marginLeft: "auto", fontSize: 10.5, color: T.ivory3, flexShrink: 0 }}>{rel(t.lastAtISO)}</span>
              </div>
            ))}
          </div>

          {/* Accounts needing attention */}
          <div style={{ padding: "14px 16px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.ivory3, marginBottom: 10 }}>Accounts — needs attention</div>
            {ACCOUNTS_LIST.filter(a=>a.overdue>0).slice(0,4).map(a=>(
              <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: `1px solid ${T.border}` }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: acctColor(a.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{initials(a.name)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: T.ivory }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: T.danger }}>{a.overdue} overdue · {a.open} open</div>
                </div>
                <ChevronRight size={13} color={T.ivory3} />
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Upcoming + Recent activity */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Upcoming meetings */}
          <div style={{ padding: "14px 16px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.ivory3, marginBottom: 10 }}>Upcoming meetings</div>
            {[
              { title:"Stryker Q3 Pipeline Review", time:"Today · 2:00 PM", category:"STRYKER" },
              { title:"Mike / Jordan 1:1", time:"Tomorrow · 9:00 AM", category:"INTERNAL" },
              { title:"ReCurve Medical Kickoff", time:"Thu · 10:00 AM", category:"RECURVE" },
            ].map(m=>(
              <div key={m.title} style={{ padding: "7px 0", borderTop: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: acctColor(m.category), textTransform: "uppercase", letterSpacing: "0.08em" }}>{m.category}</div>
                <div style={{ fontSize: 12.5, color: T.ivory, fontWeight: 500, marginTop: 2 }}>{m.title}</div>
                <div style={{ fontSize: 11, color: T.ivory3, marginTop: 2 }}>{m.time}</div>
              </div>
            ))}
          </div>

          {/* Recent activity */}
          <div style={{ padding: "14px 16px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.ivory3, marginBottom: 10 }}>Recent activity</div>
            {[
              { text:"ECN218128 flagged for route approval", time:"2m", color:T.danger },
              { text:"Stryker PV quote request triaged by AI", time:"1h", color:T.sg },
              { text:"Morning brief delivered", time:"8am", color:T.warn },
              { text:"Biotronik PO 2700286 confirmed", time:"Yesterday", color:T.ivory3 },
            ].map((a,i)=>(
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderTop: `1px solid ${T.border}` }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: a.color, flexShrink: 0, marginTop: 4 }} />
                <span style={{ fontSize: 12, color: T.ivory2, flex: 1, lineHeight: 1.4 }}>{a.text}</span>
                <span style={{ fontSize: 10.5, color: T.ivory3, flexShrink: 0 }}>{a.time}</span>
              </div>
            ))}
          </div>

          {/* Quick Ask recent */}
          <div style={{ padding: "12px 14px", borderRadius: 12, background: T.sgSoft, border: `1px solid ${T.sgBorder}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Sparkles size={12} color={T.sg} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.sg }}>Ask — recent</span>
            </div>
            {["What is open and overdue for Stryker?","What did I commit to last Balt meeting?"].map(q=>(
              <div key={q} style={{ fontSize: 11.5, color: T.ivory2, padding: "4px 0", borderTop: `1px solid ${T.sgBorder}`, cursor: "pointer" }}>{q}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DashTaskCard({ task: t }: { task: typeof TODAY_TASKS[0] }) {
  const [done, setDone] = useState(false);
  return (
    <div onClick={() => setDone(v=>!v)} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 10, background: done ? "rgba(255,255,255,0.02)" : T.slate, border: `1px solid ${done ? T.border : t.overdue ? T.danger+"44" : T.border}`, cursor: "pointer", opacity: done ? 0.45 : 1, transition: "all 0.15s" }}>
      <div style={{ width: 17, height: 17, borderRadius: 5, border: `2px solid ${done ? T.sg : t.priority==="high" ? T.danger : T.border2}`, background: done ? T.sg : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
        {done && <Check size={10} color={T.navy} strokeWidth={3} />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: done ? T.ivory3 : T.ivory, textDecoration: done ? "line-through" : "none" }}>{t.title}</div>
        <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
          {t.account && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: acctColor(t.account)+"28", color: acctColor(t.account), fontWeight: 600 }}>{t.account}</span>}
          <span style={{ fontSize: 10, color: t.overdue ? T.danger : T.ivory3 }}>{t.overdue ? `overdue ${t.due}` : `due ${t.due}`}</span>
        </div>
      </div>
    </div>
  );
}

// ── TODAY (tabbed) ────────────────────────────────────────────
function TodayView() {
  const [tab, setTab] = useState<"focus"|"planner">("focus");
  return (
    <div style={{ minHeight: "100%", background: T.navySurf }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`, padding: "0 32px", background: T.navySurf }}>
        {[{k:"focus" as const, label:"Focus queue"},{k:"planner" as const, label:"Build your day"}].map(({k,label})=>(
          <button key={k} onClick={() => setTab(k)} style={{ padding: "14px 20px", border: "none", background: "transparent", color: tab===k ? T.sg : T.ivory3, fontSize: 13.5, fontWeight: tab===k ? 700 : 400, cursor: "pointer", borderBottom: tab===k ? `2px solid ${T.sg}` : "2px solid transparent", marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>
      {tab === "focus" ? <FocusView /> : <BuildYourDayView />}
    </div>
  );
}

function FocusView() {
  const [commits, setCommits] = useState<Set<number>>(new Set([1,2,5]));
  const [showBacklog, setShowBacklog] = useState(false);
  const overdue = TODAY_TASKS.filter(t => t.overdue);
  const queue   = TODAY_TASKS.filter(t => !t.overdue);

  function toggle(id: number) { setCommits(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  return (
    <div style={{ minHeight: "100%", background: T.navySurf, padding: "28px 32px 40px" }}>
      {/* Morning brief */}
      <div style={{ padding: "14px 18px", borderRadius: 12, background: T.sgSoft, border: `1px solid ${T.sgBorder}`, marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <Sparkles size={16} color={T.sg} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.ivory }}>Morning brief</div>
          <div style={{ fontSize: 12.5, color: T.ivory2, marginTop: 2 }}>
            5 overdue tasks · <b style={{ color: T.danger }}>3 need replies</b> in inbox · Stryker call at 2:00 PM · 1 quote due today
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Your commits */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: T.ivory3, marginBottom: 10 }}>
            Today's commits — pick what you'll actually do
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {TODAY_TASKS.filter(t => commits.has(t.id)).map(t => (
              <DashTaskCard key={t.id} task={t} />
            ))}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.ivory3, marginBottom: 8 }}>Add to today</div>
          {TODAY_TASKS.filter(t => !commits.has(t.id)).map(t => (
            <button key={t.id} onClick={() => toggle(t.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px", borderRadius: 9, border: "none", background: "transparent", color: T.ivory2, fontSize: 12.5, cursor: "pointer", textAlign: "left", marginBottom: 2 }}>
              <Plus size={12} color={T.sg} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
              {t.overdue && <span style={{ fontSize: 10, color: T.danger, flexShrink: 0 }}>overdue</span>}
            </button>
          ))}
        </div>

        {/* Overdue backlog — collapsed by default */}
        <div>
          <button onClick={() => setShowBacklog(v=>!v)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: "0 0 10px", color: T.danger, width: "100%" }}>
            {showBacklog ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Overdue backlog</span>
            <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 10, background: T.dangerSoft, color: T.danger, fontWeight: 700 }}>{overdue.length}</span>
          </button>
          {showBacklog && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {overdue.map(t => (
                <div key={t.id} style={{ display: "flex", gap: 10, padding: "9px 12px", borderRadius: 9, background: T.slate, border: `1px solid ${T.danger}33`, borderLeft: `3px solid ${T.danger}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, color: T.ivory }}>{t.title}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      {t.account && <span style={{ fontSize: 10, color: acctColor(t.account), fontWeight: 600 }}>{t.account}</span>}
                      <span style={{ fontSize: 10, color: T.danger }}>overdue {t.due}</span>
                    </div>
                  </div>
                  <button onClick={() => toggle(t.id)} style={{ fontSize: 10.5, color: T.sg, background: T.sgSoft, border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer", flexShrink: 0 }}>Add today</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── BUILD YOUR DAY ────────────────────────────────────────────
const SLOT_H = 52;  // px per 30-min slot
const DAY_START = 8; // 8 AM
const DAY_END   = 19; // 7 PM

function timeToSlot(t: string): number {
  const [h,m] = t.split(":").map(Number);
  return (h - DAY_START) * 2 + (m >= 30 ? 1 : 0);
}
function slotToLabel(i: number): string {
  const totalMins = DAY_START * 60 + i * 30;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2,"0")} ${ampm}`;
}
const TOTAL_SLOTS = (DAY_END - DAY_START) * 2; // 22 slots: 8am–7pm

interface CalEvent { id:string; title:string; start:string; end:string; account?:string; color:string }
interface DayBlock  { taskId:number; start:string; durationMins:number }

const MOCK_CALENDAR: CalEvent[] = [
  { id:"c1", title:"Morning standup", start:"09:00", end:"09:30", color: T.coolGray },
  { id:"c2", title:"Stryker Q3 Pipeline Review", start:"10:00", end:"12:00", account:"Stryker", color: acctColor("Stryker") },
  { id:"c3", title:"Stryker Call — PV Quote", start:"14:00", end:"14:30", account:"Stryker", color: acctColor("Stryker") },
  { id:"c4", title:"Mike / Jordan 1:1", start:"16:00", end:"16:30", color: T.meritRed },
];

const INITIAL_BLOCKS: DayBlock[] = [
  { taskId:4, start:"09:30", durationMins:45 },  // Intuitive SCR
  { taskId:1, start:"12:30", durationMins:60 },  // ReCurve quote
];

function nowOffset(): number {
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  if (h < DAY_START || h >= DAY_END) return -1;
  return ((h - DAY_START) * 60 + m) / 30 * SLOT_H;
}

function BuildYourDayView() {
  const [blocks,    setBlocks]    = useState<DayBlock[]>(INITIAL_BLOCKS);
  const [done,      setDone]      = useState<Set<number>>(new Set());
  const [rolledOver,setRolledOver]= useState<Set<number>>(new Set());
  const [scheduling,setScheduling]= useState<{taskId:number; step:"time"|"dur"} | null>(null);
  const [pickTime,  setPickTime]  = useState("08:00");
  const [pickDur,   setPickDur]   = useState(30);
  const [suggested, setSuggested] = useState(false);
  const [hovSlot,   setHovSlot]   = useState<number|null>(null);

  const scheduledIds = new Set(blocks.map(b => b.taskId));
  const today = new Date().toISOString().slice(0,10);
  const unscheduled = ALL_TASKS.filter(t => !scheduledIds.has(t.id));

  // Compute booked slot ranges (calendar events)
  function isCalBooked(slot: number): CalEvent | null {
    return MOCK_CALENDAR.find(e => slot >= timeToSlot(e.start) && slot < timeToSlot(e.end)) ?? null;
  }
  function isBlockBooked(slot: number): DayBlock | null {
    return blocks.find(b => slot >= timeToSlot(b.start) && slot < timeToSlot(b.start) + b.durationMins/30) ?? null;
  }

  function addBlock() {
    if (!scheduling) return;
    // Remove any existing block for this task
    const clean = blocks.filter(b => b.taskId !== scheduling.taskId);
    setBlocks([...clean, { taskId: scheduling.taskId, start: pickTime, durationMins: pickDur }]);
    setScheduling(null);
  }

  function removeBlock(taskId: number) { setBlocks(b => b.filter(x => x.taskId !== taskId)); }
  function markDone(taskId: number) { setDone(s => { const n = new Set(s); n.has(taskId) ? n.delete(taskId) : n.add(taskId); return n; }); }
  function rollOver(taskId: number) { setRolledOver(s => { const n = new Set(s); n.add(taskId); return n; }); removeBlock(taskId); }

  // AI Suggest: greedy fill open slots with high-priority tasks
  function suggestDay() {
    const sorted = [...unscheduled].sort((a,b) => {
      const da = taskUrgency(a.due).days, db = taskUrgency(b.due).days;
      return da - db;
    });
    const newBlocks: DayBlock[] = [...blocks];
    const slotOccupied = (slot: number) => {
      const calBusy = MOCK_CALENDAR.some(e => slot >= timeToSlot(e.start) && slot < timeToSlot(e.end));
      const blkBusy = newBlocks.some(b => slot >= timeToSlot(b.start) && slot < timeToSlot(b.start) + b.durationMins/30);
      return calBusy || blkBusy;
    };
    for (const task of sorted.slice(0,5)) {
      const dur = 30;
      const slots = dur / 30;
      for (let s = 0; s <= TOTAL_SLOTS - slots; s++) {
        let fits = true;
        for (let ss = s; ss < s + slots; ss++) { if (slotOccupied(ss)) { fits = false; break; } }
        if (fits) {
          const totalMins = DAY_START * 60 + s * 30;
          const h = Math.floor(totalMins / 60), m = totalMins % 60;
          newBlocks.push({ taskId: task.id, start: `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`, durationMins: dur });
          break;
        }
      }
    }
    setBlocks(newBlocks);
    setSuggested(true);
  }

  // Available time calculation
  const calMins = MOCK_CALENDAR.reduce((sum,e)=> sum + (timeToSlot(e.end)-timeToSlot(e.start))*30, 0);
  const blkMins = blocks.reduce((sum,b)=>sum+b.durationMins,0);
  const availMins = (DAY_END - DAY_START) * 60 - calMins;

  const nowPx = nowOffset();

  return (
    <div style={{ display:"flex", height:"calc(100vh - 112px)", overflow:"hidden" }}>
      {/* ── Left: task queue ── */}
      <div style={{ width:280, flexShrink:0, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", background:T.navy }}>
        <div style={{ padding:"16px 16px 10px" }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.13em", textTransform:"uppercase", color:T.ivory3, marginBottom:6 }}>Unscheduled — {unscheduled.length}</div>
          {/* Day stats */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:12 }}>
            {[
              { label:"Meetings", val:`${Math.round(calMins/60)}h`, color:T.coolGray },
              { label:"Task time", val:`${Math.round(blkMins/60)}h ${blkMins%60?blkMins%60+"m":""}`, color:T.sg },
              { label:"Open", val:`${Math.round(availMins/60)}h`, color:T.ivory3 },
            ].map(s=>(
              <div key={s.label} style={{ padding:"7px 8px", borderRadius:8, background:T.slate, border:`1px solid ${T.border}`, textAlign:"center" }}>
                <div style={{ fontSize:14, fontWeight:800, color:s.color, fontFamily:"'Sohne','Plus Jakarta Sans',sans-serif" }}>{s.val}</div>
                <div style={{ fontSize:9.5, color:T.ivory3, marginTop:1 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <button onClick={suggestDay} style={{ display:"flex", alignItems:"center", gap:6, width:"100%", padding:"8px 12px", borderRadius:9, border:`1px solid ${T.sgBorder}`, background:suggested?T.sgSoft:"transparent", color:T.sg, fontSize:12.5, fontWeight:600, cursor:"pointer" }}>
            <Sparkles size={13} /> {suggested ? "Schedule updated ✓" : "AI: Plan my day"}
          </button>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"0 10px 16px" }}>
          {/* Rolled over from yesterday */}
          {rolledOver.size > 0 && (
            <div style={{ padding:"8px 10px", borderRadius:8, background:T.warnSoft, border:`1px solid ${T.warn}44`, marginBottom:10 }}>
              <div style={{ fontSize:10, fontWeight:700, color:T.warn, marginBottom:4 }}>Rolled over from yesterday</div>
              {[...rolledOver].map(id => { const t = ALL_TASKS.find(x=>x.id===id); return t ? <div key={id} style={{ fontSize:12, color:T.ivory2 }}>• {t.title.slice(0,36)}…</div> : null; })}
            </div>
          )}

          {/* Tasks grouped by urgency */}
          {[
            { label:"Overdue", tasks: unscheduled.filter(t=>taskUrgency(t.due).days<0), color:T.danger },
            { label:"Due soon", tasks: unscheduled.filter(t=>{ const d=taskUrgency(t.due).days; return d>=0&&d<=5; }), color:T.warn },
            { label:"This week", tasks: unscheduled.filter(t=>{ const d=taskUrgency(t.due).days; return d>5&&d<=14; }), color:T.sg },
          ].filter(g=>g.tasks.length>0).map(g=>(
            <div key={g.label} style={{ marginBottom:10 }}>
              <div style={{ fontSize:9.5, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:g.color, padding:"6px 4px 4px" }}>{g.label} — {g.tasks.length}</div>
              {g.tasks.map(t=>{
                const isScheduling = scheduling?.taskId === t.id;
                return (
                  <div key={t.id} style={{ padding:"8px 10px", borderRadius:9, background:T.slate, border:`1px solid ${isScheduling?T.sg:T.border}`, marginBottom:5 }}>
                    <div style={{ fontSize:12.5, fontWeight:500, color:T.ivory, lineHeight:1.35 }}>{t.title}</div>
                    <div style={{ display:"flex", gap:5, marginTop:4, flexWrap:"wrap" }}>
                      {t.account && <span style={{ fontSize:10, padding:"1px 6px", borderRadius:7, background:acctColor(t.account)+"28", color:acctColor(t.account), fontWeight:600 }}>{t.account}</span>}
                      <span style={{ fontSize:10, color:g.color }}>{taskUrgency(t.due).label}</span>
                    </div>
                    {isScheduling ? (
                      <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
                        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                          <label style={{ fontSize:11, color:T.ivory3 }}>Start</label>
                          <select value={pickTime} onChange={e=>setPickTime(e.target.value)} style={{ flex:1, padding:"4px 6px", borderRadius:6, border:`1px solid ${T.border2}`, background:T.slateUp, color:T.ivory, fontSize:11.5, outline:"none" }}>
                            {Array.from({length:TOTAL_SLOTS},(_,i)=>{
                              const totalMins=DAY_START*60+i*30;
                              const h=Math.floor(totalMins/60), m=totalMins%60;
                              const val=`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
                              return <option key={val} value={val}>{slotToLabel(i)}</option>;
                            })}
                          </select>
                        </div>
                        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                          {[15,30,45,60,90,120].map(d=>(
                            <button key={d} onClick={()=>setPickDur(d)} style={{ padding:"3px 8px", borderRadius:6, border:`1px solid ${pickDur===d?T.sg:T.border2}`, background:pickDur===d?T.sgSoft:"transparent", color:pickDur===d?T.sg:T.ivory3, fontSize:11, cursor:"pointer", fontWeight:pickDur===d?700:400 }}>
                              {d<60?`${d}m`:d===60?"1h":`${d/60}h`}
                            </button>
                          ))}
                        </div>
                        <div style={{ display:"flex", gap:5 }}>
                          <button onClick={addBlock} style={{ flex:1, padding:"6px", borderRadius:7, border:"none", background:T.sg, color:T.navy, fontSize:12, fontWeight:700, cursor:"pointer" }}>Add to day</button>
                          <button onClick={()=>setScheduling(null)} style={{ padding:"6px 10px", borderRadius:7, border:`1px solid ${T.border2}`, background:"transparent", color:T.ivory3, fontSize:12, cursor:"pointer" }}>×</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={()=>setScheduling({taskId:t.id,step:"time"})} style={{ marginTop:6, display:"flex", alignItems:"center", gap:5, padding:"4px 9px", borderRadius:7, border:`1px solid ${T.border2}`, background:"transparent", color:T.ivory3, fontSize:11.5, cursor:"pointer" }}>
                        <Clock size={11} /> Schedule
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {unscheduled.length === 0 && (
            <div style={{ padding:"20px", textAlign:"center", color:T.sg, fontSize:13, fontWeight:600 }}>All tasks scheduled ✓</div>
          )}
        </div>
      </div>

      {/* ── Right: day timeline ── */}
      <div style={{ flex:1, overflowY:"auto", position:"relative", background:T.navySurf }}>
        {/* Date header */}
        <div style={{ padding:"14px 24px 10px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", background:T.navySurf, position:"sticky", top:0, zIndex:10 }}>
          <div style={{ fontFamily:"'Sohne','Plus Jakarta Sans',sans-serif", fontWeight:700, fontSize:15, color:T.ivory }}>
            {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
          </div>
          <div style={{ display:"flex", gap:10, fontSize:12, color:T.ivory3 }}>
            <span><b style={{ color:T.sg }}>{blocks.length}</b> task blocks</span>
            <span><b style={{ color:T.coolGray }}>{MOCK_CALENDAR.length}</b> meetings</span>
            <span style={{ color:T.warn }}>Outlook calendar synced</span>
          </div>
        </div>

        {/* Timeline grid */}
        <div style={{ position:"relative", margin:"8px 24px 24px" }}>
          {/* Slot rows (background grid) */}
          {Array.from({length:TOTAL_SLOTS},(_,i)=>(
            <div key={i} style={{ height:SLOT_H, borderTop:`1px solid ${i%2===0?T.border:T.border+"55"}`, display:"flex", alignItems:"flex-start", paddingTop:3 }}
              onMouseEnter={()=>setHovSlot(i)} onMouseLeave={()=>setHovSlot(null)}>
              {i%2===0 && (
                <span style={{ fontSize:10.5, color:T.ivory3, minWidth:54, paddingRight:10, userSelect:"none", fontVariantNumeric:"tabular-nums" }}>{slotToLabel(i)}</span>
              )}
            </div>
          ))}

          {/* Events and blocks overlay */}
          <div style={{ position:"absolute", top:0, left:54, right:0, bottom:0 }}>
            {/* Calendar events */}
            {MOCK_CALENDAR.map(ev=>{
              const startSlot = timeToSlot(ev.start);
              const endSlot   = timeToSlot(ev.end);
              const h = (endSlot-startSlot)*SLOT_H - 2;
              return (
                <div key={ev.id} style={{ position:"absolute", top:startSlot*SLOT_H+1, height:h, left:0, right:0, borderRadius:8, background:`${ev.color}28`, border:`1px solid ${ev.color}66`, padding:"6px 10px", overflow:"hidden", display:"flex", flexDirection:"column", justifyContent:"center" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:ev.color, textTransform:"uppercase", letterSpacing:"0.08em" }}>MEETING</div>
                  <div style={{ fontSize:12.5, fontWeight:600, color:T.ivory, marginTop:2 }}>{ev.title}</div>
                  <div style={{ fontSize:10.5, color:T.ivory3 }}>{slotToLabel(timeToSlot(ev.start))} – {slotToLabel(timeToSlot(ev.end))}</div>
                </div>
              );
            })}

            {/* Task blocks */}
            {blocks.map(b=>{
              const task = ALL_TASKS.find(t=>t.id===b.taskId);
              if (!task) return null;
              const startSlot = timeToSlot(b.start);
              const slotCount = b.durationMins/30;
              const h = slotCount*SLOT_H - 2;
              const color = task.account ? acctColor(task.account) : T.sg;
              const isDone = done.has(b.taskId);
              const u = taskUrgency(task.due);
              return (
                <div key={b.taskId} style={{ position:"absolute", top:startSlot*SLOT_H+1, height:h, left:0, right:0, borderRadius:8, background:isDone?`${T.sg}18`:`${color}22`, border:`1.5px solid ${isDone?T.sg:color}66`, borderLeft:`3px solid ${isDone?T.sg:u.color}`, padding:"6px 10px", overflow:"hidden", display:"flex", flexDirection:"column", justifyContent:"space-between", opacity:isDone?0.55:1 }}>
                  <div>
                    <div style={{ fontSize:11, color:isDone?T.sg:u.color, fontWeight:600, textDecoration:isDone?"line-through":"none" }}>{task.title.slice(0,45)}{task.title.length>45?"…":""}</div>
                    <div style={{ display:"flex", gap:5, marginTop:2 }}>
                      {task.account && <span style={{ fontSize:9.5, color, fontWeight:600 }}>{task.account}</span>}
                      <span style={{ fontSize:9.5, color:T.ivory3 }}>{b.durationMins<60?`${b.durationMins}min`:b.durationMins===60?"1h":`${b.durationMins/60}h`}</span>
                    </div>
                  </div>
                  {h > 52 && (
                    <div style={{ display:"flex", gap:5 }}>
                      <button onClick={()=>markDone(b.taskId)} style={{ fontSize:10, padding:"2px 7px", borderRadius:5, border:`1px solid ${T.sg}66`, background:isDone?T.sgSoft:"transparent", color:T.sg, cursor:"pointer", fontWeight:600 }}>
                        {isDone?"✓ Done":"Mark done"}
                      </button>
                      <button onClick={()=>rollOver(b.taskId)} title="Roll to tomorrow" style={{ fontSize:10, padding:"2px 7px", borderRadius:5, border:`1px solid ${T.border2}`, background:"transparent", color:T.ivory3, cursor:"pointer" }}>
                        → Tomorrow
                      </button>
                      <button onClick={()=>removeBlock(b.taskId)} style={{ fontSize:10, padding:"2px 6px", borderRadius:5, border:`1px solid ${T.border2}`, background:"transparent", color:T.ivory3, cursor:"pointer" }}>×</button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* "Now" line */}
            {nowPx >= 0 && (
              <div style={{ position:"absolute", top:nowPx, left:-54, right:0, height:2, background:T.danger, zIndex:5, display:"flex", alignItems:"center" }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:T.danger, flexShrink:0 }} />
              </div>
            )}
          </div>
        </div>

        {/* Rollover summary */}
        <div style={{ margin:"0 24px 24px", padding:"12px 16px", borderRadius:10, background:T.slate, border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:T.ivory3, marginBottom:8 }}>End of day — rollover</div>
          <div style={{ fontSize:12.5, color:T.ivory2 }}>
            {blocks.filter(b=>!done.has(b.taskId)).length} unfinished blocks will roll to tomorrow. Mark tasks done or use "→ Tomorrow" to explicitly roll them.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ASK ───────────────────────────────────────────────────────
const EXAMPLE_PROMPTS = [
  "What is open and overdue for Stryker?",
  "Summarize where things stand with Terumo.",
  "What is our price on part MSS031?",
  "What did I commit to in my last meeting?",
];
function AskView() {
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState<{ role: "user"|"ai"; text: string }[]>([]);
  const [loading, setLoading] = useState(false);
  function send(text: string) {
    if (!text.trim()) return;
    setMessages(m => [...m, { role: "user", text }, { role: "ai", text: "I'm grounded in your vault data — accounts, contacts, open tasks, and meetings. This is a prototype so I can't query live data, but in production I'd give you a real answer here based on Jordan's workspace." }]);
    setQ("");
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: T.navySurf }}>
      <div style={{ padding: "24px 32px 16px", borderBottom: `1px solid ${T.border}` }}>
        <h1 style={{ fontFamily: "'Sohne','Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 22, color: T.ivory, margin: 0 }}>Ask</h1>
        <p style={{ margin: "4px 0 0", fontSize: 12.5, color: T.ivory3 }}>The brain. Grounded in your vault: accounts, contacts, open tasks, and meetings.</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
        {messages.length === 0 ? (
          <div style={{ maxWidth: 560 }}>
            <div style={{ padding: "16px 20px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}`, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Sparkles size={14} color={T.sg} />
                <span style={{ fontSize: 12, fontWeight: 700, color: T.sg, letterSpacing: "0.08em", textTransform: "uppercase" }}>Grounded answers only</span>
              </div>
              <p style={{ fontSize: 13, color: T.ivory2, lineHeight: 1.65, margin: 0 }}>Answers are grounded in your vault data — accounts, contacts, open tasks, and meeting notes. Nothing is invented. If the data isn't there, I'll say so.</p>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.ivory3, marginBottom: 10 }}>Try asking</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {EXAMPLE_PROMPTS.map(p => (
                <button key={p} onClick={() => send(p)} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border2}`, background: T.slate, color: T.ivory2, fontSize: 12.5, textAlign: "left", cursor: "pointer", lineHeight: 1.5, transition: "border-color 0.12s" }}>{p}</button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 10, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                {m.role === "ai" && <div style={{ width: 28, height: 28, borderRadius: 8, background: T.sgSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Sparkles size={13} color={T.sg} /></div>}
                <div style={{ padding: "10px 14px", borderRadius: 10, background: m.role === "user" ? T.sg : T.slate, color: m.role === "user" ? T.navy : T.ivory2, fontSize: 13, lineHeight: 1.65, maxWidth: "80%" }}>{m.text}</div>
              </div>
            ))}
            {loading && <div style={{ color: T.ivory3, fontSize: 12 }}>Thinking…</div>}
          </div>
        )}
      </div>
      <div style={{ padding: "12px 32px 20px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && send(q)} placeholder="Ask the brain…" style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border2}`, background: T.slate, color: T.ivory, fontSize: 13, outline: "none" }} />
        <button onClick={() => send(q)} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: T.sg, color: T.navy, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Ask</button>
      </div>
    </div>
  );
}

// ── TASKS ─────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  "Pricing/Quote":  { color: T.sg,      bg: T.sgSoft },
  "Quality & Reg":  { color: T.warn,    bg: T.warnSoft },
  "PCN":            { color: "#9B7CC4", bg: "rgba(155,124,196,0.12)" },
  "Admin/Other":    { color: T.coolGray,bg: "rgba(166,173,180,0.10)" },
  "Samples/Dev":    { color: T.info,    bg: T.infoSoft },
};

interface CheckItem { id: string; text: string; done: boolean; owner?: string }
interface TaskData {
  id: number; title: string; account: string | null; type: string; status: string;
  due: string; priority: string; fromMeeting: boolean;
  linkedThread: string | null;
  lastCustomerUpdate: string | null; // ISO date of last "heads up" sent
  checklist: CheckItem[];
}

const ALL_TASKS: TaskData[] = [
  {
    id:1, title:"Send updated quote — Custom 3ml Kit", account:"ReCurve Medical",
    type:"Pricing/Quote", status:"Open", due:"2026-06-28", priority:"high",
    fromMeeting:false, linkedThread:"tiger-syringe", lastCustomerUpdate: null,
    checklist:[
      { id:"1a", text:"Get BOM confirmation from engineering", done:true, owner:"Chad R." },
      { id:"1b", text:"Confirm NRE costs with product team", done:true, owner:"Jordan" },
      { id:"1c", text:"Final pricing approval from management", done:false, owner:"Manager" },
      { id:"1d", text:"Format and send quote PDF", done:false, owner:"Jordan" },
    ],
  },
  {
    id:2, title:"Follow up on Stryker PV quote request 7/1", account:"Stryker",
    type:"Pricing/Quote", status:"Open", due:"2026-06-30", priority:"high",
    fromMeeting:true, linkedThread:"stryker-pv", lastCustomerUpdate:"2026-06-28",
    checklist:[
      { id:"2a", text:"Pull Inari Medical product overlap list", done:true, owner:"Jordan" },
      { id:"2b", text:"Confirm Stryker is new BDM contact", done:true, owner:"Jordan" },
      { id:"2c", text:"Build PV quote in system", done:false, owner:"Jordan" },
    ],
  },
  {
    id:3, title:"Review Biotronik delivery timeline — PO 2700286", account:"Biotronik",
    type:"Admin/Other", status:"Open", due:"2026-07-01", priority:"med",
    fromMeeting:false, linkedThread:"biotronik-po", lastCustomerUpdate:"2026-07-01",
    checklist:[
      { id:"3a", text:"Confirm production schedule with ops", done:true, owner:"Luis M." },
      { id:"3b", text:"Validate 280-unit qty against forecast", done:true, owner:"Jordan" },
    ],
  },
  {
    id:4, title:"Respond to Intuitive Surgical SCR — stopcock ECN", account:"Intuitive Surgical",
    type:"Quality & Reg", status:"Open", due:"2026-07-01", priority:"high",
    fromMeeting:false, linkedThread:"stopcock-scr", lastCustomerUpdate:null,
    checklist:[
      { id:"4a", text:"Review ECN documentation from Intuitive", done:true, owner:"Jordan" },
      { id:"4b", text:"Loop in quality team for regulatory review", done:false, owner:"Rachel J." },
      { id:"4c", text:"Draft Merit response / position statement", done:false, owner:"Jordan" },
    ],
  },
  {
    id:5, title:"Submit Q3 OEM forecast to leadership", account:null,
    type:"Admin/Other", status:"Open", due:"2026-07-04", priority:"med",
    fromMeeting:false, linkedThread:null, lastCustomerUpdate:null,
    checklist:[
      { id:"5a", text:"Collect pipeline data from all accounts", done:false, owner:"Jordan" },
      { id:"5b", text:"Reconcile with Q2 actuals", done:false, owner:"Jordan" },
    ],
  },
  {
    id:6, title:"Send biocompatibility packet to Nectero", account:"Nectero",
    type:"Quality & Reg", status:"Open", due:"2026-07-05", priority:"med",
    fromMeeting:true, linkedThread:null, lastCustomerUpdate:null,
    checklist:[
      { id:"6a", text:"Locate current biocomp docs in library", done:true, owner:"Jordan" },
      { id:"6b", text:"Confirm correct revision with quality team", done:false, owner:"Rachel J." },
      { id:"6c", text:"Package and send to Nectero contact", done:false, owner:"Jordan" },
    ],
  },
  {
    id:7, title:"PCN review — Balt K04-01258 MEX facility", account:"Balt",
    type:"PCN", status:"Waiting", due:"2026-07-08", priority:"high",
    fromMeeting:true, linkedThread:null, lastCustomerUpdate:"2026-07-02",
    checklist:[
      { id:"7a", text:"Review MEX facility PCN documentation", done:true, owner:"Jordan" },
      { id:"7b", text:"Submit to Merit quality portal", done:true, owner:"Rachel J." },
      { id:"7c", text:"Await regulatory review (6-week timeline)", done:false, owner:"Quality team" },
    ],
  },
  {
    id:8, title:"Samples request — Aust Manufacturing", account:"Aust Manufacturing",
    type:"Samples/Dev", status:"Open", due:"2026-07-10", priority:"low",
    fromMeeting:false, linkedThread:null, lastCustomerUpdate:null,
    checklist:[
      { id:"8a", text:"Confirm part numbers requested", done:true, owner:"Jordan" },
      { id:"8b", text:"Check sample inventory with warehouse", done:false, owner:"Luis M." },
      { id:"8c", text:"Arrange shipment", done:false, owner:"Jordan" },
    ],
  },
];

// Urgency helper — days until due (negative = overdue)
function taskUrgency(due: string): { days: number; label: string; color: string; barColor: string } {
  const days = Math.round((new Date(due).getTime() - Date.now()) / 86400000);
  if (days < 0)  return { days, label: `${Math.abs(days)}d overdue`, color: T.danger,   barColor: T.danger };
  if (days === 0) return { days, label: "Due today",                  color: T.danger,   barColor: T.danger };
  if (days <= 2)  return { days, label: `${days}d left`,             color: T.warn,     barColor: T.warn };
  if (days <= 7)  return { days, label: `${days}d left`,             color: T.sg400,    barColor: T.sg };
  return { days, label: due, color: T.ivory3, barColor: T.border };
}

// AI draft generator for "keeping customer warm"
function generateWarmDraft(task: TaskData): string {
  const incompleteInternal = task.checklist.filter(c => !c.done);
  const u = taskUrgency(task.due);
  const salutation = task.account ? `Hi,` : "Hi,";

  if (u.days < 0) {
    // Overdue — apologize, give ETA
    const blockedBy = incompleteInternal.length > 0 ? " We're coordinating a few internal items to make sure what we send you is accurate." : "";
    return `${salutation}\n\nI wanted to reach out regarding the ${task.title} — I apologize for not having this to you yet.${blockedBy} I'm making this a priority and expect to have something to you within the next 1–2 business days.\n\nI appreciate your patience and I'll follow up as soon as it's ready.\n\nBest,\nJordan`;
  }
  if (u.days <= 3) {
    // Close — proactive heads up
    const blockedNote = incompleteInternal.length > 0
      ? " We're still finalizing a few internal steps to make sure the information is complete and accurate."
      : " We're in the final stages of putting this together.";
    return `${salutation}\n\nJust wanted to give you a quick heads-up on the ${task.title}.${blockedNote} I'm targeting ${task.due} and wanted to make sure you knew it's still actively in progress — you'll hear from me as soon as it's done.\n\nBest,\nJordan`;
  }
  // Normal — reassurance
  return `${salutation}\n\nJust a quick note on the ${task.title} — everything is on track on our end. We're working toward the ${task.due} commitment and will follow up as soon as it's ready. Let me know if anything changes on your side in the meantime.\n\nBest,\nJordan`;
}

function TasksView() {
  const [view, setView]       = useState<"grouped"|"table">("grouped");
  const [q, setQ]             = useState("");
  const [addingTo, setAddingTo] = useState<string|null>(null);
  const [newTitle, setNewTitle]  = useState("");
  const [tasks, setTasks]     = useState<TaskData[]>(ALL_TASKS);
  const today = new Date().toISOString().slice(0,10);

  const filtered = tasks.filter(t =>
    !q || t.title.toLowerCase().includes(q.toLowerCase()) || (t.account ?? "").toLowerCase().includes(q.toLowerCase())
  );
  const byAccount: Record<string, TaskData[]> = {};
  filtered.forEach(t => { const k = t.account ?? "No account"; (byAccount[k] ??= []).push(t); });

  function toggleCheck(taskId: number, itemId: string) {
    setTasks(ts => ts.map(t => t.id !== taskId ? t : {
      ...t, checklist: t.checklist.map(c => c.id === itemId ? { ...c, done: !c.done } : c)
    }));
  }
  function markUpdateSent(taskId: number) {
    setTasks(ts => ts.map(t => t.id !== taskId ? t : { ...t, lastCustomerUpdate: today }));
  }
  function addTask(acct: string) {
    if (!newTitle.trim()) return;
    const newTask: TaskData = { id: Date.now(), title: newTitle, account: acct === "No account" ? null : acct, type: "Admin/Other", status: "Open", due: "", priority: "med", fromMeeting: false, linkedThread: null, lastCustomerUpdate: null, checklist: [] };
    setTasks(ts => [...ts, newTask]);
    setNewTitle(""); setAddingTo(null);
  }

  // Which tasks need a proactive update? (within 5 days or overdue, no update sent today)
  const needsUpdate = tasks.filter(t => t.account && taskUrgency(t.due).days <= 5 && t.lastCustomerUpdate !== today);

  return (
    <div style={{ minHeight: "100%", background: T.navySurf }}>
      {/* Header */}
      <div style={{ padding: "24px 32px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Sohne','Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 22, color: T.ivory, margin: 0 }}>Tasks</h1>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: T.ivory3 }}>{tasks.length} tasks · grouped by account</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: T.ivory3 }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tasks…" style={{ padding: "7px 10px 7px 28px", borderRadius: 8, border: `1px solid ${T.border2}`, background: "rgba(255,255,255,0.04)", color: T.ivory, fontSize: 12.5, outline: "none", width: 200 }} />
          </div>
          <div style={{ display: "flex", borderRadius: 8, border: `1px solid ${T.border2}`, overflow: "hidden" }}>
            {[{k:"grouped" as const, Icon:Columns3},{k:"table" as const, Icon:List}].map(({k,Icon})=>(
              <button key={k} onClick={() => setView(k)} style={{ padding: "6px 10px", border: "none", background: view===k ? T.sg : "transparent", color: view===k ? T.navy : T.ivory3, cursor: "pointer" }}><Icon size={14} /></button>
            ))}
          </div>
        </div>
      </div>

      {/* "Send updates" nudge bar */}
      {needsUpdate.length > 0 && (
        <div style={{ margin: "16px 32px 0", padding: "10px 16px", borderRadius: 10, background: T.warnSoft, border: `1px solid ${T.warn}44`, display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={14} color={T.warn} />
          <span style={{ fontSize: 12.5, color: T.warn, fontWeight: 500 }}>
            {needsUpdate.length} task{needsUpdate.length > 1 ? "s are" : " is"} approaching or past due — customers haven't been updated.
          </span>
          <span style={{ fontSize: 12, color: T.ivory3, marginLeft: 4 }}>Expand a task below to send a quick heads-up.</span>
        </div>
      )}

      <div style={{ padding: "16px 32px 40px" }}>
        {view === "grouped" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Object.entries(byAccount).map(([acct, acctTasks]) => {
              const overdueCount   = acctTasks.filter(t => taskUrgency(t.due).days < 0).length;
              const needsUpdateCnt = acctTasks.filter(t => t.account && taskUrgency(t.due).days <= 5 && t.lastCustomerUpdate !== today).length;
              const color = acct === "No account" ? T.ivory3 : acctColor(acct);
              return (
                <div key={acct} style={{ borderRadius: 12, background: T.slate, border: `1px solid ${overdueCount > 0 ? T.danger+"44" : T.border}`, overflow: "hidden" }}>
                  {/* Account header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: T.slateUp, borderBottom: `1px solid ${T.border}` }}>
                    {acct !== "No account" && <div style={{ width: 24, height: 24, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff" }}>{initials(acct)}</div>}
                    <span style={{ fontSize: 13, fontWeight: 700, color }}>{acct}</span>
                    <span style={{ fontSize: 11, color: T.ivory3 }}>{acctTasks.length} task{acctTasks.length!==1?"s":""}</span>
                    {overdueCount > 0 && <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 8, background: T.dangerSoft, color: T.danger, fontWeight: 700 }}>{overdueCount} overdue</span>}
                    {needsUpdateCnt > 0 && <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 8, background: T.warnSoft, color: T.warn, fontWeight: 600 }}>{needsUpdateCnt} needs update</span>}
                    {acctTasks.some(t=>t.fromMeeting) && <span style={{ marginLeft: "auto", fontSize: 9.5, padding: "2px 6px", borderRadius: 6, background: T.warnSoft, color: T.warn, fontWeight: 600 }}>From Granola</span>}
                  </div>

                  {/* Task cards */}
                  {acctTasks.map((t, i) => (
                    <EnhancedTaskCard
                      key={t.id} task={t} first={i===0}
                      onToggleCheck={toggleCheck}
                      onUpdateSent={() => markUpdateSent(t.id)}
                    />
                  ))}

                  {/* Quick add */}
                  {addingTo === acct ? (
                    <div style={{ display: "flex", gap: 8, padding: "8px 16px", borderTop: `1px solid ${T.border}`, background: T.sgSoft }}>
                      <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="New task title…"
                        onKeyDown={e => { if (e.key === "Enter") addTask(acct); if (e.key === "Escape") setAddingTo(null); }}
                        style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.ivory, fontSize: 13 }} />
                      <button onClick={() => addTask(acct)} style={{ fontSize: 11.5, color: T.sg, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Add</button>
                      <button onClick={() => setAddingTo(null)} style={{ fontSize: 11.5, color: T.ivory3, background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingTo(acct)} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 16px", border: "none", background: "transparent", color: T.ivory3, fontSize: 12, cursor: "pointer", borderTop: `1px solid ${T.border}` }}>
                      <Plus size={11} /> Add task{acct !== "No account" ? ` to ${acct}` : ""}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Table view */
          <div style={{ borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 140px 100px 110px", padding: "8px 14px", background: T.slate, borderBottom: `1px solid ${T.border}`, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.ivory3, gap: 8 }}>
              {["Task","Account","Type","Urgency","Due"].map(h => <span key={h}>{h}</span>)}
            </div>
            {filtered.map((t, i) => {
              const tc = TYPE_COLORS[t.type] ?? { color: T.ivory3, bg: T.ivory4 };
              const u  = taskUrgency(t.due);
              return (
                <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1fr 160px 140px 100px 110px", padding: "10px 14px", borderTop: i===0?"none":`1px solid ${T.border}`, gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: T.ivory }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: t.account ? acctColor(t.account) : T.ivory3, fontWeight: 500 }}>{t.account ?? "—"}</div>
                  <div><span style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 8, background: tc.bg, color: tc.color, fontWeight: 600 }}>{t.type}</span></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: u.barColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, color: u.color, fontWeight: u.days <= 2 ? 700 : 400 }}>{u.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: u.color, fontWeight: u.days < 0 ? 700 : 400 }}>{t.due || "—"}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Enhanced task card ─────────────────────────────────────────
function EnhancedTaskCard({ task: t, first, onToggleCheck, onUpdateSent }: {
  task: TaskData; first: boolean;
  onToggleCheck: (taskId: number, itemId: string) => void;
  onUpdateSent: () => void;
}) {
  const [expanded,    setExpanded]    = useState(false);
  const [done,        setDone]        = useState(false);
  const [showDraft,   setShowDraft]   = useState(false);
  const [draft,       setDraft]       = useState("");
  const [sent,        setSent]        = useState(false);
  const u = taskUrgency(t.due);
  const tc = TYPE_COLORS[t.type] ?? { color: T.ivory3, bg: T.ivory4 };
  const incompleteInternal = t.checklist.filter(c => !c.done);
  const needsCustomerUpdate = t.account && u.days <= 5 && t.lastCustomerUpdate !== new Date().toISOString().slice(0,10);
  const linkedThread = INIT_THREADS.find(th => th.key === t.linkedThread);
  const today = new Date().toISOString().slice(0,10);

  function openDraft() {
    setDraft(generateWarmDraft(t));
    setShowDraft(true);
  }

  function sendUpdate() {
    setSent(true);
    setShowDraft(false);
    onUpdateSent();
    setTimeout(() => setSent(false), 4000);
  }

  // Urgency left-border color
  const borderLeft = u.days < 0 ? `3px solid ${T.danger}` : u.days <= 2 ? `3px solid ${T.warn}` : `1px solid ${T.border}`;

  return (
    <div style={{ borderTop: first ? "none" : `1px solid ${T.border}`, borderLeft, opacity: done ? 0.35 : 1, transition: "opacity 0.15s, border-left 0.15s" }}>
      {/* Collapsed row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", cursor: "pointer" }}>
        {/* Checkbox */}
        <div onClick={e => { e.stopPropagation(); setDone(v=>!v); }}
          style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${done ? T.sg : u.days < 0 ? T.danger : T.border2}`, background: done ? T.sg : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {done && <Check size={10} color={T.navy} strokeWidth={3} />}
        </div>

        {/* Title + chips */}
        <div style={{ flex: 1, minWidth: 0 }} onClick={() => setExpanded(v=>!v)}>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.ivory, textDecoration: done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
          <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: tc.bg, color: tc.color, fontWeight: 600 }}>{t.type}</span>
            {t.fromMeeting && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: T.warnSoft, color: T.warn, fontWeight: 600 }}>From meeting</span>}
            {incompleteInternal.length > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: T.ivory4, color: T.ivory3, fontWeight: 500 }}>{t.checklist.filter(c=>c.done).length}/{t.checklist.length} internal steps</span>}
            {sent && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: T.sgSoft, color: T.sg, fontWeight: 600 }}>✓ Update sent</span>}
          </div>
        </div>

        {/* Urgency + update button */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {needsCustomerUpdate && !done && (
            <button onClick={e => { e.stopPropagation(); setExpanded(true); openDraft(); }}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 7, border: `1px solid ${u.color}66`, background: u.days < 0 ? T.dangerSoft : T.warnSoft, color: u.color, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              <MessageSquare size={11} /> Send update
            </button>
          )}
          <div style={{ textAlign: "right", minWidth: 70 }}>
            <div style={{ fontSize: 11.5, color: u.color, fontWeight: u.days <= 2 ? 700 : 400 }}>{u.label}</div>
            {t.lastCustomerUpdate && <div style={{ fontSize: 10, color: T.ivory3 }}>updated {t.lastCustomerUpdate}</div>}
          </div>
          <button onClick={() => setExpanded(v=>!v)} style={{ background: "none", border: "none", cursor: "pointer", color: T.ivory3, padding: 2 }}>
            <ChevronRight size={14} style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Two-column: checklist + customer update */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Internal checklist */}
            <div style={{ padding: "12px 14px", borderRadius: 9, background: T.slateUp, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.ivory3, marginBottom: 10 }}>
                Internal progress — {t.checklist.filter(c=>c.done).length}/{t.checklist.length} done
              </div>
              {/* Progress bar */}
              <div style={{ height: 3, borderRadius: 2, background: T.border, marginBottom: 10, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 2, background: T.sg, width: `${t.checklist.length ? (t.checklist.filter(c=>c.done).length / t.checklist.length) * 100 : 0}%`, transition: "width 0.3s ease" }} />
              </div>
              {t.checklist.map(item => (
                <div key={item.id} onClick={() => onToggleCheck(t.id, item.id)}
                  style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0", cursor: "pointer", borderTop: `1px solid ${T.border}` }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${item.done ? T.sg : T.border2}`, background: item.done ? T.sg : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    {item.done && <Check size={9} color={T.navy} strokeWidth={3} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 12, color: item.done ? T.ivory3 : T.ivory, textDecoration: item.done ? "line-through" : "none" }}>{item.text}</span>
                    {item.owner && <span style={{ fontSize: 10.5, color: T.ivory3, marginLeft: 6 }}>→ {item.owner}</span>}
                  </div>
                </div>
              ))}
              <button style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, background: "none", border: "none", cursor: "pointer", color: T.ivory3, fontSize: 11.5 }}>
                <Plus size={11} /> Add step
              </button>
            </div>

            {/* Customer update panel */}
            <div style={{ padding: "12px 14px", borderRadius: 9, background: needsCustomerUpdate ? `${u.color}0d` : T.slateUp, border: `1px solid ${needsCustomerUpdate ? u.color+"44" : T.border}` }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: needsCustomerUpdate ? u.color : T.ivory3, marginBottom: 8 }}>
                Customer update {t.account ? `— ${t.account}` : ""}
              </div>
              {t.lastCustomerUpdate ? (
                <div style={{ fontSize: 12, color: T.ivory3, marginBottom: 8 }}>Last update: <b style={{ color: T.ivory2 }}>{t.lastCustomerUpdate}</b></div>
              ) : (
                <div style={{ fontSize: 12, color: T.ivory3, marginBottom: 8 }}>No update sent yet.</div>
              )}
              {incompleteInternal.length > 0 && (
                <div style={{ padding: "6px 9px", borderRadius: 7, background: T.ivory4, marginBottom: 10, fontSize: 11.5, color: T.ivory2 }}>
                  <b>Note:</b> {incompleteInternal.length} internal step{incompleteInternal.length>1?"s":""} still open. Draft will say "still coordinating internally" — no specifics shared.
                </div>
              )}
              {!showDraft ? (
                <button onClick={openDraft} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1px solid ${needsCustomerUpdate ? u.color+"88" : T.border2}`, background: needsCustomerUpdate ? `${u.color}18` : "transparent", color: needsCustomerUpdate ? u.color : T.ivory2, fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%" }}>
                  <Sparkles size={12} /> Draft "still working on it" email
                </button>
              ) : (
                <div>
                  <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={6}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${T.border2}`, background: "rgba(255,255,255,0.04)", color: T.ivory2, fontSize: 12, lineHeight: 1.6, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button onClick={sendUpdate} style={{ flex: 1, padding: "7px", borderRadius: 7, border: "none", background: T.sg, color: T.navy, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {linkedThread ? "Send in original thread" : "Send email"}
                    </button>
                    <button onClick={() => setShowDraft(false)} style={{ padding: "7px 10px", borderRadius: 7, border: `1px solid ${T.border2}`, background: "transparent", color: T.ivory3, fontSize: 12, cursor: "pointer" }}>×</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Thread link */}
          {linkedThread && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: 9, background: T.slateUp, border: `1px solid ${T.border}` }}>
              <Inbox size={13} color={T.sg} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: T.ivory3, marginBottom: 2 }}>Linked thread</div>
                <div style={{ fontSize: 12.5, color: T.ivory, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{linkedThread.subject}</div>
                <div style={{ fontSize: 11, color: T.ivory3 }}>{linkedThread.who} · {rel(linkedThread.lastAtISO)}</div>
              </div>
              <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: `1px solid ${T.sgBorder}`, background: T.sgSoft, color: T.sg, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                <MessageSquare size={11} /> Reply in thread
              </button>
            </div>
          )}

          {/* Schedule for today shortcut */}
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", borderRadius:9, background:T.sgSoft, border:`1px solid ${T.sgBorder}` }}>
            <Clock size={12} color={T.sg} />
            <span style={{ fontSize:12, color:T.ivory2 }}>Schedule time for this today</span>
            <button style={{ marginLeft:"auto", fontSize:11.5, color:T.sg, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>→ Open planner</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ACCOUNTS ─────────────────────────────────────────────────
const ACCOUNTS_LIST = [
  { name:"Intuitive Surgical", overdue:7, open:14, contacts:8, type:"OEM Account", region:"Pacific OEM", acctNum:"ACCT # 69249" },
  { name:"Stryker",            overdue:3, open:11, contacts:12, type:"OEM Account", region:"Midwest OEM", acctNum:"" },
  { name:"ReCurve Medical",    overdue:2, open:5,  contacts:4,  type:"OEM Account", region:"Pacific OEM", acctNum:"" },
  { name:"Biotronik",          overdue:1, open:6,  contacts:5,  type:"OEM Account", region:"EU OEM",      acctNum:"" },
  { name:"Balt",               overdue:2, open:4,  contacts:3,  type:"OEM Account", region:"EU OEM",      acctNum:"" },
  { name:"Flex",               overdue:0, open:3,  contacts:6,  type:"OEM Account", region:"Contract Mfg",acctNum:"" },
  { name:"Aust Manufacturing",  overdue:1, open:7,  contacts:9,  type:"OEM Account", region:"Contract Mfg",acctNum:"" },
  { name:"Nectero",            overdue:0, open:2,  contacts:2,  type:"OEM Account", region:"Pacific OEM", acctNum:"" },
];
const ACCT_TABS = ["Overview","Contacts","Emails","Tasks","Quotes","Pricing","Quality","OEM PCNs","Meetings"];
function AccountsView() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(ACCOUNTS_LIST[0]);
  const [tab, setTab] = useState("Overview");
  const filtered = ACCOUNTS_LIST.filter(a => a.name.toLowerCase().includes(q.toLowerCase()));
  const color = acctColor(selected.name);
  return (
    <div style={{ display: "flex", height: "calc(100vh - 0px)", background: T.navySurf }}>
      {/* Account list */}
      <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 16px 12px" }}>
          <h2 style={{ fontFamily: "'Sohne','Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 18, color: T.ivory, margin:"0 0 12px" }}>Accounts</h2>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: T.ivory3 }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search accounts…" style={{ width: "100%", padding: "7px 10px 7px 28px", borderRadius: 8, border: `1px solid ${T.border2}`, background: "rgba(255,255,255,0.04)", color: T.ivory, fontSize: 12.5, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ fontSize: 11, color: T.ivory3, marginTop: 8 }}>{filtered.length} accounts · 1 with account numbers</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.map(a => (
            <button key={a.name} onClick={() => { setSelected(a); setTab("Overview"); }}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", border: "none", background: selected.name === a.name ? T.slateUp : "transparent", cursor: "pointer", textAlign: "left", borderLeft: selected.name === a.name ? `3px solid ${acctColor(a.name)}` : "3px solid transparent" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: acctColor(a.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{initials(a.name)}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.ivory }}>{a.name}</div>
                <div style={{ fontSize: 11, color: a.overdue > 0 ? T.danger : T.ivory3 }}>{a.overdue > 0 ? `${a.overdue} overdue · ` : ""}{a.open} open</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      {/* Account detail */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "24px 28px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff" }}>{initials(selected.name)}</div>
          <div>
            <h2 style={{ fontFamily: "'Sohne','Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 20, color: T.ivory, margin: 0 }}>{selected.name}</h2>
            <div style={{ fontSize: 12, color: T.ivory3, marginTop: 3 }}>{selected.type} · {selected.region}</div>
            {selected.acctNum && <div style={{ fontSize: 12, color: T.sg, marginTop: 3, fontWeight: 600 }}>{selected.acctNum}</div>}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button style={{ display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,border:`1px solid ${T.border2}`,background:"transparent",color:T.ivory2,fontSize:12,cursor:"pointer" }}>
              <Link2 size={12} /> Link emails
            </button>
            <button style={{ display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,border:"none",background:T.sg,color:T.navy,fontSize:12,fontWeight:700,cursor:"pointer" }}>
              <Plus size={12} /> Add task
            </button>
          </div>
        </div>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, padding: "16px 28px" }}>
          {[
            { label:"Open", val:selected.open, color:T.sg },
            { label:"Overdue", val:selected.overdue, color:selected.overdue > 0 ? T.danger : T.ivory3 },
            { label:"Contacts", val:selected.contacts, color:T.info },
            { label:"Meetings", val:0, color:T.ivory3 },
          ].map(s => (
            <div key={s.label} style={{ padding: "14px 16px", borderRadius: 10, background: T.slate, border: `1px solid ${T.border}`, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color, fontFamily: "'Sohne','Plus Jakarta Sans',sans-serif" }}>{s.val}</div>
              <div style={{ fontSize: 11, color: T.ivory3, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, padding: "0 28px", borderBottom: `1px solid ${T.border}`, overflowX: "auto" }}>
          {ACCT_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 14px", border: "none", background: "transparent", color: tab === t ? T.sg : T.ivory3, fontSize: 12.5, fontWeight: tab === t ? 600 : 400, cursor: "pointer", borderBottom: tab === t ? `2px solid ${T.sg}` : "2px solid transparent", whiteSpace: "nowrap" }}>{t}</button>
          ))}
        </div>
        <div style={{ padding: "20px 28px" }}>
          {tab === "Overview" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.ivory3, marginBottom: 10 }}>Open Tasks</div>
                {ALL_TASKS.filter(t => t.account === selected.name).slice(0,4).map(t => (
                  <div key={t.id} style={{ padding: "8px 12px", borderRadius: 8, background: T.slate, border: `1px solid ${T.border}`, marginBottom: 6 }}>
                    <div style={{ fontSize: 12.5, color: T.ivory }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: t.due < new Date().toISOString().slice(0,10) ? T.danger : T.ivory3, marginTop: 3 }}>Due {t.due}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.ivory3, marginBottom: 10 }}>Snapshot</div>
                <div style={{ padding: "14px 16px", borderRadius: 10, background: T.slate, border: `1px solid ${T.border}` }}>
                  {[["Type", selected.type],["Region", selected.region],["Stage","Active"],["As of",new Date().toISOString().slice(0,10)]].map(([k,v])=>(
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12.5 }}>
                      <span style={{ color: T.ivory3 }}>{k}</span>
                      <span style={{ color: T.ivory, fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {tab === "Contacts" && (
            <div>
              {PEOPLE_DATA.filter(p=>p.company===selected.name).length === 0
                ? <div style={{ fontSize: 13, color: T.ivory3 }}>No contacts mapped to this account yet.</div>
                : PEOPLE_DATA.filter(p=>p.company===selected.name).map(p => <PersonRow key={p.name} person={p} />)
              }
            </div>
          )}
          {tab === "Emails" && (
            <div>
              <div style={{ fontSize: 11, color: T.ivory3, marginBottom: 12 }}>Recent email threads mapped to {selected.name}</div>
              {INIT_THREADS.filter(t=>t.accountName===selected.name).map(t=>(
                <div key={t.key} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:9,background:T.slate,border:`1px solid ${T.border}`,marginBottom:6,cursor:"pointer" }}>
                  <div style={{ width:28,height:28,borderRadius:"50%",background:acctColor(t.accountName??t.who),display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff" }}>{initials(t.accountName??t.who)}</div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:13,color:T.ivory,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{t.subject}</div>
                    <div style={{ fontSize:11,color:T.ivory3,marginTop:2 }}>{t.who} · {rel(t.lastAtISO)}</div>
                  </div>
                  {t.unread && <span style={{ width:7,height:7,borderRadius:"50%",background:T.sg }} />}
                  <ExternalLink size={13} color={T.ivory3} />
                </div>
              ))}
              {INIT_THREADS.filter(t=>t.accountName===selected.name).length===0 && <div style={{fontSize:13,color:T.ivory3}}>No mapped emails yet.</div>}
            </div>
          )}
          {tab !== "Overview" && tab !== "Contacts" && tab !== "Emails" && <div style={{ fontSize: 13, color: T.ivory3, padding: "20px 0" }}>No {tab.toLowerCase()} data in this prototype.</div>}
        </div>
      </div>
    </div>
  );
}

// ── CONTACTS (Relationship Health) ────────────────────────────
const PEOPLE_DATA = [
  { name:"Kenny Johnson",   company:"ReCurve Medical", role:"Procurement Director", lastEmail:8,  pendingReply:true,  openTasks:2 },
  { name:"Aman Dhah",       company:"Stryker",         role:"BDM Contact",          lastEmail:12, pendingReply:false, openTasks:0 },
  { name:"Julio Tang Hon",  company:"Intuitive Surgical",role:"Quality Eng.",       lastEmail:4,  pendingReply:true,  openTasks:1 },
  { name:"Hilda Alvarez",   company:"Flex",            role:"Procurement",          lastEmail:1,  pendingReply:false, openTasks:1 },
  { name:"Jimmy Rudig",     company:"Biotronik",       role:"Purchasing",           lastEmail:3,  pendingReply:false, openTasks:0 },
  { name:"Susan Ly",        company:"Balt",            role:"Quality Eng.",         lastEmail:25, pendingReply:false, openTasks:2 },
  { name:"Greg Chin",       company:"Stryker",         role:"RA Team",              lastEmail:2,  pendingReply:false, openTasks:0 },
  { name:"Alex Villarreal", company:"ReCurve Medical", role:"Procurement",          lastEmail:8,  pendingReply:true,  openTasks:1 },
];

function ContactsView() {
  const [q, setQ] = useState("");
  const filtered = PEOPLE_DATA.filter(p =>
    !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.company.toLowerCase().includes(q.toLowerCase())
  );
  const needsAttention = filtered.filter(p => p.pendingReply || p.lastEmail > 14);
  const byCompany = ACCOUNTS_LIST.map(a => ({
    ...a,
    people: PEOPLE_DATA.filter(p => p.company === a.name),
  })).filter(a => a.people.length > 0);

  return (
    <ViewShell title="Contacts" sub="Relationship health across 145 customer contacts · Primary home is inside each Account">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20 }}>
        <div>
          {/* Search */}
          <div style={{ position: "relative", marginBottom: 16 }}>
            <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: T.ivory3 }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search people across all accounts…" style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 9, border: `1px solid ${T.border2}`, background: "rgba(255,255,255,0.04)", color: T.ivory, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>

          {/* Needs attention */}
          {needsAttention.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: T.warn, marginBottom: 8 }}>Needs attention — {needsAttention.length}</div>
              {needsAttention.map(p => (
                <PersonRow key={p.name} person={p} highlight />
              ))}
            </div>
          )}

          {/* By account */}
          {byCompany.map(a => (
            <div key={a.name} style={{ marginBottom: 14, borderRadius: 12, background: T.slate, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: T.slateUp, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: acctColor(a.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff" }}>{initials(a.name)}</div>
                <span style={{ fontSize: 13, fontWeight: 600, color: acctColor(a.name) }}>{a.name}</span>
                <span style={{ fontSize: 11, color: T.ivory3 }}>{a.people.length} contacts</span>
              </div>
              {PEOPLE_DATA.filter(p=>p.company===a.name).map(p => <PersonRow key={p.name} person={p} />)}
            </div>
          ))}
        </div>

        {/* Right: account primary contacts summary */}
        <div>
          <div style={{ padding: "14px 16px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.ivory3, marginBottom: 10 }}>Primary contacts by account</div>
            {ACCOUNTS_LIST.slice(0,6).map(a => {
              const primary = PEOPLE_DATA.find(p => p.company === a.name);
              return (
                <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: `1px solid ${T.border}` }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: acctColor(a.name), flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: T.ivory, fontWeight: 500 }}>{a.name}</div>
                    {primary && <div style={{ fontSize: 11, color: T.ivory3 }}>{primary.name} · {primary.lastEmail}d ago</div>}
                  </div>
                  {primary?.pendingReply && <span style={{ fontSize: 9.5, padding: "1px 5px", borderRadius: 6, background: T.dangerSoft, color: T.danger, fontWeight: 700 }}>reply</span>}
                </div>
              );
            })}
          </div>
          <div style={{ padding: "12px 14px", borderRadius: 12, background: T.ivory4, border: `1px solid ${T.border}`, marginTop: 10 }}>
            <div style={{ fontSize: 12, color: T.ivory3, lineHeight: 1.6 }}>
              <b style={{ color: T.ivory2 }}>Tip:</b> Full contact profiles, email history, and tasks live inside each Account. This view is for relationship health at a glance.
            </div>
          </div>
        </div>
      </div>
    </ViewShell>
  );
}

function PersonRow({ person: p, highlight }: { person: typeof PEOPLE_DATA[0]; highlight?: boolean }) {
  const stale = p.lastEmail > 14;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: highlight ? "none" : `1px solid ${T.border}`, background: highlight ? T.warnSoft+"44" : "transparent", cursor: "pointer" }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: acctColor(p.company), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{initials(p.name)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.ivory }}>{p.name}</div>
        <div style={{ fontSize: 11, color: T.ivory3 }}>{p.role} · {p.company}</div>
      </div>
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        {p.pendingReply && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: T.dangerSoft, color: T.danger, fontWeight: 600 }}>awaiting reply</span>}
        {stale && !p.pendingReply && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: T.warnSoft, color: T.warn, fontWeight: 600 }}>gone quiet</span>}
        <span style={{ fontSize: 11, color: stale ? T.warn : T.ivory3, minWidth: 40, textAlign: "right" }}>{p.lastEmail}d ago</span>
        {p.openTasks > 0 && <span style={{ fontSize: 10, color: T.ivory3 }}>{p.openTasks} tasks</span>}
      </div>
    </div>
  );
}

// ── MEETINGS ─────────────────────────────────────────────────
const MEETINGS_DATA = [
  { id:1, date:"2026-07-01", category:"STRYKER",  title:"Stryker Q3 Pipeline Review",        month:"July 2026" },
  { id:2, date:"2026-07-01", category:"INTERNAL", title:"Mike / Jordan 1:1",                 month:"July 2026" },
  { id:3, date:"2026-06-28", category:"RECURVE",  title:"ReCurve Medical Custom Kit Kickoff", month:"June 2026" },
  { id:4, date:"2026-06-25", category:"INTERNAL", title:"OEM Team Weekly Sync",              month:"June 2026" },
  { id:5, date:"2026-06-22", category:"BALT",     title:"Balt MEX Facility PN Review",       month:"June 2026" },
  { id:6, date:"2026-06-18", category:"STRYKER",  title:"Stryker China RA Update",           month:"June 2026" },
];
function MeetingsView() {
  const [filter, setFilter] = useState("All");
  const FILTERS = ["All","Customers","Series","Month"];
  const byMonth = MEETINGS_DATA.reduce((acc, m) => { (acc[m.month] ??= []).push(m); return acc; }, {} as Record<string,typeof MEETINGS_DATA>);
  return (
    <ViewShell title="All Meetings" sub="155 meetings · 22 customers · 3 rolling series"
      actions={<>
        <div style={{ display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:8,background:T.sgSoft,border:`1px solid ${T.sgBorder}`,fontSize:11.5,color:T.sg,fontWeight:600 }}><Check size={11} /> Synced from vault · just now</div>
        <SgBtn label="Pull from Granola" icon={<RotateCcw size={12} />} outline />
      </>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 20 }}>
        <div>
          <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
            {FILTERS.map(f => <button key={f} onClick={() => setFilter(f)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: filter === f ? T.sg : T.slate, color: filter === f ? T.navy : T.ivory2, fontSize: 12, fontWeight: filter === f ? 700 : 400, cursor: "pointer" }}>{f}</button>)}
          </div>
          <div style={{ padding: "14px 16px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}`, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.ivory3, marginBottom: 10 }}>Jump back in</div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
              {MEETINGS_DATA.slice(0,3).map(m => (
                <div key={m.id} style={{ minWidth: 180, padding: "12px 14px", borderRadius: 10, background: T.slateUp, border: `1px solid ${T.border}`, flexShrink: 0 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", color: acctColor(m.category), textTransform: "uppercase", marginBottom: 4 }}>{m.category}</div>
                  <div style={{ fontSize: 12.5, color: T.ivory, fontWeight: 500, lineHeight: 1.4 }}>{m.title}</div>
                  <div style={{ fontSize: 11, color: T.ivory3, marginTop: 5 }}>{m.date}</div>
                </div>
              ))}
            </div>
          </div>
          {Object.entries(byMonth).map(([month, ms]) => (
            <div key={month} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.ivory3, padding: "6px 0 8px" }}>{month} {ms.length}</div>
              {ms.map((m,i) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderRadius: 8, background: T.slate, border: `1px solid ${T.border}`, marginBottom: 5, cursor: "pointer" }}>
                  <div style={{ minWidth: 52, fontSize: 11, color: T.ivory3, fontVariantNumeric: "tabular-nums" }}>{m.date.slice(5)}</div>
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: acctColor(m.category)+"28", color: acctColor(m.category), fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>{m.category}</span>
                  <span style={{ flex: 1, fontSize: 13, color: T.ivory }}>{m.title}</span>
                  <span style={{ fontSize: 11.5, color: T.sg, fontWeight: 500 }}>Open →</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ padding: "16px 18px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}`, height: "fit-content" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.ivory3, marginBottom: 14 }}>By the numbers</div>
          {[["Meetings","155"],["This month","2"],["Customers","22"],["Series","3"]].map(([k,v])=>(
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 12.5, color: T.ivory2 }}>{k}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: T.sg, fontFamily: "'Sohne','Plus Jakarta Sans',sans-serif" }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 12, color: T.ivory3 }}>Busiest: <b style={{ color: T.ivory2 }}>Stryker (48)</b></div>
          <div style={{ fontSize: 12, color: T.ivory3, marginTop: 4 }}>Top series: <b style={{ color: T.ivory2 }}>Mike / Jordan 1:1 (11)</b></div>
        </div>
      </div>
    </ViewShell>
  );
}

// ── LIBRARY ──────────────────────────────────────────────────
const LIBRARY_DOCS = [
  { id:1, category:"Quote",      name:"Tiger_06.26.26_Cust3ML",   source:"Tiger",        date:"2026-06-30", desc:"Custom 3ml Syringe Kit with NRE" },
  { id:2, category:"ISO",        name:"ISO_13485_Cert_2026",      source:"Compliance",   date:"2026-01-15", desc:"ISO 13485:2016 quality management certificate" },
  { id:3, category:"Drawing",    name:"MSS031_Rev_D_Drawing",     source:"Engineering",  date:"2026-05-10", desc:"Assembly drawing Rev D for part MSS031" },
  { id:4, category:"PCN",        name:"PCN_Balt_K04-01258_MEX",   source:"Quality",      date:"2026-06-20", desc:"Process change notice for MEX facility transfer" },
];
function LibraryView() {
  return (
    <ViewShell title="Library" sub="Reference documents for the Merit OEM team: ISO docs, biocompatibility, drawings, certificates, OEM PCNs, and spec sheets."
      actions={<SgBtn label="Upload" icon={<Plus size={13} />} />}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {LIBRARY_DOCS.map(d => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: T.sgSoft, color: T.sg, fontWeight: 700 }}>{d.category}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.ivory }}>{d.name}</span>
              </div>
              <div style={{ fontSize: 11.5, color: T.ivory3 }}>{d.source} · {d.date} · {d.desc}</div>
            </div>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: T.ivory3, padding: 4 }}><X size={14} /></button>
          </div>
        ))}
      </div>
    </ViewShell>
  );
}

// ── QUOTE ────────────────────────────────────────────────────
function QuoteView() {
  const [customer, setCustomer] = useState("");
  const [contact, setContact]   = useState("");
  const [desc, setDesc]         = useState("");
  const [tag, setTag]           = useState("");
  const today_ = new Date().toISOString().slice(0,10);
  const errors = [
    !customer && "Customer / account name required",
    !contact  && "Contact (Quoted For) required",
    !tag      && "Quote tag required",
    "At least one line item required",
  ].filter(Boolean);
  return (
    <ViewShell title="Quote Builder" sub="1,144 catalog parts loaded"
      actions={<><SgBtn label="New quote" icon={<Plus size={13} />} outline /><SgBtn label="Save quote" /></>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
        <div>
          <div style={{ padding: "18px 20px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}`, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.ivory3, marginBottom: 14 }}>Quote details</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label:"Customer / Account", val:customer, set:setCustomer, placeholder:"Type to search accounts…" },
                { label:"Contact (Quoted For)", val:contact, set:setContact, placeholder:"Contact name…" },
                { label:"Description", val:desc, set:setDesc, placeholder:"Quote description…" },
                { label:"Quote tag", val:tag, set:setTag, placeholder:"e.g. tiger_3ml" },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: T.ivory3, display: "block", marginBottom: 5 }}>{f.label}</label>
                  <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border2}`, background: "rgba(255,255,255,0.04)", color: T.ivory, fontSize: 12.5, outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: T.ivory3, display: "block", marginBottom: 5 }}>Quote date</label>
                <input type="date" defaultValue={today_} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border2}`, background: "rgba(255,255,255,0.04)", color: T.ivory, fontSize: 12.5, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: T.ivory3, display: "block", marginBottom: 5 }}>Header style</label>
                <select style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border2}`, background: T.slate, color: T.ivory2, fontSize: 12.5, outline: "none", boxSizing: "border-box" }}>
                  <option>Graphite</option><option>Navy</option><option>Ivory</option>
                </select>
              </div>
            </div>
          </div>
          {/* Line items */}
          <div style={{ padding: "16px 20px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.ivory3 }}>Add or parse items</div>
              <div style={{ display: "flex", gap: 6 }}>
                <SgBtn label="Add from catalog" small outline />
                <SgBtn label="Paste a quote" small outline />
              </div>
            </div>
            <div style={{ padding: "24px", textAlign: "center", borderRadius: 8, border: `1px dashed ${T.border2}`, color: T.ivory3, fontSize: 13 }}>No line items yet</div>
          </div>
        </div>
        {/* Validation + recent */}
        <div>
          {errors.length > 0 && (
            <div style={{ padding: "14px 16px", borderRadius: 12, background: T.dangerSoft, border: `1px solid ${T.danger}33`, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.danger, marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>Required to generate PDF</div>
              {errors.map(e => <div key={e} style={{ fontSize: 12, color: T.danger, padding: "2px 0" }}>· {e}</div>)}
            </div>
          )}
          <div style={{ padding: "14px 16px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.ivory3, marginBottom: 10 }}>Recent quotes · 1 saved</div>
            <div style={{ padding: "10px 12px", borderRadius: 8, background: T.slateUp, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: T.ivory }}>Tiger_06.26.26_Cust3ML</div>
              <div style={{ fontSize: 11, color: T.ivory3, marginTop: 3 }}>ReCurve Medical · 2026-06-26</div>
            </div>
          </div>
        </div>
      </div>
    </ViewShell>
  );
}

// ── BRANDING ─────────────────────────────────────────────────
function BrandingView() {
  const [primary,   setPrimary]   = useState("#C9242B");
  const [secondary, setSecondary] = useState("#4C4848");
  const [accent,    setAccent]    = useState("#631D20");
  const [paper,     setPaper]     = useState("White");
  const PAPERS = ["White","Cream","Ivory","Sand","Parchment","Slate","Charcoal","Navy"];
  const PAPER_COLORS: Record<string,string> = { White:"#ffffff", Cream:"#fffef0", Ivory:"#FFFFF0", Sand:"#f5f0e8", Parchment:"#f2e8d9", Slate:"#708090", Charcoal:"#36454f", Navy:"#1B2A4A" };
  return (
    <ViewShell title="Branding" sub="Manage kits that style your meeting exports. The app interface keeps its own theme.">
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 280px", gap: 20 }}>
        {/* Kit list */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.ivory3, marginBottom: 8 }}>Kits</div>
          <div style={{ padding: "9px 12px", borderRadius: 8, background: T.sgSoft, border: `1px solid ${T.sgBorder}`, marginBottom: 6, fontSize: 13, fontWeight: 600, color: T.sg }}>Merit Medical OEM</div>
          <button style={{ display: "flex", alignItems: "center", gap: 5, width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px dashed ${T.border2}`, background: "transparent", color: T.ivory3, fontSize: 12, cursor: "pointer" }}><Plus size={11} /> New kit</button>
        </div>
        {/* Editor */}
        <div style={{ padding: "18px 20px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.ivory3, marginBottom: 14 }}>Merit Medical OEM</div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.ivory3, display: "block", marginBottom: 5 }}>Workstream</label>
            <select style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border2}`, background: T.slateUp, color: T.ivory2, fontSize: 12.5, outline: "none" }}>
              <option>Merit (live client)</option>
            </select>
          </div>
          {[
            { label:"Primary", val:primary, set:setPrimary, note:"eyebrow / chips / borders / callout" },
            { label:"Secondary", val:secondary, set:setSecondary, note:"title + section headings" },
            { label:"Accent", val:accent, set:setAccent, note:"stat numbers / section index" },
          ].map(c => (
            <div key={c.label} style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.ivory3, display: "block", marginBottom: 5 }}>{c.label} <span style={{ fontWeight: 400 }}>— {c.note}</span></label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="color" value={c.val} onChange={e => c.set(e.target.value)} style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${T.border2}`, cursor: "pointer", padding: 2, background: "transparent" }} />
                <span style={{ fontSize: 12.5, color: T.ivory2, fontFamily: "monospace" }}>{c.val}</span>
              </div>
            </div>
          ))}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.ivory3, display: "block", marginBottom: 8 }}>Paper background</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PAPERS.map(p => (
                <button key={p} onClick={() => setPaper(p)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${paper === p ? T.sg : T.border2}`, background: paper === p ? T.sgSoft : PAPER_COLORS[p]+"22", color: paper === p ? T.sg : T.ivory2, fontSize: 11.5, cursor: "pointer", fontWeight: paper === p ? 600 : 400 }}>{p}</button>
              ))}
            </div>
          </div>
          <SgBtn label="Save changes" />
        </div>
        {/* Export preview */}
        <div style={{ padding: "16px 18px", borderRadius: 12, background: PAPER_COLORS[paper], border: `1px solid ${T.border2}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: primary, marginBottom: 12 }}>Export Preview</div>
          <div style={{ height: 4, borderRadius: 2, background: primary, marginBottom: 10 }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: secondary, marginBottom: 6, fontFamily: "serif" }}>Meeting Notes</div>
          <div style={{ fontSize: 10, color: primary, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Stryker Q3 Pipeline Review · 2026-07-01</div>
          <div style={{ fontSize: 12, color: secondary, fontWeight: 600, marginBottom: 6 }}>Summary</div>
          <div style={{ fontSize: 11, color:"#555", lineHeight: 1.6 }}>Discussed Q3 pipeline and account priorities. Next steps assigned to Jordan and Stryker procurement team.</div>
          <div style={{ marginTop: 12, fontSize: 18, fontWeight: 800, color: accent, fontFamily: "serif" }}>3</div>
          <div style={{ fontSize: 10, color:"#888" }}>action items</div>
        </div>
      </div>
    </ViewShell>
  );
}

// ── ACTIVITY ─────────────────────────────────────────────────
const ACTIVITY_ITEMS = [
  { id:1, type:"new_email", read:false, subject:"ECN218128 is ready for your action (ROUTE_APPROVAL)", sender:"epicc_no_reply@merit.com", time:"2m ago" },
  { id:2, type:"new_email", read:false, subject:"Stryker PV Quote Request 7/1/26 — flagged by AI", sender:"susette.sit@merit.com", time:"1h ago" },
  { id:3, type:"brief",     read:false, subject:"Morning brief: 5 overdue tasks, 3 threads need reply", sender:"System", time:"8:00 AM" },
  { id:4, type:"new_email", read:true,  subject:"BIOTRONIK PO 2700286 confirmed", sender:"yessennia.perry@merit.com", time:"Yesterday" },
  { id:5, type:"due_today", read:true,  subject:"4 tasks due today — open Today view to review", sender:"System", time:"Yesterday" },
  { id:6, type:"new_email", read:true,  subject:"Tiger 3ml kit — customer approved schedule", sender:"avillarrealberain@rtxpartnersllc.com", time:"2 days ago" },
];
const ACTIVITY_COLORS: Record<string,{ color:string; bg:string }> = {
  new_email: { color:T.sg,   bg:T.sgSoft },
  brief:     { color:T.warn, bg:T.warnSoft },
  due_today: { color:T.danger, bg:T.dangerSoft },
};
function ActivityView() {
  const [items, setItems] = useState(ACTIVITY_ITEMS);
  return (
    <ViewShell title="Activity" sub="Notification log: due-today, new flagged email, briefs. In-app only. Set NOTIFY_WEBHOOK_URL to also push to phone or email.">
      <div style={{ maxWidth: 680 }}>
        {items.map(item => {
          const ac = ACTIVITY_COLORS[item.type];
          return (
            <div key={item.id} onClick={() => setItems(is => is.map(i => i.id === item.id ? {...i, read:true} : i))}
              style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", borderRadius: 10, background: T.slate, border: `1px solid ${item.read ? T.border : ac.color+"44"}`, marginBottom: 8, cursor: "pointer", opacity: item.read ? 0.65 : 1, transition: "opacity 0.15s" }}>
              {!item.read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.info, flexShrink: 0, marginTop: 4 }} />}
              {item.read && <span style={{ width: 7, height: 7, flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: T.ivory, fontWeight: item.read ? 400 : 600 }}>{item.sender}</div>
                <div style={{ fontSize: 12.5, color: T.ivory2, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.subject}</div>
                <div style={{ fontSize: 11, color: T.ivory3, marginTop: 4 }}>{item.time} · in-app</div>
              </div>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: ac.bg, color: ac.color, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{item.type.replace("_"," ")}</span>
            </div>
          );
        })}
      </div>
    </ViewShell>
  );
}

// ── SETTINGS ─────────────────────────────────────────────────
function SettingsView() {
  const [greeting, setGreeting] = useState("Hi {first},");
  const [closing,  setClosing]  = useState("Thanks, Jordan");
  const [formal,   setFormal]   = useState("Balanced");
  const [length,   setLength]   = useState("Balanced");
  const [tone,     setTone]     = useState("warm, direct, professional but approachable");
  return (
    <ViewShell title="Your Email Voice" sub="Teach the app how you sound. Every AI draft, reply, compose, and forward uses this."
      actions={<SgBtn label="Save voice" />}>
      <div style={{ maxWidth: 600, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ padding: "14px 18px", borderRadius: 12, background: T.slate, border: `1px solid ${T.sgBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={13} color={T.sg} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ivory }}>Let Claude propose your voice</span>
            </div>
            <SgBtn label="Suggest my voice" small />
          </div>
          <div style={{ fontSize: 12, color: T.ivory3 }}>Reads your recent sent mail and drafts a starting profile.</div>
        </div>
        {[
          { q:"How do you open an email?", val:greeting, set:setGreeting },
          { q:"How do you sign off?",      val:closing,  set:setClosing },
        ].map(f => (
          <div key={f.q} style={{ padding: "16px 18px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}` }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: T.ivory, display: "block", marginBottom: 10 }}>{f.q}</label>
            <input value={f.val} onChange={e => f.set(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border2}`, background: "rgba(255,255,255,0.04)", color: T.ivory, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
        ))}
        {[
          { q:"How formal are you?", opts:["Casual","Balanced","Formal"], val:formal, set:setFormal },
          { q:"How long are your replies?", opts:["Brief","Balanced","Thorough"], val:length, set:setLength },
        ].map(f => (
          <div key={f.q} style={{ padding: "16px 18px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}` }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: T.ivory, display: "block", marginBottom: 10 }}>{f.q}</label>
            <div style={{ display: "flex", gap: 6 }}>
              {f.opts.map(o => (
                <button key={o} onClick={() => f.set(o)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${f.val === o ? T.sg : T.border2}`, background: f.val === o ? T.sgSoft : "transparent", color: f.val === o ? T.sg : T.ivory2, fontSize: 12.5, fontWeight: f.val === o ? 700 : 400, cursor: "pointer" }}>{o}</button>
              ))}
            </div>
          </div>
        ))}
        <div style={{ padding: "16px 18px", borderRadius: 12, background: T.slate, border: `1px solid ${T.border}` }}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: T.ivory, display: "block", marginBottom: 10 }}>Describe your tone in a few words</label>
          <textarea value={tone} onChange={e => setTone(e.target.value)} rows={3} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border2}`, background: "rgba(255,255,255,0.04)", color: T.ivory, fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <SgBtn label="Save voice" />
        </div>
      </div>
    </ViewShell>
  );
}
