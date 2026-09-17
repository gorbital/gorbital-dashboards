import { describe, expect, it } from "vitest";
import { defaultMailForm, defaultStorageForm, defaultTLS, storageDefaults, storageFields, toMailCommand, toMailInput, toStorageCommand, toStorageInput, validateMailForm, validateStorageForm } from "./add";

describe("add mail", () => {
  it("sends only what was set, so the CLI's defaults apply", () => {
    expect(toMailInput(defaultMailForm())).toEqual({ provider: "resend" });
    expect(toMailInput({ ...defaultMailForm("smtp"), smtpHost: "smtp.postmarkapp.com", smtpUsername: "token" })).toEqual({ provider: "smtp", smtp_host: "smtp.postmarkapp.com", smtp_port: "587", smtp_username: "token" });
    expect(toMailInput({ ...defaultMailForm("smtp"), smtpPort: "465", smtpTLS: "tls" })).toEqual({ provider: "smtp", smtp_port: "465", smtp_tls: "tls" });
  });

  it("checks the SMTP fields like normalizeMail", () => {
    expect(validateMailForm(defaultMailForm())).toEqual({});
    expect(validateMailForm({ ...defaultMailForm("smtp"), smtpPort: "70000" }).smtpPort).toMatch(/port number/);
    expect(validateMailForm({ ...defaultMailForm("smtp"), smtpHost: "smtp host" }).smtpHost).toMatch(/host name/);
    expect(validateMailForm({ ...defaultMailForm("smtp"), smtpUsername: "a b" }).smtpUsername).toMatch(/spaces/);
    expect(validateMailForm({ ...defaultMailForm("smtp"), smtpHost: "smtp.example.com" })).toEqual({});
  });

  it("derives the encryption from the port and prints the command", () => {
    expect(defaultTLS("465")).toBe("tls");
    expect(defaultTLS("587")).toBe("starttls");
    expect(toMailCommand(defaultMailForm())).toBe("orb add mail --provider resend");
    expect(toMailCommand({ ...defaultMailForm("smtp"), smtpHost: "smtp.example.com", smtpPort: "2525", smtpTLS: "none", smtpUsername: "u" }, true)).toBe("orb add mail --provider smtp --smtp-host smtp.example.com --smtp-port 2525 --smtp-tls none --smtp-username u --allow-dirty");
  });
});

describe("add storage", () => {
  it("shows the driver's fields and MinIO's defaults", () => {
    expect(storageFields("local")).toEqual([]);
    expect(storageFields("s3")).toEqual(["region", "bucket", "accessKey", "publicUrl"]);
    expect(storageFields("r2")).toContain("endpoint");
    expect(storageDefaults("minio", "acme-api")).toEqual({ endpoint: "127.0.0.1:9000", accessKey: "minioadmin", bucket: "acme-api" });
    expect(storageDefaults("s3", "acme-api")).toEqual({});
  });

  it("wants a bucket and a region where the CLI does", () => {
    expect(validateStorageForm(defaultStorageForm())).toEqual({});
    expect(validateStorageForm(defaultStorageForm("minio"))).toEqual({});
    expect(validateStorageForm(defaultStorageForm("s3"))).toEqual({ bucket: "the bucket is required", region: "the region is required; the endpoint follows from it" });
    expect(validateStorageForm({ ...defaultStorageForm("r2"), bucket: "b", publicUrl: "files.example.com" }).publicUrl).toMatch(/http/);
    expect(validateStorageForm({ ...defaultStorageForm("spaces"), bucket: "b", region: "nyc3" })).toEqual({});
  });

  it("sends only the driver's fields and prints the command", () => {
    const f = { ...defaultStorageForm("s3"), region: "eu-west-1", bucket: "acme-files", accessKey: "AKIA1", endpoint: "ignored" };
    expect(toStorageInput(f)).toEqual({ driver: "s3", region: "eu-west-1", bucket: "acme-files", access_key: "AKIA1" });
    expect(toStorageCommand(f)).toBe("orb add storage --driver s3 --region eu-west-1 --bucket acme-files --access-key AKIA1");
    expect(toStorageInput(defaultStorageForm("minio"))).toEqual({ driver: "minio" });
    expect(toStorageCommand(defaultStorageForm("local"), true)).toBe("orb add storage --driver local --allow-dirty");
  });
});
