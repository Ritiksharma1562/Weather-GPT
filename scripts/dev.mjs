import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const windows = process.platform === "win32";
const executable = join(root, "backend", ".venv", windows ? "Scripts/python.exe" : "bin/python");
if (!existsSync(executable) || !existsSync(join(root, "frontend", "node_modules"))) throw new Error("Run npm run setup first.");
const processes = [];
let stopping = false;
function stop() { if (stopping) return; stopping = true; for (const child of processes) child.kill("SIGTERM"); }
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
processes.push(spawn(executable, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], { cwd: join(root, "backend"), stdio: "inherit" }));
processes.push(spawn(windows ? "npm.cmd" : "npm", ["run", "dev"], { cwd: join(root, "frontend"), stdio: "inherit", env: { ...process.env, WATCHPACK_POLLING: process.env.WATCHPACK_POLLING || "true" }, shell: windows }));
for (const child of processes) { child.on("error", error => { console.error(error.message); stop(); process.exitCode = 1; }); child.on("exit", code => { if (!stopping) { process.exitCode = code || 0; stop(); } }); }
console.log("\nWeatherGPT: http://127.0.0.1:3000\nAPI documentation: http://127.0.0.1:8000/docs\nPress Ctrl+C to stop both services.\n");
