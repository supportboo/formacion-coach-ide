import { describe, expect, it } from "vitest";
import { isPublicHttpUrl } from "../src/util/publicUrl.js";

describe("isPublicHttpUrl (SSRF guard)", () => {
  it.each([
    "http://127.0.0.1:8080/api", "http://127.0.0.1/", "http://localhost/", "http://169.254.169.254/latest/meta-data",
    "http://10.1.2.3/", "http://172.20.0.1/", "http://192.168.1.1/", "http://[::1]/", "http://[::ffff:127.0.0.1]/",
    "http://0.0.0.0/", "file:///etc/passwd", "https://93.184.215.14:5432/", "https://user:pw@93.184.215.14/",
  ])("blocks %s", async (u) => {
    expect(await isPublicHttpUrl(new URL(u))).toBe(false);
  });

  it("allows a public IP on a default port", async () => {
    expect(await isPublicHttpUrl(new URL("https://93.184.215.14/"))).toBe(true);
  });
});
