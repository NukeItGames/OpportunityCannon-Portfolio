import { Agent } from "undici";
import { lookup } from "node:dns";
import { isIP } from "node:net";
export function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (isIP(address) === 6) {
    const first = parseInt(address.split(":")[0], 16);
    return (
      first >= 0x2000 &&
      first <= 0x3fff &&
      !address.toLowerCase().startsWith("2001:db8:")
    );
  }
  return false;
}
// Validate the addresses actually used by the connection, including every redirect.
// This blocks private-network access even when an untrusted public hostname resolves locally.
const dispatcher = new Agent({
  connect: {
    lookup: ((hostname: string, options: any, callback: any) =>
      lookup(hostname, { all: true }, (error, addresses) => {
        if (error) return callback(error);
        if (
          !addresses.length ||
          addresses.some((a) => !publicAddress(a.address))
        )
          return callback(
            new Error("Discovery only permits public Internet addresses"),
          );
        return options?.all
          ? callback(null, addresses)
          : callback(null, addresses[0].address, addresses[0].family);
      })) as any,
  },
});
import { canonical } from "./core";
export async function boundedText(r: Response, limit = 32000000) {
  const reader = r.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0,
    text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw Error("Source exceeds size limit");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
export async function request(url: string, resolved?: (url: string) => void) {
  canonical(url); // Validate without dropping a server-required trailing slash.
  let next = new URL(url).href;
  for (let i = 0; i < 5; i++) {
    const r = await fetch(next, {
      dispatcher,
      signal: AbortSignal.timeout(12000),
      redirect: "manual",
      headers: {
        "User-Agent": "OpportunityCannon/0.3.1 (personal opportunity research)",
      },
    } as any);
    if (r.status >= 300 && r.status < 400) {
      await r.body?.cancel();
      const target = new URL(r.headers.get("location") || "", next).href;
      canonical(target);
      next = target;
      continue;
    }
    if (!r.ok) {
      await r.body?.cancel();
      throw Error(
        `HTTP ${r.status}${r.status === 403 ? " — access restricted; review in browser" : ""}`,
      );
    }
    const text = await boundedText(r);
    resolved?.(next);
    return text;
  }
  throw Error("Too many redirects");
}
