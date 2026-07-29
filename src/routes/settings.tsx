import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useApp } from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SpendWise" },
      { name: "description", content: "Manage your SpendWise profile, theme and backend status." },
      { property: "og:title", content: "Settings — SpendWise" },
      { property: "og:description", content: "Profile, appearance and backend configuration." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useApp();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("spendwise:theme") === "dark";
    setDark(stored);
    document.documentElement.classList.toggle("dark", stored);
  }, []);

  const toggle = (value: boolean) => {
    setDark(value);
    window.localStorage.setItem("spendwise:theme", value ? "dark" : "light");
    document.documentElement.classList.toggle("dark", value);
  };

  return (
    <AppShell title="Settings">
      <div className="grid max-w-3xl gap-4">
        <section className="card-surface p-5">
          <h2 className="text-sm font-semibold">Profile</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Row label="Name" value={user?.displayName ?? "—"} />
            <Row label="Email" value={user?.email ?? "—"} />
            <Row label="Role" value={user?.role ?? "—"} />
            <Row label="Family ID" value={user?.familyId ?? "—"} />
          </dl>
        </section>

        <section className="card-surface flex items-center justify-between p-5">
          <div>
            <h2 className="text-sm font-semibold">Dark mode</h2>
            <p className="text-sm text-muted-foreground">Switch between light and dark themes.</p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="dark-mode" className="sr-only">
              Dark mode
            </Label>
            <Switch id="dark-mode" checked={dark} onCheckedChange={toggle} />
          </div>
        </section>

        <section className="card-surface p-5">
          <h2 className="text-sm font-semibold">Backend</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isFirebaseConfigured
              ? "Connected to Firebase Authentication and Firestore."
              : "Running in local demo mode. Add your Firebase keys to .env (see .env.example) and reload to switch to Firestore — no code changes needed."}
          </p>
        </section>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium capitalize">{value}</dd>
    </div>
  );
}