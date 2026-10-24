import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

// Preserve each attempt without shell interpolation or environment dumps.
const [prefix, command, ...args] = process.argv.slice(2);
if (!prefix || !command) {
  throw new Error("Usage: run-command.mjs <log-prefix> <command> [args...]");
}
const startedAt = new Date().toISOString();
writeFileSync(`${prefix}.log`, "", { flag: "wx" });
const { appendFileSync } = await import("node:fs");
const record = { command, args, startedAt, cwd: process.cwd() };
appendFileSync(`${prefix}.log`, `${JSON.stringify(record)}\n`);
const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk;
  process.stdout.write(chunk);
  appendFileSync(`${prefix}.log`, chunk);
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
  process.stderr.write(chunk);
  appendFileSync(`${prefix}.log`, chunk);
});
child.on("error", (error) => {
  stderr += `${error.message}\n`;
});
child.on("close", (code, signal) => {
  const result = {
    ...record,
    finishedAt: new Date().toISOString(),
    exitCode: code,
    signal,
    stdout,
    stderr,
  };
  writeFileSync(`${prefix}.json`, `${JSON.stringify(result, null, 2)}\n`, {
    flag: "wx",
  });
  appendFileSync(`${prefix}.log`, `\nexitCode=${code} signal=${signal}\n`);
  process.exitCode = code ?? 1;
});
