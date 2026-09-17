/**
 * Project Settings edits `.env` through the env editor, one key per value.
 * The screen never guesses a key: `GET /_portal/api/project` names the key
 * behind each value (`app.key`, `portal.key`…), and this module turns a
 * section's edit into the `{set, unset}` change the editor takes.
 */

import type { EnvChange } from "@/lib/api/env";
import { joinOrigins } from "./cors";

export type LogLevel = "debug" | "info" | "warn" | "error";
export const LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

export type LogFormat = "" | "json" | "text";
export const LOG_FORMATS: { value: LogFormat; label: string }[] = [
  { value: "", label: "default (json in production, text otherwise; json under orb dev)" },
  { value: "json", label: "json" },
  { value: "text", label: "text" },
];

export type MailDelivery = "devmail" | "mailpit" | "provider";
export const MAIL_DELIVERIES: { value: MailDelivery; label: string; hint: string }[] = [
  { value: "devmail", label: "devmail", hint: "orb dev's own catcher; every email lands on the Mail page" },
  { value: "mailpit", label: "mailpit", hint: "the Mailpit container from compose.yaml" },
  { value: "provider", label: "provider", hint: "the configured provider (Resend or SMTP): real email while developing" },
];

/** A value set through its key. `""` is a set empty value; `null` unsets the key. */
export function setKey(key: string, value: string | null): EnvChange {
  return value === null ? { unset: [key] } : { set: { [key]: value } };
}

/** `APP_ADDR`: host:port, or :port. */
export function addrError(addr: string): string | undefined {
  const a = addr.trim();
  if (!a) return "the address is required, such as 127.0.0.1:8080";
  const m = /^(.*):(\d{1,5})$/.exec(a);
  if (!m) return "write host:port, such as 127.0.0.1:8080 or :8080";
  const port = Number(m[2]);
  if (port < 1 || port > 65535) return "the port must be between 1 and 65535";
  return undefined;
}

/** `DEV_PORTAL_PORT`, `POSTGRES_PORT`: a port number, or empty for the default. */
export function portError(port: string, required = false): string | undefined {
  const p = port.trim();
  if (!p) return required ? "the port is required" : undefined;
  if (!/^\d{1,5}$/.test(p) || Number(p) < 1 || Number(p) > 65535) return "the port must be a number between 1 and 65535";
  return undefined;
}

/** The change for the CORS list: the joined value, or the key unset when the list is empty (CORS off). */
export function corsChange(key: string, origins: string[]): EnvChange {
  const value = joinOrigins(origins);
  return setKey(key, value === "" ? "" : value);
}

/** `APP_DOCS_ENABLED`: "true" or "false"; empty means the app's default (on in development). */
export function docsChange(key: string, enabled: boolean): EnvChange {
  return setKey(key, enabled ? "true" : "false");
}

/** The two logging keys, as the settings list them: level first, format second. */
export function loggingKeys(keys: string[] | undefined): { level: string; format: string } {
  return { level: keys?.[0] ?? "APP_LOG_LEVEL", format: keys?.[1] ?? "APP_LOG_FORMAT" };
}

/** The app's log format as the settings report it: "json (orb dev)" means the key is empty and orb dev set json. */
export function formatValue(format: string | undefined): LogFormat {
  if (format === "json" || format === "text") return format;
  return "";
}
