import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ListPlus,
  Layers,
  BarChart3,
  Target,
  Settings,
  LogOut,
  Menu,
  Wallet,
  Scale,
  Repeat,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { useApp } from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ListPlus },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/budget", label: "Budget", icon: Target },
  { to: "/recurring", label: "Recurring", icon: Repeat },
  { to: "/networth", label: "Net Worth", icon: Scale },
  { to: "/masters/expense-groups", label: "Masters", icon: Layers, match: "/masters" },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

type SlotKey = "title" | "actions";
type HeaderSlots = Record<SlotKey, HTMLElement | null>;

const HeaderSlotsContext = createContext<{
  slots: HeaderSlots;
  setSlot: (key: SlotKey, el: HTMLElement | null) => void;
}>({
  slots: { title: null, actions: null },
  setSlot: () => {},
});

/**
 * Puts a page's title and header buttons into the persistent header.
 *
 * The frame itself never unmounts on navigation, so the sidebar and header
 * stay painted while only the page content below them is swapped.
 */
export function PageHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  const { slots } = useContext(HeaderSlotsContext);
  return (
    <>
      {slots.title ? createPortal(<>{title}</>, slots.title) : null}
      {slots.actions && actions ? createPortal(<>{actions}</>, slots.actions) : null}
    </>
  );
}

/**
 * The app frame: sidebar, header and page body. Mounted once at the root so
 * switching tabs does not tear down and rebuild the whole screen.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { ready, user, init, signOut, dataError } = useApp(
    useShallow((state) => ({
      ready: state.ready,
      user: state.user,
      init: state.init,
      signOut: state.signOut,
      dataError: state.dataError,
    })),
  );
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<HeaderSlots>({ title: null, actions: null });

  const setSlot = useCallback((key: SlotKey, el: HTMLElement | null) => {
    setSlots((current) => (current[key] === el ? current : { ...current, [key]: el }));
  }, []);
  const titleRef = useCallback((el: HTMLElement | null) => setSlot("title", el), [setSlot]);
  const actionsRef = useCallback((el: HTMLElement | null) => setSlot("actions", el), [setSlot]);
  const slotValue = useMemo(() => ({ slots, setSlot }), [slots, setSlot]);

  useEffect(() => init(), [init]);
  useEffect(() => {
    if (ready && !user) navigate({ to: "/auth", replace: true });
  }, [ready, user, navigate]);
  useEffect(() => setOpen(false), [pathname]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 py-6">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
          <Wallet className="h-5 w-5" />
        </span>
        <span className="text-lg font-bold tracking-tight">SpendWise</span>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ to, label, icon: Icon, ...rest }) => {
          const match = "match" in rest ? (rest.match as string) : to;
          const active = match === "/" ? pathname === "/" : pathname.startsWith(match);
          return (
            <Link
              key={label}
              to={to as string}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <div className="mb-3 truncate text-xs text-sidebar-foreground/70">
          {user.displayName ?? user.email} · {user.role}
        </div>
        <button
          onClick={async () => {
            await signOut();
            navigate({ to: "/auth", replace: true });
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <HeaderSlotsContext.Provider value={slotValue}>
      <div className="min-h-screen bg-background">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-64">
              <button
                onClick={() => setOpen(false)}
                className="absolute right-3 top-6 text-sidebar-foreground/70"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
              {sidebar}
            </aside>
          </div>
        )}

        <div className="lg:pl-64">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3.5 backdrop-blur md:px-8">
            <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <h1
              ref={titleRef}
              className="flex-1 text-lg font-semibold tracking-tight empty:hidden"
            />
            <div ref={actionsRef} className="flex items-center gap-2 empty:hidden" />
          </header>
          {!isFirebaseConfigured && (
            <div className="border-b border-border bg-accent px-4 py-2 text-xs text-accent-foreground md:px-8">
              Demo mode — Firebase env vars are not set, data is stored in this browser. Add your
              Firebase config in <code>.env</code> to switch to Firestore.
            </div>
          )}
          {dataError && (
            <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive md:px-8">
              {dataError}
            </div>
          )}
          <main className="px-4 py-6 md:px-8">{children}</main>
        </div>
      </div>
    </HeaderSlotsContext.Provider>
  );
}
