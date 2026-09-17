/**
 * The `orb add mail` and `orb add storage` forms as pure logic: the inputs
 * the portal takes (`addMailInputJSON`, `addStorageInputJSON`), the CLI's
 * checks (`normalizeMail`, `planStorage`) and the equivalent commands.
 */

export type MailProvider = "resend" | "smtp";
export type SMTPTLS = "starttls" | "tls" | "none";

export type MailForm = {
  provider: MailProvider;
  smtpHost: string;
  smtpPort: string;
  smtpTLS: SMTPTLS | "";
  smtpUsername: string;
};

/** What `generators/add-mail` accepts; secrets are never sent (put them in .env). */
export type AddMailInput = {
  provider: MailProvider;
  smtp_host?: string;
  smtp_port?: string;
  smtp_tls?: string;
  smtp_username?: string;
};

export const SMTP_PORTS: { value: string; label: string; tls: SMTPTLS }[] = [
  { value: "587", label: "587 · STARTTLS", tls: "starttls" },
  { value: "465", label: "465 · TLS", tls: "tls" },
  { value: "2525", label: "2525 · STARTTLS", tls: "starttls" },
  { value: "25", label: "25 · none", tls: "none" },
];

export function defaultMailForm(provider: MailProvider = "resend"): MailForm {
  return { provider, smtpHost: "", smtpPort: "587", smtpTLS: "", smtpUsername: "" };
}

/** The encryption the CLI picks for a port when none is given: `tls` for 465, `starttls` otherwise. */
export function defaultTLS(port: string): SMTPTLS {
  return port.trim() === "465" ? "tls" : "starttls";
}

export function validateMailForm(f: MailForm): Partial<Record<keyof MailForm, string>> {
  const errors: Partial<Record<keyof MailForm, string>> = {};
  if (f.provider !== "resend" && f.provider !== "smtp") errors.provider = `provider must be resend or smtp, got "${f.provider}"`;
  if (f.provider !== "smtp") return errors;
  const host = f.smtpHost.trim();
  if (host && !/^[A-Za-z0-9.-]+$/.test(host)) errors.smtpHost = "the SMTP server is a host name, such as smtp.postmarkapp.com";
  const port = f.smtpPort.trim();
  if (port && !(/^\d+$/.test(port) && Number(port) >= 1 && Number(port) <= 65535)) errors.smtpPort = `port must be a port number such as 587, got "${port}"`;
  if (f.smtpTLS && !["starttls", "tls", "none"].includes(f.smtpTLS)) errors.smtpTLS = `encryption must be starttls, tls or none, got "${f.smtpTLS}"`;
  if (/\s/.test(f.smtpUsername.trim())) errors.smtpUsername = "the username can't contain spaces";
  return errors;
}

/** The body for `generators/add-mail`: only what was set, so the CLI's defaults apply. */
export function toMailInput(f: MailForm): AddMailInput {
  const input: AddMailInput = { provider: f.provider };
  if (f.provider !== "smtp") return input;
  if (f.smtpHost.trim()) input.smtp_host = f.smtpHost.trim();
  if (f.smtpPort.trim()) input.smtp_port = f.smtpPort.trim();
  if (f.smtpTLS) input.smtp_tls = f.smtpTLS;
  if (f.smtpUsername.trim()) input.smtp_username = f.smtpUsername.trim();
  return input;
}

export function toMailCommand(f: MailForm, allowDirty = false): string {
  const parts = ["orb add mail", "--provider", f.provider];
  if (f.provider === "smtp") {
    if (f.smtpHost.trim()) parts.push("--smtp-host", f.smtpHost.trim());
    if (f.smtpPort.trim() && f.smtpPort.trim() !== "587") parts.push("--smtp-port", f.smtpPort.trim());
    if (f.smtpTLS && f.smtpTLS !== defaultTLS(f.smtpPort)) parts.push("--smtp-tls", f.smtpTLS);
    if (f.smtpUsername.trim()) parts.push("--smtp-username", f.smtpUsername.trim());
  }
  if (allowDirty) parts.push("--allow-dirty");
  return parts.join(" ");
}

/* ---------- Storage ---------- */

export type StorageDriver = "local" | "s3" | "spaces" | "r2" | "minio";

export type StorageForm = {
  driver: StorageDriver;
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  publicUrl: string;
};

/** What `generators/add-storage` accepts; the secret key goes in .env by hand. */
export type AddStorageInput = {
  driver: StorageDriver;
  endpoint?: string;
  region?: string;
  bucket?: string;
  access_key?: string;
  public_url?: string;
};

export type StorageFieldName = Exclude<keyof StorageForm, "driver">;

export const STORAGE_DRIVERS: { value: StorageDriver; label: string; hint: string; fields: StorageFieldName[] }[] = [
  { value: "local", label: "Local disk", hint: "files under STORAGE_LOCAL_DIR (.orb/storage); nothing to configure", fields: [] },
  { value: "minio", label: "MinIO", hint: "a MinIO service in compose.yaml that orb dev starts; 127.0.0.1:9000, minioadmin", fields: ["endpoint", "bucket", "accessKey", "publicUrl"] },
  { value: "s3", label: "Amazon S3", hint: "the endpoint follows from the region", fields: ["region", "bucket", "accessKey", "publicUrl"] },
  { value: "spaces", label: "DigitalOcean Spaces", hint: "the endpoint follows from the region (nyc3, ams3…)", fields: ["region", "bucket", "accessKey", "publicUrl"] },
  { value: "r2", label: "Cloudflare R2", hint: "the endpoint is <account id>.r2.cloudflarestorage.com", fields: ["endpoint", "bucket", "accessKey", "publicUrl"] },
];

export const STORAGE_FIELD_LABELS: Record<StorageFieldName, { label: string; hint: string; placeholder: string }> = {
  endpoint: { label: "Endpoint", hint: "the service's host", placeholder: "127.0.0.1:9000" },
  region: { label: "Region", hint: "such as us-east-1 or nyc3", placeholder: "us-east-1" },
  bucket: { label: "Bucket", hint: "the bucket name", placeholder: "acme-files" },
  accessKey: { label: "Access key", hint: "STORAGE_ACCESS_KEY; put STORAGE_SECRET_KEY in .env yourself", placeholder: "AKIA…" },
  publicUrl: { label: "Public URL", hint: "where objects are reachable when the bucket is public (optional)", placeholder: "https://files.example.com" },
};

export function defaultStorageForm(driver: StorageDriver = "local"): StorageForm {
  return { driver, endpoint: "", region: "", bucket: "", accessKey: "", publicUrl: "" };
}

/** The values the CLI fills in when a field is left empty (`planStorage`): MinIO's local defaults. */
export function storageDefaults(driver: StorageDriver, appName: string): Partial<Record<StorageFieldName, string>> {
  if (driver === "minio") return { endpoint: "127.0.0.1:9000", accessKey: "minioadmin", bucket: appName };
  return {};
}

/** The fields the driver reads; the others are neither shown nor sent. */
export function storageFields(driver: StorageDriver): StorageFieldName[] {
  return STORAGE_DRIVERS.find((d) => d.value === driver)?.fields ?? [];
}

export function validateStorageForm(f: StorageForm): Partial<Record<keyof StorageForm, string>> {
  const errors: Partial<Record<keyof StorageForm, string>> = {};
  if (!STORAGE_DRIVERS.some((d) => d.value === f.driver)) errors.driver = `driver must be local, s3, spaces, r2 or minio, got "${f.driver}"`;
  const fields = storageFields(f.driver);
  if (fields.includes("bucket") && f.driver !== "minio" && !f.bucket.trim()) errors.bucket = "the bucket is required";
  if (fields.includes("region") && !f.region.trim()) errors.region = "the region is required; the endpoint follows from it";
  if (f.publicUrl.trim() && !/^https?:\/\//.test(f.publicUrl.trim())) errors.publicUrl = "the public URL must start with http:// or https://";
  return errors;
}

export function toStorageInput(f: StorageForm): AddStorageInput {
  const input: AddStorageInput = { driver: f.driver };
  const keys: Record<StorageFieldName, keyof AddStorageInput> = { endpoint: "endpoint", region: "region", bucket: "bucket", accessKey: "access_key", publicUrl: "public_url" };
  for (const field of storageFields(f.driver)) {
    const v = f[field].trim();
    if (v) (input as Record<string, string>)[keys[field]] = v;
  }
  return input;
}

export function toStorageCommand(f: StorageForm, allowDirty = false): string {
  const parts = ["orb add storage", "--driver", f.driver];
  const flags: Record<StorageFieldName, string> = { endpoint: "--endpoint", region: "--region", bucket: "--bucket", accessKey: "--access-key", publicUrl: "--public-url" };
  for (const field of storageFields(f.driver)) {
    const v = f[field].trim();
    if (v) parts.push(flags[field], v);
  }
  if (allowDirty) parts.push("--allow-dirty");
  return parts.join(" ");
}
