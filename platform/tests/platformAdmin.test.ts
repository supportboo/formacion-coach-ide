import { describe, expect, it, vi } from "vitest";

async function load(env: Record<string, string>) {
  vi.resetModules();
  Object.assign(process.env, env);
  return (await import("../src/http/context.js")).isPlatformAdmin;
}

describe("superadmin needs a listed email AND a provisioned user id", { timeout: 30_000 }, () => {
  it("a new account registered with the admin email is not superadmin", async () => {
    const isPlatformAdmin = await load({ PLATFORM_ADMIN_EMAILS: "boss@x.com", PLATFORM_ADMIN_USER_IDS: "u-boss", DEV_AUTH: "false" });
    expect(isPlatformAdmin({ userEmail: "boss@x.com", userId: "u-boss" })).toBe(true);
    expect(isPlatformAdmin({ userEmail: "Boss@X.com", userId: "u-impostor" })).toBe(false);
    expect(isPlatformAdmin({ userEmail: "other@x.com", userId: "u-boss" })).toBe(false);
  });
  it("fails closed in production when no ids are provisioned", async () => {
    const isPlatformAdmin = await load({ PLATFORM_ADMIN_EMAILS: "boss@x.com", PLATFORM_ADMIN_USER_IDS: "", DEV_AUTH: "false" });
    expect(isPlatformAdmin({ userEmail: "boss@x.com", userId: "u-boss" })).toBe(false);
  });
});
