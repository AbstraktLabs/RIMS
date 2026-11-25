"use client";

import { useState } from "react";
import { KeyRound, Save, UserRound } from "lucide-react";
import { Field, FormGrid, Input } from "@/components/ui/form";
import { Alert, Badge, Button, Card, CardHeader, DetailList, PageHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { patch, post } from "@/lib/client/api";
import { useAction } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";

export default function ProfilePage() {
  const { session, reloadSettings } = useSession();
  const toast = useToast();
  const [f, setF] = useState({ name: session.user.name, phone: session.user.phone ?? "" });
  const profile = useAction();
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const pass = useAction();
  const active = session.locations.find((l) => l.id === session.activeLocationId);

  return (
    <div>
      <PageHeader title="My profile" subtitle="Your own account details and password" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Personal details" icon={UserRound} />
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                profile.run(async () => {
                  await patch("/api/users/me", { name: f.name, phone: f.phone || null });
                  await reloadSettings();
                  toast("Profile saved");
                });
              }}
            >
              {profile.error && <Alert>{profile.error}</Alert>}
              <FormGrid>
                <Field label="Full name" required>
                  <Input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                </Field>
                <Field label="Phone">
                  <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                </Field>
                <Field label="Email" hint="Ask the business owner to change your email">
                  <Input value={session.user.email} disabled />
                </Field>
              </FormGrid>
              <div className="flex justify-end">
                <Button type="submit" icon={Save} loading={profile.busy}>Save</Button>
              </div>
            </form>
          </Card>
          <Card>
            <CardHeader title="Change password" subtitle="You’ll stay signed in here; other devices are signed out" icon={KeyRound} />
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (pw.newPassword !== pw.confirm) {
                  pass.setError("The new passwords don’t match");
                  return;
                }
                pass.run(async () => {
                  await post("/api/auth/change-password", { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
                  setPw({ currentPassword: "", newPassword: "", confirm: "" });
                  toast("Password changed");
                });
              }}
            >
              {pass.error && <Alert>{pass.error}</Alert>}
              <FormGrid cols={3}>
                <Field label="Current password">
                  <Input type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
                </Field>
                <Field label="New password" hint="8+ characters, letters and numbers">
                  <Input type="password" autoComplete="new-password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
                </Field>
                <Field label="Confirm new password">
                  <Input type="password" autoComplete="new-password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
                </Field>
              </FormGrid>
              <div className="flex justify-end">
                <Button type="submit" variant="dark" loading={pass.busy}>Change password</Button>
              </div>
            </form>
          </Card>
        </div>
        <Card>
          <CardHeader title="Access" />
          <DetailList
            items={[
              ["Business", session.organization.name],
              ["Current location", active?.name ?? "—"],
              ["Role here", <Badge key="r" tone="blue">{session.role}</Badge>],
            ]}
          />
          <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">All locations</div>
          <ul className="mt-2 space-y-1.5">
            {session.locations.map((l) => (
              <li key={l.id} className="flex items-center justify-between text-sm text-slate-700">
                <span>{l.name}</span>
                <Badge tone={l.role === "Viewer" ? "slate" : "green"}>{l.role}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
