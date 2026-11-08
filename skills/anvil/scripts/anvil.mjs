#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const STATUS_CONTEXT = "anvil/review";
export const COMMENT_MARKER = "<!-- anvil:summary -->";
const VERDICTS = new Set(["accept", "request_changes", "not_relevant"]);
const SEVERITIES = new Set(["blocker", "should_fix", "nit"]);
const FINDING_STATES = new Set(["open", "fixed", "dismissed"]);
const SHA = /^[0-9a-f]{40}$/;

export function loadLenses(path = join(dirname(fileURLToPath(import.meta.url)), "../references/lenses.json")) {
  const catalogue = JSON.parse(readFileSync(path, "utf8"));
  const ids = new Set();
  for (const lens of catalogue.lenses) {
    if (!/^[a-z][a-z0-9-]*$/.test(lens.id) || ids.has(lens.id)) throw new Error(`Invalid or duplicate lens id: ${lens.id}`);
    ids.add(lens.id);
  }
  return catalogue.lenses;
}

export function parseVerdict(value, lensIds) {
  const problems = [];
  const verdict = typeof value === "string" ? JSON.parse(value) : value;
  if (!lensIds.includes(verdict.lens)) problems.push(`unknown lens "${verdict.lens}"`);
  if (!SHA.test(verdict.sha ?? "")) problems.push("sha must be a full 40-character commit");
  if (!VERDICTS.has(verdict.verdict)) problems.push(`verdict must be one of ${[...VERDICTS].join(", ")}`);
  for (const field of ["reviewer", "model", "summary"])
    if (typeof verdict[field] !== "string" || !verdict[field].trim()) problems.push(`${field} is required`);
  if (verdict.verdict !== "not_relevant" && !(Number.isInteger(verdict.score) && verdict.score >= 0 && verdict.score <= 100))
    problems.push("score must be an integer from 0 to 100");
  if (!Array.isArray(verdict.findings)) problems.push("findings must be an array");
  for (const [index, finding] of (verdict.findings ?? []).entries()) {
    if (!SEVERITIES.has(finding.severity)) problems.push(`findings[${index}].severity is invalid`);
    if (!FINDING_STATES.has(finding.status)) problems.push(`findings[${index}].status is invalid`);
    for (const field of ["scenario", "evidence"])
      if (typeof finding[field] !== "string" || !finding[field].trim()) problems.push(`findings[${index}].${field} is required`);
    if (finding.status === "dismissed" && !finding.reason?.trim()) problems.push(`findings[${index}] needs a dismissal reason`);
  }
  const blocking = (verdict.findings ?? []).some((f) => f.status === "open" && f.severity !== "nit");
  if (verdict.verdict === "accept" && blocking) problems.push("an accept verdict cannot have open blocker or should_fix findings");
  if (problems.length) throw new Error(`Invalid verdict: ${problems.join("; ")}`);
  return verdict;
}

export function gate(lenses, verdicts, headSha) {
  const byLens = new Map(verdicts.filter((v) => v.sha === headSha).map((v) => [v.lens, v]));
  const rows = lenses.map((lens) => {
    const verdict = byLens.get(lens.id);
    if (!verdict) return { lens, state: "missing" };
    const open = verdict.findings.filter((f) => f.status === "open" && f.severity !== "nit");
    return { lens, verdict, state: verdict.verdict === "request_changes" || open.length ? "failing" : "passing", open };
  });
  const missing = rows.filter((row) => row.state === "missing");
  const failing = rows.filter((row) => row.state === "failing");
  const state = failing.length ? "failure" : missing.length ? "pending" : "success";
  const description =
    state === "success"
      ? `${rows.length} lenses accepted at ${headSha.slice(0, 9)}`
      : state === "failure"
        ? `${failing.length} lens${failing.length === 1 ? "" : "es"} requesting changes`
        : `${missing.length} of ${rows.length} lenses not yet reviewed at ${headSha.slice(0, 9)}`;
  return { state, description, rows };
}

export function renderSummary(result, headSha) {
  const mark = { passing: "Accept", failing: "Request changes", missing: "Not reviewed" };
  const lines = [
    COMMENT_MARKER,
    `**Anvil review: ${result.state}** at \`${headSha.slice(0, 9)}\``,
    "",
    "| Lens | Verdict | Score | Reviewer | Summary |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const row of result.rows) {
    const verdict = row.verdict;
    const label = verdict?.verdict === "not_relevant" ? "Not relevant" : mark[row.state];
    const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(
      `| ${row.lens.title} | ${label} | ${verdict?.score ?? ""} | ${cell(verdict ? `${verdict.reviewer} (${verdict.model})` : "")} | ${cell(verdict?.summary)} |`,
    );
  }
  const open = result.rows.flatMap((row) => (row.open ?? []).map((finding) => ({ lens: row.lens.title, ...finding })));
  if (open.length) {
    lines.push("", "**Open findings**", "");
    for (const finding of open)
      lines.push(`- **${finding.severity}** (${finding.lens})${finding.file ? ` \`${finding.file}${finding.line ? `:${finding.line}` : ""}\`` : ""}: ${finding.scenario}`);
  }
  return `${lines.join("\n")}\n`;
}

export function staleLenses(lenses, verdicts, headSha, changedSince) {
  return lenses.map((lens) => {
    const latest = verdicts.filter((v) => v.lens === lens.id).sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)))[0];
    if (!latest) return { lens: lens.id, action: "review", reason: "no verdict recorded" };
    if (latest.sha === headSha) return { lens: lens.id, action: "current", sha: latest.sha };
    return { lens: lens.id, action: "rerun", sha: latest.sha, changedFiles: changedSince(latest.sha) };
  });
}

export const CROSS_CHECKED = ["correctness", "security", "durability", "concurrency"];

export const PROVIDERS = [
  { id: "claude", family: "anthropic", command: "claude", status: ["auth", "status"], signedIn: (out) => /"loggedIn"\s*:\s*true/.test(out) },
  { id: "codex", family: "openai", command: "codex", status: ["login", "status"], signedIn: (out) => /logged in/i.test(out) && !/not logged in/i.test(out) },
  { id: "gemini", family: "google", command: "gemini" },
  { id: "cursor-agent", family: "cursor", command: "cursor-agent", status: ["status"], signedIn: (out) => /logged in/i.test(out) && !/not logged in/i.test(out) },
];

export function detectProviders({ which, run, home = process.env.HOME ?? "" } = {}) {
  const locate = (provider) => {
    const found = which(provider.command);
    if (found || provider.id !== "codex") return found;
    const bundled = run("/bin/sh", ["-c", `ls -d "${home}"/.t3/tools/codex/*/bin/codex 2>/dev/null | tail -1`]).trim();
    return bundled || null;
  };
  return PROVIDERS.map((provider) => {
    const path = locate(provider);
    if (!path) return { id: provider.id, family: provider.family, state: "absent" };
    if (!provider.status) return { id: provider.id, family: provider.family, path, state: "installed" };
    const output = run(path, provider.status);
    return { id: provider.id, family: provider.family, path, state: provider.signedIn(output) ? "signed-in" : "signed-out" };
  });
}

export function planReviews(lenses, providers) {
  const usable = providers.filter((provider) => provider.state === "signed-in");
  if (!usable.length) throw new Error("No signed-in reviewer found. Sign in to Claude Code or Codex, then retry.");
  return lenses.map((lens, index) => {
    const primary = usable[index % usable.length];
    const second = CROSS_CHECKED.includes(lens.id) ? usable.find((provider) => provider.family !== primary.family) : undefined;
    return { lens: lens.id, reviewers: second ? [primary.id, second.id] : [primary.id], crossChecked: Boolean(second) };
  });
}

const gh = (args, input) => execFileSync("gh", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });

function pullRequest(pr, repo) {
  const fields = "number,title,body,url,headRefOid,baseRefName,headRefName,files";
  return JSON.parse(gh(["pr", "view", String(pr), "--json", fields, ...(repo ? ["--repo", repo] : [])]));
}

function repoOf(url) {
  const match = /github\.com\/([^/]+\/[^/]+)\/pull\//.exec(url);
  if (!match) throw new Error(`Cannot read repository from ${url}`);
  return match[1];
}

function storeDir(root, pr) {
  return join(root, ".anvil", `pr-${pr}`);
}

function readVerdicts(dir) {
  const verdictDir = join(dir, "verdicts");
  if (!existsSync(verdictDir)) return [];
  return readdirSync(verdictDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(verdictDir, name), "utf8")));
}

function options(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) parsed[key] = true;
      else parsed[key] = argv[++index];
    } else parsed._.push(arg);
  }
  return parsed;
}

async function main(argv) {
  const args = options(argv);
  const [command] = args._;
  const root = args.root ?? process.cwd();
  const lenses = loadLenses(args.lenses);
  if (command === "lenses") return void process.stdout.write(`${JSON.stringify(lenses, null, 2)}\n`);
  if (command === "providers" || command === "plan") {
    const run = (file, argv) => {
      try {
        return execFileSync(file, argv, { encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "pipe"] });
      } catch (error) {
        return `${error.stdout ?? ""}${error.stderr ?? ""}`;
      }
    };
    const which = (name) => run("/bin/sh", ["-c", `command -v ${name}`]).trim() || null;
    const providers = detectProviders({ which, run });
    const output = command === "providers" ? providers : planReviews(lenses, providers);
    return void process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  }
  if (!args.pr) throw new Error("--pr <number> is required");
  const pr = pullRequest(args.pr, args.repo);
  const repo = args.repo ?? repoOf(pr.url);
  const dir = storeDir(root, pr.number);
  if (command === "context") {
    const shaDir = join(dir, pr.headRefOid);
    mkdirSync(shaDir, { recursive: true });
    writeFileSync(join(shaDir, "context.json"), `${JSON.stringify({ repo, ...pr }, null, 2)}\n`);
    writeFileSync(join(shaDir, "diff.patch"), gh(["pr", "diff", String(pr.number), "--repo", repo]));
    return void process.stdout.write(`${shaDir}\n`);
  }
  if (command === "record") {
    if (!args.file) throw new Error("--file <verdict.json> is required");
    const verdict = parseVerdict(readFileSync(args.file, "utf8"), lenses.map((lens) => lens.id));
    if (verdict.sha !== pr.headRefOid)
      throw new Error(`Verdict is for ${verdict.sha.slice(0, 9)} but the PR head is ${pr.headRefOid.slice(0, 9)}`);
    const verdictDir = join(dir, "verdicts");
    mkdirSync(verdictDir, { recursive: true });
    const stored = { ...verdict, recordedAt: new Date().toISOString() };
    writeFileSync(join(verdictDir, `${verdict.lens}-${verdict.sha.slice(0, 12)}.json`), `${JSON.stringify(stored, null, 2)}\n`);
    return void process.stdout.write(`Recorded ${verdict.lens}: ${verdict.verdict}\n`);
  }
  if (command === "stale") {
    const changedSince = (sha) =>
      JSON.parse(gh(["api", `repos/${repo}/compare/${sha}...${pr.headRefOid}`, "--jq", "[.files[].filename]"]));
    return void process.stdout.write(`${JSON.stringify(staleLenses(lenses, readVerdicts(dir), pr.headRefOid, changedSince), null, 2)}\n`);
  }
  if (command === "gate") {
    const result = gate(lenses, readVerdicts(dir), pr.headRefOid);
    const summary = renderSummary(result, pr.headRefOid);
    process.stdout.write(summary);
    if (args.post) {
      const comments = JSON.parse(gh(["api", `repos/${repo}/issues/${pr.number}/comments`, "--paginate", "--jq", "[.[] | {id, body}]"]));
      const existing = comments.find((comment) => comment.body?.startsWith(COMMENT_MARKER));
      const comment = JSON.parse(
        existing
          ? gh(["api", "-X", "PATCH", `repos/${repo}/issues/comments/${existing.id}`, "--input", "-"], JSON.stringify({ body: summary }))
          : gh(["api", `repos/${repo}/issues/${pr.number}/comments`, "--input", "-"], JSON.stringify({ body: summary })),
      );
      gh(
        ["api", `repos/${repo}/statuses/${pr.headRefOid}`, "--input", "-"],
        JSON.stringify({ state: result.state, context: STATUS_CONTEXT, description: result.description.slice(0, 140), target_url: comment.html_url }),
      );
      process.stdout.write(`Posted ${STATUS_CONTEXT}: ${result.state}\n`);
    }
    process.exitCode = result.state === "success" ? 0 : 1;
    return;
  }
  throw new Error(`Unknown command "${command}". Use lenses, context, record, stale or gate.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
