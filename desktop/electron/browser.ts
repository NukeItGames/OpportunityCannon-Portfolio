import { createServer, Server } from "node:net";
import { randomBytes, createHash } from "node:crypto";
import { Store, canonical } from "./core";
export const pipeName =
  "\\\\.\\pipe\\opportunity-cannon-" +
  createHash("sha256")
    .update(process.env.USERPROFILE || "")
    .digest("hex")
    .slice(0, 24);
export class BrowserBridge {
  server?: Server;
  seen = 0;
  ready = false;
  constructor(private db: Store) {}
  tasks(): any[] {
    return this.db
      .get("browser-tasks-v1", [])
      .filter((t: any) => t.expires > Date.now());
  }
  queue(url: string, kind: string, record: string) {
    const task = {
      id: randomBytes(24).toString("hex"),
      url: canonical(url),
      kind,
      record,
      expires: Date.now() + 15 * 60 * 1000,
      nonce: randomBytes(32).toString("hex"),
    };
    // A new explicit action supersedes an older task for this application.
    this.db.set("browser-tasks-v1", [
      ...this.tasks().filter((t) => t.record !== record),
      task,
    ]);
    return task.id;
  }
  message(m: any, fields: (t: any) => any) {
    if (!m || typeof m !== "object" || JSON.stringify(m).length > 8192)
      throw Error("Invalid message");
    this.seen = Date.now();
    const tasks = this.tasks();
    if (m.op === "poll") this.ready = m.ready === true;
    if (m.op === "poll")
      return {
        tasks: tasks.map(({ id, url, kind, expires, nonce }) => ({
          id,
          url,
          kind,
          expires,
          nonce,
        })),
      };
    const t = tasks.find((t) => t.id === m.id && t.nonce === m.nonce);
    if (!t || canonical(m.url) !== t.url)
      throw Error("Task expired or URL mismatch; use OPEN & FILL again");
    if (m.op === "claim") {
      if (t.claimed) throw Error("Task already delivered; retry from desktop");
      t.claimed = true;
      this.db.set("browser-tasks-v1", tasks);
      return {
        id: t.id,
        url: t.url,
        kind: t.kind,
        expires: t.expires,
        fields: fields(t),
      };
    }
    if (m.op === "ack") {
      this.db.set(
        "browser-tasks-v1",
        tasks.filter((x) => x.id !== t.id),
      );
      return { ok: true };
    }
    throw Error("Unsupported message");
  }
  start(fields: (t: any) => any, secret: string) {
    this.server = createServer((socket) => {
      let buffer = "";
      socket.setTimeout(10000, () => socket.destroy());
      socket.on("data", (chunk) => {
        buffer += chunk.toString();
        if (buffer.length > 8192) {
          socket.destroy();
          return;
        }
        if (buffer.includes("\n")) {
          try {
            socket.end(
              JSON.stringify(
                this.message(
                  (() => {
                    const envelope = JSON.parse(buffer.trim());
                    if (envelope.auth !== secret)
                      throw Error("Unauthorized host");
                    return envelope.message;
                  })(),
                  fields,
                ),
              ) + "\n",
            );
          } catch {
            socket.end(
              JSON.stringify({
                error:
                  "Task unavailable. Check exact application URL or retry OPEN & FILL in the desktop.",
              }) + "\n",
            );
          }
        }
      });
      socket.on("error", () => {});
    }).listen(pipeName);
    this.server.on("error", () => {});
  }
  status() {
    return {
      connected: Date.now() - this.seen < 45000 && this.ready,
      pending: this.tasks().length,
      notice:
        "Keep the desktop running. If disconnected, enable extension, grant HTTPS access, then Repair and reconnect. Tasks expire after 15 minutes; retry OPEN & FILL after a restart.",
    };
  }
}
