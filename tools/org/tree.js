"use strict";

// Build a browsable tree of every agent conversation.
//
// Reads the transcripts Claude Code writes and emits ONE self-contained HTML
// file: a collapsible tree of the whole agent hierarchy, where each node opens
// into that agent's full chat — every message, every tool call, every result.
//
//   node tools/org/tree.js                      # newest session
//   node tools/org/tree.js --session <id>
//   node tools/org/tree.js --list               # what sessions exist
//   node tools/org/tree.js --out somewhere.html
//
// Then open the file. No server, no build step, no dependencies — the same
// way the game itself runs.

var fs = require("fs");
var path = require("path");
var os = require("os");

var PROJECTS = path.join(os.homedir(), ".claude", "projects");
var RATES = { opus: { in: 5, out: 25 }, sonnet: { in: 3, out: 15 }, haiku: { in: 1, out: 5 } };

function rateFor(m) {
  m = String(m || "").toLowerCase();
  if (m.indexOf("haiku") !== -1) return RATES.haiku;
  if (m.indexOf("sonnet") !== -1) return RATES.sonnet;
  return RATES.opus;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function walkFiles(dir, out) {
  var e;
  try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch (err) { return out; }
  for (var i = 0; i < e.length; i++) {
    var full = path.join(dir, e[i].name);
    if (e[i].isDirectory()) walkFiles(full, out);
    else if (/^agent-.*\.jsonl$/.test(e[i].name)) out.push(full);
  }
  return out;
}

function listSessions() {
  var out = [];
  var slugs;
  try { slugs = fs.readdirSync(PROJECTS, { withFileTypes: true }); } catch (e) { return out; }
  slugs.forEach(function (slug) {
    if (!slug.isDirectory()) return;
    var dir = path.join(PROJECTS, slug.name);
    fs.readdirSync(dir).forEach(function (f) {
      if (!/\.jsonl$/.test(f)) return;
      var id = f.replace(/\.jsonl$/, "");
      var st = fs.statSync(path.join(dir, f));
      out.push({ id: id, slug: slug.name, dir: dir, mtime: st.mtimeMs, size: st.size });
    });
  });
  out.sort(function (a, b) { return b.mtime - a.mtime; });
  return out;
}

// ---- reading one transcript --------------------------------------------

function parseTranscript(file) {
  var turns = [], usage = { calls: 0, tokIn: 0, tokOut: 0, cacheR: 0, cacheW: 0 };
  var first = null, last = null, model = null;
  var lines = fs.readFileSync(file, "utf8").split("\n");

  for (var i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    var rec; try { rec = JSON.parse(lines[i]); } catch (e) { continue; }
    if (rec.timestamp) {
      if (!first || rec.timestamp < first) first = rec.timestamp;
      if (!last || rec.timestamp > last) last = rec.timestamp;
    }
    var m = rec.message;
    if (!m) continue;
    if (m.model) model = m.model;

    var parts = [];
    var content = m.content;
    if (typeof content === "string") {
      if (content.trim()) parts.push({ kind: "text", text: content });
    } else if (Array.isArray(content)) {
      for (var c = 0; c < content.length; c++) {
        var b = content[c];
        if (!b) continue;
        if (b.type === "text" && b.text && b.text.trim()) {
          parts.push({ kind: "text", text: b.text });
        } else if (b.type === "tool_use") {
          parts.push({ kind: "tool", name: b.name, input: JSON.stringify(b.input, null, 1) });
        } else if (b.type === "tool_result") {
          var t = b.content;
          if (Array.isArray(t)) {
            t = t.map(function (x) { return x && x.text ? x.text : ""; }).join("\n");
          }
          parts.push({ kind: "result", text: String(t == null ? "" : t) });
        } else if (b.type === "thinking") {
          parts.push({ kind: "thinking", text: b.thinking || "" });
        }
      }
    }
    if (parts.length) turns.push({ role: m.role, ts: rec.timestamp, parts: parts });

    var u = m.usage;
    if (u) {
      usage.calls++;
      usage.tokIn += u.input_tokens || 0;
      usage.tokOut += u.output_tokens || 0;
      usage.cacheR += u.cache_read_input_tokens || 0;
      var cc = u.cache_creation || {};
      usage.cacheW += (cc.ephemeral_5m_input_tokens || 0) + (cc.ephemeral_1h_input_tokens || 0) ||
                      (u.cache_creation_input_tokens || 0);
    }
  }

  var r = rateFor(model);
  var cost = (usage.tokIn * r.in + usage.cacheW * r.in * 1.25 +
              usage.cacheR * r.in * 0.1 + usage.tokOut * r.out) / 1e6;
  return {
    turns: turns, model: model, cost: cost,
    tokens: usage.tokIn + usage.tokOut + usage.cacheR + usage.cacheW,
    calls: usage.calls, startedAt: first,
    durationMs: (first && last) ? Date.parse(last) - Date.parse(first) : 0
  };
}

// Workflow labels are not persisted anywhere — the journal stores only a hash
// — so an agent's readable name comes from one of two places: its type, when
// that type is a real employee (vera, ivan…), or the first line of the brief
// it was given. Named staff show their name; anonymous workers show their job.
var GENERIC = { "workflow-subagent": 1, "general-purpose": 1, "agent": 1, "unknown": 1, "claude": 1 };

// The staff roster is read from .claude/agents/*.md rather than hardcoded, so
// hiring someone is just writing their file — they appear here on the next
// run, with or without any work behind them. Reporting lines come from the
// "reports to X" in each description; anyone without one is a manager.
var ROSTER = {};

function loadRoster(repoRoot) {
  var dir = path.join(repoRoot, ".claude", "agents"), files;
  try { files = fs.readdirSync(dir); } catch (e) { return {}; }
  var out = {};
  files.forEach(function (f) {
    if (!/\.md$/.test(f)) return;
    var txt;
    try { txt = fs.readFileSync(path.join(dir, f), "utf8"); } catch (e) { return; }
    var fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(txt);
    if (!fm) return;
    var name = (/^name:\s*(.+)$/m.exec(fm[1]) || [])[1];
    var desc = (/^description:\s*(.+)$/m.exec(fm[1]) || [])[1];
    if (!name) return;
    name = name.trim();
    desc = (desc || "").trim();

    var boss = (/\breports to (\w+)/i.exec(desc) || [])[1];
    // The role is the opening phrase: "Systems engineer, reports to vera."
    var role = desc.split(/[,.]/)[0].trim() || name;
    out[name] = {
      role: role,
      rank: boss ? "Employee" : "Manager",
      boss: boss ? boss.toLowerCase() : null
    };
  });
  return out;
}

// A label has to fit on one line and be readable at a glance. A truncated
// paragraph is worse than a short imperfect phrase, so cut at the first
// natural clause break rather than at a character count.
function shortLabel(text, cap) {
  cap = cap || 58;
  var s = String(text || "")
    .replace(/^(QUESTION|TASK|GOAL|OBJECTIVE|ORIGINAL QUESTION)\s*[:\-]\s*/i, "")
    .replace(/^#+\s*/, "").replace(/\s+/g, " ").trim();
  if (!s) return null;

  var cut = s.length;
  var marks = [". ", "? ", "; ", ": ", ", ", " — ", " - ", " (", " i.e", " so "];
  for (var i = 0; i < marks.length; i++) {
    var at = s.indexOf(marks[i]);
    // Only accept a break that leaves something substantial behind.
    if (at > 18 && at < cut) cut = at;
  }
  s = s.slice(0, cut).replace(/[\s,;:—-]+$/, "");

  if (s.length > cap) {                       // still long: cut on a word
    var sp = s.lastIndexOf(" ", cap);
    s = s.slice(0, sp > 20 ? sp : cap);
  }
  return s.length >= 4 ? s : null;
}

function deriveTitle(turns) {
  // Prefer the brief it was given; fall back to the first thing it said. An
  // agent resumed from transcript has no fresh user turn, so without the
  // fallback it would show up nameless.
  var roles = ["user", "assistant"];
  for (var r = 0; r < roles.length; r++) {
    for (var i = 0; i < turns.length; i++) {
      if (turns[i].role !== roles[r]) continue;
      for (var p = 0; p < turns[i].parts.length; p++) {
        if (turns[i].parts[p].kind !== "text") continue;
        var lines = turns[i].parts[p].text.split("\n");
        for (var l = 0; l < lines.length; l++) {
          if (!lines[l].trim()) continue;
          var got = shortLabel(lines[l]);
          if (got) return got;
        }
      }
    }
  }
  return null;
}

function firstUserText(turns) {
  for (var i = 0; i < turns.length; i++) {
    if (turns[i].role !== "user") continue;
    for (var p = 0; p < turns[i].parts.length; p++) {
      if (turns[i].parts[p].kind === "text") return turns[i].parts[p].text;
    }
  }
  return "";
}

// A line only makes a usable name if it reads as prose. Section rules, banner
// headers, quoted command fragments and JSON all differ nicely between agents
// and tell a human nothing, so they must never win the disambiguation.
function isProse(s) {
  if (s.length < 16) return false;
  if (/^[=\-*_~#>|`+.\s]{3,}/.test(s)) return false;        // ===, ---, ***, > …
  if (/^[\[{("']/.test(s)) return false;                     // fragments, JSON
  if (/[=\-*_~]{3,}\s*$/.test(s)) return false;              // trailing banner rule
  var words = s.split(/\s+/).filter(function (w) { return /[a-z]{2,}/i.test(w); });
  if (words.length < 5) return false;
  var alpha = (s.match(/[a-z ]/gi) || []).length;
  return alpha / s.length > 0.62;                            // mostly letters
}

function cleanLine(raw) {
  return raw.replace(/^(ORIGINAL QUESTION|QUESTION|TASK|GOAL)\s*[:\-]\s*/i, "")
            .replace(/^YOUR APPROACH\s*\(([^)]*)\)\s*[:\-]?\s*.*$/i, "$1 check")
            .replace(/^#+\s*/, "").trim();
}

// Several agents often share an opening line — a fleet of verifiers briefed
// from one template, say. Worse, they share it in overlapping sets: two
// skeptics per probe share a question, and every skeptic using the same lens
// shares that lens. So no single line identifies anyone.
//
// Take the lines that are NOT common to the whole group, and stack them until
// each member's title is unique. Question alone gives "…sibling messaging";
// question plus lens gives "…sibling messaging · overclaim check".
function disambiguate(agents) {
  var groups = {};
  agents.forEach(function (a) {
    if (a.named) return;
    (groups[a.title] = groups[a.title] || []).push(a);
  });

  refine(agents, 0);
}

// One pass cannot do it. Ten skeptics briefed from one template split first by
// which probe they check (five pairs), and only then by which lens they use —
// and a single scan fills up with shared evidence text long before it reaches
// the lens line. So refine repeatedly, each pass re-grouping on the titles the
// previous pass produced, and looking for a line that is not common to the
// whole of that now-smaller group.
function refine(agents, pass) {
  if (pass > 3) return;

  var groups = {};
  agents.forEach(function (a) {
    if (a.named) return;
    (groups[a.title] = groups[a.title] || []).push(a);
  });

  var changed = false;
  Object.keys(groups).forEach(function (k) {
    var g = groups[k];
    if (g.length < 2) return;

    g.forEach(function (a) {
      // At most two refinements: a real label, then one short qualifier.
      // Anything more and the row stops being readable, which defeats the
      // point of naming it at all. Remaining ties get a timestamp instead.
      if (a.authored) return;   // caller wrote a description; no guessing needed
      if (a.used && a.used.length >= 2) return;
      var first = !a.used || !a.used.length;

      var lines = String(a.promptText || "").split("\n");
      for (var i = 0; i < lines.length; i++) {
        var raw = lines[i].trim();
        if (raw.length < 12) continue;
        if (a.used && a.used.indexOf(raw) !== -1) continue;
        var inAll = g.every(function (o) {
          return String(o.promptText || "").indexOf(raw) !== -1;
        });
        if (inAll) continue;

        var c = cleanLine(raw);
        if (first) {
          if (!isProse(c)) continue;
          a.used = [raw];
          a.title = shortLabel(c, 52) || c.slice(0, 52);
        } else {
          // A qualifier must be COMPLETE, short, and plain words. One
          // positive rule beats a growing pile of rejections: "overclaim
          // check" passes; a chopped stub, a field label like "ORIGINAL
          // VERDICT: PARTIAL", and code like `if(f)return Lsa(r,f,e);` all
          // fail it. Anything needing truncation is not a name.
          if (c.length > 26 || !/^[A-Za-z][A-Za-z0-9 '’-]+$/.test(c)) continue;
          if (c.split(/\s+/).length > 4) continue;
          a.used = a.used.concat([raw]);
          a.title = a.title + "  ·  " + c;
        }
        changed = true;
        return;
      }
    });
  });

  if (changed) refine(agents, pass + 1);
}

// After content-based naming there can still be identical titles, and that is
// usually honest: a workflow resumed after a crash re-runs jobs whose briefs
// are byte-identical. Nothing in the text can separate them, so separate them
// by when they ran.
function stampDuplicates(agents) {
  var counts = {};
  agents.forEach(function (a) { counts[a.title] = (counts[a.title] || 0) + 1; });
  agents.forEach(function (a) {
    if (counts[a.title] < 2 || !a.data.startedAt) return;
    var hhmm = String(a.data.startedAt).replace(/^.*T/, "").slice(0, 8);
    a.title = a.title + "  ·  " + hhmm;
  });
}

// Each workflow run persists its script as "<workflow-name>-<runId>.js", so
// the run's real name is recoverable. Without this a batch shows up as
// "wf_40f58261-266", which is exactly the kind of hash nobody can read.
function loadRunNames(sessionDir) {
  var map = {}, dir = path.join(sessionDir, "workflows", "scripts");
  var files;
  try { files = fs.readdirSync(dir); } catch (e) { return map; }
  files.forEach(function (f) {
    var m = /^(.*)-(wf_[a-z0-9-]+)\.js$/.exec(f);
    if (m) map[m[2]] = m[1].replace(/[-_]+/g, " ");
  });
  return map;
}

function loadAgents(sessionDir) {
  return walkFiles(sessionDir, []).map(function (f) {
    var meta = {};
    try { meta = JSON.parse(fs.readFileSync(f.replace(/\.jsonl$/, ".meta.json"), "utf8")); }
    catch (e) {}
    var t = parseTranscript(f);
    var type = meta.agentType || "agent";
    // An Agent-tool spawn carries the description its caller wrote. That is
    // authoritative and already short — infinitely better than guessing a
    // name out of the prompt text, which is only needed for workflow agents.
    var authored = meta.description ? (shortLabel(meta.description, 64) || meta.description) : null;
    var brief = authored || deriveTitle(t.turns);
    return {
      id: path.basename(f).replace(/^agent-|\.jsonl$/g, ""),
      type: type,
      named: !GENERIC[type],
      authored: !!authored,
      title: (!GENERIC[type] ? type : (brief || "untitled worker")),
      brief: brief,
      promptText: firstUserText(t.turns),
      depth: typeof meta.spawnDepth === "number" ? meta.spawnDepth : 1,
      parent: meta.parentAgentId || null,
      run: path.basename(path.dirname(f)),
      file: f, data: t
    };
  });
}

// ---- tree assembly ------------------------------------------------------

function rollUp(node) {
  var c = node.data.cost, t = node.data.tokens, n = 1;
  (node.kids || []).forEach(function (k) {
    var r = rollUp(k);
    c += r.cost; t += r.tokens; n += r.count;
  });
  return { cost: c, tokens: t, count: n };
}

function buildTree(agents, runNames, showAll) {
  runNames = runNames || {};
  var byId = {}, roots = [];
  agents.forEach(function (a) { a.kids = []; byId[a.id] = a; });
  agents.forEach(function (a) {
    if (a.parent && byId[a.parent]) byId[a.parent].kids.push(a);
    else roots.push(a);
  });
  // Group orphans by their workflow run so the tree reflects real structure
  // rather than a flat list, when parentAgentId is absent.
  function group(id) {
    return { id: id, type: "group", depth: 0, kids: [], synthetic: true,
             data: { turns: [], cost: 0, tokens: 0, calls: 0, durationMs: 0 } };
  }

  // The company comes first and always. Everything else is spent research —
  // dead agents that will never run again — and stays hidden unless asked for.
  var grouped = [];
  var rest = roots.filter(function (a) { return !ROSTER[a.type]; });
  var names = Object.keys(ROSTER);

  if (names.length) {
    // One slot per person on the roster, whether or not they have ever
    // worked. The org chart is who you employ, not who happens to be busy.
    var slots = {};
    names.forEach(function (name) {
      slots[name] = { id: name, type: name, slot: true, idle: true, kids: [],
                      depth: ROSTER[name].boss ? 2 : 1,
                      data: { turns: [], cost: 0, tokens: 0, calls: 0, durationMs: 0 } };
    });

    var work = {};
    agents.forEach(function (a) {
      if (ROSTER[a.type]) (work[a.type] = work[a.type] || []).push(a);
    });
    Object.keys(work).forEach(function (name) {
      var list = work[name], slot = slots[name];
      slot.idle = false;
      // Reporting lines come from the roster, so drop any parent/child links
      // inferred from spawn metadata — otherwise a person appears twice.
      list.forEach(function (a) { a.kids = []; });
      if (list.length === 1) {
        slot.data = list[0].data;                  // one job: it IS the slot
        slot.realId = list[0].id;
      } else {
        // Several jobs by one person: the slot becomes their total and each
        // job hangs underneath. Label those rows by the JOB, not by the person
        // again — three rows all reading "Milo" tells the reader nothing.
        list.forEach(function (a) { a.isJob = true; });
        slot.kids = list.sort(function (a, b) { return b.data.cost - a.data.cost; });
        var r = rollUp(slot);
        slot.data.cost = r.cost; slot.data.tokens = r.tokens;
        slot.jobs = list.length;
      }
    });

    var top = [];
    names.forEach(function (name) {
      var boss = ROSTER[name].boss;
      if (boss && slots[boss]) slots[boss].kids.push(slots[name]);
      else top.push(slots[name]);
    });

    function byActivity(a, b) {
      if (a.idle !== b.idle) return a.idle ? 1 : -1;   // people who worked first
      if (a.idle) return a.id < b.id ? -1 : 1;
      return b.data.cost - a.data.cost;
    }
    top.sort(byActivity);
    top.forEach(function (m) { m.kids.sort(byActivity); });

    var co = group("THE COMPANY");
    co.kids = top;
    var roll = rollUp(co);
    co.data.cost = roll.cost; co.data.tokens = roll.tokens;
    co.count = names.length;
    co.staffed = names.filter(function (n) { return !slots[n].idle; }).length;
    grouped.push(co);
  }

  if (showAll) {
    var runs = {};
    rest.forEach(function (a) {
      var key = runNames[a.run] || (a.run === "subagents" ? "one-off probes" : a.run);
      if (!runs[key]) { runs[key] = group(key); grouped.push(runs[key]); }
      runs[key].kids.push(a);
    });
    Object.keys(runs).forEach(function (k) {
      var g = runs[k], r = rollUp(g);
      g.data.cost = r.cost; g.data.tokens = r.tokens; g.count = r.count - 1;
      g.kids.sort(function (a, b) { return b.data.cost - a.data.cost; });
    });
  }
  return grouped;
}

// ---- rendering ----------------------------------------------------------

function fmtDur(ms) {
  if (!ms) return "—";
  var s = Math.round(ms / 1000);
  return s < 60 ? s + "s" : Math.floor(s / 60) + "m" + (s % 60) + "s";
}

function renderTurns(turns) {
  if (!turns.length) return '<p class="empty">No messages recorded.</p>';
  return turns.map(function (t) {
    var body = t.parts.map(function (p) {
      if (p.kind === "text") return '<div class="text">' + esc(p.text) + "</div>";
      if (p.kind === "thinking") return '<details class="think"><summary>thinking</summary><pre>' + esc(p.text) + "</pre></details>";
      if (p.kind === "tool") return '<details class="tool"><summary>→ ' + esc(p.name) + "</summary><pre>" + esc(p.input) + "</pre></details>";
      return '<details class="res"><summary>← result</summary><pre>' + esc(p.text) + "</pre></details>";
    }).join("");
    return '<div class="turn ' + esc(t.role) + '"><div class="who">' + esc(t.role) +
           '<span class="ts">' + esc((t.ts || "").replace("T", " ").replace(/\..*/, "")) +
           "</span></div>" + body + "</div>";
  }).join("");
}

function renderNode(n) {
  var d = n.data;
  var pills, title, sub;

  if (n.synthetic) {
    title = n.id;
    sub = n.staffed !== undefined
        ? n.staffed + " of " + n.count + " have worked"
        : (n.count || n.kids.length) + " agents";
    pills = '<span class="pill">$' + d.cost.toFixed(2) + "</span>" +
            '<span class="pill">' + d.tokens.toLocaleString("en-US") + " tok</span>";
  } else if (n.idle) {
    var w0 = ROSTER[n.type];
    title = n.type.charAt(0).toUpperCase() + n.type.slice(1);
    sub = esc(w0.role);
    pills = '<span class="pill rank ' + w0.rank.toLowerCase() + '">' + esc(w0.rank) + "</span>" +
            '<span class="pill idle">no jobs yet</span>';
  } else if (n.isJob) {
    title = n.brief || n.title || "job";
    sub = "";
    pills = '<span class="pill">$' + d.cost.toFixed(2) + "</span>" +
            '<span class="pill">' + d.calls + " calls</span>" +
            '<span class="pill">' + fmtDur(d.durationMs) + "</span>";
  } else {
    var who = ROSTER[n.type];
    title = who ? (n.type.charAt(0).toUpperCase() + n.type.slice(1)) : n.title;
    // The hex id is noise on the row. It stays reachable on hover and in the
    // chat, but nothing a person reads at a glance should be a hash.
    // Only show a subtitle if it says something the title does not. Repeating
    // the title in grey underneath is pure noise.
    var bare = (n.title || "").split("  ·  ")[0];
    sub = who ? esc(who.role)
              : (n.brief && n.brief !== bare && n.brief.indexOf(bare) !== 0 ? esc(n.brief) : "");
    pills = (who ? '<span class="pill rank ' + who.rank.toLowerCase() + '">' +
                   esc(who.rank) + "</span>"
                 : '<span class="pill">worker</span>') +
            '<span class="pill">$' + d.cost.toFixed(2) + "</span>" +
            '<span class="pill">' + d.calls + " calls</span>" +
            '<span class="pill">' + fmtDur(d.durationMs) + "</span>";
  }

  var chat = (n.synthetic || !d.turns.length) ? "" :
    '<details class="chat" data-k="' + esc(n.type + "/" + n.id + "#chat") +
    '"><summary>open chat (' + d.turns.length + " turns)</summary>" +
    renderTurns(d.turns) + "</details>";
  var kids = (n.kids || []).map(renderNode).join("");

  // data-k is a stable identity across rebuilds, so an auto-refresh can put
  // every open branch back exactly as the reader left it.
  return '<details class="node' + (n.named ? " isnamed" : "") + '" data-k="' +
         esc(n.type + "/" + n.id) + '"' +
         (n.synthetic ? " open" : "") + '><summary title="' +
         esc(n.synthetic ? n.id : n.type + " · " + n.id) + '">' +
         '<div class="row"><span class="lbl' + (n.named ? " name" : "") + '">' +
         esc(title) + "</span>" + pills + "</div>" +
         (sub ? '<div class="sub2">' + sub + "</div>" : "") +
         "</summary>" + chat +
         (kids ? '<div class="kids">' + kids + "</div>" : "") + "</details>";
}

var CSS = [
"*{box-sizing:border-box}",
"body{margin:0;padding:24px;font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;",
"background:#0f1115;color:#dde1e7}",
"h1{font-size:18px;margin:0 0 4px}",
".sub{color:#8b93a1;font-size:13px;margin-bottom:20px}",
".node{border-left:2px solid #262b34;margin:3px 0 3px 0;padding-left:10px}",
".node>summary{cursor:pointer;padding:6px 6px;border-radius:5px}",
".node>summary:hover{background:#171b22}",
".row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
".lbl{font-weight:600;color:#e8ecf1;flex:1;min-width:220px}",
".lbl.name{color:#e0b552;font-size:15px;text-transform:capitalize;flex:0 0 auto;min-width:0}",
".node.isnamed{border-left-color:#5a4a22}",
".sub2{font-size:11px;color:#727a87;margin-top:3px;padding-left:1px}",
".dim{color:#3f4650}",
".pill{font-size:11px;color:#8b93a1;background:#181d25;border:1px solid #262b34;border-radius:9px;padding:1px 7px}",
".pill.depth{color:#c8a24a;border-color:#3a3320}",
".pill.rank{font-weight:600;letter-spacing:.03em}",
".pill.rank.manager{color:#e0b552;border-color:#4a3d1c;background:#211b0d}",
".pill.rank.employee{color:#6f9ae8;border-color:#22314c;background:#0f1620}",
".pill.idle{color:#5c6470;border-style:dashed}",
".node>summary:has(.pill.idle) .lbl{color:#78808d;font-weight:500}",
".kids{margin-left:14px}",
".chat{margin:6px 0 10px 4px}",
".chat>summary{cursor:pointer;color:#6f9ae8;font-size:12px;padding:3px 0}",
".turn{margin:8px 0;padding:8px 10px;background:#141820;border:1px solid #21262f;border-radius:6px}",
".turn.assistant{border-left:3px solid #4a7fd4}",
".turn.user{border-left:3px solid #4aa06a}",
".who{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#7d8592;margin-bottom:5px}",
".ts{float:right;text-transform:none;letter-spacing:0}",
".text{white-space:pre-wrap;word-break:break-word}",
"details.tool>summary{color:#c8a24a} details.res>summary{color:#5fa88a} details.think>summary{color:#8a7fb8}",
"details.tool,details.res,details.think{margin:5px 0;font-size:12px}",
"details.tool>summary,details.res>summary,details.think>summary{cursor:pointer;padding:2px 0}",
"pre{white-space:pre-wrap;word-break:break-word;background:#0c0f14;border:1px solid #1e232b;",
"border-radius:5px;padding:8px;margin:4px 0;max-height:340px;overflow:auto;font-size:12px;color:#b7bec9}",
".empty{color:#6b7280;font-style:italic}",
".bar{display:flex;gap:8px;margin-bottom:16px}",
"button{background:#1b212a;color:#dde1e7;border:1px solid #2b323d;border-radius:6px;padding:5px 11px;",
"cursor:pointer;font:inherit;font-size:12px} button:hover{background:#222935}",
"button.on{color:#5fa88a;border-color:#24463a}",
".stamp{color:#6b7280;font-size:11px;align-self:center;margin-left:2px}",
"body.stale{opacity:.55;transition:opacity .3s}",
"body.stale .stamp{color:#c8735a}",
"#tree{transition:opacity .12s}"
].join("");

// Auto-refresh only earns its place if it is invisible: reloading a tree that
// snaps shut and jumps to the top is worse than a stale one. Open branches and
// scroll position are saved before every reload and restored after it.
var PAGE_JS = [
"var KEY='agent-tree-view',AUTO=true,LEFT=15,BUSY=false;",
"function all(o){document.querySelectorAll('details').forEach(function(d){d.open=!!o})}",
"function keys(){var o=[];document.querySelectorAll('details[data-k]').forEach(function(d){if(d.open)o.push(d.dataset.k)});return o}",
"function save(){try{sessionStorage.setItem(KEY,JSON.stringify({o:keys(),y:window.scrollY,a:AUTO}))}catch(e){}}",
"function restore(){var s={};try{s=JSON.parse(sessionStorage.getItem(KEY)||'{}')}catch(e){}",
"var m={};(s.o||[]).forEach(function(k){m[k]=1});",
"document.querySelectorAll('details[data-k]').forEach(function(d){if(m[d.dataset.k])d.open=true});",
"if(s.y)window.scrollTo(0,s.y);if(s.a===false)AUTO=false;}",
"function stamp(t){document.getElementById('stamp').textContent=t}",
"function paint(){var b=document.getElementById('auto');",
"b.textContent=AUTO?('auto-refresh '+LEFT+'s'):'auto-refresh off';b.className=AUTO?'on':'';}",
"function toggle(){AUTO=!AUTO;LEFT=15;save();paint();if(AUTO)swap();}",
// Swap the tree in place instead of reloading. A reload repaints the whole
// document — that is the black flash — and throws away scroll and open state
// so they have to be rebuilt. Fetching and replacing one subtree keeps the
// pixels that did not change exactly where they were.
"function swap(){if(BUSY)return;BUSY=true;",
"fetch(location.href,{cache:'no-store'}).then(function(r){",
"if(!r.ok)throw new Error(r.status);return r.text()}).then(function(t){",
"var doc=new DOMParser().parseFromString(t,'text/html');",
"var nt=doc.getElementById('tree'),ns=doc.getElementById('sub');",
"if(!nt){BUSY=false;return}",
"var m={};keys().forEach(function(k){m[k]=1});",
"nt.querySelectorAll('details[data-k]').forEach(function(d){d.open=!!m[d.dataset.k]});",
"var y=window.scrollY;",
"document.getElementById('tree').replaceWith(nt);",
"if(ns)document.getElementById('sub').innerHTML=ns.innerHTML;",
"window.scrollTo(0,y);",
"stamp('updated '+new Date().toTimeString().slice(0,8));",
"document.body.classList.remove('stale');BUSY=false;",
"}).catch(function(){document.body.classList.add('stale');",
"stamp('server unreachable — retrying');BUSY=false});}",
"restore();paint();stamp('updated '+new Date().toTimeString().slice(0,8));",
"window.addEventListener('beforeunload',save);",
"setInterval(function(){if(!AUTO||BUSY)return;LEFT--;paint();",
"if(LEFT<=0){LEFT=15;save();swap();}},1000);"
].join("");

function render(sessionId, roots, totals, showAll) {
  // Count what is actually on screen, not what exists on disk — a header that
  // says 37 agents above a tree showing 2 is just confusing.
  // Group nodes already hold their subtree's totals, so summing them directly
  // is the whole answer. Rolling up again would count every agent twice.
  var shown = { n: 0, tok: 0, cost: 0 };
  roots.forEach(function (r) {
    shown.n += (r.count || r.kids.length);
    shown.tok += r.data.tokens;
    shown.cost += r.data.cost;
  });
  return "<!doctype html><html><head><meta charset=\"utf-8\">" +
    "<title>Agent tree · " + esc(sessionId.slice(0, 8)) + "</title><style>" + CSS + "</style></head><body>" +
    "<h1>Agent tree</h1><div class=\"sub\" id=\"sub\">" + shown.n + " agents · " +
    shown.tok.toLocaleString("en-US") + " tokens · $" + shown.cost.toFixed(2) +
    (showAll ? "" : "  ·  research agents hidden, --all shows them") + "</div>" +
    '<div class="bar"><button onclick="all(1)">expand all</button>' +
    '<button onclick="all(0)">collapse all</button>' +
    '<button id="auto" onclick="toggle()"></button>' +
    '<span class="stamp" id="stamp"></span></div>' +
    '<div id="tree">' + roots.map(renderNode).join("") + "</div>" +
    "<script>" + PAGE_JS + "<\/script>" +
    "</body></html>";
}

// ---- main ---------------------------------------------------------------

// Build the page from scratch. Called once for a file, or on every request in
// --serve mode — the whole point being that the data is re-read each time,
// since a static snapshot cannot show an agent that started after it was made.
function buildHtml(args) {
  ROSTER = loadRoster(path.join(__dirname, "..", ".."));
  var sessions = listSessions();

  var si = args.indexOf("--session");
  var want = si !== -1 ? args[si + 1] : null;
  var sess, agents, note = "";

  if (want) {
    sess = sessions.filter(function (s) { return s.id.indexOf(want) === 0; })[0];
    if (!sess) throw new Error("No session starts with '" + want + "'. Try --list.");
    agents = loadAgents(path.join(sess.dir, sess.id));
  } else {
    for (var i = 0; i < sessions.length; i++) {
      var found = loadAgents(path.join(sessions[i].dir, sessions[i].id));
      if (found.length) { sess = sessions[i]; agents = found; break; }
    }
    if (!sess) throw new Error("No session on this machine has any agents yet.");
    if (sess !== sessions[0]) note = "(newest session has no agents yet — showing the most recent one that does)";
  }
  if (!agents.length) throw new Error("Session " + sess.id + " has no subagents.");

  disambiguate(agents);
  stampDuplicates(agents);

  var totals = { agents: agents.length, cost: 0, tokens: 0 };
  agents.forEach(function (a) { totals.cost += a.data.cost; totals.tokens += a.data.tokens; });

  var showAll = args.indexOf("--all") !== -1;
  var roots = buildTree(agents, loadRunNames(path.join(sess.dir, sess.id)), showAll);
  if (!roots.length) {
    throw new Error("No company agents have worked in this session yet. Use --all for the research agents.");
  }
  return { html: render(sess.id, roots, totals, showAll), totals: totals, note: note, sess: sess };
}

function serve(args) {
  var http = require("http");
  var pi = args.indexOf("--serve");
  var port = parseInt(args[pi + 1], 10) || 8799;

  http.createServer(function (req, res) {
    if (req.url && req.url.indexOf("/favicon") === 0) { res.writeHead(204); return res.end(); }
    var built;
    try { built = buildHtml(args); }
    catch (e) {
      res.writeHead(503, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end('<body style="background:#0f1115;color:#dde1e7;font:14px system-ui;padding:40px">' +
                     "<h2>Nothing to show yet</h2><p>" + esc(e.message) + "</p>" +
                     '<p style="color:#8b93a1">Retrying every 15s.</p>' +
                     "<script>setTimeout(function(){location.reload()},15000)<\/script></body>");
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(built.html);
  }).listen(port, "127.0.0.1", function () {
    console.log("Live agent tree on http://127.0.0.1:" + port);
    console.log("Rebuilt from disk on every request. Ctrl-C to stop.");
  }).on("error", function (e) {
    console.error(e.code === "EADDRINUSE"
      ? "Port " + port + " is already in use — a tree server may already be running there."
      : String(e.message));
    process.exit(1);
  });
}

function main() {
  var args = process.argv.slice(2);
  // tools/org/ -> repo root, so this works no matter where it is invoked from.
  ROSTER = loadRoster(path.join(__dirname, "..", ".."));
  var sessions = listSessions();

  if (args.indexOf("--serve") !== -1) return serve(args);

  if (args.indexOf("--list") !== -1) {
    if (!sessions.length) { console.error("No sessions found under " + PROJECTS); process.exit(1); }
    sessions.slice(0, 25).forEach(function (s) {
      console.log(new Date(s.mtime).toISOString().replace("T", " ").replace(/\..*/, "") +
                  "  " + s.id + "  " + (s.size / 1024).toFixed(0) + "KB");
    });
    return;
  }

  var si = args.indexOf("--session");
  var want = si !== -1 ? args[si + 1] : null;
  var sess, agents;
  if (want) {
    sess = sessions.filter(function (s) { return s.id.indexOf(want) === 0; })[0];
    if (!sess) { console.error("No session starts with '" + want + "'. Try --list."); process.exit(1); }
    agents = loadAgents(path.join(sess.dir, sess.id));
  } else {
    // Newest FIRST, but skip sessions with nothing in them. Right after a
    // restart the newest session is empty, and erroring there would make the
    // launcher useless at exactly the moment you want it.
    for (var i = 0; i < sessions.length; i++) {
      var found = loadAgents(path.join(sessions[i].dir, sessions[i].id));
      if (found.length) { sess = sessions[i]; agents = found; break; }
    }
    if (!sess) { console.error("No session on this machine has any agents yet."); process.exit(1); }
    if (sess !== sessions[0]) {
      console.log("(newest session has no agents yet — showing the most recent one that does)");
    }
  }
  if (!agents.length) { console.error("Session " + sess.id + " has no subagents."); process.exit(1); }
  disambiguate(agents);
  stampDuplicates(agents);

  var totals = { agents: agents.length, cost: 0, tokens: 0 };
  agents.forEach(function (a) { totals.cost += a.data.cost; totals.tokens += a.data.tokens; });

  var oi = args.indexOf("--out");
  var out = oi !== -1 ? args[oi + 1] : path.join(__dirname, "tree.html");
  var runNames = loadRunNames(path.join(sess.dir, sess.id));
  var showAll = args.indexOf("--all") !== -1;
  var roots = buildTree(agents, runNames, showAll);
  if (!roots.length) {
    console.error("No company agents have worked in this session yet.");
    console.error("Use --all to see the research agents instead.");
    process.exit(1);
  }
  fs.writeFileSync(out, render(sess.id, roots, totals, showAll));

  console.log("Wrote " + out);
  console.log(totals.agents + " agents, " + totals.tokens.toLocaleString("en-US") +
              " tokens, $" + totals.cost.toFixed(2));
  console.log("Open it in a browser.");
}

main();
