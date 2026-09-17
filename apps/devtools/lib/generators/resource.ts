/**
 * The resource generator's form as pure logic: the field editor's rules
 * (mirroring `cli/internal/recipes/resource.go`: ParseFields, parseField,
 * parseEnumValues, NewResourceData), the names the generator derives, the
 * `resourceInputJSON` the portal takes and the `orb gen resource` command.
 */

import { splitWords } from "@/lib/jobs/form";

export type FieldType = "string" | "text" | "enum";

export type ResourceField = {
  /** snake_case, up to 20 characters. */
  name: string;
  type: FieldType;
  /** Comma-separated enum values (2 to 20, snake_case, up to 30 characters each). */
  values: string;
  /** Unique among each owner's records, ignoring case; string fields only. */
  unique: boolean;
};

export type ResourceScope = "user" | "org";

export type ResourceForm = {
  name: string;
  fields: ResourceField[];
  /** Override of the derived plural (`People`); empty for the default. */
  plural: string;
  /** Override of the derived ID prefix (`prj`); empty for the default. */
  idPrefix: string;
  /** Who the records belong to; `org` needs the orgs module. */
  scope: ResourceScope;
};

export type ResourceErrors = Partial<Record<"name" | "plural" | "idPrefix" | "scope" | "fields", string>> & {
  /** One message per field row, by index. */
  fieldRows?: Record<number, string>;
};

/** What `orb gen resource` accepts as `{"input": …}` (`resourceInputJSON`); unknown keys are refused. */
export type ResourceGeneratorInput = {
  name: string;
  /** Specs as on the command line: `name:string:unique`. */
  fields: string[];
  plural?: string;
  id_prefix?: string;
  scope?: ResourceScope;
};

export const FIELD_TYPES: { value: FieldType; label: string; hint: string }[] = [
  { value: "string", label: "string", hint: "1 to 100 characters, required, sortable in lists; can be unique" },
  { value: "text", label: "text", hint: "up to 2000 characters, optional" },
  { value: "enum", label: "enum", hint: "one of 2 to 20 snake_case values; the first is the default; lists can filter by it" },
];

export const MAX_FIELDS = 20;

const snakePattern = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const resourceNamePattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
const idPrefixPattern = /^[a-z]{2,8}$/;

/** Columns, struct fields and query parameters every resource already has. */
const reservedFieldNames = new Set(["id", "owner_id", "org_id", "created_by", "version", "created_at", "updated_at", "created", "updated", "limit", "cursor", "sort", "after", "page", "params", "apply"]);

/** PostgreSQL's reserved key words, which can't name a table or column without quoting. */
const sqlReserved = new Set(
  `all analyse analyze and any array as asc asymmetric authorization binary both case cast check collate collation column concurrently constraint create cross current_catalog current_date current_role current_schema current_time current_timestamp current_user default deferrable desc distinct do else end except false fetch for foreign freeze from full grant group having ilike in initially inner intersect into is isnull join lateral leading left like limit localtime localtimestamp natural not notnull null offset on only or order outer overlaps placing primary references returning right select session_user similar some symmetric system_user table tablesample then to trailing true union unique user using variadic verbose when where window with`.split(/\s+/),
);

/** Go keywords, which can't name the module's package. */
const goKeywords = new Set(["break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough", "for", "func", "go", "goto", "if", "import", "interface", "map", "package", "range", "return", "select", "struct", "switch", "type", "var"]);

export function emptyField(): ResourceField {
  return { name: "", type: "string", values: "", unique: false };
}

export function defaultResourceForm(scope: ResourceScope = "user"): ResourceForm {
  return { name: "", fields: [{ name: "name", type: "string", values: "", unique: false }], plural: "", idPrefix: "", scope };
}

/** The spec the CLI takes for one field: `name:string:unique`, `notes:text`, `status:enum(open,done)`. */
export function fieldSpec(f: ResourceField): string {
  const name = f.name.trim();
  if (f.type === "enum") return `${name}:enum(${enumValues(f.values).join(",")})`;
  return `${name}:${f.type}${f.unique && f.type === "string" ? ":unique" : ""}`;
}

/** The enum values as typed, trimmed, empty ones dropped. */
export function enumValues(values: string): string[] {
  return values
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function identFromWords(words: string[]): string {
  return words.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : "")).join("");
}

/** `pluralize` from the recipes: -ies, -es or -s. */
export function pluralize(w: string): string {
  if (w.length > 1 && w.endsWith("y") && !"aeiou".includes(w[w.length - 2])) return w.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/.test(w)) return w + "es";
  return w + "s";
}

/** `deriveIDPrefix`: the first letter and the next consonants, up to three letters (`prj` for project). */
export function deriveIDPrefix(snake: string): string {
  const letters = snake.replace(/[^a-z]/g, "");
  if (!letters) return "";
  let out = letters[0];
  for (let i = 1; i < letters.length && out.length < 3; i++) {
    if (!"aeiou".includes(letters[i])) out += letters[i];
  }
  return out;
}

export type ResourceNames = {
  /** `Project` */
  ident: string;
  /** `project`: audit actions, error codes, file names */
  snake: string;
  /** `Projects` */
  plural: string;
  /** `projects`: the Go package and the module directory */
  pkg: string;
  /** `projects` */
  table: string;
  /** `projects`, as in /v1/projects */
  route: string;
  /** `prj` */
  idPrefix: string;
};

/** Every name `orb gen resource` derives from the resource's name (`NewResourceData`). */
export function resourceNames(name: string, plural = "", idPrefix = ""): ResourceNames {
  const words = splitWords(name.trim() || "Resource");
  const pluralWords = plural.trim() ? splitWords(plural.trim()) : [...words.slice(0, -1), pluralize(words[words.length - 1])];
  const snake = words.join("_");
  return {
    ident: identFromWords(words),
    snake,
    plural: identFromWords(pluralWords),
    pkg: pluralWords.join(""),
    table: pluralWords.join("_"),
    route: pluralWords.join("-"),
    idPrefix: idPrefix.trim() || deriveIDPrefix(snake),
  };
}

/** Checks one field like `parseField`; the message is the CLI's. */
export function validateField(f: ResourceField): string | undefined {
  const name = f.name.trim();
  if (!name) return "write it as name:type, such as title:string, notes:text or status:enum(open,closed)";
  if (name.length > 20 || !snakePattern.test(name)) return `field name "${name}" must be snake_case: lowercase letters, digits and single underscores, starting with a letter (max 20)`;
  if (reservedFieldNames.has(name) || sqlReserved.has(name) || name.endsWith("_sort")) return `field name "${name}" is reserved; choose another`;
  if (f.type === "enum") {
    const values = enumValues(f.values);
    if (values.length < 2 || values.length > 20) return `field ${name}: give 2 to 20 values, such as ${name}:enum(open,closed)`;
    const seen = new Set<string>();
    for (const v of values) {
      if (v.length > 30 || !snakePattern.test(v)) return `field ${name}: value "${v}" must be snake_case: lowercase letters, digits and single underscores, starting with a letter (max 30)`;
      if (seen.has(v)) return `field ${name}: value ${v} appears more than once`;
      seen.add(v);
    }
  }
  if (f.unique && f.type !== "string") return `field ${name}: only string fields can be unique`;
  return undefined;
}

/** Checks the whole form like the CLI does before planning; empty when it would plan. */
export function validateResourceForm(form: ResourceForm): ResourceErrors {
  const errors: ResourceErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = "give the resource a singular name, such as Project";
  else if (name.length > 40 || !resourceNamePattern.test(name)) errors.name = "resource name must start with a letter and use letters, digits, hyphens or underscores (max 40), such as Project";
  const plural = form.plural.trim();
  if (plural && (plural.length > 40 || !resourceNamePattern.test(plural))) errors.plural = "plural must start with a letter and use letters, digits, hyphens or underscores (max 40), such as People";
  const idPrefix = form.idPrefix.trim();
  if (idPrefix && !idPrefixPattern.test(idPrefix)) errors.idPrefix = `ID prefix "${idPrefix}" must be 2 to 8 lowercase letters`;
  if (!errors.name && !errors.plural) {
    const n = resourceNames(name, plural, idPrefix);
    if (n.plural === n.ident) errors.plural = `the plural of ${n.ident} must differ from the name; set one`;
    else if (goKeywords.has(n.pkg) || !/^[a-z][a-z0-9]*$/.test(n.pkg)) errors.plural = `"${n.pkg}" can't be used as a Go package name; choose another name or plural`;
    else if (sqlReserved.has(n.table)) errors.plural = `"${n.table}" is reserved in PostgreSQL; choose another name or plural`;
    else if (n.table.length > 30) errors.plural = `the table name "${n.table}" is too long (max 30 characters); set a shorter plural`;
    if (!errors.idPrefix && !idPrefixPattern.test(n.idPrefix)) errors.idPrefix = `ID prefix "${n.idPrefix}" must be 2 to 8 lowercase letters; set one`;
  }
  if (form.fields.length === 0) errors.fields = "add at least one field, such as name:string";
  else if (form.fields.length > MAX_FIELDS) errors.fields = `a resource can have at most ${MAX_FIELDS} fields`;
  const rows: Record<number, string> = {};
  const seen = new Set<string>();
  form.fields.forEach((f, i) => {
    const err = validateField(f);
    if (err) {
      rows[i] = err;
      return;
    }
    const n = f.name.trim();
    if (seen.has(n)) rows[i] = `field ${n} appears more than once`;
    seen.add(n);
  });
  if (Object.keys(rows).length) errors.fieldRows = rows;
  if (!errors.fields && !errors.fieldRows && !form.fields.some((f) => f.type === "string")) errors.fields = "add at least one string field, such as name:string; the first one is the title lists sort by";
  return errors;
}

/** The body for `generators/resource/plan` and `apply`: only the keys the portal accepts. */
export function toResourceInput(form: ResourceForm): ResourceGeneratorInput {
  const input: ResourceGeneratorInput = { name: form.name.trim(), fields: form.fields.map(fieldSpec) };
  if (form.plural.trim()) input.plural = form.plural.trim();
  if (form.idPrefix.trim()) input.id_prefix = form.idPrefix.trim();
  if (form.scope) input.scope = form.scope;
  return input;
}

function shellQuote(s: string): string {
  return /^[A-Za-z0-9_./:@%+=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/** The equivalent `orb gen resource …` command; enum fields are quoted, as the guide says. */
export function toResourceCommand(form: ResourceForm, allowDirty = false): string {
  const parts = ["orb gen resource", shellQuote(form.name.trim() || "Name"), ...form.fields.map((f) => shellQuote(fieldSpec(f)))];
  if (form.plural.trim()) parts.push("--plural", shellQuote(form.plural.trim()));
  if (form.idPrefix.trim()) parts.push("--id-prefix", shellQuote(form.idPrefix.trim()));
  if (form.scope) parts.push("--scope", form.scope);
  if (allowDirty) parts.push("--allow-dirty");
  return parts.join(" ");
}
