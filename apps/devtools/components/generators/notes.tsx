"use client";

import Link from "next/link";
import { ArrowRight, GitBranch, ShieldCheck, Zap } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";

/** `orb add rls` takes no input: what it does and what it needs. */
export function RlsNote({ tenancy, database }: { tenancy?: string; database: boolean }) {
  const ok = database && tenancy === "multi";
  return (
    <div className="grid gap-3 text-[12px] text-muted">
      <div className="flex items-start gap-2">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" />
        <div>
          Row-level security is a fifth isolation layer, in PostgreSQL, under the four organisations already have: the policy migration forces RLS with <span className="font-mono text-text">org_isolation</span> on every table with <span className="font-mono text-text">org_id NOT NULL</span> except <span className="font-mono text-text">org_members</span> and <span className="font-mono text-text">org_invitations</span>. The app already sets the organisation on every connection, so no code changes.
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Requires</span>
        <Badge tone={database ? "ok" : "danger"}>Full preset</Badge>
        <Badge tone={tenancy === "multi" ? "ok" : "danger"}>multi-tenant (orb add orgs)</Badge>
        <Badge tone="muted">on this orb release (orb upgrade)</Badge>
        <Badge tone="muted">in git</Badge>
      </div>
      {!ok && <div className="text-warn">{!database ? "This app has no database." : "This app is single-tenant: add organisations first. Preview will say the same."}</div>}
      <div className="text-[11px] text-dim">Afterwards connect as a role without superuser or BYPASSRLS (PostgreSQL applies no policy to those), migrate, run orb doctor and the tests. Running it again changes nothing.</div>
    </div>
  );
}

/** `orb add orgs` takes no input: the branch workflow it runs. */
export function OrgsNote({ tenancy, git }: { tenancy?: string; git?: boolean }) {
  return (
    <div className="grid gap-3 text-[12px] text-muted">
      <div className="flex items-start gap-2">
        <GitBranch size={14} className="mt-0.5 shrink-0 text-primary" />
        <div>
          Unlike the other generators this one doesn&apos;t write into your working tree: it checks out branch <span className="font-mono text-text">orb-add-orgs</span>, merges the multi-tenant app&apos;s files into yours the way <span className="font-mono text-text">orb upgrade</span> does (files you never edited are replaced, your edits are merged or left as conflicts), adds the <span className="font-mono text-text">orgs</span> and <span className="font-mono text-text">orgs_convert</span> migrations, updates go.mod, builds, regenerates <span className="font-mono text-text">api/openapi.json</span>, records <span className="font-mono text-text">api/surface.json</span> and commits <em>Add organisations</em>.
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Preview</span>
        <span>is the CLI&apos;s dry run: the files it will touch and the branch, without a diff.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Requires</span>
        <Badge tone={git === false ? "danger" : "ok"}>in git, no uncommitted changes</Badge>
        <Badge tone="muted">on this orb release</Badge>
        {tenancy === "multi" && <Badge tone="info">already multi-tenant: nothing to do</Badge>}
      </div>
      <div className="text-[11px] text-dim">Resources generated with orb gen resource stay owned by users and keep working; to move one to organisations, generate it again with the organisation scope. Set orgs.invitation_url before inviting people. Then go test ./..., apply the migrations and merge the branch.</div>
    </div>
  );
}

/** The job generator has its own sheet on the Jobs page. */
export function JobNote() {
  return (
    <div className="grid gap-3 text-[12px] text-muted">
      <div className="flex items-start gap-2">
        <Zap size={14} className="mt-0.5 shrink-0 text-primary" />
        <div>A job is made on the Jobs page: the form (schedule, interval or on demand; HTTP, SQL, email, dispatch or custom Go), the CLI command, or the code, with the same plan → diff → apply → restart flow.</div>
      </div>
      <Link href="/jobs?new=1">
        <Button size="sm" kind="primary" icon={<ArrowRight size={11} />}>
          Open the New job sheet
        </Button>
      </Link>
    </div>
  );
}
