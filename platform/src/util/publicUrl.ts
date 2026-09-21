// SSRF guard for server-side fetches of user-supplied URLs (e.g. company website in onboarding).
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const PRIVATE = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.168.0.0", 16], ["224.0.0.0", 3],
] as const) PRIVATE.addSubnet(net, bits, "ipv4");
// IPv4-mapped IPv6 (::ffff:a.b.c.d) is matched against the IPv4 rules by BlockList itself.
for (const [net, bits] of [["::", 127], ["fc00::", 7], ["fe80::", 10]] as const) {
  PRIVATE.addSubnet(net, bits, "ipv6");
}

/** Only http(s) on default ports, no credentials, resolving exclusively to public IPs. */
// ponytail: resolve-then-fetch leaves a DNS-rebinding window; pin the IP with a custom agent if that ever matters.
export async function isPublicHttpUrl(u: URL): Promise<boolean> {
  if (!/^https?:$/.test(u.protocol) || u.port !== "" || u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true }).catch(() => []);
  return addrs.length > 0 && addrs.every((a) => !PRIVATE.check(a.address, a.family === 6 ? "ipv6" : "ipv4"));
}

/** fetch() that re-checks every redirect hop against isPublicHttpUrl. Null if blocked. */
export async function fetchPublic(raw: string, init: RequestInit = {}, maxHops = 4): Promise<Response | null> {
  let target = new URL(raw);
  for (let hop = 0; hop <= maxHops; hop++) {
    if (!(await isPublicHttpUrl(target))) return null;
    const r = await fetch(target, { ...init, redirect: "manual" });
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) { target = new URL(loc, target); continue; }
    return r;
  }
  return null;
}
