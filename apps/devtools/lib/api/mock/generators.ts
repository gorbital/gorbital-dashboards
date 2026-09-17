/**
 * The generators hub in mock mode (ADR-0077): `resource`, `add-mail`,
 * `add-storage`, `add-rls` and `add-orgs` planned against a small working
 * tree in memory, with the CLI's usage messages, and applied onto it. The
 * `job` generator lives in `mock/jobs.ts`, `migration` in `mock/schema.ts`
 * (it lands in the Migrations page's list).
 */

import { portalStatus } from "@/lib/mock";
import type { GeneratorResponse, Plan, PlanChange, Problem } from "../types";
import { setMockEnv } from "./project";

type Line = (stream: "orb" | "app", text: string) => void;

/* ---------- The working tree ---------- */

const APP_MODULE = "github.com/acme/acme-api";

const MODULES_GO = `package app

import (
\t"errors"

\t"github.com/danielgtaylor/huma/v2"
)

// registerModules wires every API module. orb gen resource adds a line
// after the anchor; keep the anchor.
func registerModules(api huma.API, mapper *errorMapper, svc *services) error {
\treturn errors.Join(
\t\tregisterProjects(api, mapper, svc),
\t\t//orb:anchor modules
\t)
}
`;

const PERMISSIONS_GO = `package app

import "github.com/acme/acme-api/internal/modules/orgs"

// orgPermissions are declared for every organisation role.
var orgPermissions = []orgs.PermissionSet{
\tprojectsPermissions,
\t//orb:anchor org-permissions
}

// userPermissions go to the user role every account holds.
var userPermissions = []orgs.PermissionSet{
\t//orb:anchor user-permissions
}
`;

const INFRA_MAIL_RESEND = `package app

import (
\t"os"

\t"gorbital.dev/mail"
\t"gorbital.dev/mail/resend"
)

// newMailer sends through Resend (orb add mail --provider resend).
func newMailer() (mail.Sender, error) {
\treturn resend.New(os.Getenv("RESEND_API_KEY"))
}
`;

const INFRA_MAIL_SMTP = `package app

import (
\t"os"

\t"gorbital.dev/mail"
\t"gorbital.dev/mail/smtp"
)

// newMailer sends through an SMTP server (orb add mail --provider smtp).
func newMailer() (mail.Sender, error) {
\treturn smtp.New(smtp.Config{
\t\tHost:     os.Getenv("SMTP_HOST"),
\t\tPort:     os.Getenv("SMTP_PORT"),
\t\tTLS:      os.Getenv("SMTP_TLS"),
\t\tUsername: os.Getenv("SMTP_USERNAME"),
\t\tPassword: os.Getenv("SMTP_PASSWORD"),
\t})
}
`;

const ENV_EXAMPLE_HEAD = `# Copy to .env for local development. Never commit .env.
#
# Only secrets and infrastructure live here. Values operators change at
# runtime are runtime settings, edited through /ops/settings.

APP_ENV=development
APP_ADDR=127.0.0.1:8080
DATABASE_URL=postgres://acme:acme@127.0.0.1:5432/acme_api?sslmode=disable
`;

const mailBlock = (provider: string) =>
  provider === "smtp"
    ? `# orb:begin mail
# SMTP server the app sends through (orb add mail --provider smtp).
SMTP_HOST=
SMTP_PORT=587
SMTP_TLS=starttls
SMTP_USERNAME=
SMTP_PASSWORD=
# orb:end mail
`
    : `# orb:begin mail
# Resend API key (orb add mail --provider resend): https://resend.com/api-keys
RESEND_API_KEY=
# orb:end mail
`;

const storageBlock = (driver: string, v: Record<string, string>) =>
  driver === "local"
    ? `# orb:begin storage
# File storage: local keeps files under STORAGE_LOCAL_DIR.
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=.orb/storage
# orb:end storage
`
    : `# orb:begin storage
# File storage with ${driver}: the endpoint (s3 and spaces derive it from
# the region), region, bucket and keys; STORAGE_PUBLIC_URL when the bucket
# is public; STORAGE_PATH_STYLE=true for MinIO (the default there).
STORAGE_DRIVER=${driver}
STORAGE_ENDPOINT=${v.endpoint ?? ""}
STORAGE_REGION=${v.region ?? ""}
STORAGE_BUCKET=${v.bucket ?? ""}
STORAGE_ACCESS_KEY=${v.access_key ?? ""}
STORAGE_SECRET_KEY=
STORAGE_PUBLIC_URL=${v.public_url ?? ""}
STORAGE_PATH_STYLE=${driver === "minio" ? "true" : ""}
# orb:end storage
`;

const COMPOSE = `services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: acme
      POSTGRES_PASSWORD: acme
      POSTGRES_DB: acme_api
    ports:
      - "\${POSTGRES_PORT:-5432}:5432"
  mailpit:
    image: axllent/mailpit
    ports:
      - "\${MAILPIT_WEB_PORT:-8025}:8025"
      - "1025:1025"
`;

const MINIO_SERVICE = `  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "\${MINIO_PORT:-9000}:9000"
      - "\${MINIO_CONSOLE_PORT:-9001}:9001"
    volumes:
      - minio:/data
volumes:
  minio:
`;

const manifest = (mail: string, rls: boolean) => `name: acme-api\nmodule: github.com/acme/acme-api\npreset: full\ntenancy: multi\nmail: ${mail}\n${rls ? "rls: true\n" : ""}`;
const lockFile = (mail: string, rls: boolean, n: number) => `version: 1\norb:\n  version: 1.3.0\ninputs:\n  preset: full\n  tenancy: multi\n  mail: ${mail}\n  rls: ${rls}\nfiles:\n  gorbital.yaml: sha256:${(n * 2654435761).toString(16).padStart(12, "0")}9c3e1\n`;

type Tree = Map<string, string>;

let tree: Tree;
let mail: string;
let rls: boolean;
let storageDriver: string;
/** The sample repository has an uncommitted migration (the one the Database page shows pending). */
let dirty: boolean;
let modules: Set<string>;

function initialTree() {
  mail = "resend";
  rls = false;
  storageDriver = "local";
  dirty = true;
  modules = new Set(["projects", "billing", "books", "shelves"]);
  tree = new Map<string, string>([
    ["internal/app/modules.go", MODULES_GO],
    ["internal/app/permissions.go", PERMISSIONS_GO],
    ["internal/modules/modules.gen.go", modulesGen(["billing", "books", "shelves"])],
    ["internal/app/infra_mail.go", INFRA_MAIL_RESEND],
    ["internal/app/infra_mail_test.go", `package app\n\nimport "testing"\n\nfunc TestMailer(t *testing.T) {\n\tt.Setenv("RESEND_API_KEY", "re_test")\n\tif _, err := newMailer(); err != nil {\n\t\tt.Fatal(err)\n\t}\n}\n`],
    [".env.example", ENV_EXAMPLE_HEAD + "\n" + mailBlock("resend") + "\n" + storageBlock("local", {})],
    [".env", ENV_EXAMPLE_HEAD.replace("acme:acme@127.0.0.1:5432", "acme:secret@127.0.0.1:55432") + "\n" + mailBlock("resend") + "\n" + storageBlock("local", {})],
    ["gorbital.yaml", manifest("resend", false)],
    ["gorbital.lock", lockFile("resend", false, 1)],
    ["compose.yaml", COMPOSE],
    ["go.mod", "module github.com/acme/acme-api\n\ngo 1.25\n\nrequire (\n\tgorbital.dev v1.3.0\n\tgorbital.dev/mail/resend v1.3.0\n)\n"],
  ]);
}
initialTree();

/** Resets the tree; `resetMock` calls it. */
export function resetMockGenerators() {
  initialTree();
}

/* ---------- Helpers ---------- */

function change(path: string, content: string): PlanChange {
  const before = tree.get(path);
  return before === undefined ? { path, kind: "create", content } : { path, kind: "modify", content, before };
}

function apply(changes: PlanChange[]) {
  for (const c of changes) tree.set(c.path, c.content);
  dirty = true;
}

const usage = (detail: string): Problem => ({ title: "Unprocessable Entity", status: 422, code: "generator_failed", detail });
const conflict = (detail: string): Problem => ({ title: "Conflict", status: 409, code: "plan_conflict", detail });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function problemResponse(p: Problem): Response {
  return new Response(JSON.stringify(p), { status: p.status, headers: { "Content-Type": "application/problem+json" } });
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function version(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

/* ---------- resource ---------- */

type Field = { name: string; kind: "string" | "text" | "enum"; values: string[]; unique: boolean; optional?: boolean };

const snake = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const reserved = new Set(["id", "owner_id", "org_id", "created_by", "version", "created_at", "updated_at", "created", "updated", "limit", "cursor", "sort", "after", "page", "params", "apply", "order", "user", "select", "from", "where", "table", "group", "limit"]);

function parseFields(specs: unknown, allowOptional = false): Field[] | Problem {
  if (!Array.isArray(specs) || specs.length === 0) return usage("add at least one field, such as name:string");
  if (specs.length > 20) return usage("a resource can have at most 20 fields");
  const out: Field[] = [];
  const seen = new Set<string>();
  for (const raw of specs) {
    const spec = str(raw);
    const i = spec.indexOf(":");
    if (i <= 0 || i === spec.length - 1) return usage(`field "${spec}": write it as name:type, such as title:string, notes:text or status:enum(open,closed)`);
    const name = spec.slice(0, i);
    const rest = spec.slice(i + 1);
    if (name.length > 20 || !snake.test(name)) return usage(`field name "${name}" must be snake_case: lowercase letters, digits and single underscores, starting with a letter (max 20)`);
    if (reserved.has(name) || name.endsWith("_sort")) return usage(`field name "${name}" is reserved; choose another`);
    if (seen.has(name)) return usage(`field ${name} appears more than once`);
    seen.add(name);
    const f: Field = { name, kind: "string", values: [], unique: false };
    let options = "";
    if (rest.startsWith("enum(")) {
      const close = rest.indexOf(")");
      if (close < 0) return usage(`field ${name}: close the values, such as ${name}:enum(open,closed)`);
      f.kind = "enum";
      f.values = rest.slice(5, close).split(",").map((v) => v.trim());
      if (f.values.length < 2 || f.values.length > 20) return usage(`field ${name}: give 2 to 20 values, such as ${name}:enum(open,closed)`);
      for (const v of f.values) if (v.length > 30 || !snake.test(v)) return usage(`field ${name}: value "${v}" must be snake_case: lowercase letters, digits and single underscores, starting with a letter (max 30)`);
      options = rest.slice(close + 1);
    } else {
      const [kind, ...more] = rest.split(":");
      if (allowOptional && kind === "string?") {
        f.optional = true;
      } else if (kind !== "string" && kind !== "text") {
        return usage(`field ${name}: type must be string, ${allowOptional ? "string?, " : ""}text or enum(a,b), got "${kind}"`);
      }
      f.kind = kind === "text" ? "text" : "string";
      if (more.length) options = ":" + more.join(":");
    }
    if (options) {
      if (!options.startsWith(":")) return usage(`field ${name}: unexpected "${options}" after the type`);
      for (const o of options.slice(1).split(":")) {
        if (o === "unique" && f.kind === "string" && !f.optional) f.unique = true;
        else if (o === "unique") return usage(`field ${name}: only ${allowOptional ? "required " : ""}string fields can be unique`);
        else return usage(`field ${name}: unknown option "${o}" (want unique)`);
      }
    }
    out.push(f);
  }
  if (!out.some((f) => f.kind === "string" && !f.optional)) return usage(`add at least one ${allowOptional ? "required " : ""}string field, such as name:string; the first one is the title lists sort by`);
  return out;
}

function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}
const ident = (ws: string[]) => ws.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
const pluralize = (w: string) => (w.length > 1 && w.endsWith("y") && !"aeiou".includes(w[w.length - 2]) ? w.slice(0, -1) + "ies" : /(s|x|z|ch|sh)$/.test(w) ? w + "es" : w + "s");

function column(f: Field): string {
  switch (f.kind) {
    case "string":
      return `${f.name} text NOT NULL CHECK (char_length(${f.name}) BETWEEN 1 AND 100)`;
    case "text":
      return `${f.name} text NOT NULL DEFAULT '' CHECK (char_length(${f.name}) <= 2000)`;
    default:
      return `${f.name} text NOT NULL DEFAULT '${f.values[0]}' CHECK (${f.name} IN (${f.values.map((v) => `'${v}'`).join(", ")}))`;
  }
}

function goType(f: Field, ident: string): string {
  return f.kind === "enum" ? ident + f.name.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("") : "string";
}

function planResource(input: Record<string, unknown>): GeneratorResponse | Problem {
  const name = str(input.name);
  if (!name) return usage("resource name must start with a letter and use letters, digits, hyphens or underscores (max 40), such as Project");
  if (name.length > 40 || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return usage("resource name must start with a letter and use letters, digits, hyphens or underscores (max 40), such as Project");
  const fields = parseFields(input.fields);
  if (!Array.isArray(fields)) return fields;
  const scope = str(input.scope) || (portalStatus.project.tenancy === "multi" ? "org" : "user");
  if (scope !== "user" && scope !== "org") return usage(`scope must be user or org, got "${scope}"`);
  const ws = words(name);
  const pws = str(input.plural) ? words(str(input.plural)) : [...ws.slice(0, -1), pluralize(ws[ws.length - 1])];
  const Ident = ident(ws);
  const Plural = ident(pws);
  const pkg = pws.join("");
  const table = pws.join("_");
  const route = pws.join("-");
  const snakeName = ws.join("_");
  const prefix = str(input.id_prefix) || (snakeName[0] + snakeName.slice(1).replace(/[aeiou_]/g, "")).slice(0, 3);
  if (!/^[a-z]{2,8}$/.test(prefix)) return usage(`ID prefix "${prefix}" must be 2 to 8 lowercase letters; pass --id-prefix`);
  if (Plural === Ident) return usage(`the plural of ${Ident} must differ from the name; pass --plural`);
  if (modules.has(pkg)) return conflict(`internal/modules/${pkg} exists; a resource can be registered once`);
  const v = version();
  const dir = `internal/modules/${pkg}`;
  const org = scope === "org";
  const owner = org ? "org_id" : "owner_id";
  const module = portalStatus.project.module;
  const fieldLines = fields.map((f) => `\t${f.name.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("")} ${goType(f, Ident)} \`json:"${f.name}"\``).join("\n");
  const enums = fields
    .filter((f) => f.kind === "enum")
    .map((f) => {
      const t = goType(f, Ident);
      return `\n// ${t} is one of ${f.values.join(", ")}.\ntype ${t} string\n\nconst (\n${f.values.map((val) => `\t${t}${val.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("")} ${t} = "${val}"`).join("\n")}\n)\n`;
    })
    .join("");
  const title = fields.find((f) => f.kind === "string")!;
  const changes: PlanChange[] = [
    change(`${dir}/module.go`, `// Package ${pkg} is the ${ws.join(" ")} module: ${org ? "records that belong to an organisation" : "records that belong to the signed-in user"}.\npackage ${pkg}\n\nimport (\n\t"${module}/${dir}/delivery"\n\t"${module}/${dir}/repository"\n\t"${module}/${dir}/usecase"\n\t"github.com/danielgtaylor/huma/v2"\n\t"github.com/jackc/pgx/v5/pgxpool"\n)\n\n// Register wires the layers and mounts /v1/${org ? "orgs/{orgId}/" : ""}${route}.\nfunc Register(api huma.API, pool *pgxpool.Pool) *usecase.Service {\n\tstore := repository.New(pool)\n\tsvc := usecase.New(store)\n\tdelivery.Register(api, svc)\n\treturn svc\n}\n`),
    change(`${dir}/domain/${snakeName}.go`, `package domain\n\nimport "time"\n${enums}\n// ${Ident} is one ${ws.join(" ")}. IDs look like ${prefix}_….\ntype ${Ident} struct {\n\tID        string    \`json:"id"\`\n\t${org ? "OrgID     string    `json:\"org_id\"`\n\tCreatedBy string    `json:\"created_by\"`" : "OwnerID   string    `json:\"owner_id\"`"}\n${fieldLines}\n\tVersion   int       \`json:"version"\`\n\tCreatedAt time.Time \`json:"created_at"\`\n\tUpdatedAt time.Time \`json:"updated_at"\`\n}\n\n// ${Ident}Fields is what a caller sets.\ntype ${Ident}Fields struct {\n${fieldLines}\n}\n\n// Validate checks the fields' lengths and values.\nfunc (f ${Ident}Fields) Validate() error {\n${fields.map((f) => (f.kind === "string" ? `\tif n := len([]rune(f.${f.name.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("")})); n < 1 || n > 100 {\n\t\treturn &FieldError{Field: "${f.name}", Message: "must be 1 to 100 characters"}\n\t}` : f.kind === "text" ? `\tif len([]rune(f.${f.name.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("")})) > 2000 {\n\t\treturn &FieldError{Field: "${f.name}", Message: "must be at most 2000 characters"}\n\t}` : `\tswitch f.${f.name.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("")} {\n\tcase ${f.values.map((val) => `${goType(f, Ident)}${val.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("")}`).join(", ")}:\n\tdefault:\n\t\treturn &FieldError{Field: "${f.name}", Message: "must be ${f.values.join(", ")}"}\n\t}`)).join("\n")}\n\treturn nil\n}\n`),
    change(`${dir}/domain/errors.go`, `package domain\n\nimport "errors"\n\nvar (\n\tErr${Ident}NotFound        = errors.New("${snakeName} not found")\n\tErr${Ident}VersionConflict = errors.New("${snakeName} changed since it was read")\n\tErrForbidden${""}              = errors.New("forbidden")\n)\n\n// FieldError says which field is wrong.\ntype FieldError struct {\n\tField, Message string\n}\n\nfunc (e *FieldError) Error() string { return e.Field + " " + e.Message }\n`),
    change(`${dir}/domain/${snakeName}_test.go`, `package domain\n\nimport "testing"\n\nfunc TestValidate(t *testing.T) {\n\tf := ${Ident}Fields{${title.name.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("")}: "Example"}\n\tif err := f.Validate(); err != nil {\n\t\tt.Fatalf("valid fields refused: %v", err)\n\t}\n\tf.${title.name.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("")} = ""\n\tif err := f.Validate(); err == nil {\n\t\tt.Fatal("empty ${title.name} accepted")\n\t}\n}\n`),
    change(`${dir}/usecase/ports.go`, `package usecase\n\nimport (\n\t"context"\n\n\t"${module}/${dir}/domain"\n)\n\n// Store is what the use cases need from the repository.\ntype Store interface {\n\tInsert(ctx context.Context, p *domain.${Ident}) error\n\tSelect(ctx context.Context, ${owner}, id string) (*domain.${Ident}, error)\n\tList(ctx context.Context, ${owner} string, q ListQuery) ([]domain.${Ident}, string, error)\n\tUpdate(ctx context.Context, p *domain.${Ident}) error\n\tDelete(ctx context.Context, ${owner}, id string) error\n}\n`),
    change(`${dir}/usecase/service.go`, `package usecase\n\n// Service holds the ${pws.join(" ")} use cases.\ntype Service struct {\n\tstore Store\n}\n\n// New wires the service.\nfunc New(store Store) *Service { return &Service{store: store} }\n`),
    change(`${dir}/usecase/${pkg}.go`, `package usecase\n\nimport (\n\t"context"\n\n\t"${module}/${dir}/domain"\n\t"gorbital.dev/actor"\n\t"gorbital.dev/audit"\n\t"gorbital.dev/id"\n)\n\n// Create makes a ${ws.join(" ")} for the ${org ? "organisation" : "signed-in user"}; needs ${pkg}.${snakeName}.write.\nfunc (s *Service) Create(ctx context.Context, ${org ? "orgID string, " : ""}f domain.${Ident}Fields) (*domain.${Ident}, error) {\n\tif err := actor.Require(ctx, "${pkg}.${snakeName}.write"); err != nil {\n\t\treturn nil, err\n\t}\n\tif err := f.Validate(); err != nil {\n\t\treturn nil, err\n\t}\n\tp := &domain.${Ident}{ID: id.New("${prefix}"), ${org ? "OrgID: orgID, CreatedBy: actor.UserID(ctx)" : "OwnerID: actor.UserID(ctx)"}, ${Ident}Fields: f}\n\tif err := s.store.Insert(ctx, p); err != nil {\n\t\treturn nil, err\n\t}\n\taudit.Record(ctx, "${pkg}.${snakeName}.created", p.ID)\n\treturn p, nil\n}\n\n// ListQuery pages a list: limit, cursor and sort.\ntype ListQuery struct {\n\tLimit  int\n\tCursor string\n\tSort   string\n}\n`),
    change(`${dir}/usecase/${pkg}_test.go`, `package usecase_test\n\nimport "testing"\n\nfunc TestCreateNeedsPermission(t *testing.T) {\n\tt.Skip("runs on PostgreSQL: go test ./... with DATABASE_URL")\n}\n`),
    change(`${dir}/repository/store.go`, `package repository\n\nimport (\n\t_ "embed"\n\n\t"github.com/jackc/pgx/v5/pgxpool"\n)\n\n//go:embed insert_${snakeName}.sql\nvar insertSQL string\n\n//go:embed select_${snakeName}.sql\nvar selectSQL string\n\n// Store runs the hand-written SQL in this package.\ntype Store struct{ pool *pgxpool.Pool }\n\n// New wraps the pool.\nfunc New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }\n`),
    change(`${dir}/repository/insert_${snakeName}.sql`, `INSERT INTO ${table} (id, ${owner}${org ? ", created_by" : ""}, ${fields.map((f) => f.name).join(", ")})\nVALUES ($1, $2${org ? ", $3" : ""}, ${fields.map((_, i) => `$${i + (org ? 4 : 3)}`).join(", ")})\nRETURNING version, created_at, updated_at;\n`),
    change(`${dir}/repository/select_${snakeName}.sql`, `SELECT id, ${owner}${org ? ", created_by" : ""}, ${fields.map((f) => f.name).join(", ")}, version, created_at, updated_at\nFROM ${table}\nWHERE ${owner} = $1 AND id = $2;\n`),
    change(`${dir}/delivery/${pkg}.go`, `package delivery\n\nimport (\n\t"context"\n\t"net/http"\n\n\t"${module}/${dir}/domain"\n\t"${module}/${dir}/usecase"\n\t"github.com/danielgtaylor/huma/v2"\n)\n\ntype createInput struct {\n\t${org ? "OrgID string `path:\"orgId\"`\n\t" : ""}Body domain.${Ident}Fields\n}\n\ntype ${snakeName}Output struct {\n\tBody domain.${Ident}\n}\n\n// Register mounts the ${route} endpoints.\nfunc Register(api huma.API, svc *usecase.Service) {\n\thuma.Register(api, huma.Operation{\n\t\tOperationID: "${route}-create", Method: http.MethodPost, Path: "/v1/${org ? "orgs/{orgId}/" : ""}${route}",\n\t\tSummary: "Create ${/^[aeiou]/.test(ws.join(" ")) ? "an" : "a"} ${ws.join(" ")}", DefaultStatus: http.StatusCreated,\n\t}, func(ctx context.Context, in *createInput) (*${snakeName}Output, error) {\n\t\tp, err := svc.Create(ctx, ${org ? "in.OrgID, " : ""}in.Body)\n\t\tif err != nil {\n\t\t\treturn nil, err\n\t\t}\n\t\treturn &${snakeName}Output{Body: *p}, nil\n\t})\n}\n`),
    change(`internal/app/module_${pkg}.go`, `package app\n\nimport (\n\t"${module}/${dir}"\n\t"${module}/${dir}/domain"\n\t"github.com/danielgtaylor/huma/v2"\n\t"gorbital.dev/orgs"\n)\n\n// ${pkg}Permissions are the module's permissions: ${pkg}.${snakeName}.read and .write.\nvar ${pkg}Permissions = orgs.PermissionSet{Module: "${pkg}", Permissions: []string{"${pkg}.${snakeName}.read", "${pkg}.${snakeName}.write"}}\n\nfunc register${Plural}(api huma.API, mapper *errorMapper, svc *services) error {\n\tmapper.Map(domain.Err${Ident}NotFound, 404, "${snakeName}_not_found")\n\tmapper.Map(domain.Err${Ident}VersionConflict, 409, "${snakeName}_version_conflict")\n\t${pkg}.Register(api, svc.pool)\n\treturn nil\n}\n`),
    change(`internal/app/${pkg}_test.go`, `package app_test\n\nimport "testing"\n\nfunc Test${Plural}(t *testing.T) {\n\tt.Skip("end to end on PostgreSQL: creates, lists, updates and deletes; another user's requests get 404")\n}\n`),
    change(`db/migrations/${v}_${table}.sql`, `-- ${Plural}: ${org ? "records that belong to an organisation" : "records that belong to the signed-in user"}.\n\n-- +goose Up\nCREATE TABLE ${table} (\n    id text PRIMARY KEY,\n    ${org ? "org_id text NOT NULL REFERENCES orgs (id) ON DELETE CASCADE,\n    created_by text NOT NULL REFERENCES auth_users (id)," : "owner_id text NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,"}\n${fields.map((f) => `    ${column(f)},`).join("\n")}\n    version integer NOT NULL DEFAULT 1,\n    created_at timestamptz NOT NULL DEFAULT now(),\n    updated_at timestamptz NOT NULL DEFAULT now()\n);\n${fields
      .filter((f) => f.unique)
      .map((f) => `CREATE UNIQUE INDEX ${table}_${owner}_${f.name}_key ON ${table} (${owner}, lower(${f.name}));\n`)
      .join("")}CREATE INDEX ${table}_${owner}_${title.name}_sort ON ${table} (${owner}, ${title.name}, id);\n${org && rls ? `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\nALTER TABLE ${table} FORCE ROW LEVEL SECURITY;\nCREATE POLICY org_isolation ON ${table} USING (org_id = current_setting('app.org_id', true));\n` : ""}`),
    change("internal/app/modules.go", tree.get("internal/app/modules.go")!.replace("\t\t//orb:anchor modules", `\t\tregister${Plural}(api, mapper, svc),\n\t\t//orb:anchor modules`)),
    change("internal/app/permissions.go", tree.get("internal/app/permissions.go")!.replace(org ? "\t//orb:anchor org-permissions" : "\t//orb:anchor user-permissions", `\t${pkg}Permissions,\n\t//orb:anchor ${org ? "org-permissions" : "user-permissions"}`)),
  ];
  const fieldDesc = (f: Field) => (f.kind === "string" ? `string, 1 to 100 characters${f.unique ? ", unique" : ""}` : f.kind === "text" ? "text, up to 2000 characters" : `one of ${f.values.join(", ")}`);
  const summary = `  Resource:  ${Ident} (table ${table}, IDs like ${prefix}_…)\n  API:       /v1/${org ? "orgs/{orgId}/" : ""}${route}, for ${org ? "the organisation's" : "the signed-in user's"} ${pws.join(" ")}\n  Fields:\n${fields.map((f) => `    ${f.name.padEnd(20)} ${fieldDesc(f)}`).join("\n")}\n  Files:\n${changes.map((c) => `    ${c.path}`).join("\n")}`;
  const plan: Plan = {
    generator: "resource",
    name: Ident,
    summary,
    changes,
    next: ["go run ./cmd/migrate", "go run ./cmd/api openapi --dir api", "go test ./internal/app -run TestPublicSurface -update", "go test ./..."],
    result: { name: Ident, package: pkg, table, route: `/v1/${org ? "orgs/{orgId}/" : ""}${route}`, files: changes.map((c) => c.path), dry_run: true },
  };
  return { plan, applied: false };
}

/* ---------- module (v0.2: gorbital.Main apps) ---------- */

function modulesGen(pkgs: string[]): string {
  const sorted = [...pkgs].sort();
  return `// Code generated by orb; DO NOT EDIT.\n\n// Package modules lists every module under internal/modules, sorted by name.\npackage modules\n\nimport (\n\t"gorbital.dev"\n\n${sorted.map((p) => `\t"${APP_MODULE}/internal/modules/${p}"`).join("\n")}\n)\n\n// All returns the app's modules for gorbital.Main.\nfunc All() []gorbital.Module {\n\treturn []gorbital.Module{\n${sorted.map((p) => `\t\t${p}.Module(),`).join("\n")}\n\t}\n}\n`;
}

const pascal = (snakeName: string) => snakeName.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("");

/** The module generator's plural: -lf, -eaf and -ife become -ves; the rest like the resource generator. */
const modulePluralize = (w: string) => (/(l|ea|i)fe?$/.test(w) ? w.replace(/fe?$/, "ves") : pluralize(w));

function planModule(input: Record<string, unknown>): GeneratorResponse | Problem {
  const name = str(input.name);
  if (!name || name.length > 40 || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return usage("module name must start with a letter and use letters, digits, hyphens or underscores (max 40), such as Shelf");
  const fields = parseFields(input.fields, true);
  if (!Array.isArray(fields)) return fields;
  const ws = words(name);
  const pws = str(input.plural) ? words(str(input.plural)) : [...ws.slice(0, -1), modulePluralize(ws[ws.length - 1])];
  const Ident = ident(ws);
  const Plural = ident(pws);
  const pkg = pws.join("");
  const table = pws.join("_");
  const org = input.org === true;
  const route = org ? `/v1/orgs/{orgId}/${pws.join("-")}` : `/v1/${pws.join("-")}`;
  const snakeName = ws.join("_");
  const prefix = str(input.id_prefix) || (snakeName[0] + snakeName.slice(1).replace(/[aeiou_]/g, "")).slice(0, 3);
  if (!/^[a-z]{2,8}$/.test(prefix)) return usage(`ID prefix "${prefix}" must be 2 to 8 lowercase letters; pass --id-prefix`);
  if (Plural === Ident) return usage(`the plural of ${Ident} must differ from the name; pass --plural`);
  if (modules.has(pkg)) return conflict(`internal/modules/${pkg} exists; choose another name, or edit the module by hand`);
  const dir = `internal/modules/${pkg}`;
  const imp = `${APP_MODULE}/${dir}`;
  const title = fields.find((f) => f.kind === "string" && !f.optional)!;
  const perms = [`${pkg}.${snakeName}.read`, `${pkg}.${snakeName}.write`];
  const goFields = fields.map((f) => `\t${pascal(f.name)} ${f.kind === "enum" ? Ident + pascal(f.name) : "string"} \`json:"${f.name}"\``).join("\n");
  const enums = fields
    .filter((f) => f.kind === "enum")
    .map((f) => `\n// ${Ident}${pascal(f.name)} is one of ${f.values.join(", ")}; ${f.values[0]} by default.\ntype ${Ident}${pascal(f.name)} string\n\nconst (\n${f.values.map((v) => `\t${Ident}${pascal(f.name)}${pascal(v)} ${Ident}${pascal(f.name)} = "${v}"`).join("\n")}\n)\n`)
    .join("");
  const checks = fields
    .map((f) =>
      f.kind === "string"
        ? `\tif n := utf8.RuneCountInString(f.${pascal(f.name)}); n < ${f.optional ? 0 : 1} || n > 100 {\n\t\treturn &FieldError{Field: "${f.name}", Message: "must be ${f.optional ? "at most 100" : "1 to 100"} characters"}\n\t}`
        : f.kind === "text"
          ? `\tif utf8.RuneCountInString(f.${pascal(f.name)}) > 2000 {\n\t\treturn &FieldError{Field: "${f.name}", Message: "must be at most 2000 characters"}\n\t}`
          : `\tswitch f.${pascal(f.name)} {\n\tcase ${f.values.map((v) => `${Ident}${pascal(f.name)}${pascal(v)}`).join(", ")}:\n\tdefault:\n\t\treturn &FieldError{Field: "${f.name}", Message: "must be one of ${f.values.join(", ")}"}\n\t}`,
    )
    .join("\n");
  const op = (verb: string, doc: string, perm: string, sig: string, body: string) =>
    `package usecase\n\nimport (\n\t"context"\n\n\t"${imp}/domain"\n\t"gorbital.dev/actor"\n)\n\n// ${verb} ${doc}; needs ${perm}.\nfunc (s *Service) ${verb}(${sig}) {\n\tif err := actor.Require(ctx, "${perm}"); err != nil {\n\t\treturn ${verb === "Delete" ? "err" : "nil, err"}\n\t}\n${body}\n}\n`;
  const withID = (src: string) => src.replace('\t"gorbital.dev/actor"\n', '\t"gorbital.dev/actor"\n\t"gorbital.dev/id"\n');
  const v = version();
  const changes: PlanChange[] = [
    change(`${dir}/module.go`, `// Package ${pkg} is the ${ws.join(" ")} module: records that belong to the signed-in user.\npackage ${pkg}\n\nimport (\n\t"${imp}/delivery"\n\t"${imp}/domain"\n\t"${imp}/repository"\n\t"${imp}/usecase"\n\t"gorbital.dev"\n)\n\n// Module wires the layers; modules.gen.go lists it.\nfunc Module() gorbital.Module {\n\treturn gorbital.Module{\n\t\tName:        "${pkg}",\n\t\tPermissions: []string{"${perms[0]}", "${perms[1]}"},\n\t\tErrors: gorbital.Errors{\n\t\t\tdomain.Err${Ident}NotFound:        {Status: 404, Code: "${snakeName}_not_found"},\n\t\t\tdomain.Err${Ident}VersionConflict: {Status: 409, Code: "${snakeName}_version_conflict"},\n${fields.filter((f) => f.unique).map((f) => `\t\t\tdomain.Err${Ident}${pascal(f.name)}Taken: {Status: 409, Code: "${snakeName}_${f.name}_taken"},\n`).join("")}\t\t},\n\t\tRoutes: func(r *gorbital.Router, deps gorbital.Deps) {\n\t\t\tsvc := usecase.New(repository.New(deps.DB))\n\t\t\tdelivery.Routes(r, svc)\n\t\t},\n\t}\n}\n`),
    change(`${dir}/domain/${snakeName}.go`, `package domain\n\nimport (\n\t"time"\n\t"unicode/utf8"\n)\n${enums}\n// ${Ident} is one ${ws.join(" ")}. IDs look like ${prefix}_….\ntype ${Ident} struct {\n\tID      string \`json:"id"\`\n\tOwnerID string \`json:"owner_id"\`\n\t${Ident}Fields\n\tVersion   int       \`json:"version"\`\n\tCreatedAt time.Time \`json:"created_at"\`\n\tUpdatedAt time.Time \`json:"updated_at"\`\n}\n\n// ${Ident}Fields is what a caller sets.\ntype ${Ident}Fields struct {\n${goFields}\n}\n\n// Validate checks the fields' lengths and values.\nfunc (f ${Ident}Fields) Validate() error {\n${checks}\n\treturn nil\n}\n`),
    change(`${dir}/domain/errors.go`, `package domain\n\nimport "errors"\n\nvar (\n\tErr${Ident}NotFound        = errors.New("${snakeName} not found")\n\tErr${Ident}VersionConflict = errors.New("${snakeName} changed since it was read")\n${fields.filter((f) => f.unique).map((f) => `\tErr${Ident}${pascal(f.name)}Taken = errors.New("${snakeName} ${f.name} taken")\n`).join("")})\n\n// FieldError says which field is wrong.\ntype FieldError struct{ Field, Message string }\n\nfunc (e *FieldError) Error() string { return e.Field + " " + e.Message }\n`),
    change(`${dir}/domain/${snakeName}_test.go`, `package domain\n\nimport "testing"\n\nfunc TestValidate(t *testing.T) {\n\tf := ${Ident}Fields{${pascal(title.name)}: "Example"${fields.filter((f) => f.kind === "enum").map((f) => `, ${pascal(f.name)}: ${Ident}${pascal(f.name)}${pascal(f.values[0])}`).join("")}}\n\tif err := f.Validate(); err != nil {\n\t\tt.Fatalf("valid fields refused: %v", err)\n\t}\n\tf.${pascal(title.name)} = ""\n\tif err := f.Validate(); err == nil {\n\t\tt.Fatal("empty ${title.name} accepted")\n\t}\n}\n`),
    change(`${dir}/usecase/ports.go`, `package usecase\n\nimport (\n\t"context"\n\n\t"${imp}/domain"\n)\n\n// Store is what the use cases need from the repository.\ntype Store interface {\n\tInsert(ctx context.Context, x *domain.${Ident}) error\n\tGet(ctx context.Context, ownerID, id string) (*domain.${Ident}, error)\n\tList(ctx context.Context, ownerID string, q ListQuery) ([]domain.${Ident}, string, error)\n\tUpdate(ctx context.Context, x *domain.${Ident}) error\n\tDelete(ctx context.Context, ownerID, id string) error\n}\n\n// Service holds the ${pws.join(" ")} use cases.\ntype Service struct{ store Store }\n\n// New wires the service.\nfunc New(store Store) *Service { return &Service{store: store} }\n`),
    change(`${dir}/usecase/create_${snakeName}.go`, withID(op("Create", `makes a ${ws.join(" ")} for the signed-in user`, perms[1], `ctx context.Context, f domain.${Ident}Fields) (*domain.${Ident}, error`, `\tif err := f.Validate(); err != nil {\n\t\treturn nil, err\n\t}\n\tx := &domain.${Ident}{ID: id.New("${prefix}"), OwnerID: actor.UserID(ctx), ${Ident}Fields: f}\n\treturn x, s.store.Insert(ctx, x)`))),
    change(`${dir}/usecase/get_${snakeName}.go`, op("Get", `reads one of the user's ${pws.join(" ")}`, perms[0], `ctx context.Context, id string) (*domain.${Ident}, error`, `\treturn s.store.Get(ctx, actor.UserID(ctx), id)`)),
    change(`${dir}/usecase/list_${table}.go`, op("List", `pages through the user's ${pws.join(" ")}, sorted by ${title.name}`, perms[0], `ctx context.Context, q ListQuery) ([]domain.${Ident}, string, error`, `\treturn s.store.List(ctx, actor.UserID(ctx), q.Normalise())`).replace("return nil, err\n\t}", "return nil, \"\", err\n\t}")),
    change(`${dir}/usecase/update_${snakeName}.go`, op("Update", `changes a ${ws.join(" ")} at the version the caller read`, perms[1], `ctx context.Context, id string, version int, f domain.${Ident}Fields) (*domain.${Ident}, error`, `\tif err := f.Validate(); err != nil {\n\t\treturn nil, err\n\t}\n\tx := &domain.${Ident}{ID: id, OwnerID: actor.UserID(ctx), Version: version, ${Ident}Fields: f}\n\treturn x, s.store.Update(ctx, x)`)),
    change(`${dir}/usecase/delete_${snakeName}.go`, op("Delete", `removes a ${ws.join(" ")}`, perms[1], `ctx context.Context, id string) error`, `\treturn s.store.Delete(ctx, actor.UserID(ctx), id)`).replace(") error) {", ") error {")),
    change(`${dir}/usecase/${table}_test.go`, `package usecase_test\n\nimport "testing"\n\nfunc TestNeedsPermissions(t *testing.T) {\n\tt.Skip("runs on PostgreSQL: go test ./... with DATABASE_URL")\n}\n`),
    change(`${dir}/repository/store.go`, `package repository\n\nimport "github.com/jackc/pgx/v5/pgxpool"\n\n// Store runs the hand-written SQL for ${table}; another user's rows are never read.\ntype Store struct{ pool *pgxpool.Pool }\n\n// New wraps the pool.\nfunc New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }\n`),
    change(`${dir}/delivery/routes.go`, `package delivery\n\nimport (\n\t"${imp}/usecase"\n\t"gorbital.dev"\n\t"gorbital.dev/guard"\n)\n\n// Routes mounts ${route}; every route needs a signed-in user.\nfunc Routes(r *gorbital.Router, svc *usecase.Service) {\n\th := &handlers{svc: svc}\n\tg := r.Group("${route}")\n\tgorbital.Get(g, "", h.list${Plural}, guard.Permission("${perms[0]}"))\n\tgorbital.Post(g, "", h.create${Ident}, guard.Permission("${perms[1]}"), gorbital.Status(201))\n\tgorbital.Get(g, "/{id}", h.get${Ident}, guard.Permission("${perms[0]}"))\n\tgorbital.Patch(g, "/{id}", h.update${Ident}, guard.Permission("${perms[1]}"))\n\tgorbital.Delete(g, "/{id}", h.delete${Ident}, guard.Permission("${perms[1]}"), gorbital.Status(204))\n}\n`),
    change(`${dir}/delivery/handlers.go`, `package delivery\n\nimport (\n\t"context"\n\n\t"${imp}/domain"\n\t"${imp}/usecase"\n)\n\ntype handlers struct{ svc *usecase.Service }\n\ntype ${snakeName}Output struct{ Body domain.${Ident} }\n\ntype createInput struct{ Body domain.${Ident}Fields }\n\nfunc (h *handlers) create${Ident}(ctx context.Context, in *createInput) (*${snakeName}Output, error) {\n\tx, err := h.svc.Create(ctx, in.Body)\n\tif err != nil {\n\t\treturn nil, err\n\t}\n\treturn &${snakeName}Output{Body: *x}, nil\n}\n`),
    change(`${dir}/delivery/handlers_test.go`, `package delivery_test\n\nimport "testing"\n\nfunc Test${Plural}Routes(t *testing.T) {\n\tt.Skip("end to end on PostgreSQL: creates, lists, updates and deletes; another user's requests get 404")\n}\n`),
    change(`db/migrations/${v}_${table}.sql`, `-- ${Plural}: records that belong to the signed-in user (orb gen module).\n\n-- +goose Up\nCREATE TABLE ${table} (\n    id text PRIMARY KEY,\n    owner_id text NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,\n${fields.map((f) => `    ${f.optional ? `${f.name} text NOT NULL DEFAULT '' CHECK (char_length(${f.name}) <= 100)` : column(f)},`).join("\n")}\n    version integer NOT NULL DEFAULT 1,\n    created_at timestamptz NOT NULL DEFAULT now(),\n    updated_at timestamptz NOT NULL DEFAULT now()\n);\n${fields.filter((f) => f.unique).map((f) => `CREATE UNIQUE INDEX ${table}_owner_id_${f.name}_key ON ${table} (owner_id, lower(${f.name}));\n`).join("")}CREATE INDEX ${table}_owner_id_${title.name}_sort ON ${table} (owner_id, ${title.name}, id);\n`),
    change("internal/modules/modules.gen.go", modulesGen([...[...modules].filter((m) => tree.get("internal/modules/modules.gen.go")!.includes(`/modules/${m}"`)), pkg])),
  ];
  const migration = changes.find((c) => c.path.startsWith("db/migrations/"))!.path;
  const fieldDesc = (f: Field) => (f.kind === "string" ? `string, ${f.optional ? "optional, up to 100" : "1 to 100"} characters${f.unique ? ", unique" : ""}` : f.kind === "text" ? "text, up to 2000 characters" : `one of ${f.values.join(", ")}`);
  const summary = `  Module:    ${pkg} (${Ident}, table ${table}, IDs like ${prefix}_…)\n  API:       ${route}, for ${org ? `an organisation's ${pws.join(" ")} (guard.OrgMember)` : `the signed-in user's ${pws.join(" ")}`}\n  Permissions: ${perms.join(", ")}\n  Fields:\n${fields.map((f) => `    ${f.name.padEnd(20)} ${fieldDesc(f)}`).join("\n")}\n  Files:\n${changes.map((c) => `    ${c.path}`).join("\n")}`;
  const plan: Plan = {
    generator: "module",
    name: Ident,
    summary,
    changes,
    next: ["go run ./cmd/migrate", "go test ./internal/modules/" + pkg + "/...", "Give roles the permissions in the admin API: " + perms.join(", ")],
    result: { name: Ident, module: pkg, route, table, scope: org ? "org" : "user", permissions: perms, migration, files: changes.map((c) => c.path), dry_run: false },
  };
  return { plan, applied: false };
}

/* ---------- middleware ---------- */

function planMiddleware(input: Record<string, unknown>): GeneratorResponse | Problem {
  const name = str(input.name);
  const module = str(input.module);
  const global = input.global === true;
  const guard = input.guard === true;
  if (!name || name.length > 60 || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return usage("middleware name must start with a letter and use letters, digits, hyphens or underscores (max 60), such as RequireClientVersion");
  if (module && global) return usage("--module and --global can't be used together");
  if (guard && !module) return usage("--guard needs --module: a guard is a route option of one module");
  if (!module && !global) return usage("pass --module <name> or --global");
  if (module && !/^[a-z][a-z0-9_]*$/.test(module)) return usage(`--module "${module}" must be a lowercase identifier, such as books`);
  if (module && !modules.has(module)) return usage(`module ${module} not found: internal/modules/${module} doesn't exist (have ${[...modules].sort().join(", ")})`);
  const ws = words(name);
  const Ident = ident(ws);
  const snakeName = ws.join("_");
  const kind = guard ? "guard" : global ? "global" : "module";
  const pkg = global ? "middleware" : "delivery";
  const dir = global ? "internal/middleware" : `internal/modules/${module}/delivery`;
  const file = `${dir}/${snakeName}.go`;
  const test = `${dir}/${snakeName}_test.go`;
  if (tree.has(file)) return conflict(`${file} exists`);
  const errName = `Err${Ident.replace(/^Require/, "")}`;
  const content =
    kind === "guard"
      ? `package delivery\n\nimport (\n\t"context"\n\t"errors"\n\n\t"gorbital.dev/guard"\n)\n\n// ${errName} is what ${Ident} refuses with; module.go maps it to a status and a code.\nvar ${errName} = errors.New("${ws.join(" ")} refused")\n\n// ${Ident} is a route option: add it to a route in routes.go.\nvar ${Ident} = guard.New(guard.Spec{\n\tName:   "${snakeName}",\n\tErrors: []error{${errName}},\n\tCheck: func(ctx context.Context, req guard.Request) error {\n\t\t// TODO: return ${errName} to refuse, nil to allow. req.PathParam("id") reads the path.\n\t\treturn nil\n\t},\n})\n`
      : `package ${pkg}\n\nimport "net/http"\n\n// ${Ident} runs before the handlers it wraps${global ? " on every request, after authentication" : ` of the ${module} module`}.\nfunc ${Ident}(next http.Handler) http.Handler {\n\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {\n\t\t// TODO: refuse with httpx.WriteProblem, or call next.\n\t\tnext.ServeHTTP(w, r)\n\t})\n}\n`;
  const testContent =
    kind === "guard"
      ? `package delivery\n\nimport (\n\t"context"\n\t"testing"\n\n\t"gorbital.dev/guard/guardtest"\n)\n\nfunc Test${Ident}(t *testing.T) {\n\tif err := guardtest.Check(context.Background(), ${Ident}, guardtest.Request{}); err != nil {\n\t\tt.Fatalf("refused: %v", err)\n\t}\n}\n`
      : `package ${pkg}\n\nimport (\n\t"net/http"\n\t"net/http/httptest"\n\t"testing"\n)\n\nfunc Test${Ident}(t *testing.T) {\n\tok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })\n\trec := httptest.NewRecorder()\n\t${Ident}(ok).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))\n\tif rec.Code != http.StatusNoContent {\n\t\tt.Fatalf("status %d, want 204", rec.Code)\n\t}\n}\n`;
  const changes = [change(file, content), change(test, testContent)];
  const wire = kind === "guard" ? `gorbital.Get(g, "/{id}", h.getBook, ${Ident})` : kind === "global" ? `gorbital.WithMiddleware(middleware.${Ident})` : `gorbital.Use(delivery.${Ident})`;
  const next =
    kind === "guard"
      ? [`Add ${Ident} to the routes it protects in internal/modules/${module}/delivery/routes.go, such as:`, `  ${wire}`, `Map ${errName} in internal/modules/${module}/module.go, such as {Status: 403, Code: "${snakeName}_refused"}`, `go test ./internal/modules/${module}/...`]
      : kind === "global"
        ? ["Add it to gorbital.Main in cmd/api/main.go (orb never edits main.go):", `  ${wire}`, "go test ./internal/middleware/..."]
        : [`Add it to routes in internal/modules/${module}/delivery/routes.go:`, `  ${wire}`, `or to every route of the module: Middleware: []httpx.Middleware{delivery.${Ident}} in internal/modules/${module}/module.go`, `go test ./internal/modules/${module}/...`];
  const summary = `  ${kind === "guard" ? "Guard" : kind === "global" ? "Global middleware" : "Middleware"}: ${Ident}${module ? ` (module ${module})` : ""}\n  Files:\n    ${file}\n    ${test}`;
  return { plan: { generator: "middleware", name: Ident, summary, changes, next, result: { name: Ident, kind, module, package: pkg, file, test, files: [file, test], wire, dry_run: false } }, applied: false };
}

/* ---------- add-mail ---------- */

function planAddMail(input: Record<string, unknown>): GeneratorResponse | Problem {
  let provider = str(input.provider);
  const host = str(input.smtp_host);
  let port = str(input.smtp_port);
  let tls = str(input.smtp_tls).toLowerCase();
  const username = str(input.smtp_username);
  if (!provider) provider = host ? "smtp" : "resend";
  if (provider !== "resend" && provider !== "smtp") return usage(`provider must be resend or smtp, got "${provider}"`);
  if (provider === "smtp") {
    if (host && !/^[A-Za-z0-9.-]+$/.test(host)) return usage("--smtp-host must be a host name such as smtp.postmarkapp.com");
    if (!port) port = "587";
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) return usage(`--smtp-port must be a port number such as 587, got "${port}"`);
    if (!tls) tls = port === "465" ? "tls" : "starttls";
    if (!["starttls", "tls", "none"].includes(tls)) return usage(`--smtp-tls must be starttls, tls or none, got "${tls}"`);
    if (/\s/.test(username)) return usage("--smtp-username must be a single word");
  }
  const label = provider === "smtp" ? "SMTP" : "Resend";
  if (provider === mail) return { plan: { generator: "add-mail", name: label, summary: `The app already sends email with ${label}; nothing to change.`, changes: [], next: [] }, applied: false };
  const env = tree.get(".env")!;
  const envValues = provider === "smtp" ? mailBlock("smtp").replace("SMTP_HOST=", `SMTP_HOST=${host}`).replace("SMTP_PORT=587", `SMTP_PORT=${port}`).replace("SMTP_TLS=starttls", `SMTP_TLS=${tls}`).replace("SMTP_USERNAME=", `SMTP_USERNAME=${username}`) : mailBlock("resend");
  const swap = (s: string, block: string) => s.replace(/# orb:begin mail[\s\S]*?# orb:end mail\n/, block);
  const goMod = tree.get("go.mod")!;
  const wantModule = `gorbital.dev/mail/${provider}`;
  const changes: PlanChange[] = [
    change("internal/app/infra_mail.go", provider === "smtp" ? INFRA_MAIL_SMTP : INFRA_MAIL_RESEND),
    change("internal/app/infra_mail_test.go", `package app\n\nimport "testing"\n\nfunc TestMailer(t *testing.T) {\n${provider === "smtp" ? '\tt.Setenv("SMTP_HOST", "smtp.example.com")\n\tt.Setenv("SMTP_PORT", "587")' : '\tt.Setenv("RESEND_API_KEY", "re_test")'}\n\tif _, err := newMailer(); err != nil {\n\t\tt.Fatal(err)\n\t}\n}\n`),
    change(".env.example", swap(tree.get(".env.example")!, mailBlock(provider))),
    change(".env", swap(env, envValues)),
    change("gorbital.yaml", manifest(provider, rls)),
    change("gorbital.lock", lockFile(provider, rls, 2)),
  ];
  const saved = provider === "smtp" ? ["SMTP_HOST", "SMTP_PORT", "SMTP_TLS", ...(username ? ["SMTP_USERNAME"] : [])] : [];
  const summary = `  Provider:  ${label}\n${provider === "smtp" ? `  Server:    ${host || "(add SMTP_HOST to .env)"}:${port} (${tls})\n` : ""}  Changes:\n    internal/app/infra_mail.go\n    internal/app/infra_mail_test.go\n    .env.example\n    .env${saved.length ? ` (saves ${saved.join(", ")})` : ""}\n    gorbital.yaml\n    gorbital.lock`;
  const next = [
    `go.mod gains ${wantModule} (go mod edit), then go mod tidy runs`,
    "Next steps:",
    provider === "smtp" ? `  1. ${host ? "✓ The SMTP server is saved in .env" : "Add the SMTP server to .env: SMTP_HOST=…"}\n     Add the password to .env: SMTP_PASSWORD=…` : "  1. Get an API key at https://resend.com/api-keys and add it to .env: RESEND_API_KEY=…\n     Verify your domain at https://resend.com/domains",
    provider === "smtp" ? "  2. Make sure your SMTP provider allows the address you send from" : "  2. Set the sender to an address on that domain",
    "  3. Set the sender in the admin API; it applies at once, without a restart:",
    '       PUT /ops/settings/mail.from_email  {"value": "hello@yourdomain.com", "version": 0, "reason": "our domain"}',
    "  4. Send yourself a test email:",
    '       POST /ops/mail/test  {"to": "you@example.com"}',
    "",
    "In development every email goes to the Mail page; set MAIL_DELIVERY=provider in .env to send real email.",
  ];
  void goMod;
  return { plan: { generator: "add-mail", name: label, summary, changes, next, result: { provider } }, applied: false };
}

/* ---------- add-storage ---------- */

function planAddStorage(input: Record<string, unknown>): GeneratorResponse | Problem {
  const driver = str(input.driver) || "local";
  if (!["local", "s3", "spaces", "r2", "minio"].includes(driver)) return usage(`--driver must be local, s3, spaces, r2 or minio, got "${driver}"`);
  const v: Record<string, string> = { endpoint: str(input.endpoint), region: str(input.region), bucket: str(input.bucket), access_key: str(input.access_key), public_url: str(input.public_url) };
  if (driver === "minio") {
    v.endpoint ||= "127.0.0.1:9000";
    v.access_key ||= "minioadmin";
    v.bucket ||= portalStatus.project.name;
  }
  if (driver === "s3" && !v.region) return usage("--region is required for s3 (the endpoint follows from it)");
  if (driver === "spaces" && !v.region) return usage("--region is required for spaces, such as nyc3");
  if (driver !== "local" && driver !== "minio" && !v.bucket) return usage("--bucket is required");
  const swap = (s: string) => s.replace(/# orb:begin storage[\s\S]*?# orb:end storage\n/, storageBlock(driver, v));
  const changes: PlanChange[] = [change(".env.example", swap(tree.get(".env.example")!)), change(".env", swap(tree.get(".env")!))];
  if (driver === "minio") {
    const compose = tree.get("compose.yaml")!;
    if (!compose.includes("  minio:")) changes.push(change("compose.yaml", compose + MINIO_SERVICE));
  }
  const next = driver === "local" ? ["Files land under .orb/storage; nothing else to set up."] : driver === "minio" ? ["orb dev starts MinIO from compose.yaml. Create the bucket once in its console (http://127.0.0.1:9001, minioadmin / minioadmin) or with `mc mb`."] : ["Put STORAGE_SECRET_KEY in .env (never in the command line).", "Restart the app so it reads the new storage settings.", "docs/guides/storage.md"];
  return { plan: { generator: "add-storage", name: driver, summary: `File storage with ${driver}: ${changes.map((c) => c.path).join(", ")}`, changes, next, result: { driver, env: v } }, applied: false };
}

/* ---------- add-rls, add-orgs ---------- */

function planAddRLS(): GeneratorResponse | Problem {
  if (portalStatus.project.tenancy !== "multi") return usage("row-level security separates organisations' data, and this app is single-tenant; add organisations first (orb add orgs)");
  if (rls) return { plan: { generator: "add-rls", name: "rls", summary: "The app already has row-level security; nothing to change.", changes: [], next: [] }, applied: false };
  const migration = `db/migrations/${version()}_row_level_security.sql`;
  const policy = `-- Row-level security: a fifth isolation layer under the organisation checks (ADR-0061).\n-- Forces RLS with the org_isolation policy on every table with org_id NOT NULL,\n-- except org_members and org_invitations.\n\n-- +goose Up\n-- +goose StatementBegin\nDO $$\nDECLARE\n    t text;\nBEGIN\n    FOR t IN\n        SELECT c.table_name FROM information_schema.columns c\n        WHERE c.table_schema = 'public' AND c.column_name = 'org_id' AND c.is_nullable = 'NO'\n          AND c.table_name NOT IN ('org_members', 'org_invitations')\n    LOOP\n        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);\n        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);\n        EXECUTE format('CREATE POLICY org_isolation ON %I USING (org_id = current_setting(''app.org_id'', true))', t);\n    END LOOP;\nEND $$;\n-- +goose StatementEnd\n`;
  const changes: PlanChange[] = [change(migration, policy), change("gorbital.yaml", manifest(mail, true)), change("gorbital.lock", lockFile(mail, true, 3))];
  return {
    plan: {
      generator: "add-rls",
      name: "rls",
      summary: `Row-level security: the policy migration ${migration}, the manifest key and the lock.`,
      changes,
      next: ["Make sure DATABASE_URL connects as a role without superuser or BYPASSRLS (docs/guides/row-level-security.md)", "go run ./cmd/migrate, then orb doctor and go test ./...", "git add -A && git commit -m 'Add row-level security'"],
    },
    applied: false,
  };
}

function planAddOrgs(): GeneratorResponse {
  if (portalStatus.project.tenancy === "multi") return { plan: { generator: "add-orgs", name: "orgs", summary: "The app already has organisations; nothing to change.", changes: [], next: [] }, applied: false };
  const files = ["internal/app/app.go", "internal/app/orgs.go", "internal/app/permissions.go", "internal/modules/projects/domain/project.go", "internal/modules/projects/usecase/projects.go", "internal/modules/projects/delivery/projects.go", "db/migrations/20260918000001_orgs.sql", "db/migrations/20260918000002_orgs_convert.sql", "go.mod", "gorbital.yaml", "gorbital.lock"];
  return {
    plan: {
      generator: "add-orgs",
      name: "orgs",
      summary: `Turns the app multi-tenant on branch orb-add-orgs: organisations with members, roles and invitations; ${files.length} files change. orb add orgs builds the app, regenerates api/, records api/surface.json and commits on that branch; review it there.`,
      changes: files.map((path) => ({ path, kind: "modify" as const, content: "" })),
      next: ["Review the branch orb-add-orgs and merge it", "docs/guides/organisations.md"],
    },
    applied: false,
  };
}

/* ---------- The entry point ---------- */

const DIRTY = "the git repository has uncommitted changes; commit or stash them first, or pass --allow-dirty";

/**
 * Answers `generators/{name}/{plan|apply}` for the hub's generators;
 * undefined for `job` and `migration`, which other mocks answer. `input`
 * is the request's `input`; `allowDirty` its `allow_dirty`.
 */
export function mockGenerator(name: string, action: "plan" | "apply", input: Record<string, unknown>, allowDirty: boolean, log: Line): Response | undefined {
  let planned: GeneratorResponse | Problem;
  switch (name) {
    case "resource":
      planned = planResource(input);
      break;
    case "module":
      planned = planModule(input);
      break;
    case "middleware":
      planned = planMiddleware(input);
      break;
    case "add-mail":
      planned = planAddMail(input);
      break;
    case "add-storage":
      planned = planAddStorage(input);
      break;
    case "add-rls":
      planned = planAddRLS();
      break;
    case "add-orgs":
      planned = planAddOrgs();
      break;
    default:
      return undefined;
  }
  if ("status" in planned) return problemResponse(planned);
  if (action === "plan") return json(planned);
  const { plan } = planned;
  if (plan.changes.length === 0) return json({ plan, applied: true });
  if (name !== "add-orgs" && dirty && !allowDirty) return problemResponse(usage(DIRTY));
  if (name === "add-orgs") {
    log("orb", "orb add orgs: checking out branch orb-add-orgs");
    log("orb", `orb add orgs: merged ${plan.changes.length} files, go build ./..., go run ./cmd/api openapi --dir api`);
    log("orb", "orb add orgs: committed 'Add organisations' on orb-add-orgs; review and merge it");
  } else {
    apply(plan.changes);
    log("orb", `orb ${name.replace("-", " ")} ${plan.name}: wrote ${plan.changes.length} files`);
  }
  switch (name) {
    case "resource": {
      const r = plan.result as { package: string };
      modules.add(r.package);
      log("orb", `migration pending: ${plan.changes.find((c) => c.path.startsWith("db/migrations/"))?.path}; apply it from the Database page`);
      break;
    }
    case "module":
      modules.add((plan.result as { module: string }).module);
      log("orb", `migration pending: ${(plan.result as { migration: string }).migration}; apply it from the Database page`);
      break;
    case "add-mail": {
      mail = (plan.result as { provider: string }).provider;
      log("orb", `go mod tidy: gorbital.dev/mail/${mail} added`);
      break;
    }
    case "add-storage": {
      const r = plan.result as { driver: string; env: Record<string, string> };
      storageDriver = r.driver;
      setMockEnv({ STORAGE_DRIVER: r.driver, STORAGE_ENDPOINT: r.env.endpoint, STORAGE_REGION: r.env.region, STORAGE_BUCKET: r.env.bucket, STORAGE_ACCESS_KEY: r.env.access_key, STORAGE_PUBLIC_URL: r.env.public_url });
      break;
    }
    case "add-rls":
      rls = true;
      break;
  }
  return json({ plan, applied: true } satisfies GeneratorResponse);
}

/** What the tree says now, for tests: the mail provider, RLS, the storage driver and the dirty flag. */
export function mockGeneratorState() {
  return { mail, rls, storageDriver, dirty, modules: [...modules], files: [...tree.keys()] };
}
