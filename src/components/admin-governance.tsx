import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Plus, Save, Trash2, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  adminListCategories,
  adminUpsertCategory,
  adminDeleteCategory,
  adminListCourses,
  adminUpsertCourse,
  adminDeleteCourse,
  adminListModules,
  adminUpsertModule,
  adminDeleteModule,
  adminListFlags,
  adminUpsertFlag,
  adminDeleteFlag,
  adminListSettings,
  adminUpsertSetting,
  adminDeleteSetting,
} from "@/lib/learning.functions";

/* ================= CATEGORIES ================= */

export function CategoriesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListCategories);
  const upsertFn = useServerFn(adminUpsertCategory);
  const delFn = useServerFn(adminDeleteCategory);
  const q = useQuery({ queryKey: ["adminCategories"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<null | {
    id?: string;
    name: string;
    slug: string;
    description: string;
    icon: string;
    sort_order: number;
  }>(null);

  const upsert = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: editing?.id,
          name: editing!.name,
          slug: editing!.slug,
          description: editing!.description || null,
          icon: editing!.icon || null,
          sort_order: editing!.sort_order,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["adminCategories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminCategories"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 paper-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl text-primary">Categories</h3>
          <Button
            size="sm"
            onClick={() =>
              setEditing({ name: "", slug: "", description: "", icon: "", sort_order: 0 })
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> New
          </Button>
        </div>
        {q.isLoading ? (
          <div className="h-24 rounded-md bg-muted/40 animate-pulse" />
        ) : !q.data?.length ? (
          <p className="text-sm text-muted-foreground">No categories yet.</p>
        ) : (
          <div className="space-y-2">
            {q.data.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3"
              >
                <div className="text-xs w-8 text-center text-muted-foreground">
                  #{c.sort_order}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {c.icon && <span className="mr-1.5">{c.icon}</span>}
                    {c.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">/{c.slug}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setEditing({
                      id: c.id,
                      name: c.name,
                      slug: c.slug,
                      description: c.description ?? "",
                      icon: c.icon ?? "",
                      sort_order: c.sort_order,
                    })
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Delete category "${c.name}"?`)) del.mutate(c.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="paper-card rounded-xl p-5">
        <h3 className="font-display text-xl text-primary mb-4">
          {editing ? (editing.id ? "Edit category" : "New category") : "Editor"}
        </h3>
        {!editing ? (
          <p className="text-sm text-muted-foreground">Select a category or click New.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                value={editing.slug}
                onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                placeholder="lowercase-hyphens"
              />
            </div>
            <div>
              <Label>Icon (emoji or short text)</Label>
              <Input
                value={editing.icon}
                onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
              />
            </div>
            <div>
              <Label>Sort order</Label>
              <Input
                type="number"
                value={editing.sort_order}
                onChange={(e) =>
                  setEditing({ ...editing, sort_order: parseInt(e.target.value || "0", 10) })
                }
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= COURSES + MODULES ================= */

export function CoursesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListCourses);
  const upsertFn = useServerFn(adminUpsertCourse);
  const delFn = useServerFn(adminDeleteCourse);
  const q = useQuery({ queryKey: ["adminCourses"], queryFn: () => listFn() });

  const [editing, setEditing] = useState<null | {
    id?: string;
    title: string;
    slug: string;
    description: string;
    cover_url: string;
    is_published: boolean;
  }>(null);
  const [managingModulesFor, setManagingModulesFor] = useState<string | null>(null);

  const upsert = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: editing?.id,
          title: editing!.title,
          slug: editing!.slug,
          description: editing!.description || null,
          cover_url: editing!.cover_url || null,
          is_published: editing!.is_published,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["adminCourses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminCourses"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (managingModulesFor) {
    return (
      <ModulesEditor
        courseId={managingModulesFor}
        onBack={() => setManagingModulesFor(null)}
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 paper-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl text-primary">Courses</h3>
          <Button
            size="sm"
            onClick={() =>
              setEditing({
                title: "",
                slug: "",
                description: "",
                cover_url: "",
                is_published: false,
              })
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> New
          </Button>
        </div>
        {q.isLoading ? (
          <div className="h-24 rounded-md bg-muted/40 animate-pulse" />
        ) : !q.data?.length ? (
          <p className="text-sm text-muted-foreground">No courses yet.</p>
        ) : (
          <div className="space-y-2">
            {q.data.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    /{c.slug} ·{" "}
                    {c.is_published ? (
                      <span className="text-emerald-700">Published</span>
                    ) : (
                      <span className="text-amber-700">Draft</span>
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setManagingModulesFor(c.id)}
                >
                  Modules
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setEditing({
                      id: c.id,
                      title: c.title,
                      slug: c.slug,
                      description: c.description ?? "",
                      cover_url: c.cover_url ?? "",
                      is_published: c.is_published,
                    })
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Delete course "${c.title}"?`)) del.mutate(c.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="paper-card rounded-xl p-5">
        <h3 className="font-display text-xl text-primary mb-4">
          {editing ? (editing.id ? "Edit course" : "New course") : "Editor"}
        </h3>
        {!editing ? (
          <p className="text-sm text-muted-foreground">Select a course or click New.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                value={editing.slug}
                onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
              />
            </div>
            <div>
              <Label>Cover image URL</Label>
              <Input
                value={editing.cover_url}
                onChange={(e) => setEditing({ ...editing, cover_url: e.target.value })}
                placeholder="https://…"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={4}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.is_published}
                onChange={(e) => setEditing({ ...editing, is_published: e.target.checked })}
              />
              Published
            </label>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModulesEditor({ courseId, onBack }: { courseId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListModules);
  const upsertFn = useServerFn(adminUpsertModule);
  const delFn = useServerFn(adminDeleteModule);
  const q = useQuery({
    queryKey: ["adminModules", courseId],
    queryFn: () => listFn({ data: { courseId } }),
  });
  const [editing, setEditing] = useState<null | {
    id?: string;
    title: string;
    content: string;
    sort_order: number;
  }>(null);

  const upsert = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: editing?.id,
          course_id: courseId,
          title: editing!.title,
          content: editing!.content || null,
          sort_order: editing!.sort_order,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["adminModules", courseId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminModules", courseId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← All courses
        </Button>
        <h3 className="font-display text-xl text-primary">Modules</h3>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() =>
            setEditing({
              title: "",
              content: "",
              sort_order: (q.data?.length ?? 0) * 10,
            })
          }
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> New module
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-2">
          {q.isLoading ? (
            <div className="h-24 rounded-md bg-muted/40 animate-pulse" />
          ) : !q.data?.length ? (
            <p className="text-sm text-muted-foreground paper-card rounded-xl p-5">
              No modules yet.
            </p>
          ) : (
            q.data.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-background/60 p-3"
              >
                <div className="text-xs w-8 text-center text-muted-foreground pt-0.5">
                  #{m.sort_order}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{m.title}</p>
                  {m.content && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {m.content}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setEditing({
                      id: m.id,
                      title: m.title,
                      content: m.content ?? "",
                      sort_order: m.sort_order,
                    })
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Delete module "${m.title}"?`)) del.mutate(m.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="paper-card rounded-xl p-5">
          <h4 className="font-display text-lg text-primary mb-3">
            {editing ? (editing.id ? "Edit module" : "New module") : "Editor"}
          </h4>
          {!editing ? (
            <p className="text-sm text-muted-foreground">Select or add a module.</p>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Title</Label>
                <Input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={editing.sort_order}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      sort_order: parseInt(e.target.value || "0", 10),
                    })
                  }
                />
              </div>
              <div>
                <Label>Content</Label>
                <Textarea
                  rows={8}
                  value={editing.content}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Save
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  <X className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= FEATURE FLAGS ================= */

export function FlagsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListFlags);
  const upsertFn = useServerFn(adminUpsertFlag);
  const delFn = useServerFn(adminDeleteFlag);
  const q = useQuery({ queryKey: ["adminFlags"], queryFn: () => listFn() });
  const [newKey, setNewKey] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const toggle = useMutation({
    mutationFn: (v: { id: string; key: string; enabled: boolean; description: string | null }) =>
      upsertFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminFlags"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const create = useMutation({
    mutationFn: () =>
      upsertFn({
        data: { key: newKey.trim(), enabled: false, description: newDesc.trim() || null },
      }),
    onSuccess: () => {
      setNewKey("");
      setNewDesc("");
      toast.success("Flag added");
      qc.invalidateQueries({ queryKey: ["adminFlags"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminFlags"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 paper-card rounded-xl p-5">
        <h3 className="font-display text-xl text-primary mb-4">Feature Flags</h3>
        {q.isLoading ? (
          <div className="h-24 rounded-md bg-muted/40 animate-pulse" />
        ) : !q.data?.length ? (
          <p className="text-sm text-muted-foreground">No flags defined.</p>
        ) : (
          <div className="space-y-2">
            {q.data.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium font-mono">{f.key}</p>
                  {f.description && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{f.description}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Updated {formatDistanceToNow(new Date(f.updated_at), { addSuffix: true })}
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    onChange={(e) =>
                      toggle.mutate({
                        id: f.id,
                        key: f.key,
                        enabled: e.target.checked,
                        description: f.description,
                      })
                    }
                  />
                  <span className="text-xs">{f.enabled ? "On" : "Off"}</span>
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Delete flag ${f.key}?`)) del.mutate(f.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="paper-card rounded-xl p-5">
        <h3 className="font-display text-xl text-primary mb-4">Add flag</h3>
        <div className="space-y-3">
          <div>
            <Label>Key</Label>
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="e.g. new_search_ui"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
          <Button
            onClick={() => create.mutate()}
            disabled={!newKey.trim() || create.isPending}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ================= APP SETTINGS ================= */

export function SettingsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListSettings);
  const upsertFn = useServerFn(adminUpsertSetting);
  const delFn = useServerFn(adminDeleteSetting);
  const q = useQuery({ queryKey: ["adminSettings"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<null | {
    id?: string;
    key: string;
    valueText: string;
    description: string;
  }>(null);

  const upsert = useMutation({
    mutationFn: () => {
      let value: unknown = {};
      try {
        value = JSON.parse(editing!.valueText || "null");
      } catch {
        throw new Error("Value must be valid JSON");
      }
      return upsertFn({
        data: {
          id: editing?.id,
          key: editing!.key,
          value,
          description: editing!.description || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["adminSettings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminSettings"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 paper-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl text-primary">App Settings</h3>
          <Button
            size="sm"
            onClick={() =>
              setEditing({ key: "", valueText: '""', description: "" })
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> New
          </Button>
        </div>
        {q.isLoading ? (
          <div className="h-24 rounded-md bg-muted/40 animate-pulse" />
        ) : !q.data?.length ? (
          <p className="text-sm text-muted-foreground">No settings defined.</p>
        ) : (
          <div className="space-y-2">
            {q.data.map((s) => (
              <div
                key={s.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-background/60 p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium font-mono">{s.key}</p>
                  <pre className="text-[11px] text-muted-foreground bg-muted/40 rounded p-2 mt-1 overflow-x-auto">
                    {JSON.stringify(s.value, null, 2)}
                  </pre>
                  {s.description && (
                    <p className="text-[11px] text-muted-foreground mt-1">{s.description}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setEditing({
                      id: s.id,
                      key: s.key,
                      valueText: JSON.stringify(s.value, null, 2),
                      description: s.description ?? "",
                    })
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Delete setting ${s.key}?`)) del.mutate(s.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="paper-card rounded-xl p-5">
        <h3 className="font-display text-xl text-primary mb-4">
          {editing ? (editing.id ? "Edit setting" : "New setting") : "Editor"}
        </h3>
        {!editing ? (
          <p className="text-sm text-muted-foreground">
            Values are stored as JSON (e.g. <code>"hello"</code>, <code>42</code>,{" "}
            <code>{`{"a":1}`}</code>).
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Key</Label>
              <Input
                value={editing.key}
                onChange={(e) => setEditing({ ...editing, key: e.target.value })}
                placeholder="site.title"
              />
            </div>
            <div>
              <Label>Value (JSON)</Label>
              <Textarea
                rows={6}
                className="font-mono text-xs"
                value={editing.valueText}
                onChange={(e) => setEditing({ ...editing, valueText: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
