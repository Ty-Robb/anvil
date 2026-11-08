import assert from "node:assert/strict";
import test from "node:test";
import { COMMENT_MARKER, detectProviders, gate, loadLenses, parseVerdict, planReviews, renderSummary, staleLenses } from "./anvil.mjs";

const lenses = loadLenses();
const ids = lenses.map((lens) => lens.id);
const head = "a".repeat(40);
const older = "b".repeat(40);
const verdict = (lens, extra = {}) => ({
  lens,
  sha: head,
  reviewer: "fresh-context reviewer",
  model: "test-model",
  verdict: "accept",
  score: 90,
  summary: "Looks right.",
  findings: [],
  ...extra,
});
const finding = (extra = {}) => ({ severity: "blocker", status: "open", scenario: "Data is lost.", evidence: "repro.test.ts", ...extra });

test("the lens catalogue has unique, well-formed ids", () => {
  assert.ok(lenses.length >= 10);
  assert.equal(new Set(ids).size, ids.length);
});

test("verdicts must name a known lens, a full commit and evidence for every finding", () => {
  assert.throws(() => parseVerdict(verdict("nope"), ids), /unknown lens/);
  assert.throws(() => parseVerdict(verdict("security", { sha: "abc123" }), ids), /full 40-character/);
  assert.throws(() => parseVerdict(verdict("security", { findings: [finding({ evidence: "" })] }), ids), /evidence is required/);
  assert.throws(() => parseVerdict(verdict("security", { findings: [finding({ status: "dismissed" })], verdict: "request_changes" }), ids), /dismissal reason/);
  assert.equal(parseVerdict(verdict("interface", { verdict: "not_relevant", score: undefined }), ids).verdict, "not_relevant");
});

test("an accept verdict cannot hide an open blocking finding", () => {
  assert.throws(() => parseVerdict(verdict("security", { findings: [finding()] }), ids), /cannot have open blocker/);
  assert.ok(parseVerdict(verdict("security", { findings: [finding({ severity: "nit" })] }), ids));
  assert.ok(parseVerdict(verdict("security", { findings: [finding({ status: "fixed" })] }), ids));
});

test("the gate passes only when every lens has a passing verdict at the head commit", () => {
  const all = ids.map((id) => verdict(id));
  assert.equal(gate(lenses, all, head).state, "success");
  assert.equal(gate(lenses, all.slice(1), head).state, "pending");
  assert.equal(gate(lenses, all.map((v) => ({ ...v, sha: older })), head).state, "pending", "evidence for an older commit does not count");
  const failing = [...all.slice(1), verdict(ids[0], { verdict: "request_changes", findings: [finding()] })];
  const result = gate(lenses, failing, head);
  assert.equal(result.state, "failure");
  assert.match(result.description, /1 lens requesting changes/);
});

test("the summary comment is marked for in-place updates and lists open findings", () => {
  const result = gate(lenses, [verdict(ids[0], { verdict: "request_changes", findings: [finding({ file: "src/a.ts", line: 4 })] })], head);
  const summary = renderSummary(result, head);
  assert.ok(summary.startsWith(COMMENT_MARKER));
  assert.match(summary, /Request changes/);
  assert.match(summary, /\*\*blocker\*\* \(Correctness\) `src\/a.ts:4`: Data is lost\./);
  assert.match(summary, /Not reviewed/);
});

test("stale detection reruns lenses whose newest verdict predates the head", () => {
  const verdicts = [
    { ...verdict(ids[0], { sha: older }), recordedAt: "2026-01-01" },
    { ...verdict(ids[1]), recordedAt: "2026-01-02" },
  ];
  const result = staleLenses(lenses, verdicts, head, (sha) => (sha === older ? ["src/a.ts"] : []));
  assert.deepEqual(result[0], { lens: ids[0], action: "rerun", sha: older, changedFiles: ["src/a.ts"] });
  assert.deepEqual(result[1], { lens: ids[1], action: "current", sha: head });
  assert.equal(result[2].action, "review");
});

test("provider detection reports signed-in, signed-out, installed and absent tools without calling a model", () => {
  const paths = { claude: "/bin/claude", codex: null, gemini: "/bin/gemini", "cursor-agent": null };
  const calls = [];
  const run = (file, argv) => {
    calls.push([file, ...argv].join(" "));
    if (file === "/bin/claude") return '{ "loggedIn": true }';
    if (file === "/bin/sh") return "/home/u/.t3/tools/codex/1.0/bin/codex\n";
    if (file.endsWith("/codex")) return "Not logged in";
    return "";
  };
  const found = detectProviders({ which: (name) => paths[name], run, home: "/home/u" });
  assert.deepEqual(
    found.map(({ id, state }) => [id, state]),
    [["claude", "signed-in"], ["codex", "signed-out"], ["gemini", "installed"], ["cursor-agent", "absent"]],
  );
  assert.equal(found[1].path, "/home/u/.t3/tools/codex/1.0/bin/codex", "falls back to the T3 Code bundled Codex");
  assert.ok(calls.every((call) => /auth status|login status|ls -d/.test(call)), "only status commands run");
});

test("the plan spreads lenses across signed-in providers and cross-checks high-risk lenses with another family", () => {
  const claude = { id: "claude", family: "anthropic", state: "signed-in" };
  const codex = { id: "codex", family: "openai", state: "signed-in" };
  const both = planReviews(lenses, [claude, codex]);
  assert.deepEqual(new Set(both.map((entry) => entry.reviewers[0])), new Set(["claude", "codex"]));
  for (const entry of both.filter((item) => ["correctness", "security", "durability", "concurrency"].includes(item.lens))) {
    assert.equal(entry.reviewers.length, 2);
    assert.notEqual(entry.reviewers[0], entry.reviewers[1]);
  }
  const single = planReviews(lenses, [claude, { ...codex, state: "signed-out" }]);
  assert.ok(single.every((entry) => entry.reviewers.length === 1 && entry.reviewers[0] === "claude" && !entry.crossChecked));
  assert.throws(() => planReviews(lenses, [{ ...claude, state: "absent" }]), /No signed-in reviewer/);
});

test("the command runs when invoked through an installed symlink", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, symlinkSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const skill = dirname(dirname(fileURLToPath(import.meta.url)));
  const linked = join(mkdtempSync(join(tmpdir(), "anvil-link-")), "anvil");
  symlinkSync(skill, linked);
  const output = execFileSync(process.execPath, [join(linked, "scripts/anvil.mjs"), "lenses"], { encoding: "utf8" });
  assert.ok(JSON.parse(output).some((lens) => lens.id === "correctness"));
});
