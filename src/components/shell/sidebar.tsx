"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Receipt,
  Settings,
  ShoppingCart,
  UserPlus,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useSession, type OrgSettings } from "@/lib/client/session";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  perm?: string | string[];
  exact?: boolean;
  /** active when the path contains this (e.g. any party's ledger) */
  match?: string;
  /** shown only when the business has this feature switched on */
  feature?: (s: OrgSettings) => boolean;
};
type NavGroup = { id: string; label: string; icon: LucideIcon; items: NavItem[] };
type Entry = NavItem | NavGroup;
const isGroup = (e: Entry): e is NavGroup => "items" in e;

// Same menu as the pharmacy IMS: Operations, Parties, Finance, Settings.
function entries(): Entry[] {
  return [
    { href: "", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view", exact: true },
    {
      id: "operations",
      label: "Operations",
      icon: Boxes,
      items: [
        { href: "/inventory", label: "Inventory", icon: Boxes, perm: "products.view" },
        { href: "/batches", label: "Batches", icon: Layers, perm: "inventory.view" },
        { href: "/purchase", label: "Purchase", icon: Receipt, perm: "purchases.view" },
        { href: "/sales", label: "Sales", icon: ShoppingCart, perm: "sales.view" },
      ],
    },
    { href: "/parties", label: "Parties", icon: Users, perm: "parties.view", exact: true },
    {
      id: "finance",
      label: "Finance",
      icon: Wallet,
      items: [
        { href: "/parties/ledger", label: "Party Ledger", icon: FileText, perm: "parties.view", match: "/ledger" },
        { href: "/expense", label: "Expense", icon: Wallet, perm: "finance.view" },
        { href: "/analytics", label: "Analytics", icon: BarChart3, perm: "reports.view" },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      icon: Settings,
      items: [
        { href: "/settings", label: "General", icon: Settings, perm: "settings.view", exact: true },
        { href: "/settings/add-account", label: "Add Account", icon: UserPlus, perm: "users.view" },
      ],
    },
  ];
}

function useNav() {
  const { base, can, settings } = useSession();
  const pathname = usePathname();
  const visible = (i: NavItem) => (!i.perm || can(i.perm)) && (!i.feature || i.feature(settings));
  const list = entries()
    .map((e) => (isGroup(e) ? { ...e, items: e.items.filter(visible) } : e))
    .filter((e) => (isGroup(e) ? e.items.length > 0 : visible(e)));
  const isActive = (i: NavItem) => {
    const href = base + i.href;
    if (i.match) return pathname.startsWith(base + "/parties/") && pathname.endsWith(i.match);
    if (i.href === "/parties") return pathname === href || (pathname.startsWith(href + "/") && !pathname.endsWith("/ledger"));
    return i.exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  };
  return { list, isActive, base };
}

function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const { org } = useSession();
  const s = size === "sm" ? "h-8 w-8 text-xs" : "h-11 w-11 text-lg";
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm ${s}`}>
      {org.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={org.logoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="font-bold text-[#044d73]">{org.name.trim().charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

function LocationSwitcher({ collapsed }: { collapsed: boolean }) {
  const { session, switchLocation } = useSession();
  const [busy, setBusy] = useState(false);
  if (session.locations.length < 2 || collapsed) return null;
  return (
    <div className="px-4 pb-3">
      <label className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-white">
        <MapPin className="h-4 w-4 shrink-0 text-white/70" />
        <select
          aria-label="Active location"
          disabled={busy}
          value={session.activeLocationId}
          onChange={async (e) => {
            setBusy(true);
            await switchLocation(e.target.value).catch(() => setBusy(false));
          }}
          className="min-w-0 flex-1 cursor-pointer bg-transparent text-xs font-semibold text-white focus:outline-none [&>option]:text-slate-900"
        >
          {session.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function NavLink({ item, collapsed, indent, onNavigate }: { item: NavItem; collapsed: boolean; indent?: boolean; onNavigate?: () => void }) {
  const { isActive, base } = useNav();
  const active = isActive(item);
  const Icon = item.icon;
  return (
    <Link
      href={base + item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-full py-3 text-sm font-semibold transition-all ${
        collapsed ? "justify-center px-0" : indent ? "pl-10 pr-4" : "px-4"
      } ${active ? "bg-white text-[#044d73] shadow-md" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
    >
      <Icon size={19} className="shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { list, isActive } = useNav();
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(list.filter(isGroup).map((g) => [g.id, g.items.some(isActive)])),
  );
  const cls = "flex-1 space-y-1 overflow-y-auto px-3 py-2 no-scrollbar";
  if (collapsed) {
    return (
      <nav aria-label="Main" className={cls}>
        {list.flatMap((e) => (isGroup(e) ? e.items : [e])).map((i) => (
          <NavLink key={i.href} item={i} collapsed onNavigate={onNavigate} />
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="Main" className={cls}>
      {list.map((e) => {
        if (!isGroup(e)) return <NavLink key={e.href} item={e} collapsed={false} onNavigate={onNavigate} />;
        const isOpen = !!open[e.id];
        const Icon = e.icon;
        const hasActive = e.items.some(isActive);
        return (
          <div key={e.id}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen((o) => ({ ...o, [e.id]: !o[e.id] }))}
              className={`flex w-full items-center gap-3 rounded-full px-4 py-3 text-sm font-semibold transition-all hover:bg-white/10 hover:text-white ${
                hasActive && !isOpen ? "text-white" : "text-white/70"
              }`}
            >
              <Icon size={19} className="shrink-0" />
              <span className="flex-1 truncate text-left">{e.label}</span>
              <ChevronDown size={15} className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="mt-1 space-y-1">
                {e.items.map((i) => (
                  <NavLink key={i.href} item={i} collapsed={false} indent onNavigate={onNavigate} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function UserFooter({ collapsed }: { collapsed: boolean }) {
  const { session, logout } = useSession();
  const initials = session.user.name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="space-y-2 border-t border-white/10 px-3 py-4">
      <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : "px-3"}`} title={collapsed ? session.user.name : undefined}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">{initials}</div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{session.user.name}</p>
            <p className="truncate text-[11px] font-medium text-white/60">{session.user.email}</p>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={logout}
        title={collapsed ? "Log out" : undefined}
        className={`flex w-full items-center gap-3.5 rounded-full py-3.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-red-300 ${
          collapsed ? "justify-center" : "px-4"
        }`}
      >
        <LogOut size={20} className="shrink-0" />
        {!collapsed && <span>Log out</span>}
      </button>
    </div>
  );
}

function BrandName() {
  const { org } = useSession();
  const [first, ...rest] = org.name.trim().split(/\s+/);
  return (
    <div className="w-full text-center leading-tight">
      <p className="truncate text-base font-bold text-white">{first}</p>
      {rest.length > 0 && <p className="truncate text-base font-bold text-white">{rest.join(" ")}</p>}
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { org } = useSession();
  return (
    <>
      <aside
        className={`sticky top-3 m-3 hidden h-[calc(100dvh-1.5rem)] shrink-0 self-start flex-col rounded-3xl bg-[#044d73] shadow-sm transition-[width] duration-300 md:flex print:hidden ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        <div className={`relative flex flex-col items-center gap-2 pb-4 pt-6 ${collapsed ? "px-3" : "px-4"}`}>
          <Logo />
          {!collapsed && <BrandName />}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white ${collapsed ? "" : "absolute right-3 top-3"}`}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>
        <LocationSwitcher collapsed={collapsed} />
        <NavList collapsed={collapsed} />
        <UserFooter collapsed={collapsed} />
      </aside>

      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 bg-[#044d73] px-4 md:hidden print:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/10"
        >
          <Menu size={20} />
        </button>
        <Logo size="sm" />
        <span className="truncate text-sm font-bold text-white">{org.name}</span>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden print:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-zinc-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col rounded-r-3xl bg-[#044d73] shadow-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/10"
            >
              <X size={18} />
            </button>
            <div className="flex flex-col items-center gap-2 px-4 pb-4 pt-6">
              <Logo />
              <BrandName />
            </div>
            <LocationSwitcher collapsed={false} />
            <NavList collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <UserFooter collapsed={false} />
          </aside>
        </div>
      )}
    </>
  );
}
