import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/lib/store";
import { PAYMENT_SOURCE_KINDS } from "@/lib/seed";
import { MASTER_LABELS, MASTER_SLUGS, type MasterItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/masters/$type")({
  head: () => ({
    meta: [
      { title: "Masters — SpendWise" },
      {
        name: "description",
        content:
          "Manage expense groups, sub groups, income groups and payment sources for your family.",
      },
      { property: "og:title", content: "Masters — SpendWise" },
      { property: "og:description", content: "Category and payment source master data." },
    ],
  }),
  component: MastersPage,
});

const TABS = Object.entries(MASTER_SLUGS) as [string, keyof typeof MASTER_LABELS][];
const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function MastersPage() {
  const { type } = useParams({ from: "/masters/$type" });
  const collection = MASTER_SLUGS[type] ?? "expenseGroups";
  const { masters, saveMaster, deleteMaster, user } = useApp();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MasterItem | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [kind, setKind] = useState<string>(PAYMENT_SOURCE_KINDS[0]);
  const [search, setSearch] = useState("");

  const isSub =
    collection === "expenseSubGroups" ||
    collection === "incomeSubGroups" ||
    collection === "investmentSubGroups" ||
    collection === "expenseIncludes";
  const isSource = collection === "paymentSources";
  const parents =
    collection === "expenseSubGroups"
      ? masters.expenseGroups
      : collection === "incomeSubGroups"
        ? masters.incomeGroups
        : collection === "investmentSubGroups"
          ? masters.investmentGroups
          : collection === "expenseIncludes"
            ? masters.expenseSubGroups
            : masters.incomeGroups;
  const parentLabel = collection === "expenseIncludes" ? "Sub group" : "Parent group";

  const parentName = useMemo(() => {
    const map = new Map(parents.map((p) => [p.id, p.name]));
    return (id?: string | null) => (id ? (map.get(id) ?? "—") : "—");
  }, [parents]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return masters[collection].filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [masters, collection, search]);

  const isAdmin = user?.role === "admin";

  const openNew = () => {
    setEditing(null);
    setName("");
    setParentId(parents[0]?.id ?? "");
    setKind(PAYMENT_SOURCE_KINDS[0]);
    setOpen(true);
  };

  const openEdit = (item: MasterItem) => {
    setEditing(item);
    setName(item.name);
    setParentId(item.parentId ?? "");
    setKind(item.kind ?? PAYMENT_SOURCE_KINDS[0]);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Name is required");
    if (isSub && !parentId) return toast.error("Parent group is required");
    try {
      await saveMaster(
        collection,
        {
          name: trimmed.slice(0, 60),
          parentId: isSub ? parentId : null,
          kind: isSource ? kind : null,
        },
        editing?.id,
      );
      toast.success(editing ? "Updated" : "Added");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    }
  };

  return (
    <AppShell
      title="Master Data"
      actions={
        isAdmin ? (
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> New
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap gap-2">
        {TABS.map(([slug, key]) => (
          <Link
            key={slug}
            to="/masters/$type"
            params={{ type: slug }}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              MASTER_SLUGS[slug] === collection
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {MASTER_LABELS[key].title}
          </Link>
        ))}
      </div>

      <div className="mt-5 max-w-sm">
        <Input
          placeholder={`Search ${MASTER_LABELS[collection].title.toLowerCase()}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <section className="card-surface mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              {isSub && <th className="px-4 py-2.5 font-medium">Parent group</th>}
              {isSource && <th className="px-4 py-2.5 font-medium">Type</th>}
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{item.name}</td>
                {isSub && <td className="px-4 py-3 text-muted-foreground">{parentName(item.parentId)}</td>}
                {isSource && <td className="px-4 py-3 text-muted-foreground">{item.kind ?? "—"}</td>}
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {isAdmin && (
                      <>
                        <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => openEdit(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete"
                          onClick={async () => {
                            await deleteMaster(collection, item.id);
                            toast.success("Deleted");
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-12 text-center text-muted-foreground">
                  Nothing here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit" : "New"} {MASTER_LABELS[collection].singular}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="master-name">Name</Label>
              <Input
                id="master-name"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Groceries"
              />
            </div>
            {isSub && (
              <div className="space-y-1.5">
                <Label htmlFor="master-parent">Parent group</Label>
                <select
                  id="master-parent"
                  className={selectClass}
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {isSource && (
              <div className="space-y-1.5">
                <Label htmlFor="master-kind">Type</Label>
                <select
                  id="master-kind"
                  className={selectClass}
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  {PAYMENT_SOURCE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}