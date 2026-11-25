import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useApp } from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { downloadBlob } from "@/lib/excel";
import { can, isRole, ROLE_LABELS } from "@/lib/permissions";
import {
  backupCounts,
  backupFilename,
  createBackup,
  parseBackup,
  restoreBackup,
  type Backup,
} from "@/lib/backup";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SpendWise" },
      { name: "description", content: "Manage your SpendWise profile, theme and backend status." },
      { property: "og:title", content: "Settings — SpendWise" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
            <Row label="Role" value={user?.role ?? "—"} capitalize />
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

        <MembersSection />

        <BackupSection />

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

function MembersSection() {
  const user = useApp((s) => s.user);
  const members = useApp((s) => s.members);
  const setMemberRole = useApp((s) => s.setMemberRole);
  const [busy, setBusy] = useState<string | null>(null);
  const canManage = can(user?.role, "manageMembers");

  if (members.length === 0) return null;

  const change = async (uid: string, value: string) => {
    if (!isRole(value)) return;
    setBusy(uid);
    try {
      await setMemberRole(uid, value);
      toast.success(`Role changed to ${ROLE_LABELS[value].label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change role");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card-surface p-5">
      <h2 className="text-sm font-semibold">Members</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {canManage
          ? "Choose what each person can do. You cannot change your own role."
          : "Only an admin can change roles."}
      </p>
      <ul className="mt-4 divide-y divide-border">
        {members.map((m) => {
          const role = isRole(m.role) ? m.role : "admin";
          const self = m.id === user?.uid;
          return (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {m.displayName || m.email || "Unknown"}
                  {self && <span className="text-muted-foreground"> (you)</span>}
                </div>
                {m.email && (
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                )}
              </div>
              {canManage && !self ? (
                <select
                  aria-label={`Role for ${m.displayName || m.email || "member"}`}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={role}
                  disabled={busy === m.id}
                  onChange={(e) => change(m.id, e.target.value)}
                >
                  {(["admin", "member", "viewer"] as const).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r].label} — {ROLE_LABELS[r].description}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-muted-foreground">{ROLE_LABELS[role].label}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BackupSection() {
  const user = useApp((s) => s.user);
  const canRestore = can(user?.role, "delete");
  const refresh = useApp((s) => s.refresh);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);

  const download = async () => {
    if (!user) return;
    setBusy("Preparing backup…");
    try {
      const backup = await createBackup(user.familyId);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      downloadBlob(blob, backupFilename());
      const c = backupCounts(backup);
      toast.success(
        `Backup saved: ${c.transactions} entries, ${c.budgets} budgets, ${c.masters} masters.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the backup.");
    } finally {
      setBusy(null);
    }
  };

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setPending(parseBackup(await file.text()));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read the backup file.");
    }
  };

  const restore = async () => {
    if (!user || !pending) return;
    const backup = pending;
    setPending(null);
    setBusy("Restoring…");
    try {
      const written = await restoreBackup(user.familyId, backup, (done, total) =>
        setBusy(`Restoring… ${done}/${total}`),
      );
      await refresh();
      toast.success(`Restored ${written} records.`);
    } catch (error) {
      await refresh().catch(() => {});
      toast.error(
        `Restore stopped: ${error instanceof Error ? error.message : "write failed"}. Records written so far are kept; restoring the same file again is safe.`,
      );
    } finally {
      setBusy(null);
    }
  };

  const counts = pending ? backupCounts(pending) : null;

  return (
    <section className="card-surface p-5">
      <h2 className="text-sm font-semibold">Backup &amp; restore</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Download every entry, budget and master as one JSON file. Restoring puts those records back
        under their original IDs. It never deletes anything and never creates duplicates.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={download} disabled={!!busy}>
          <Download className="h-4 w-4" /> Download backup
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={!!busy || !canRestore}
          title={canRestore ? undefined : "Only an admin can restore a backup"}
        >
          <Upload className="h-4 w-4" /> Restore from file
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={pick}
        />
        {busy && <span className="text-sm text-muted-foreground">{busy}</span>}
      </div>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.exportedAt
                ? `Backup taken ${new Date(pending.exportedAt).toLocaleString()}. `
                : ""}
              It contains {counts?.transactions} entries, {counts?.budgets} budgets and{" "}
              {counts?.masters} masters. Records with the same ID will be overwritten with the
              backed-up version. Anything added since the backup stays as it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={restore}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Row({
  label,
  value,
  capitalize = false,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 break-all font-medium ${capitalize ? "capitalize" : ""}`}>{value}</dd>
    </div>
  );
}
