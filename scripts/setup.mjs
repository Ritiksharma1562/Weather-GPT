import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { configure } from "./configure.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const windows = process.platform === "win32";
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: windows });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} failed`);
}
const backend = join(root, "backend"), frontend = join(root, "frontend");
let python = process.env.PYTHON || "python3.12";
if (spawnSync(python, ["--version"]).status !== 0) python = windows ? "python" : "python3";
const version = spawnSync(python, ["-c", "import sys; print('.'.join(map(str, sys.version_info[:2])))"], { encoding: "utf8" });
if (version.status !== 0 || Number(version.stdout.trim().split(".")[1]) < 12) throw new Error("Install Python 3.12 or newer, then run setup again.");
if (!existsSync(join(backend, ".venv"))) run(python, ["-m", "venv", ".venv"], backend);
const executable = join(backend, ".venv", windows ? "Scripts/python.exe" : "bin/python");
run(executable, ["-m", "ensurepip", "--upgrade"], backend);
run(executable, ["-m", "pip", "install", "-r", "requirements.lock"], backend);
run(windows ? "npm.cmd" : "npm", ["ci"], frontend);
configure(root);
run(executable, ["-m", "app.migrate"], backend);
console.log("WeatherGPT is ready. Run npm run dev, then open http://127.0.0.1:3000.");
