import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
export function configure(root = fileURLToPath(new URL("../", import.meta.url))) {
  const backend = join(root, "backend"), frontend = join(root, "frontend");
  if (!existsSync(join(backend, ".env"))) {
    const example = readFileSync(join(backend, ".env.example"), "utf8");
    writeFileSync(join(backend, ".env"), example.replace(/^JWT_SECRET_KEY=$/m, `JWT_SECRET_KEY=${randomBytes(48).toString("base64url")}`), { mode: 0o600 });
  }
  if (!existsSync(join(frontend, ".env.local"))) writeFileSync(join(frontend, ".env.local"), readFileSync(join(frontend, ".env.example")), { mode: 0o600 });
  if (!existsSync(join(root, ".env"))) writeFileSync(join(root, ".env"), `POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}\nJWT_SECRET_KEY=${randomBytes(48).toString("base64url")}\n`, { mode: 0o600 });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { configure(); console.log("Local configuration is ready. Existing configuration was preserved."); }
