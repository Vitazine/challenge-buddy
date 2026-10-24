import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const owner = "challenge-buddy:test-results:v1\n";

function assertNoLinks(path) {
  const info = lstatSync(path);
  if (info.isSymbolicLink()) throw new Error(`Refusing symlink: ${path}`);
  if (info.isDirectory()) {
    for (const child of readdirSync(path)) assertNoLinks(join(path, child));
  }
}

function pathsAt(root) {
  root = realpathSync(root);
  if (
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name !==
    "challenge-buddy"
  ) {
    throw new Error("Not a Challenge Buddy project");
  }
  const results = join(root, "test-results");
  if (existsSync(results) || lstatIfPresent(results)) {
    const info = lstatSync(results);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error("Refusing unsafe test-results directory");
    }
  }
  const current = join(results, "current");
  if (lstatIfPresent(current)) {
    assertNoLinks(current);
    if (
      !lstatSync(current).isDirectory() ||
      !existsSync(join(current, ".owner")) ||
      readFileSync(join(current, ".owner"), "utf8") !== owner
    ) {
      throw new Error("Refusing cleanup without artifact ownership marker");
    }
  }
  return {
    root,
    results,
    current,
    screenshots: join(current, "screenshots"),
    logs: join(current, "logs"),
  };
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

// Read-only: restarting a smoke server within one run must preserve attempts.
export function currentArtifacts(root = projectRoot) {
  const paths = pathsAt(root);
  if (!existsSync(join(paths.current, ".owner"))) {
    throw new Error("Run pnpm check or pnpm test:prepare before smoke");
  }
  return paths;
}

export function prepareArtifacts(root = projectRoot) {
  const paths = pathsAt(root);
  if (existsSync(paths.current)) rmSync(paths.current, { recursive: true });
  mkdirSync(paths.screenshots, { recursive: true });
  mkdirSync(paths.logs);
  writeFileSync(join(paths.current, ".owner"), owner, { flag: "wx" });
  return paths;
}
