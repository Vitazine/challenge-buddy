import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
const root = resolve(process.argv[2]);
const expected = process.argv[3] ?? "fixed";
const localRequire = createRequire(join(root, "package.json"));
const ts = localRequire("typescript");
const source = fs.readFileSync(
  join(root, "src/hooks/useChallengeApp.ts"),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function harness() {
  const slots = [],
    requests = [],
    intervals = new Map(),
    listeners = new Map();
  let cursor = 0,
    dirty = false,
    output,
    effects = [],
    nextTimer = 0;
  const equal = (a, b) =>
    a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: initial };
      return [
        slots[i].value,
        (value) => {
          const next =
            typeof value === "function" ? value(slots[i].value) : value;
          if (!Object.is(next, slots[i].value)) {
            slots[i].value = next;
            dirty = true;
          }
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { current: initial };
      return slots[i];
    },
    useCallback(callback, deps) {
      const i = cursor++;
      if (!slots[i] || !equal(deps, slots[i].deps))
        slots[i] = { callback, deps };
      return slots[i].callback;
    },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!slots[i] || !equal(deps, slots[i].deps))
        effects.push(() => {
          slots[i]?.cleanup?.();
          slots[i] = { deps, cleanup: effect() };
        });
    },
  };
  const api = {
    session: async () => ({ mode: "development" }),
    list: (page, archived) => {
      const job = { kind: "list", page, archived, ...deferred() };
      requests.push(job);
      return job.promise;
    },
    get: (id) => {
      const job = { kind: "get", id, ...deferred() };
      requests.push(job);
      return job.promise;
    },
    create: () => {
      const job = { kind: "create", ...deferred() };
      requests.push(job);
      return job.promise;
    },
  };
  const module = { exports: {} };
  const context = {
    exports: module.exports,
    module,
    require: (name) =>
      name === "react"
        ? hooks
        : name === "../api"
          ? { api }
          : name === "../telegram"
            ? { telegram: undefined }
            : localRequire(name),
    window: {
      scrollTo() {},
      setInterval(fn) {
        intervals.set(++nextTimer, fn);
        return nextTimer;
      },
    },
    clearInterval: (id) => intervals.delete(id),
    document: {
      hidden: false,
      addEventListener: (event, fn) => listeners.set(event, fn),
      removeEventListener: (event, fn) => {
        if (listeners.get(event) === fn) listeners.delete(event);
      },
    },
  };
  vm.runInNewContext(compiled, context);
  function render() {
    do {
      dirty = false;
      cursor = 0;
      effects = [];
      output = module.exports.useChallengeApp();
      effects.forEach((fn) => fn());
    } while (dirty);
  }
  async function settle() {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      if (dirty) render();
    }
  }
  function act(fn) {
    fn(output);
    if (dirty) render();
  }
  function take(kind) {
    const i = requests.findIndex((r) => r.kind === kind);
    assert.ok(i >= 0, `request ${kind} missing`);
    return requests.splice(i, 1)[0];
  }
  render();
  return {
    get state() {
      return output;
    },
    requests,
    act,
    settle,
    take,
    tick() {
      [...intervals.values()].forEach((fn) => fn());
    },
  };
}
const challenge = {
  id: "synthetic",
  title: "Synthetic",
  checkIns: [],
  progress: 0,
  archivedAt: null,
};
const list = (items, total = items.length, page = 1) => ({
  items,
  total,
  page,
  pageSize: 20,
});
async function initialized(total = 1) {
  const h = harness();
  h.take("list").resolve(list([challenge], total));
  await h.settle();
  assert.equal(h.state.loading, false);
  return h;
}

(async () => {
  {
    const h = await initialized();
    h.act((s) => s.navigate({ type: "detail", challenge }));
    h.tick();
    const oldDetail = h.take("get");
    const archive = deferred();
    let mutation;
    h.act((s) => {
      mutation = s.mutate(() => archive.promise, "archived");
    });
    archive.resolve({ ...challenge, archivedAt: "2026-10-24T10:00:00Z" });
    await mutation;
    await h.settle();
    oldDetail.resolve(challenge);
    await h.settle();
    assert.equal(h.state.view.challenge.archivedAt, "2026-10-24T10:00:00Z");
    console.log(
      "PASS: delayed background detail response before archive does not replace mutation result",
    );
  }
  {
    const h = await initialized(21);
    h.act((s) => s.changePage(2));
    h.take("list").resolve(list([challenge], 21, 2));
    await h.settle();
    h.act((s) => s.switchArchive(true));
    assert.equal(h.state.page, 1);
    h.take("list").resolve(list([{ ...challenge, archivedAt: "date" }]));
    await h.settle();
    h.act((s) =>
      s.navigate({
        type: "detail",
        challenge: { ...challenge, archivedAt: "date" },
      }),
    );
    h.act((s) => s.back());
    assert.equal(h.state.archived, true);
    assert.equal(h.state.view.type, "list");
    assert.equal(h.take("list").archived, true);
    h.act((s) => s.switchArchive(false));
    assert.equal(h.state.page, 1);
    assert.equal(h.state.archived, false);
    h.take("list").resolve(list([challenge]));
    await h.settle();
    console.log(
      "PASS: archive switch resets page; detail Back keeps archive; returning to ordinary list switches filter",
    );
  }
  {
    const h = await initialized(21);
    h.act((s) => s.changePage(2));
    h.take("list").resolve(list([challenge], 21, 2));
    await h.settle();
    h.act((s) => s.navigate({ type: "detail", challenge }));
    h.act((s) => s.back());
    h.take("list").resolve(list([], 20, 2));
    await h.settle();
    assert.equal(h.state.page, 1);
    h.take("list").resolve(list([challenge], 20));
    await h.settle();
    assert.equal(h.state.loading, false);
    console.log("PASS: empty final page reloads valid previous page");
  }
  {
    const h = await initialized(21);
    h.act((s) => s.changePage(2));
    const slowList = h.take("list");
    assert.ok(h.state.session);
    assert.equal(h.state.loading, true);
    h.act((s) => s.navigate({ type: "create" }));
    slowList.resolve(list([challenge], 21, 2));
    await h.settle();
    let creation;
    h.act((s) => {
      creation = s.create({});
    });
    h.take("create").resolve({ ...challenge, id: "new" });
    await creation;
    await h.settle();
    assert.equal(h.state.view.type, "detail");
    assert.equal(h.state.loading, expected === "reproduce");
    h.tick();
    await h.settle();
    assert.equal(
      h.requests.filter((r) => r.kind === "get").length,
      expected === "reproduce" ? 0 : 1,
    );
    console.log(
      expected === "reproduce"
        ? "REPRODUCED: stale loading blocks detail refresh"
        : "PASS: canceled list loading is cleared and detail refresh issues GET",
    );
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
