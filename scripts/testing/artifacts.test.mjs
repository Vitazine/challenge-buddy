import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentArtifacts, prepareArtifacts } from "./artifacts.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "challenge-artifacts-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "challenge-buddy" }),
  );
  return root;
}

test("new run removes old captures and logs but preserves reports and source images", (t) => {
  const root = fixture(t);
  const paths = prepareArtifacts(root);
  writeFileSync(join(paths.screenshots, "old.jpg"), "synthetic screenshot");
  writeFileSync(join(paths.logs, "old.log"), "old output");
  writeFileSync(join(root, "REPORT.md"), "first attempt failed");
  writeFileSync(join(root, "asset.png"), "source asset");
  prepareArtifacts(root);
  assert.equal(existsSync(join(paths.screenshots, "old.jpg")), false);
  assert.equal(existsSync(join(paths.logs, "old.log")), false);
  assert.equal(
    readFileSync(join(root, "REPORT.md"), "utf8"),
    "first attempt failed",
  );
  assert.equal(readFileSync(join(root, "asset.png"), "utf8"), "source asset");
});

test("smoke restart preserves the failed attempt within the current run", (t) => {
  const root = fixture(t);
  const paths = prepareArtifacts(root);
  const capture = join(paths.screenshots, "attempt-01-fail.jpg");
  writeFileSync(capture, "failed attempt");
  currentArtifacts(root);
  currentArtifacts(root);
  assert.equal(readFileSync(capture, "utf8"), "failed attempt");
});

test("cleanup refuses a directory without ownership marker", (t) => {
  const root = fixture(t);
  const current = join(root, "test-results/current");
  mkdirSync(current, { recursive: true });
  writeFileSync(join(current, "keep.txt"), "unowned");
  assert.throws(() => prepareArtifacts(root), /ownership marker/);
  assert.equal(readFileSync(join(current, "keep.txt"), "utf8"), "unowned");
});

test("cleanup refuses symlink escapes at the parent and inside owned results", (t) => {
  const root = fixture(t);
  const outside = fixture(t);
  writeFileSync(join(outside, "keep.txt"), "outside");
  symlinkSync(outside, join(root, "test-results"), "dir");
  assert.throws(() => prepareArtifacts(root), /unsafe test-results/);
  rmSync(join(root, "test-results"));
  const paths = prepareArtifacts(root);
  symlinkSync(outside, join(paths.screenshots, "escape"), "dir");
  assert.throws(() => prepareArtifacts(root), /Refusing symlink/);
  assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "outside");
});
