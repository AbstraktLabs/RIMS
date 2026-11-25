"use client";

import { useState } from "react";
import { FolderTree, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, PageHeader, Tabs } from "@/components/ui/primitives";
import { DataTable } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { del, patch, post } from "@/lib/client/api";
import { useAction, useApi } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  children?: Category[];
}
interface Brand {
  id: string;
  name: string;
  isActive: boolean;
  productCount: number;
}

export default function CategoriesPage() {
  const [tab, setTab] = useState<"categories" | "brands">("categories");
  return (
    <div>
      <PageHeader title="Categories & brands" subtitle="Group your products to find and report on them" />
      <div className="mb-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: "categories", label: "Categories" }, { value: "brands", label: "Brands" }]} />
      </div>
      {tab === "categories" ? <CategoriesTab /> : <BrandsTab />}
    </div>
  );
}

function flatten(tree: Category[], depth = 0): (Category & { depth: number })[] {
  return tree.flatMap((c) => [{ ...c, depth }, ...flatten(c.children ?? [], depth + 1)]);
}

function CategoriesTab() {
  const { can, readOnly } = useSession();
  const editable = can("products.manage") && !readOnly;
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ items: Category[]; tree: Category[] }>("/api/categories", { includeInactive: true });
  const rows = data ? flatten(data.tree) : undefined;
  const [edit, setEdit] = useState<{ row: Category | null } | null>(null);
  const [f, setF] = useState({ name: "", parentId: "", description: "", isActive: true });
  const save = useAction();
  const [deleting, setDeleting] = useState<Category | null>(null);
  const remove = useAction();

  const open = (row: Category | null) => {
    save.setError(null);
    setF({ name: row?.name ?? "", parentId: row?.parentId ?? "", description: row?.description ?? "", isActive: row?.isActive ?? true });
    setEdit({ row });
  };

  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5">
        <CardHeader title="Categories" subtitle="Nest up to a few levels, e.g. Clothing → Men → Shirts" icon={FolderTree} actions={editable && <Button size="sm" icon={Plus} onClick={() => open(null)}>Add category</Button>} />
      </div>
      <DataTable
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={FolderTree} title="No categories yet" description="Create categories like Groceries, Clothing or Phones." />}
        columns={[
          {
            key: "n",
            header: "Name",
            cell: (r) => (
              <span className="flex items-center gap-2 font-semibold text-slate-800" style={{ paddingLeft: r.depth * 20 }}>
                {r.depth > 0 && <span className="text-slate-300">└</span>}
                {r.name}
                {!r.isActive && <Badge tone="red">Inactive</Badge>}
              </span>
            ),
          },
          { key: "d", header: "Description", cell: (r) => <span className="text-slate-500">{r.description ?? "—"}</span>, hideBelow: "md" },
          { key: "p", header: "Products", cell: (r) => r.productCount, align: "right" },
          {
            key: "a",
            header: "",
            align: "right",
            cell: (r) =>
              editable && (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => open(r)}>Edit</Button>
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label="Delete" onClick={() => { remove.setError(null); setDeleting(r); }} />
                </div>
              ),
          },
        ]}
      />
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.row ? "Edit category" : "Add category"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              loading={save.busy}
              disabled={!f.name.trim()}
              onClick={() =>
                save.run(async () => {
                  const body = { name: f.name, parentId: f.parentId || null, description: f.description || null };
                  if (edit?.row) await patch(`/api/categories/${edit.row.id}`, { ...body, isActive: f.isActive });
                  else await post("/api/categories", body);
                  setEdit(null);
                  reload();
                  toast("Category saved");
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {save.error && <Alert>{save.error}</Alert>}
          <Field label="Name" required>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Parent category">
            <Select value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}>
              <option value="">— None (top level) —</option>
              {(rows ?? [])
                .filter((c) => c.id !== edit?.row?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {"  ".repeat(c.depth)}
                    {c.depth ? "└ " : ""}
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Description">
            <Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          {edit?.row && <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Active" />}
        </div>
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        message="Categories with products or sub-categories are deactivated instead."
        confirmLabel="Delete"
        danger
        busy={remove.busy}
        error={remove.error}
        onConfirm={() =>
          remove.run(async () => {
            await del(`/api/categories/${deleting!.id}`);
            setDeleting(null);
            reload();
          })
        }
      />
    </Card>
  );
}

function BrandsTab() {
  const { can, readOnly } = useSession();
  const editable = can("products.manage") && !readOnly;
  const { data, error, loading, reload } = useApi<{ items: Brand[] }>("/api/brands", { includeInactive: true });
  const [edit, setEdit] = useState<{ row: Brand | null } | null>(null);
  const [f, setF] = useState({ name: "", isActive: true });
  const save = useAction();
  const [deleting, setDeleting] = useState<Brand | null>(null);
  const remove = useAction();
  const open = (row: Brand | null) => {
    save.setError(null);
    setF({ name: row?.name ?? "", isActive: row?.isActive ?? true });
    setEdit({ row });
  };
  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5">
        <CardHeader title="Brands" icon={Tag} actions={editable && <Button size="sm" icon={Plus} onClick={() => open(null)}>Add brand</Button>} />
      </div>
      <DataTable
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={Tag} title="No brands yet" description="Brands are optional — add them if you report by brand." />}
        columns={[
          { key: "n", header: "Name", cell: (r) => <span className="font-semibold text-slate-800">{r.name} {!r.isActive && <Badge tone="red">Inactive</Badge>}</span> },
          { key: "p", header: "Products", cell: (r) => r.productCount, align: "right" },
          {
            key: "a",
            header: "",
            align: "right",
            cell: (r) =>
              editable && (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => open(r)}>Edit</Button>
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label="Delete" onClick={() => { remove.setError(null); setDeleting(r); }} />
                </div>
              ),
          },
        ]}
      />
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.row ? "Edit brand" : "Add brand"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              loading={save.busy}
              disabled={!f.name.trim()}
              onClick={() =>
                save.run(async () => {
                  if (edit?.row) await patch(`/api/brands/${edit.row.id}`, { name: f.name, isActive: f.isActive });
                  else await post("/api/brands", { name: f.name });
                  setEdit(null);
                  reload();
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {save.error && <Alert>{save.error}</Alert>}
          <Field label="Name" required>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
          </Field>
          {edit?.row && <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Active" />}
        </div>
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        message="Brands used by products are deactivated instead."
        confirmLabel="Delete"
        danger
        busy={remove.busy}
        error={remove.error}
        onConfirm={() =>
          remove.run(async () => {
            await del(`/api/brands/${deleting!.id}`);
            setDeleting(null);
            reload();
          })
        }
      />
    </Card>
  );
}
