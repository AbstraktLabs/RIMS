"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { get, post, refreshSession, setAccessToken, setSignedOutHandler, type SessionPayload } from "./api";
import {
  DEFAULT_FORMAT,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyShort,
  formatNumber,
  formatQty,
  type FormatSettings,
} from "./format";

export type OrgSettings = FormatSettings & {
  taxLabel: string;
  taxIdLabel: string;
  taxRegistered: boolean;
  pricesIncludeTax: boolean;
  enableVariants: boolean;
  enableBatchTracking: boolean;
  enableExpiryTracking: boolean;
  enableSerialTracking: boolean;
  enableMultiLocation: boolean;
  enableWholesalePricing: boolean;
  expiryAlertDays: number;
  allowNegativeStock?: boolean;
  invoiceFooter?: string | null;
  receiptFooter?: string | null;
  [k: string]: unknown;
};

export interface OrgProfile {
  id: string;
  name: string;
  slug: string;
  businessType: string;
  status: string;
  plan: string;
  trialEndsAt: string | null;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
}

type Session = Omit<SessionPayload, "accessToken" | "expiresIn">;

interface SessionCtx {
  session: Session;
  settings: OrgSettings;
  org: OrgProfile;
  readOnly: boolean;
  can: (perm: string | string[]) => boolean;
  switchLocation: (id: string) => Promise<void>;
  logout: () => Promise<void>;
  reloadSettings: () => Promise<void>;
  base: string; // /t/<slug>
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [business, setBusiness] = useState<{ organization: OrgProfile; settings: OrgSettings } | null>(null);

  const toLogin = useCallback(() => {
    const next = window.location.pathname + window.location.search;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [router]);

  const loadSettings = useCallback(async () => {
    const b = await get<{ organization: OrgProfile; settings: OrgSettings }>("/api/settings");
    setBusiness(b);
  }, []);

  useEffect(() => {
    setSignedOutHandler(toLogin);
    let alive = true;
    refreshSession()
      .then(async (s) => {
        if (!alive) return;
        const { accessToken: _t, expiresIn: _e, ...rest } = s;
        setSession(rest);
        await loadSettings();
      })
      .catch(() => alive && toLogin());
    // keep the access token fresh while the tab is open
    const timer = setInterval(() => {
      refreshSession()
        .then(({ accessToken: _t, expiresIn: _e, ...rest }) => setSession(rest))
        .catch(() => undefined);
    }, 12 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(timer);
      setSignedOutHandler(null);
    };
  }, [toLogin, loadSettings]);

  const value = useMemo<SessionCtx | null>(() => {
    if (!session || !business) return null;
    const status = business.organization.status;
    const trialOver =
      status === "TRIAL" && business.organization.trialEndsAt && new Date(business.organization.trialEndsAt) < new Date();
    return {
      session,
      settings: { ...DEFAULT_FORMAT, ...business.settings },
      org: business.organization,
      readOnly: status === "SUSPENDED" || !!trialOver,
      base: `/t/${session.organization.slug}`,
      can: (perm) => {
        if (session.user.isOwner) return true;
        const list = Array.isArray(perm) ? perm : [perm];
        return list.some((p) => session.permissions.includes(p));
      },
      switchLocation: async (id) => {
        const s = await refreshSession(id);
        const { accessToken: _t, expiresIn: _e, ...rest } = s;
        setSession(rest);
        window.location.reload();
      },
      logout: async () => {
        try {
          await post("/api/auth/logout");
        } finally {
          setAccessToken(null);
          window.location.assign(new URL("/login", window.location.origin).href);
        }
      },
      reloadSettings: loadSettings,
    };
  }, [session, business, loadSettings]);

  if (!value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}

/** Formatters bound to the tenant's currency, locale and calendar. */
export function useFmt() {
  const { settings } = useSession();
  return useMemo(
    () => ({
      f: settings,
      money: (v: unknown) => formatMoney(v, settings),
      moneyShort: (v: unknown) => formatMoneyShort(v, settings),
      num: (v: unknown, d?: number) => formatNumber(v, settings, d),
      qty: formatQty,
      date: (v: string | null | undefined) => formatDate(v, settings),
      dateTime: (v: string | null | undefined) => formatDateTime(v, settings),
    }),
    [settings],
  );
}
