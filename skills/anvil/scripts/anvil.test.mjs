import assert from "node:assert/strict";
import test from "node:test";
import { COMMENT_MARKER, gate, loadLenses, parseVerdict, renderSummary, staleLenses } from "./anvil.mjs";

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
