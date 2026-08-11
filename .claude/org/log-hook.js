"use strict";

// Enforced activity log for the agent company.
//
// Wired as a hook, this records every agent's activity without the agent
// having to cooperate. Hooks in settings.json fire inside subagents too, and
// the payload carries agent_id and agent_type, so a nested tree logs itself.
//
// Usage (from .claude/settings.json):
//   node .claude/org/log-hook.js
// Reads the hook payload as JSON on stdin. Never blocks, never fails the
// tool call — any error is swallowed, because a broken logger must not be
// able to stop work.
//
// Output: .claude/org/log/activity.jsonl, one line per event.

var fs = require("fs");
var path = require("path");

var LOG_DIR = path.join(__dirname, "log");
var LOG_FILE = path.join(LOG_DIR, "activity.jsonl");
var MAX_FIELD = 400; // truncate long tool inputs; the transcript has the full text

function clip(value) {
  if (value === null || value === undefined) return undefined;
  var s = typeof value === "string" ? value : JSON.stringify(value);
  if (s === undefined) return undefined;
  return s.length > MAX_FIELD ? s.slice(0, MAX_FIELD) + "…[" + s.length + "]" : s;
}

function main(raw) {
  var p;
  try { p = JSON.parse(raw); } catch (e) { return; }

  var row = {
    t: new Date().toISOString(),
    event: p.hook_event_name,
    agent: p.agent_type || "main",
    agentId: p.agent_id || null,
    session: p.session_id || null,
    effort: p.effort && p.effort.level ? p.effort.level : null,
    tool: p.tool_name || undefined,
    input: clip(p.tool_input),
    durationMs: typeof p.duration_ms === "number" ? p.duration_ms : undefined,
    transcript: p.agent_transcript_path || undefined,
    last: clip(p.last_assistant_message)
  };

  Object.keys(row).forEach(function (k) {
    if (row[k] === undefined) delete row[k];
  });

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(row) + "\n");
  } catch (e) {
    // Deliberately silent. A logger that can fail a tool call is worse than
    // no logger.
  }
}

var chunks = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", function (d) { chunks += d; });
process.stdin.on("end", function () {
  try { main(chunks); } catch (e) {}
  process.exit(0);
});
process.stdin.on("error", function () { process.exit(0); });
