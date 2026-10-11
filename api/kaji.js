// ═══════════════════════════════════════════════
// Apple Watch / Siri（iPhoneショートカット）から家事を開始・終了する窓口
//   開始: /api/kaji?action=start&task=洗濯機を回す&k=合言葉
//   終了: /api/kaji?action=stop&k=合言葉            （動いている家事が1つならそれを完了）
//         /api/kaji?action=stop&task=丸つけ&k=合言葉
//   一覧: /api/kaji?action=status&k=合言葉
// 返り値(JSON): { say: "Siriに読み上げさせる文", choices: ["候補1", ...] }
//   choices があるときは、ショートカット側で選んでもらって同じ action で再送する
// タイマー状態は Supabase app_state（running_timers / paused_timers / started_timers）に保存。
// アプリ（App.jsx）と同じ形式なので、Watchで始めてスマホで終える／その逆もできる。
// ═══════════════════════════════════════════════
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jjfapdomwrkeenswotoc.supabase.co";
const SUPABASE_KEY = "sb_publishable_dA_dsxfo-_6HP0nRBcs27A_pCFOE-oV";

// ── 日本時間の日付・時刻（Vercelのサーバーは UTC で動くため +9時間して計算）──
function jst(ms) { return new Date(ms + 9 * 3600 * 1000); }
function ymd(ms) { var d = jst(ms); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); }
function hm(ms) { var d = jst(ms); return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); }
function md(ymdStr) { return Number(ymdStr.slice(5, 7)) + "/" + Number(ymdStr.slice(8, 10)); }
function minText(sec) { var m = Math.round(sec / 60); if (m < 60) return m + "分"; return Math.floor(m / 60) + "時間" + (m % 60 ? (m % 60) + "分" : ""); }

// ── 家事名のゆるい照合（音声入力のゆれ対策）──
var VARIANTS = { "器": "機", "付": "つ", "附": "つ", "畳": "たた", "片附": "かたづ" };
var ALIASES = { "とら": "トラちゃんのお世話", "まるつけ": "丸つけをする", "丸つけ": "丸つけをする" };
function norm(s) {
  s = String(s || "").normalize("NFKC").toLowerCase();
  s = s.replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }); // カタカナ→ひらがな
  Object.keys(VARIANTS).forEach(function (k) { s = s.split(k).join(VARIANTS[k]); });
  s = s.replace(/[\s、。・,.!?！？「」]/g, "");
  s = s.replace(/(を)?(開始|すたーと|始め(る)?|はじめ(る)?|終了|終わり|おわり|完了)$/, "");
  s = s.replace(/を|する|の|ちゃん/g, "");
  return s;
}
function bigrams(s) { var a = []; for (var i = 0; i < s.length - 1; i++) a.push(s.slice(i, i + 2)); return a.length ? a : [s]; }
function dice(a, b) {
  var A = bigrams(a), B = bigrams(b).slice(), hit = 0;
  A.forEach(function (g) { var i = B.indexOf(g); if (i >= 0) { hit++; B.splice(i, 1); } });
  return (2 * hit) / (A.length + bigrams(b).length);
}
function score(q, name) {
  var nq = norm(q), nn = norm(name);
  if (!nq) return 0;
  if (nq === nn) return 1;
  if (nn.indexOf(nq) >= 0 || nq.indexOf(nn) >= 0) return 0.8 + 0.2 * Math.min(nq.length, nn.length) / Math.max(nq.length, nn.length);
  return dice(nq, nn);
}
// 戻り値: { task } 一意に決まった / { choices:[name...] } 候補 / {} 見つからない
function findTask(q, tasks) {
  if (!q) return {};
  var exact = tasks.find(function (t) { return t.name === q; });
  if (exact) return { task: exact };
  var alias = ALIASES[norm(q)] || ALIASES[q];
  if (alias) { var a = tasks.find(function (t) { return t.name === alias; }); if (a) return { task: a }; }
  var ranked = tasks.map(function (t) { return { t: t, s: score(q, t.name) }; })
    .filter(function (x) { return x.s >= 0.3; })
    .sort(function (x, y) { return y.s - x.s; });
  if (!ranked.length) return {};
  if (ranked[0].s >= 0.55 && (ranked.length === 1 || ranked[1].s <= ranked[0].s - 0.12)) return { task: ranked[0].t };
  return { choices: ranked.slice(0, 6).map(function (x) { return x.t.name; }) };
}

function recalcStreak(dates, nowMs) {
  var active = {}; dates.forEach(function (d) { active[d] = true; });
  var cur = nowMs;
  if (!active[ymd(cur)]) { cur -= 86400000; if (!active[ymd(cur)]) return 0; }
  var s = 0; while (active[ymd(cur)]) { s++; cur -= 86400000; }
  return s;
}

function send(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).send(JSON.stringify(body));
}

export async function handle(params, sb, nowMs) {
  var action = String(params.action || "").toLowerCase();
  var q = String(params.task || "").trim();

  var tRes = await sb.from("tasks").select("*");
  var tasks = (tRes.data || []).filter(function (t) { return !t.is_deleted; });
  var sRes = await sb.from("app_state").select("*").eq("id", 1).maybeSingle();
  var st = sRes.data || { id: 1 };
  var running = Object.assign({}, st.running_timers || {});
  var paused = Object.assign({}, st.paused_timers || {});
  var started = Object.assign({}, st.started_timers || {});
  var byId = {}; tasks.forEach(function (t) { byId[t.id] = t; });
  var activeIds = Object.keys(running).concat(Object.keys(paused).filter(function (id) { return !running[id] && paused[id] > 0; }))
    .filter(function (id) { return byId[id]; });

  async function saveTimers() {
    var r = await sb.from("app_state").update({ running_timers: running, paused_timers: paused, started_timers: started, updated_at: new Date(nowMs).toISOString() }).eq("id", 1);
    if (r && r.error) throw new Error(r.error.message);
  }

  if (action === "status") {
    if (!activeIds.length) return { say: "いま動いている家事はありません" };
    return { say: "動いている家事：" + activeIds.map(function (id) { return byId[id].name + (running[id] ? "" : "（一時停止中）"); }).join("、") };
  }

  if (action === "start") {
    if (!q) return { say: "何を始めるか聞き取れませんでした" };
    var f = findTask(q, tasks);
    if (f.choices) return { say: "どれを始めますか？", choices: f.choices };
    if (!f.task) return { say: "「" + q + "」という家事が見つかりませんでした" };
    var t = f.task;
    if (running[t.id]) return { say: t.name + "はもう動いています" };
    var resumed = paused[t.id] > 0;
    running[t.id] = nowMs;
    if (!started[t.id] && !resumed) started[t.id] = nowMs;
    await saveTimers();
    return { say: t.name + (resumed ? "を再開しました" : "を開始しました") };
  }

  if (action === "stop") {
    var tid = null;
    if (q) {
      var cand = activeIds.map(function (id) { return byId[id]; });
      var f2 = findTask(q, cand.length ? cand : tasks);
      if (f2.choices) return { say: "どれを終わりますか？", choices: f2.choices };
      if (!f2.task) return { say: "「" + q + "」は動いていません" };
      tid = f2.task.id;
      if (activeIds.indexOf(tid) < 0) return { say: f2.task.name + "は動いていません" };
    } else {
      if (!activeIds.length) return { say: "いま動いている家事はありません" };
      if (activeIds.length > 1) return { say: "どれを終わりますか？", choices: activeIds.map(function (id) { return byId[id].name; }) };
      tid = activeIds[0];
    }
    var task = byId[tid];
    var sec = (paused[tid] || 0) + (running[tid] ? Math.floor((nowMs - running[tid]) / 1000) : 0);
    var startMs = started[tid] || (running[tid] ? running[tid] - (paused[tid] || 0) * 1000 : nowMs - sec * 1000);
    var today = ymd(nowMs);
    var logDate = ymd(startMs); if (logDate > today) logDate = today;
    var crossed = logDate !== today;
    var pts = task.points || 1;
    var rec = await sb.from("records").insert({
      id: "log" + nowMs, task_id: tid, task_name_snapshot: task.name, category_id: task.category_id,
      date: logDate, seconds: sec, time_label: crossed ? hm(startMs) + "〜" : hm(nowMs), points: pts,
    });
    if (rec && rec.error) throw new Error(rec.error.message);
    await sb.from("point_history").insert({ id: "pe" + nowMs, type: "earn", amount: pts, reason: task.name, date: logDate });
    delete running[tid]; delete paused[tid]; delete started[tid];
    var dRes = await sb.from("records").select("date").gte("date", ymd(nowMs - 400 * 86400000));
    var dates = (dRes.data || []).map(function (r) { return r.date; });
    var last = st.last_log_date && st.last_log_date > logDate ? st.last_log_date : logDate;
    var up = await sb.from("app_state").update({
      running_timers: running, paused_timers: paused, started_timers: started,
      total_points: (st.total_points || 0) + pts, streak: recalcStreak(dates, nowMs), last_log_date: last,
      updated_at: new Date(nowMs).toISOString(),
    }).eq("id", 1);
    if (up && up.error) throw new Error(up.error.message);
    return { say: task.name + "を完了しました。" + minText(sec) + "、" + pts + "ポイント" + (crossed ? "。" + md(logDate) + "の記録にしました" : "") };
  }

  return { say: "使い方：action=start / stop / status" };
}

export default async function handler(req, res) {
  try {
    var params = Object.assign({}, req.query || {}, (req.body && typeof req.body === "object") ? req.body : {});
    var token = process.env.KAJI_TOKEN;
    if (token && params.k !== token) return send(res, 401, { say: "合言葉がちがいます" });
    var sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    var out = await handle(params, sb, Date.now());
    return send(res, 200, out);
  } catch (e) {
    return send(res, 500, { say: "エラーで記録できませんでした" , error: String(e && e.message || e) });
  }
}
