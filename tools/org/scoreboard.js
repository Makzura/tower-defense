"use strict";

// Per-agent scoreboard: who worked, how long, how much it cost.
//
// Reads the transcripts Claude Code already writes and prints one row per
// agent. Plain node, no dependencies, consistent with the rest of this repo.
//
//   node tools/org/scoreboard.js
//   node tools/org/scoreboard.js --json
//   node tools/org/scoreboard.js --session <sessionId>
//
// Why it sums transcripts rather than reading the reported totals: the
// harness's own `subagent_tokens` / `totalTokens` figure reports the FINAL
// API call only, not the agent's lifetime. Measured on one multi-call agent
// it said 26,033 against a true 47,823. Summing per-turn usage is correct.

var fs = require("fs");
var path = require("path");
var os = require("os");

var PROJECTS = path.join(os.homedir(), ".claude", "projects");

// USD per million tokens. Cache writes are 1.25x (5m) and 2x (1h) the input
// rate; cache reads are 0.1x. Update when pricing moves.
var RATES = {
  opus:  { in: 5.00, out: 25.00 },
  sonnet:{ in: 3.00, out: 15.00 },
  haiku: { in: 1.00, out:  5.00 }
};

function rateFor(model) {
  var m = String(model || "").toLowerCase();
  if (m.indexOf("haiku") !== -1) return RATES.haiku;
  if (m.indexOf("sonnet") !== -1) return RATES.sonnet;
  return RATES.opus;
}

function walk(dir, out) {
  var entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { return out; }
  for (var i = 0; i < entries.length; i++) {
    var full = path.join(dir, entries[i].name);
    if (entries[i].isDirectory()) walk(full, out);
    else if (/^agent-.*\.jsonl$/.test(entries[i].name)) out.push(full);
  }
  return out;
}

function readMeta(jsonlPath) {
  var metaPath = jsonlPath.replace(/\.jsonl$/, ".meta.json");
  try { return JSON.parse(fs.readFileSync(metaPath, "utf8")); }
  catch (e) { return {}; }
}

function summarise(jsonlPath) {
  var meta = readMeta(jsonlPath);
  var row = {
    agentId: path.basename(jsonlPath).replace(/^agent-|\.jsonl$/g, ""),
    agentType: meta.agentType || "unknown",
    depth: typeof meta.spawnDepth === "number" ? meta.spawnDepth : null,
    parent: meta.parentAgentId || null,
    model: meta.model || null,
    calls: 0, toolCalls: 0,
    tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0,
    firstTs: null, lastTs: null
  };

  var lines = fs.readFileSync(jsonlPath, "utf8").split("\n");
  for (var i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    var rec;
    try { rec = JSON.parse(lines[i]); } catch (e) { continue; }

    if (rec.timestamp) {
      if (!row.firstTs || rec.timestamp < row.firstTs) row.firstTs = rec.timestamp;
      if (!row.lastTs || rec.timestamp > row.lastTs) row.lastTs = rec.timestamp;
    }

    var msg = rec.message;
    if (!msg) continue;

    if (Array.isArray(msg.content)) {
      for (var c = 0; c < msg.content.length; c++) {
        if (msg.content[c] && msg.content[c].type === "tool_use") row.toolCalls++;
      }
    }

    var u = msg.usage;
    if (!u) continue;
    row.calls++;
    if (!row.model && msg.model) row.model = msg.model;
    row.tokensIn      += u.input_tokens || 0;
    row.tokensOut     += u.output_tokens || 0;
    row.cacheRead     += u.cache_read_input_tokens || 0;
    var cc = u.cache_creation || {};
    row.cacheWrite5m  += cc.ephemeral_5m_input_tokens || 0;
    row.cacheWrite1h  += cc.ephemeral_1h_input_tokens || 0;
    if (!cc.ephemeral_5m_input_tokens && !cc.ephemeral_1h_input_tokens) {
      row.cacheWrite5m += u.cache_creation_input_tokens || 0;
    }
  }

  var r = rateFor(row.model);
  row.totalTokens = row.tokensIn + row.tokensOut + row.cacheRead +
                    row.cacheWrite5m + row.cacheWrite1h;
  row.costUsd = (row.tokensIn     * r.in         +
                 row.cacheWrite5m * r.in * 1.25  +
                 row.cacheWrite1h * r.in * 2.0   +
                 row.cacheRead    * r.in * 0.1   +
                 row.tokensOut    * r.out) / 1e6;
  row.durationMs = (row.firstTs && row.lastTs)
    ? (Date.parse(row.lastTs) - Date.parse(row.firstTs)) : 0;
  return row;
}

function pad(s, n, right) {
  s = String(s);
  if (s.length > n) s = s.slice(0, n - 1) + "…";
  var gap = new Array(n - s.length + 1).join(" ");
  return right ? gap + s : s + gap;
}

function fmtDur(ms) {
  if (!ms) return "-";
  var s = Math.round(ms / 1000);
  if (s < 60) return s + "s";
  var m = Math.floor(s / 60);
  return m + "m" + (s % 60) + "s";
}

function main() {
  var args = process.argv.slice(2);
  var asJson = args.indexOf("--json") !== -1;
  var sessionIdx = args.indexOf("--session");
  var session = sessionIdx !== -1 ? args[sessionIdx + 1] : null;

  var root = PROJECTS;
  if (!fs.existsSync(root)) {
    console.error("No transcripts found at " + root);
    process.exit(1);
  }

  var files = walk(root, []);
  if (session) files = files.filter(function (f) { return f.indexOf(session) !== -1; });
  if (!files.length) {
    console.error("No agent transcripts matched.");
    process.exit(1);
  }

  var rows = files.map(summarise);
  rows.sort(function (a, b) { return b.costUsd - a.costUsd; });

  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log("");
  console.log(pad("agent", 22) + pad("type", 22) + pad("d", 3) +
              pad("calls", 7, true) + pad("tools", 7, true) +
              pad("tokens", 15, true) + pad("time", 9, true) +
              pad("cost", 10, true));
  console.log(new Array(96).join("─"));

  var totals = { calls: 0, toolCalls: 0, totalTokens: 0, costUsd: 0 };
  rows.forEach(function (r) {
    console.log(
      pad(r.agentId, 22) + pad(r.agentType, 22) +
      pad(r.depth === null ? "-" : r.depth, 3) +
      pad(r.calls, 7, true) + pad(r.toolCalls, 7, true) +
      pad(r.totalTokens.toLocaleString("en-US"), 15, true) +
      pad(fmtDur(r.durationMs), 9, true) +
      pad("$" + r.costUsd.toFixed(2), 10, true));
    totals.calls += r.calls;
    totals.toolCalls += r.toolCalls;
    totals.totalTokens += r.totalTokens;
    totals.costUsd += r.costUsd;
  });

  console.log(new Array(96).join("─"));
  console.log(pad(rows.length + " agents", 47) +
              pad(totals.calls, 7, true) + pad(totals.toolCalls, 7, true) +
              pad(totals.totalTokens.toLocaleString("en-US"), 15, true) +
              pad("", 9, true) +
              pad("$" + totals.costUsd.toFixed(2), 10, true));
  console.log("");
}

main();
