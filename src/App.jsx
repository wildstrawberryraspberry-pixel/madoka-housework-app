import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ═══ Supabase 設定 ═══
const SUPABASE_URL = "https://jjfapdomwrkeenswotoc.supabase.co";
const SUPABASE_KEY = "sb_publishable_dA_dsxfo-_6HP0nRBcs27A_pCFOE-oV";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══ 定数 ═══
var DEF_CATEGORIES = [
  { id: "cooking", name: "料理", emoji: "🍳", color: "#FF8A65" },
  { id: "cleaning", name: "掃除", emoji: "🧹", color: "#4DB6AC" },
  { id: "laundry", name: "洗濯", emoji: "👕", color: "#7986CB" },
  { id: "childcare", name: "育児", emoji: "👶", color: "#F06292" },
  { id: "other", name: "その他", emoji: "📦", color: "#90A4AE" },
];
var CAT_COLORS = ["#FF8A65", "#4DB6AC", "#7986CB", "#F06292", "#90A4AE", "#AED581", "#FFD54F", "#CE93D8", "#4FC3F7", "#E57373", "#81C784", "#FFB74D"];
var DJ = ["日", "月", "火", "水", "木", "金", "土"];
var TK = "madoka-housework-timer";
var OLD_LS_KEY = "madoka-housework-v1";

var DEF_REWARDS = [
  { id: "hr1", name: "マッサージに行く", cost: 100, emoji: "💆" },
  { id: "hr2", name: "スパ・温泉に行く", cost: 150, emoji: "♨️" },
  { id: "hr3", name: "カフェでひとり時間", cost: 50, emoji: "☕" },
  { id: "hr4", name: "好きなスイーツを買う", cost: 30, emoji: "🍰" },
  { id: "hr5", name: "ネイルサロン", cost: 120, emoji: "💅" },
  { id: "hr6", name: "映画を観に行く", cost: 80, emoji: "🎬" },
  { id: "hr7", name: "好きな本を買う", cost: 40, emoji: "📖" },
];

function getToday() {
  var n = new Date();
  return { now: n, td: n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0") };
}
var NOW = new Date();
var TD = getToday().td;
// ミリ秒 → "YYYY-MM-DD"（端末のローカル日付）
function ymdOf(ms) {
  var n = new Date(ms);
  return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
}

function emptyData() {
  return { rooms: [], tasks: {}, taskOrder: [], logs: [], streak: 0, lastLogDate: "", categories: DEF_CATEGORIES.map(function (c) { return Object.assign({}, c); }), points: 0, pointHistory: [], rewards: DEF_REWARDS.map(function (r) { return Object.assign({}, r); }) };
}
function clone(d) { return JSON.parse(JSON.stringify(d)); }
function fmtSec(s) {
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
}
function fmtMin(s) {
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  if (h > 0) return h + "時間" + m + "分";
  return m + "分";
}
function daysBetween(a, b) {
  var d1 = new Date(a); var d2 = new Date(b);
  return Math.round((d2 - d1) / 86400000);
}
// 記録(logs)から連続記録(streak)を計算し直す。
// 今日（記録が無ければ昨日）を起点に、連続して記録のある日数を数える。
// これにより、過去日に後から記録を追加してもstreakが正しく反映される。
function recalcStreak(logs) {
  var active = {};
  (logs || []).forEach(function (l) { if (l.date) active[l.date] = true; });
  function dstr(dt) {
    return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
  }
  var cur = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
  if (!active[dstr(cur)]) {
    cur.setDate(cur.getDate() - 1);
    if (!active[dstr(cur)]) return 0;
  }
  var s = 0;
  while (active[dstr(cur)]) { s++; cur.setDate(cur.getDate() - 1); }
  return s;
}

// ═══ Supabase: 全データ読み込み ═══
async function loadAllFromSupabase() {
  var results = await Promise.all([
    sb.from("categories").select("*"),
    sb.from("tasks").select("*").order("sort_order"),
    sb.from("records").select("*"),
    sb.from("rewards").select("*"),
    sb.from("point_history").select("*"),
    sb.from("app_state").select("*").eq("id", 1).maybeSingle(),
    sb.from("rooms").select("*").order("sort_order"),
  ]);
  var cRes = results[0], tRes = results[1], rRes = results[2], rwRes = results[3], phRes = results[4], asRes = results[5], roRes = results[6];
  var rooms = ((roRes && roRes.data) || []).map(function (r) { return { id: r.id, name: r.name, emoji: r.emoji || "🚪", is_deleted: !!r.is_deleted }; });

  var cats = (cRes.data || []).filter(function (c) { return !c.is_deleted; }).sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
  if (cats.length === 0) cats = DEF_CATEGORIES.map(function (c) { return Object.assign({}, c); });

  var tasks = {};
  var taskOrder = [];
  (tRes.data || []).filter(function (t) { return !t.is_deleted; }).forEach(function (t) {
    tasks[t.id] = { id: t.id, name: t.name, category: t.category_id, points: t.points, room: t.room_id || null, interval: t.interval_days == null ? null : t.interval_days, storage: !!t.is_storage };
    taskOrder.push(t.id);
  });

  var logs = (rRes.data || []).map(function (r) {
    return { id: r.id, taskId: r.task_id, taskName: r.task_name_snapshot, category: r.category_id, date: r.date, seconds: r.seconds, time: r.time_label, points: r.points };
  });

  var rewards = (rwRes.data || []).filter(function (r) { return !r.is_deleted; });
  if (rewards.length === 0) rewards = DEF_REWARDS.map(function (r) { return Object.assign({}, r); });

  var pointHistory = (phRes.data || []).map(function (p) {
    return { id: p.id, type: p.type, amount: p.amount, reason: p.reason, date: p.date };
  });

  var state = asRes.data || { total_points: 0, streak: 0, last_log_date: null };

  return {
    tasks: tasks,
    taskOrder: taskOrder,
    logs: logs,
    streak: state.streak || 0,
    lastLogDate: state.last_log_date || "",
    categories: cats,
    points: state.total_points || 0,
    pointHistory: pointHistory,
    rewards: rewards,
    rooms: rooms,
    _timers: {
      running: state.running_timers || {},
      paused: state.paused_timers || {},
      startedAt: state.started_timers || {},
    },
  };
}

// ═══ タイマー状態（Apple Watch / Siri と共有するため Supabase の app_state に保存）═══
// fn(cur) は cur = {running, paused, startedAt} を書き換える関数。最新のサーバー値に適用して保存する
async function pushTimersToSupabase(fn) {
  var r = await sb.from("app_state").select("running_timers,paused_timers,started_timers").eq("id", 1).maybeSingle();
  var s = (r && r.data) || {};
  var cur = { running: Object.assign({}, s.running_timers || {}), paused: Object.assign({}, s.paused_timers || {}), startedAt: Object.assign({}, s.started_timers || {}) };
  fn(cur);
  var u = await sb.from("app_state").update({ running_timers: cur.running, paused_timers: cur.paused, started_timers: cur.startedAt }).eq("id", 1);
  if (u && u.error) console.error("timer sync error:", u.error);
}
function sameJson(a, b) { return JSON.stringify(a || {}) === JSON.stringify(b || {}); }

// ═══ Supabase: 状態全体を同期 ═══
async function syncAllToSupabase(d) {
  // categories
  if (d.categories && d.categories.length > 0) {
    var catsData = d.categories.map(function (c, i) {
      return { id: c.id, name: c.name, emoji: c.emoji || null, color: c.color || null, sort_order: i, is_deleted: !!c.is_deleted };
    });
    await sb.from("categories").upsert(catsData);
  }
  // tasks: taskOrder のインデックスを sort_order として保存
  var tasksList = Object.values(d.tasks || {});
  if (tasksList.length > 0) {
    var orderMap = {};
    (d.taskOrder || []).forEach(function (id, idx) { orderMap[id] = idx; });
    var tasksData = tasksList.map(function (t) {
      return {
        id: t.id,
        category_id: t.category,
        name: t.name,
        points: t.points || 1,
        sort_order: orderMap[t.id] !== undefined ? orderMap[t.id] : 9999,
        is_deleted: !!t.is_deleted,
        room_id: t.room || null,
        interval_days: t.interval == null ? null : t.interval,
        is_storage: !!t.storage,
      };
    });
    await sb.from("tasks").upsert(tasksData);
  }
  // rooms（部屋）
  if (d.rooms && d.rooms.length > 0) {
    var roomsData = d.rooms.map(function (r, i) {
      return { id: r.id, name: r.name, emoji: r.emoji || null, sort_order: i, is_deleted: !!r.is_deleted };
    });
    await sb.from("rooms").upsert(roomsData);
  }
  // records
  if (d.logs && d.logs.length > 0) {
    var recsData = d.logs.map(function (l) {
      return { id: l.id, task_id: l.taskId, task_name_snapshot: l.taskName, category_id: l.category, date: l.date, seconds: l.seconds, time_label: l.time, points: l.points };
    });
    await sb.from("records").upsert(recsData);
  }
  // rewards
  if (d.rewards && d.rewards.length > 0) {
    var rwData = d.rewards.map(function (r) {
      return { id: r.id, name: r.name, emoji: r.emoji || null, cost: r.cost, is_deleted: !!r.is_deleted };
    });
    await sb.from("rewards").upsert(rwData);
  }
  // point_history
  if (d.pointHistory && d.pointHistory.length > 0) {
    var phData = d.pointHistory.map(function (p) {
      return { id: p.id, type: p.type, amount: p.amount, reason: p.reason, date: p.date };
    });
    await sb.from("point_history").upsert(phData);
  }
  // app_state
  await sb.from("app_state").upsert({
    id: 1,
    total_points: d.points || 0,
    streak: d.streak || 0,
    last_log_date: d.lastLogDate || null,
    updated_at: new Date().toISOString(),
  });
}

// ═══ localStorage → Supabase 移行 ═══
async function migrateFromLocalStorage() {
  var raw;
  try { raw = localStorage.getItem(OLD_LS_KEY); } catch (e) { return null; }
  if (!raw) return null;
  var oldData;
  try { oldData = JSON.parse(raw); } catch (e) { return null; }
  if (!oldData || !oldData.tasks) return null;

  var d = {
    tasks: oldData.tasks || {},
    taskOrder: oldData.taskOrder || Object.keys(oldData.tasks || {}),
    logs: oldData.logs || [],
    streak: oldData.streak || 0,
    lastLogDate: oldData.lastLogDate || "",
    categories: oldData.categories && oldData.categories.length > 0 ? oldData.categories : DEF_CATEGORIES.map(function (c) { return Object.assign({}, c); }),
    points: oldData.points || 0,
    pointHistory: oldData.pointHistory || [],
    rewards: oldData.rewards && oldData.rewards.length > 0 ? oldData.rewards : DEF_REWARDS.map(function (r) { return Object.assign({}, r); }),
  };
  await syncAllToSupabase(d);
  try { localStorage.setItem(OLD_LS_KEY + "_migrated", new Date().toISOString()); } catch (e) {}
  return d;
}

// ═══════════════════════════════════════════════
// メインコンポーネント
// ═══════════════════════════════════════════════
export default function App() {
  var _gt = getToday(); NOW = _gt.now; TD = _gt.td;
  var _d = useState(emptyData), data = _d[0], setData = _d[1];
  var _r = useState(false), ready = _r[0], setReady = _r[1];
  var _err = useState(null), err = _err[0], setErr = _err[1];
  var _t = useState("home"), tab = _t[0], setTab = _t[1];
  var _at = useState(null), addingTo = _at[0], setAddingTo = _at[1];
  var _mig = useState(null), migPrompt = _mig[0], setMigPrompt = _mig[1];

  var _savedTimer = (function () {
    try {
      var raw = localStorage.getItem(TK);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  })();
  var _run = useState(_savedTimer ? _savedTimer.running || {} : {}), running = _run[0], setRunning = _run[1];
  var _paused = useState(_savedTimer ? _savedTimer.paused || {} : {}), paused = _paused[0], setPaused = _paused[1];
  // 家事を最初に開始した時刻（一時停止→再開しても変えない）。日をまたいで完了しても開始日に記録するため
  var _started = useState(_savedTimer ? _savedTimer.startedAt || {} : {}), startedAt = _started[0], setStartedAt = _started[1];
  var tickRef = useRef(null);
  var _now = useState(Date.now()), nowMs = _now[0], setNowMs = _now[1];

  useEffect(function () {
    tickRef.current = setInterval(function () { setNowMs(Date.now()); }, 1000);
    return function () { clearInterval(tickRef.current); };
  }, []);

  useEffect(function () {
    try { localStorage.setItem(TK, JSON.stringify({ running: running, paused: paused, startedAt: startedAt })); } catch (e) {}
  }, [running, paused, startedAt]);

  // 初回ロード
  useEffect(function () {
    (async function () {
      try {
        var loaded = await loadAllFromSupabase();
        var oldRaw = null;
        try { oldRaw = localStorage.getItem(OLD_LS_KEY); } catch (e) {}
        var alreadyMigrated = false;
        try { alreadyMigrated = !!localStorage.getItem(OLD_LS_KEY + "_migrated"); } catch (e) {}
        applyServerTimers(loaded._timers, true);
        delete loaded._timers;
        var sbIsEmpty = Object.keys(loaded.tasks).length === 0 && loaded.logs.length === 0;
        if (sbIsEmpty && oldRaw && !alreadyMigrated) {
          setMigPrompt(oldRaw);
          setData(loaded);
        } else {
          setData(loaded);
        }
        setReady(true);
      } catch (e) {
        console.error("Supabase load error:", e);
        setErr("読み込み失敗: " + (e.message || e));
        setReady(true);
      }
    })();
  }, []);

  var syncingRef = useRef(0);
  var lastLocalRef = useRef(0);
  var save = useCallback(function (d) {
    setData(d);
    syncingRef.current++;
    lastLocalRef.current = Date.now();
    syncAllToSupabase(d).catch(function (e) { console.error("Sync error:", e); })
      .then(function () { syncingRef.current--; lastLocalRef.current = Date.now(); });
  }, []);

  // サーバーのタイマー状態を画面に反映（Watchで開始/終了したもの）
  // isFirst: 初回ロード。サーバーが空でこの端末に動いているタイマーがあれば、サーバーへ引き継ぐ
  function applyServerTimers(t, isFirst) {
    if (!t) return;
    var serverEmpty = Object.keys(t.running).length === 0 && Object.keys(t.paused).length === 0;
    var localHas = Object.keys(running).length > 0 || Object.keys(paused).length > 0;
    // この端末のタイマーをサーバーへ引き継ぐのは、この版を初めて開いたときの1回だけ
    // （以後はサーバーが正。Watchで終えたタイマーがスマホの古い控えで復活しないように）
    var migrated = false;
    try { migrated = !!localStorage.getItem(TK + "_cloud"); localStorage.setItem(TK + "_cloud", "1"); } catch (e) {}
    if (isFirst && !migrated && serverEmpty && localHas) {
      var loc = { running: running, paused: paused, startedAt: startedAt };
      pushTimersToSupabase(function (cur) { cur.running = loc.running; cur.paused = loc.paused; cur.startedAt = loc.startedAt; }).catch(function (e) { console.error(e); });
      return;
    }
    setRunning(function (prev) { return sameJson(prev, t.running) ? prev : t.running; });
    setPaused(function (prev) { return sameJson(prev, t.paused) ? prev : t.paused; });
    setStartedAt(function (prev) { return sameJson(prev, t.startedAt) ? prev : t.startedAt; });
  }
  // タイマー操作：画面にすぐ反映 → サーバーの最新値にも同じ操作を適用
  function applyTimers(fn) {
    var cur = { running: Object.assign({}, running), paused: Object.assign({}, paused), startedAt: Object.assign({}, startedAt) };
    fn(cur);
    setRunning(cur.running); setPaused(cur.paused); setStartedAt(cur.startedAt);
    lastLocalRef.current = Date.now();
    pushTimersToSupabase(fn).catch(function (e) { console.error("timer sync error:", e); })
      .then(function () { lastLocalRef.current = Date.now(); });
  }

  // 定期確認（10秒ごと＋アプリを開き直したとき）：Watchからの開始・完了を取り込む
  var dataRef = useRef(data); dataRef.current = data;
  useEffect(function () {
    if (!ready) return;
    var busy = false;
    function quiet() { return syncingRef.current === 0 && Date.now() - lastLocalRef.current > 5000; }
    async function fullReload() {
      var loaded = await loadAllFromSupabase();
      if (!quiet()) return;
      applyServerTimers(loaded._timers, false);
      delete loaded._timers;
      setData(loaded);
    }
    async function poll(force) {
      if (busy || document.hidden || !quiet()) return;
      busy = true;
      try {
        if (force) { await fullReload(); return; }
        var r = await sb.from("app_state").select("*").eq("id", 1).maybeSingle();
        var st = r && r.data;
        if (!st || !quiet()) return;
        // ポイントが変わっていたら Watch で家事が完了された → 記録ごと読み直す
        if ((st.total_points || 0) !== (dataRef.current.points || 0)) { await fullReload(); return; }
        applyServerTimers({ running: st.running_timers || {}, paused: st.paused_timers || {}, startedAt: st.started_timers || {} }, false);
      } catch (e) { console.error("poll error:", e); }
      finally { busy = false; }
    }
    var iv = setInterval(function () { poll(false); }, 10000);
    function onVis() { if (!document.hidden) poll(true); }
    document.addEventListener("visibilitychange", onVis);
    return function () { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, [ready]);

  var doMigrate = async function () {
    try {
      setReady(false);
      var d = await migrateFromLocalStorage();
      if (d) setData(d);
      setMigPrompt(null);
      setReady(true);
    } catch (e) {
      console.error(e);
      setErr("移行失敗: " + (e.message || e));
      setReady(true);
    }
  };
  var skipMigrate = function () {
    try { localStorage.setItem(OLD_LS_KEY + "_migrated", "skipped " + new Date().toISOString()); } catch (e) {}
    setMigPrompt(null);
  };

  function getElapsed(taskId) {
    var p = paused[taskId] || 0;
    var r = running[taskId];
    if (r) return p + Math.floor((nowMs - r) / 1000);
    return p;
  }
  function isRunning(taskId) { return !!running[taskId]; }
  function isPaused(taskId) { return !running[taskId] && (paused[taskId] || 0) > 0; }
  function startTask(taskId) {
    var nowT = Date.now();
    applyTimers(function (c) {
      if (c.running[taskId]) return;
      if (!c.startedAt[taskId] && !(c.paused[taskId] > 0)) c.startedAt[taskId] = nowT;
      c.running[taskId] = nowT;
    });
  }
  // 開始時刻（ms）。この更新より前に始めたタイマーは経過時間から逆算
  function getStartMs(taskId) {
    if (startedAt[taskId]) return startedAt[taskId];
    var p = paused[taskId] || 0;
    if (running[taskId]) return running[taskId] - p * 1000;
    return Date.now() - p * 1000;
  }
  function getStartDate(taskId) { return ymdOf(getStartMs(taskId)); }
  function clearTimer(taskId) {
    applyTimers(function (c) { delete c.running[taskId]; delete c.paused[taskId]; delete c.startedAt[taskId]; });
  }
  function pauseTask(taskId) {
    var nowT = Date.now();
    applyTimers(function (c) {
      if (c.running[taskId]) {
        var elapsed = Math.floor((nowT - c.running[taskId]) / 1000);
        c.paused[taskId] = (c.paused[taskId] || 0) + elapsed;
        delete c.running[taskId];
      }
    });
  }
  function resumeTask(taskId) { startTask(taskId); }
  // 完了前にサーバーを確認（Watchですでに完了していたら二重記録しない）
  async function finishTask(taskId) {
    try {
      var chk = await sb.from("app_state").select("running_timers,paused_timers,started_timers").eq("id", 1).maybeSingle();
      var cs = chk && chk.data;
      if (cs && !(cs.running_timers || {})[taskId] && !((cs.paused_timers || {})[taskId] > 0)) {
        var loaded = await loadAllFromSupabase();
        applyServerTimers(loaded._timers, false);
        delete loaded._timers;
        setData(loaded);
        return;
      }
    } catch (e) { console.error("finish check error:", e); }
    finishTaskNow(taskId);
  }
  function finishTaskNow(taskId) {
    var totalSec = getElapsed(taskId);
    var task = data.tasks[taskId];
    if (!task) return;
    var d = clone(data);
    var ptAmt = task.points || 1;
    // 記録日＝家事を開始した日（終了を押し忘れて日をまたいでも、開始日に記録）
    var startMs = getStartMs(taskId);
    var logDate = ymdOf(startMs);
    if (logDate > TD) logDate = TD;
    var crossed = logDate !== TD;
    var hm = function (ms) { return new Date(ms).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }); };
    d.logs.push({
      id: "log" + Date.now(),
      taskId: taskId,
      taskName: task.name,
      category: task.category,
      date: logDate,
      seconds: totalSec,
      // 日をまたいだときは開始時刻を記録（例 "21:30〜"）
      time: crossed ? hm(startMs) + "〜" : hm(Date.now()),
      points: ptAmt,
    });
    d.points = (d.points || 0) + ptAmt;
    if (!d.pointHistory) d.pointHistory = [];
    d.pointHistory.push({ type: "earn", amount: ptAmt, reason: task.name, date: logDate, id: "pe" + Date.now() });
    if (!d.lastLogDate || logDate > d.lastLogDate) d.lastLogDate = logDate;
    d.streak = recalcStreak(d.logs);
    save(d);
    clearTimer(taskId);
  }
  function cancelTimer(taskId) {
    clearTimer(taskId);
  }

  // Categories
  var cats = (data.categories || []).filter(function (c) { return !c.is_deleted; });
  if (cats.length === 0) cats = DEF_CATEGORIES;

  // Tasks by category (ordered by taskOrder)
  var tasksByCategory = {};
  cats.forEach(function (c) { tasksByCategory[c.id] = []; });
  var order = data.taskOrder || [];
  var allTasks = Object.values(data.tasks).filter(function (t) { return !t.is_deleted; });
  allTasks.sort(function (a, b) {
    var ai = order.indexOf(a.id); if (ai === -1) ai = 99999;
    var bi = order.indexOf(b.id); if (bi === -1) bi = 99999;
    return ai - bi;
  });
  allTasks.forEach(function (t) {
    if (tasksByCategory[t.category]) tasksByCategory[t.category].push(t);
    else if (!tasksByCategory[t.category]) { tasksByCategory[t.category] = [t]; }
  });

  var todayLogs = data.logs.filter(function (l) { return l.date === TD; });
  var todayCount = todayLogs.length;
  var todaySec = todayLogs.reduce(function (s, l) { return s + l.seconds; }, 0);
  var todayByCat = {};
  cats.forEach(function (c) { todayByCat[c.id] = 0; });
  todayLogs.forEach(function (l) { if (todayByCat[l.category] !== undefined) todayByCat[l.category] += l.seconds; });

  var runningCount = Object.keys(running).length;

  // 掃除・片付け系カテゴリー（🧹そうじタブで部屋ごとに管理する）
  var cleanCatIds = cleanCategoryIds(cats);
  var timer = { start: startTask, pause: pauseTask, resume: resumeTask, finish: finishTask, cancel: cancelTimer, isRunning: isRunning, isPaused: isPaused, getElapsed: getElapsed };
  var homeSuggest = ready ? suggestCleaning(data, cleanCatIds, 9999, null).slice(0, 3) : [];

  if (!ready) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#FAFAF7" }}>
        <div style={{ fontSize: 50 }}>🏠</div>
        <div style={{ fontSize: 17, fontWeight: 800, marginTop: 12 }}>まどかの家事トラッカー</div>
        <div style={{ fontSize: 13, color: "#999", marginTop: 4 }}>読み込み中...</div>
        {err && <div style={{ fontSize: 12, color: "#E53935", marginTop: 12, padding: 12, background: "#FFEBEE", borderRadius: 8 }}>{err}</div>}
      </div>
    );
  }

  if (migPrompt) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#FAFAF7", padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 400, width: "100%", boxShadow: "0 4px 12px rgba(0,0,0,.1)" }}>
          <div style={{ fontSize: 30, textAlign: "center" }}>📦</div>
          <div style={{ fontSize: 17, fontWeight: 800, textAlign: "center", marginTop: 8 }}>古いデータが見つかりました</div>
          <div style={{ fontSize: 13, color: "#666", marginTop: 12, lineHeight: 1.6 }}>
            このブラウザに保存されていた家事トラッカーのデータをSupabase（クラウド）に移行できます。<br /><br />
            今後はSupabaseが正となり、複数端末から同じデータを見られるようになります。
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            <button onClick={doMigrate} style={{ padding: 12, borderRadius: 10, border: "none", background: "#5D4037", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
              ☁️ クラウドに移行する
            </button>
            <button onClick={skipMigrate} style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd", background: "#fff", color: "#999", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              スキップ（古いデータは無視）
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <style>{cssText}</style>
      <header style={S.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>🏠 まどかの家事トラッカー</div>
            <div style={{ fontSize: 11, opacity: .8, marginTop: 2 }}>{NOW.getMonth() + 1}月{NOW.getDate()}日（{DJ[NOW.getDay()]}）</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {data.streak > 0 && <div style={S.streakBadge}>🔥 {data.streak}日</div>}
            <div style={S.streakBadge}>⭐ {data.points || 0}pt</div>
          </div>
        </div>
      </header>
      <main style={{ padding: "6px 12px", paddingBottom: 70 }}>
        {tab === "home" && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <div style={{ ...S.card, background: "linear-gradient(135deg, #E8F5E9, #fff)" }}>
              <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
                <MStat l="タスク完了" v={todayCount + "個"} c="#4CAF50" />
                <MStat l="合計時間" v={fmtMin(todaySec)} c="#2196F3" />
                <MStat l="ポイント" v={(data.points || 0) + "pt"} c="#FFB300" />
                <MStat l="連続記録" v={data.streak + "日"} c="#FF9800" />
              </div>
            </div>
            {runningCount > 0 && (
              <div style={S.card}>
                <div style={S.cardTitle}>⏱️ 進行中</div>
                {Object.keys(running).map(function (tid) {
                  var task = data.tasks[tid];
                  if (!task) return null;
                  var cat = cats.find(function (c) { return c.id === task.category; }) || cats[cats.length - 1];
                  var el = getElapsed(tid);
                  return (
                    <div key={tid} style={{ padding: "10px 0", borderBottom: "1px solid #f3f3f3" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: cat.color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{cat.emoji}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{task.name}</div>
                          {getStartDate(tid) !== TD && <div style={{ fontSize: 11, color: "#E53935", fontWeight: 700 }}>⚠️ {Number(getStartDate(tid).slice(5, 7))}/{Number(getStartDate(tid).slice(8, 10))}に開始 → 完了するとその日に記録</div>}
                          <div style={{ fontSize: 24, fontWeight: 900, color: cat.color, fontVariantNumeric: "tabular-nums" }}>{fmtSec(el)}</div>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={function () { pauseTask(tid); }} style={{ ...S.smBtn, background: "#FF9800", color: "#fff" }}>⏸</button>
                          <button onClick={function () { finishTask(tid); }} style={{ ...S.smBtn, background: "#4CAF50", color: "#fff" }}>✓完了</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {Object.keys(paused).filter(function (tid) { return !running[tid] && paused[tid] > 0; }).length > 0 && (
              <div style={S.card}>
                <div style={S.cardTitle}>⏸ 一時停止中</div>
                {Object.keys(paused).filter(function (tid) { return !running[tid] && paused[tid] > 0; }).map(function (tid) {
                  var task = data.tasks[tid];
                  if (!task) return null;
                  var cat = cats.find(function (c) { return c.id === task.category; }) || cats[cats.length - 1];
                  return (
                    <div key={tid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f3f3f3" }}>
                      <div style={{ fontSize: 20 }}>{cat.emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{task.name}</div>
                        {getStartDate(tid) !== TD && <div style={{ fontSize: 11, color: "#E53935", fontWeight: 700 }}>⚠️ {Number(getStartDate(tid).slice(5, 7))}/{Number(getStartDate(tid).slice(8, 10))}に開始 → 完了するとその日に記録</div>}
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#999" }}>{fmtSec(paused[tid])}</div>
                      </div>
                      <button onClick={function () { resumeTask(tid); }} style={{ ...S.smBtn, background: cat.color, color: "#fff" }}>▶ 再開</button>
                      <button onClick={function () { finishTask(tid); }} style={{ ...S.smBtn, background: "#4CAF50", color: "#fff" }}>✓完了</button>
                      <button onClick={function () { cancelTimer(tid); }} style={{ ...S.smBtn, background: "#eee", color: "#999" }}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={S.card}>
              <div style={S.cardTitle}>▶ 家事をはじめる</div>
              <div style={{ marginBottom: 12, padding: 10, borderRadius: 12, background: "#E0F2F1" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: homeSuggest.length ? 6 : 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#00897B" }}>🧹 掃除・片付け{homeSuggest.length ? "（そろそろやりどき）" : ""}</div>
                  <button onClick={function () { setTab("clean"); }} style={{ ...S.smBtn, fontSize: 11, background: "#00897B", color: "#fff" }}>部屋ごとに見る ›</button>
                </div>
                {homeSuggest.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {homeSuggest.map(function (it) {
                      var isR = isRunning(it.task.id), isP = isPaused(it.task.id);
                      return (
                        <button key={it.task.id} onClick={function () { if (isR) pauseTask(it.task.id); else if (isP) resumeTask(it.task.id); else startTask(it.task.id); }} style={{ padding: "6px 10px", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", background: isR ? "#4DB6AC" : isP ? "#FFF3E0" : "#fff", color: isR ? "#fff" : isP ? "#FF9800" : "#555" }}>
                          {isR ? "⏸ " : isP ? "▶ " : ""}{it.task.name}<span style={{ fontSize: 10, opacity: .7 }}> 約{it.min}分</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {cats.map(function (cat) {
                var tasks = tasksByCategory[cat.id] || [];
                if (tasks.length === 0) return null;
                if (cleanCatIds.indexOf(cat.id) !== -1) return null;
                return (
                  <div key={cat.id} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: cat.color, marginBottom: 6 }}>{cat.emoji} {cat.name}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {tasks.map(function (t) {
                        var isR = isRunning(t.id);
                        var isP = isPaused(t.id);
                        return (
                          <button key={t.id} onClick={function () {
                            if (isR) pauseTask(t.id);
                            else if (isP) resumeTask(t.id);
                            else startTask(t.id);
                          }} style={{
                            padding: "6px 12px", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                            background: isR ? cat.color : isP ? "#FFF3E0" : "#f5f5f5",
                            color: isR ? "#fff" : isP ? "#FF9800" : "#555",
                          }}>
                            {isR ? "⏸ " : isP ? "▶ " : ""}{t.name}{!isR && !isP && t.points ? " +" + (t.points || 1) + "pt" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {Object.values(data.tasks).filter(function (t) { return !t.is_deleted; }).length === 0 && (
                <div style={{ fontSize: 13, color: "#bbb", textAlign: "center", padding: 10 }}>
                  「タスク管理」タブからタスクを追加してください
                </div>
              )}
            </div>
            {todayCount > 0 && (
              <div style={S.card}>
                <div style={S.cardTitle}>📊 今日のカテゴリー別</div>
                {cats.map(function (cat) {
                  var sec = todayByCat[cat.id] || 0;
                  if (sec === 0) return null;
                  var pct = todaySec > 0 ? Math.round((sec / todaySec) * 100) : 0;
                  return (
                    <div key={cat.id} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                        <span style={{ fontWeight: 600 }}>{cat.emoji} {cat.name}</span>
                        <span style={{ color: cat.color, fontWeight: 700 }}>{fmtMin(sec)}（{pct}%）</span>
                      </div>
                      <div style={S.progBar}><div style={{ height: "100%", borderRadius: 3, background: cat.color, width: pct + "%" }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
            {todayLogs.length > 0 && (
              <div style={S.card}>
                <div style={S.cardTitle}>📜 今日の記録</div>
                {todayLogs.slice().reverse().map(function (l) {
                  var cat = cats.find(function (c) { return c.id === l.category; }) || cats[cats.length - 1];
                  return (
                    <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f5f5f5", fontSize: 12 }}>
                      <span>{cat.emoji}</span>
                      <span style={{ flex: 1, fontWeight: 600 }}>{l.taskName}</span>
                      <span style={{ color: "#aaa" }}>{l.time}</span>
                      <span style={{ color: cat.color, fontWeight: 700 }}>{fmtMin(l.seconds)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <WeekView data={data} />
          </div>
        )}
        {tab === "tasks" && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>📋 タスク管理</h2>
            {cats.map(function (cat) {
              var tasks = tasksByCategory[cat.id] || [];
              if (cleanCatIds.indexOf(cat.id) !== -1) {
                return (
                  <div key={cat.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ ...S.cardTitle, marginBottom: 0, flex: 1 }}>{cat.emoji} {cat.name}<span style={{ fontSize: 11, color: "#aaa", fontWeight: 400 }}>（{tasks.length}件）</span></div>
                    <button onClick={function () { setTab("clean"); }} style={{ ...S.smBtn, fontSize: 11, background: "#E0F2F1", color: "#00897B" }}>🧹 部屋ごとに編集 ›</button>
                  </div>
                );
              }
              return (
                <div key={cat.id} style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={S.cardTitle}>{cat.emoji} {cat.name}</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={function () { setAddingTo(addingTo === cat.id ? null : cat.id); }} style={{ ...S.addBtn, background: cat.color }}>{addingTo === cat.id ? "✕" : "＋"}</button>
                      {tasks.length === 0 && (
                        <button onClick={function () {
                          var d = clone(data);
                          d.categories = (d.categories || []).map(function (c) {
                            return c.id === cat.id ? Object.assign({}, c, { is_deleted: true }) : c;
                          });
                          save(d);
                        }} style={{ ...S.addBtn, background: "#eee", color: "#999" }}>🗑</button>
                      )}
                    </div>
                  </div>
                  {addingTo === cat.id && <AddTaskForm cat={cat} data={data} save={save} onDone={function () { setAddingTo(null); }} />}
                  {tasks.length > 0 ? tasks.map(function (t, idx) {
                    return <TaskListItem key={t.id} task={t} cat={cat} data={data} save={save} isFirst={idx === 0} isLast={idx === tasks.length - 1} onMove={function (taskId, dir) {
                      var d = clone(data);
                      if (!d.taskOrder) d.taskOrder = Object.keys(d.tasks);
                      var catTasks = tasks.map(function (tt) { return tt.id; });
                      var i = catTasks.indexOf(taskId);
                      if (i === -1) return;
                      var j = i + dir;
                      if (j < 0 || j >= catTasks.length) return;
                      var gi = d.taskOrder.indexOf(catTasks[i]);
                      var gj = d.taskOrder.indexOf(catTasks[j]);
                      if (gi === -1 || gj === -1) return;
                      var tmp = d.taskOrder[gi];
                      d.taskOrder[gi] = d.taskOrder[gj];
                      d.taskOrder[gj] = tmp;
                      save(d);
                    }} />;
                  }) : (
                    <div style={{ fontSize: 12, color: "#ccc", padding: "4px 0" }}>タスクを追加してください</div>
                  )}
                </div>
              );
            })}
            <AddCategoryForm data={data} save={save} cats={cats} />
          </div>
        )}
        {tab === "clean" && <CleanTab data={data} save={save} cats={cats} cleanCatIds={cleanCatIds} timer={timer} nowMs={nowMs} />}
        {tab === "rewards" && <RewardsTab data={data} save={save} />}
        {tab === "stats" && <StatsTab data={data} cats={cats} save={save} />}
      </main>
      <nav style={S.nav}>
        {[
          { id: "home", icon: "🏠", l: "ホーム" },
          { id: "clean", icon: "🧹", l: "そうじ" },
          { id: "tasks", icon: "📋", l: "タスク管理" },
          { id: "rewards", icon: "🎁", l: "ごほうび" },
          { id: "stats", icon: "📊", l: "統計" },
        ].map(function (t) {
          return (
            <button key={t.id} onClick={function () { setTab(t.id); }} style={{ ...S.navBtn, color: tab === t.id ? "#5D4037" : "#aaa" }}>
              <span style={{ fontSize: 20 }}>{t.icon}</span>
              <span style={{ fontSize: 9, fontWeight: tab === t.id ? 700 : 400, marginTop: 1 }}>{t.l}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ═══════════════════════════════════════════════
// 🧹 そうじ（部屋ごと管理・放置度・◯分ある提案）
// ═══════════════════════════════════════════════
var INTERVALS = [
  { v: 1, l: "毎日" }, { v: 3, l: "3日に1回" }, { v: 7, l: "週1" }, { v: 14, l: "2週に1回" },
  { v: 30, l: "月1" }, { v: 60, l: "2か月に1回" }, { v: 90, l: "3か月に1回" }, { v: 180, l: "半年に1回" },
  { v: 365, l: "年1" }, { v: null, l: "決めない（提案しない）" },
];
var DEFAULT_MIN = 15; // 記録がないときの仮の所要時間（分）
function intervalLabel(v) {
  if (v == null) return "目安なし";
  var f = INTERVALS.find(function (x) { return x.v === v; });
  return f ? f.l : v + "日に1回";
}
// 掃除・片付け系カテゴリー：id が cleaning、または名前に「掃除／片付／整理」を含む
function cleanCategoryIds(cats) {
  return (cats || []).filter(function (c) { return !c.is_deleted && (c.id === "cleaning" || /掃除|片付|整理/.test(c.name || "")); }).map(function (c) { return c.id; });
}
function median(arr) {
  if (!arr.length) return 0;
  var s = arr.slice().sort(function (a, b) { return a - b; });
  var m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
// タスクごとの 最終実施日・回数・所要時間（直近10回の中央値。30秒未満と、中央値の3倍超＝止め忘れは除外）
function taskStatsMap(logs) {
  var by = {};
  (logs || []).forEach(function (l) {
    if (!l.taskId) return;
    var b = by[l.taskId] || (by[l.taskId] = { last: "", count: 0, recs: [] });
    b.count++;
    if (l.date > b.last) b.last = l.date;
    b.recs.push(l);
  });
  Object.keys(by).forEach(function (id) {
    var b = by[id];
    var secs = b.recs.slice().sort(function (a, c) { return a.date < c.date ? 1 : -1; }).slice(0, 10)
      .map(function (r) { return r.seconds || 0; }).filter(function (s) { return s >= 30; });
    var m = median(secs);
    var ok = secs.filter(function (s) { return secs.length < 3 || s <= m * 3; });
    b.medSec = ok.length ? median(ok) : 0;
    delete b.recs;
  });
  return by;
}
// 掃除系タスク1件ずつの状態
function cleanItems(data, cleanCatIds) {
  var st = taskStatsMap(data.logs);
  var roomIds = {};
  (data.rooms || []).forEach(function (r) { if (!r.is_deleted) roomIds[r.id] = true; });
  return Object.values(data.tasks || {}).filter(function (t) { return !t.is_deleted && cleanCatIds.indexOf(t.category) !== -1; }).map(function (t) {
    var s = st[t.id] || { last: "", count: 0, medSec: 0 };
    var daysAgo = s.last ? Math.max(0, daysBetween(s.last, TD)) : null;
    var ratio = null;
    if (t.interval) ratio = daysAgo == null ? 1 : daysAgo / t.interval; // 記録なし（追加したばかり等）は「やりどき」扱い
    var min = s.medSec ? Math.max(1, Math.round(s.medSec / 60)) : DEFAULT_MIN;
    return { task: t, room: t.room && roomIds[t.room] ? t.room : null, last: s.last, count: s.count, daysAgo: daysAgo, ratio: ratio, min: min, measured: !!s.medSec };
  });
}
function levelOf(ratio) {
  if (ratio == null) return { c: "#BDBDBD", bg: "#F5F5F5", l: "目安なし", n: 0 };
  if (ratio >= 2) return { c: "#E53935", bg: "#FFEBEE", l: "放置ぎみ", n: 3 };
  if (ratio >= 1) return { c: "#FB8C00", bg: "#FFF3E0", l: "やりどき", n: 2 };
  if (ratio >= 0.8) return { c: "#FDD835", bg: "#FFFDE7", l: "そろそろ", n: 1 };
  return { c: "#66BB6A", bg: "#E8F5E9", l: "きれい", n: 0 };
}
// ◯分でできる組み合わせを提案：放置度の高い順に、時間内に収まるものを詰める
function suggestCleaning(data, cleanCatIds, budgetMin, roomId) {
  var items = cleanItems(data, cleanCatIds).filter(function (it) {
    return it.ratio != null && it.ratio >= 0.8 && it.min <= budgetMin && (!roomId || it.room === roomId);
  });
  items.sort(function (a, b) { return b.ratio - a.ratio || a.min - b.min; });
  var out = [], used = 0;
  items.forEach(function (it) {
    if (used + it.min <= budgetMin) { out.push(it); used += it.min; }
  });
  return out;
}
function mdOf(ymd) { return ymd ? Number(ymd.slice(5, 7)) + "/" + Number(ymd.slice(8, 10)) : ""; }
function agoLabel(it) {
  if (!it.last) return "記録なし";
  if (it.daysAgo === 0) return "今日";
  return mdOf(it.last) + "（" + it.daysAgo + "日前）";
}

function CleanTab(p) {
  var data = p.data, save = p.save, cats = p.cats, cleanCatIds = p.cleanCatIds, timer = p.timer;
  var _v = useState("rooms"), view = _v[0], setView = _v[1];
  var _b = useState(null), budget = _b[0], setBudget = _b[1];
  var _bc = useState(""), budgetCustom = _bc[0], setBudgetCustom = _bc[1];
  var _rf = useState(""), roomFilter = _rf[0], setRoomFilter = _rf[1];
  var _ar = useState(false), addingRoom = _ar[0], setAddingRoom = _ar[1];
  var _sort = useState(false), sorting = _sort[0], setSorting = _sort[1];

  var rooms = (data.rooms || []).filter(function (r) { return !r.is_deleted; });
  var items = cleanItems(data, cleanCatIds);
  var itemsOf = function (rid) {
    return items.filter(function (it) { return it.room === rid; }).sort(function (a, b) {
      var ra = a.ratio == null ? -1 : a.ratio, rb = b.ratio == null ? -1 : b.ratio;
      return rb - ra;
    });
  };
  var unassigned = itemsOf(null);
  var activeIds = items.filter(function (it) { return timer.isRunning(it.task.id) || timer.isPaused(it.task.id); });
  var sug = budget ? suggestCleaning(data, cleanCatIds, budget, roomFilter || null) : [];
  var sugTotal = sug.reduce(function (s, it) { return s + it.min; }, 0);
  var roomOf = function (rid) { return rooms.find(function (r) { return r.id === rid; }); };

  function moveRoom(rid, dir) {
    var d = clone(data);
    var list = d.rooms || [];
    var vis = list.filter(function (r) { return !r.is_deleted; }).map(function (r) { return r.id; });
    var i = vis.indexOf(rid), j = i + dir;
    if (i < 0 || j < 0 || j >= vis.length) return;
    var gi = list.findIndex(function (r) { return r.id === vis[i]; });
    var gj = list.findIndex(function (r) { return r.id === vis[j]; });
    var tmp = list[gi]; list[gi] = list[gj]; list[gj] = tmp;
    save(d);
  }

  // ── 部屋の詳細 ──
  if (view !== "rooms" && (view === "__none__" || roomOf(view))) {
    var isUn = view === "__none__";
    var room = isUn ? { id: null, name: "部屋が未設定", emoji: "📍" } : roomOf(view);
    var list = itemsOf(isUn ? null : room.id);
    return (
      <div style={{ animation: "fadeIn .3s ease" }}>
        <button onClick={function () { setView("rooms"); }} style={{ background: "none", border: "none", fontSize: 13, color: "#00897B", fontWeight: 700, cursor: "pointer", padding: "4px 0", marginBottom: 6 }}>‹ 部屋の一覧へ</button>
        {isUn ? (
          <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>📍 部屋が未設定</h2>
        ) : (
          <RoomHeader room={room} data={data} save={save} onDeleted={function () { setView("rooms"); }} />
        )}
        {isUn && <div style={{ fontSize: 11, color: "#999", marginBottom: 10 }}>それぞれの「✏️」から部屋を選ぶと、その部屋に移ります</div>}
        {activeIds.length > 0 && <ActiveCard items={activeIds} timer={timer} />}
        <div style={S.card}>
          {list.length === 0 && <div style={{ fontSize: 12, color: "#bbb", padding: "4px 0" }}>まだ何もありません。下から追加してください</div>}
          {list.map(function (it) {
            return <CleanItemRow key={it.task.id} it={it} data={data} save={save} rooms={rooms} cats={cats} cleanCatIds={cleanCatIds} timer={timer} />;
          })}
        </div>
        {!isUn && <AddCleanItem room={room} data={data} save={save} cats={cats} cleanCatIds={cleanCatIds} />}
      </div>
    );
  }

  // ── 部屋の一覧（トップ）──
  return (
    <div style={{ animation: "fadeIn .3s ease" }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>🧹 そうじ・片付け</h2>

      <div style={{ ...S.card, background: "linear-gradient(135deg, #E0F2F1, #fff)" }}>
        <div style={S.cardTitle}>⏱ いま何分ある？</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {[10, 15, 30, 60].map(function (m) {
            var on = budget === m;
            return <button key={m} onClick={function () { setBudget(on ? null : m); setBudgetCustom(""); }} style={{ ...S.smBtn, background: on ? "#00897B" : "#fff", color: on ? "#fff" : "#00897B", border: "1.5px solid #00897B" }}>{m}分</button>;
          })}
          <input type="number" min="1" value={budgetCustom} placeholder="◯分" onChange={function (e) { setBudgetCustom(e.target.value); var n = parseInt(e.target.value); setBudget(n > 0 ? n : null); }} style={{ ...S.input, width: 64, flex: "none", textAlign: "center", padding: "6px 6px" }} />
        </div>
        {budget && (
          <div style={{ marginTop: 10 }}>
            <select value={roomFilter} onChange={function (e) { setRoomFilter(e.target.value); }} style={{ ...S.input, width: "100%", marginBottom: 8, padding: "6px 8px" }}>
              <option value="">🏠 家じゅうから選ぶ</option>
              {rooms.map(function (r) { return <option key={r.id} value={r.id}>{r.emoji} {r.name}だけ</option>; })}
            </select>
            {sug.length === 0 ? (
              <div style={{ fontSize: 12, color: "#888", padding: "6px 0" }}>{budget}分で収まる「やりどき」のものはありません。きれいな状態です✨</div>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: "#00897B", fontWeight: 700, marginBottom: 4 }}>おすすめ {sug.length}件・合計 約{sugTotal}分</div>
                {sug.map(function (it) {
                  var r = roomOf(it.room);
                  return <SuggestRow key={it.task.id} it={it} room={r} timer={timer} />;
                })}
              </div>
            )}
            <div style={{ fontSize: 10, color: "#aaa", marginTop: 6, lineHeight: 1.5 }}>放置度（前回からの日数÷目安）が高い順に、時間内に収まるものを選んでいます。時間は過去の記録の中央値で、記録がないものは{DEFAULT_MIN}分の仮置きです（「仮」と表示）。</div>
          </div>
        )}
      </div>

      {activeIds.length > 0 && <ActiveCard items={activeIds} timer={timer} />}

      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ ...S.cardTitle, marginBottom: 0 }}>🏠 部屋ごと</div>
          <button onClick={function () { setSorting(!sorting); }} style={{ ...S.smBtn, fontSize: 11, background: sorting ? "#00897B" : "#eee", color: sorting ? "#fff" : "#888" }}>{sorting ? "完了" : "↕ 並べ替え"}</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: sorting ? "1fr" : "1fr 1fr", gap: 8 }}>
          {rooms.map(function (r, idx) {
            var its = itemsOf(r.id);
            var red = its.filter(function (it) { return levelOf(it.ratio).n === 3; }).length;
            var org = its.filter(function (it) { return levelOf(it.ratio).n === 2; }).length;
            var worst = its.reduce(function (mx, it) { return Math.max(mx, levelOf(it.ratio).n); }, 0);
            var lv = worst === 3 ? levelOf(2) : worst === 2 ? levelOf(1) : null;
            var col = worst === 3 ? "#E53935" : worst === 2 ? "#FB8C00" : worst === 1 ? "#FDD835" : "#66BB6A";
            if (sorting) {
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "#fafafa", borderRadius: 10 }}>
                  <span style={{ fontSize: 18 }}>{r.emoji}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{r.name}</span>
                  <button disabled={idx === 0} onClick={function () { moveRoom(r.id, -1); }} style={{ ...S.smBtn, background: "#fff", color: idx === 0 ? "#ddd" : "#888", border: "1px solid #eee" }}>▲</button>
                  <button disabled={idx === rooms.length - 1} onClick={function () { moveRoom(r.id, 1); }} style={{ ...S.smBtn, background: "#fff", color: idx === rooms.length - 1 ? "#ddd" : "#888", border: "1px solid #eee" }}>▼</button>
                </div>
              );
            }
            return (
              <div key={r.id} onClick={function () { setView(r.id); }} style={{ padding: 10, borderRadius: 12, cursor: "pointer", background: "#fff", border: "1.5px solid #eee", borderLeft: "5px solid " + col }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{r.emoji} {r.name}</div>
                <div style={{ fontSize: 10, color: "#999", marginTop: 3 }}>{its.length}か所{its.filter(function (it) { return it.task.storage; }).length ? "（収納" + its.filter(function (it) { return it.task.storage; }).length + "）" : ""}</div>
                <div style={{ fontSize: 10, marginTop: 2, fontWeight: 700, color: red ? "#E53935" : org ? "#FB8C00" : "#66BB6A" }}>
                  {red ? "🔴 放置ぎみ " + red : ""}{red && org ? "・" : ""}{org ? "🟠 やりどき " + org : ""}{!red && !org ? "✨ だいたいOK" : ""}
                </div>
              </div>
            );
          })}
        </div>
        {!sorting && unassigned.length > 0 && (
          <div onClick={function () { setView("__none__"); }} style={{ marginTop: 8, padding: 10, borderRadius: 12, cursor: "pointer", background: "#FAFAFA", border: "1.5px dashed #ccc" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#888" }}>📍 部屋が未設定（{unassigned.length}件）</div>
            <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>タップして部屋を振り分け</div>
          </div>
        )}
        {!sorting && (addingRoom ? (
          <AddRoomForm data={data} save={save} onDone={function (rid) { setAddingRoom(false); if (rid) setView(rid); }} />
        ) : (
          <button onClick={function () { setAddingRoom(true); }} style={{ width: "100%", marginTop: 10, padding: 10, borderRadius: 10, border: "2px dashed #B2DFDB", background: "transparent", fontSize: 13, fontWeight: 700, color: "#00897B", cursor: "pointer" }}>＋ 部屋を追加</button>
        ))}
      </div>
    </div>
  );
}

function SuggestRow(p) {
  var it = p.it, room = p.room, timer = p.timer;
  var lv = levelOf(it.ratio);
  var isR = timer.isRunning(it.task.id), isP = timer.isPaused(it.task.id);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #eef5f4" }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: lv.c, flex: "none" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{it.task.name}</div>
        <div style={{ fontSize: 10, color: "#999" }}>{room ? room.emoji + " " + room.name + "・" : ""}前回 {agoLabel(it)}・{lv.l}</div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#00897B", whiteSpace: "nowrap" }}>約{it.min}分{it.measured ? "" : <span style={{ fontSize: 9, color: "#bbb" }}>仮</span>}</div>
      <button onClick={function () { if (isR) timer.pause(it.task.id); else if (isP) timer.resume(it.task.id); else timer.start(it.task.id); }} style={{ ...S.smBtn, background: isR ? "#FF9800" : "#00897B", color: "#fff" }}>{isR ? "⏸" : "▶"}</button>
    </div>
  );
}

function ActiveCard(p) {
  var timer = p.timer;
  return (
    <div style={{ ...S.card, border: "1.5px solid #4DB6AC" }}>
      <div style={S.cardTitle}>⏱️ いま進行中</div>
      {p.items.map(function (it) {
        var isR = timer.isRunning(it.task.id);
        return (
          <div key={it.task.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{it.task.name}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: isR ? "#00897B" : "#aaa", fontVariantNumeric: "tabular-nums" }}>{fmtSec(timer.getElapsed(it.task.id))}{isR ? "" : " ⏸"}</div>
            </div>
            <button onClick={function () { if (isR) timer.pause(it.task.id); else timer.resume(it.task.id); }} style={{ ...S.smBtn, background: isR ? "#FF9800" : "#4DB6AC", color: "#fff" }}>{isR ? "⏸" : "▶"}</button>
            <button onClick={function () { timer.finish(it.task.id); }} style={{ ...S.smBtn, background: "#4CAF50", color: "#fff" }}>✓完了</button>
          </div>
        );
      })}
    </div>
  );
}

function CleanItemRow(p) {
  var it = p.it, data = p.data, save = p.save, rooms = p.rooms, cats = p.cats, cleanCatIds = p.cleanCatIds, timer = p.timer;
  var t = it.task;
  var _e = useState(false), editing = _e[0], setEditing = _e[1];
  var _n = useState(t.name), name = _n[0], setName = _n[1];
  var _r = useState(t.room || ""), room = _r[0], setRoom = _r[1];
  var _i = useState(t.interval == null ? "" : String(t.interval)), iv = _i[0], setIv = _i[1];
  var _k = useState(t.storage ? "storage" : (t.category === "cleaning" ? "clean" : "tidy")), kind = _k[0], setKind = _k[1];
  var lv = levelOf(it.ratio);
  var isR = timer.isRunning(t.id), isP = timer.isPaused(t.id);
  function saveEdit() {
    if (!name.trim()) return;
    var d = clone(data);
    var x = d.tasks[t.id]; if (!x) return;
    x.name = name.trim();
    x.room = room || null;
    x.interval = iv === "" ? null : parseInt(iv);
    x.storage = kind === "storage";
    x.category = catForKind(kind, cats, cleanCatIds, x.category);
    save(d);
    setEditing(false);
  }
  // タイマーなしで「やった」を記録（家族がやった・記録し忘れた分）。時間0秒なので所要時間の計算には使わない
  function markDone() {
    var d = clone(data);
    var ptAmt = t.points || 1;
    d.logs.push({ id: "log" + Date.now(), taskId: t.id, taskName: t.name, category: t.category, date: TD, seconds: 0, time: "記録のみ", points: ptAmt });
    d.points = (d.points || 0) + ptAmt;
    if (!d.pointHistory) d.pointHistory = [];
    d.pointHistory.push({ type: "earn", amount: ptAmt, reason: t.name, date: TD, id: "pe" + Date.now() });
    if (!d.lastLogDate || TD > d.lastLogDate) d.lastLogDate = TD;
    d.streak = recalcStreak(d.logs);
    save(d);
    setEditing(false);
  }
  function del() {
    if (!window.confirm("「" + t.name + "」を削除しますか？（これまでの記録は残ります）")) return;
    var d = clone(data);
    if (d.tasks[t.id]) d.tasks[t.id].is_deleted = true;
    if (d.taskOrder) d.taskOrder = d.taskOrder.filter(function (id) { return id !== t.id; });
    save(d);
  }
  return (
    <div style={{ padding: "9px 0", borderBottom: "1px solid #f3f3f3" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span title={lv.l} style={{ width: 10, height: 10, borderRadius: 5, background: lv.c, flex: "none" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {t.name}
            {t.storage && <span style={{ fontSize: 9, marginLeft: 4, padding: "1px 5px", borderRadius: 6, background: "#EDE7F6", color: "#7E57C2" }}>収納</span>}
          </div>
          <div style={{ fontSize: 10, color: "#999", marginTop: 1 }}>
            前回 {agoLabel(it)}・約{it.min}分{it.measured ? "" : "(仮)"}・{intervalLabel(t.interval)}
            {it.ratio != null && <span style={{ color: lv.c === "#FDD835" ? "#C0A000" : lv.c, fontWeight: 700 }}>・{lv.l}</span>}
          </div>
        </div>
        <button onClick={function () { setEditing(!editing); setName(t.name); setRoom(t.room || ""); setIv(t.interval == null ? "" : String(t.interval)); }} style={{ background: "none", border: "none", fontSize: 13, cursor: "pointer", color: "#bbb" }}>✏️</button>
        <button onClick={function () { if (isR) timer.pause(t.id); else if (isP) timer.resume(t.id); else timer.start(t.id); }} style={{ ...S.smBtn, background: isR ? "#FF9800" : isP ? "#FFF3E0" : "#E0F2F1", color: isR ? "#fff" : isP ? "#FF9800" : "#00897B" }}>{isR ? "⏸" : "▶"}</button>
      </div>
      {editing && (
        <div style={{ marginTop: 8, padding: 10, background: "#F7FBFA", borderRadius: 10 }}>
          <input value={name} onChange={function (e) { setName(e.target.value); }} style={{ ...S.input, width: "100%", marginBottom: 6 }} />
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <select value={room} onChange={function (e) { setRoom(e.target.value); }} style={{ ...S.input, padding: "6px 6px" }}>
              <option value="">📍 部屋なし</option>
              {rooms.map(function (r) { return <option key={r.id} value={r.id}>{r.emoji} {r.name}</option>; })}
            </select>
            <select value={iv} onChange={function (e) { setIv(e.target.value); }} style={{ ...S.input, padding: "6px 6px" }}>
              {INTERVALS.map(function (x) { return <option key={String(x.v)} value={x.v == null ? "" : String(x.v)}>{x.l}</option>; })}
            </select>
          </div>
          <KindPicker kind={kind} setKind={setKind} />
          <button onClick={markDone} style={{ ...S.smBtn, width: "100%", marginTop: 8, background: "#fff", color: "#43A047", border: "1px solid #C8E6C9" }}>✓ 今日やった（タイマーなしで記録だけ）</button>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={saveEdit} style={{ ...S.smBtn, background: "#00897B", color: "#fff", flex: 1 }}>保存</button>
            <button onClick={function () { setEditing(false); }} style={{ ...S.smBtn, background: "#eee", color: "#888" }}>やめる</button>
            <button onClick={del} style={{ ...S.smBtn, background: "#fff", color: "#E53935", border: "1px solid #FFCDD2" }}>🗑</button>
          </div>
        </div>
      )}
    </div>
  );
}

function KindPicker(p) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[{ k: "clean", l: "🧹 掃除" }, { k: "tidy", l: "🍀 片付け" }, { k: "storage", l: "🗄 収納の整理" }].map(function (x) {
        var on = p.kind === x.k;
        return <button key={x.k} onClick={function () { p.setKind(x.k); }} style={{ ...S.smBtn, flex: 1, fontSize: 11, background: on ? "#00897B" : "#fff", color: on ? "#fff" : "#666", border: "1px solid " + (on ? "#00897B" : "#e0e0e0") }}>{x.l}</button>;
      })}
    </div>
  );
}
// 種類 → 記録上のカテゴリー（掃除＝掃除カテゴリー、片付け・収納＝片付けカテゴリー）
function catForKind(kind, cats, cleanCatIds, fallback) {
  var cleanCat = cleanCatIds.indexOf("cleaning") !== -1 ? "cleaning" : cleanCatIds[0];
  var tidy = cats.find(function (c) { return cleanCatIds.indexOf(c.id) !== -1 && /片付|整理/.test(c.name || ""); });
  if (kind === "clean") return cleanCat || fallback;
  return (tidy && tidy.id) || cleanCat || fallback;
}

function AddCleanItem(p) {
  var room = p.room, data = p.data, save = p.save, cats = p.cats, cleanCatIds = p.cleanCatIds;
  var _o = useState(false), open = _o[0], setOpen = _o[1];
  var _n = useState(""), name = _n[0], setName = _n[1];
  var _k = useState("clean"), kind = _k[0], setKind = _k[1];
  var _i = useState("7"), iv = _i[0], setIv = _i[1];
  function pickKind(k) { setKind(k); setIv(k === "clean" ? "7" : k === "tidy" ? "30" : "180"); }
  function add() {
    if (!name.trim()) return;
    var d = clone(data);
    var id = "task" + Date.now();
    d.tasks[id] = { id: id, name: name.trim(), category: catForKind(kind, cats, cleanCatIds, "cleaning"), points: 1, room: room.id, interval: iv === "" ? null : parseInt(iv), storage: kind === "storage" };
    if (!d.taskOrder) d.taskOrder = [];
    d.taskOrder.push(id);
    save(d);
    setName("");
  }
  if (!open) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={function () { pickKind("clean"); setOpen(true); }} style={{ flex: 1, padding: 10, borderRadius: 10, border: "2px dashed #B2DFDB", background: "transparent", fontSize: 12, fontWeight: 700, color: "#00897B", cursor: "pointer" }}>＋ 掃除・片付けを追加</button>
        <button onClick={function () { pickKind("storage"); setOpen(true); }} style={{ flex: 1, padding: 10, borderRadius: 10, border: "2px dashed #D1C4E9", background: "transparent", fontSize: 12, fontWeight: 700, color: "#7E57C2", cursor: "pointer" }}>＋ 収納を追加</button>
      </div>
    );
  }
  return (
    <div style={S.card}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{room.emoji} {room.name} に追加</div>
      <KindPicker kind={kind} setKind={pickKind} />
      <input value={name} onChange={function (e) { setName(e.target.value); }} onKeyDown={function (e) { if (e.key === "Enter") add(); }} placeholder={kind === "storage" ? "例：テレビ台の引き出し、押し入れ上段" : kind === "tidy" ? "例：棚の上を片付ける" : "例：窓ふき、照明のほこり取り"} style={{ ...S.input, width: "100%", marginTop: 8 }} />
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
        <span style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap" }}>目安</span>
        <select value={iv} onChange={function (e) { setIv(e.target.value); }} style={{ ...S.input, padding: "6px 6px" }}>
          {INTERVALS.map(function (x) { return <option key={String(x.v)} value={x.v == null ? "" : String(x.v)}>{x.l}</option>; })}
        </select>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button onClick={add} style={{ ...S.smBtn, background: "#00897B", color: "#fff", flex: 1 }}>追加（続けて入力できます）</button>
        <button onClick={function () { setOpen(false); setName(""); }} style={{ ...S.smBtn, background: "#eee", color: "#888" }}>閉じる</button>
      </div>
    </div>
  );
}

function AddRoomForm(p) {
  var data = p.data, save = p.save;
  var _n = useState(""), name = _n[0], setName = _n[1];
  var _e = useState("🚪"), emoji = _e[0], setEmoji = _e[1];
  function add() {
    if (!name.trim()) return;
    var d = clone(data);
    if (!d.rooms) d.rooms = [];
    var id = "room" + Date.now();
    d.rooms.push({ id: id, name: name.trim(), emoji: emoji || "🚪" });
    save(d);
    p.onDone(id);
  }
  return (
    <div style={{ marginTop: 10, padding: 10, background: "#F7FBFA", borderRadius: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={emoji} onChange={function (e) { setEmoji(e.target.value); }} style={{ ...S.input, width: 44, flex: "none", textAlign: "center" }} />
        <input value={name} onChange={function (e) { setName(e.target.value); }} onKeyDown={function (e) { if (e.key === "Enter") add(); }} placeholder="部屋の名前（例：子ども部屋、納戸）" style={S.input} autoFocus />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button onClick={add} style={{ ...S.smBtn, background: "#00897B", color: "#fff", flex: 1 }}>追加</button>
        <button onClick={function () { p.onDone(null); }} style={{ ...S.smBtn, background: "#eee", color: "#888" }}>やめる</button>
      </div>
    </div>
  );
}

function RoomHeader(p) {
  var room = p.room, data = p.data, save = p.save;
  var _e = useState(false), editing = _e[0], setEditing = _e[1];
  var _n = useState(room.name), name = _n[0], setName = _n[1];
  var _m = useState(room.emoji), emoji = _m[0], setEmoji = _m[1];
  function saveRoom() {
    if (!name.trim()) return;
    var d = clone(data);
    d.rooms = (d.rooms || []).map(function (r) { return r.id === room.id ? Object.assign({}, r, { name: name.trim(), emoji: emoji || "🚪" }) : r; });
    save(d); setEditing(false);
  }
  function delRoom() {
    if (!window.confirm("「" + room.name + "」を削除しますか？\n中の掃除・収納は消えずに「部屋が未設定」に移ります")) return;
    var d = clone(data);
    d.rooms = (d.rooms || []).map(function (r) { return r.id === room.id ? Object.assign({}, r, { is_deleted: true }) : r; });
    Object.values(d.tasks).forEach(function (t) { if (t.room === room.id) t.room = null; });
    save(d); p.onDeleted();
  }
  if (editing) {
    return (
      <div style={{ ...S.card, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={emoji} onChange={function (e) { setEmoji(e.target.value); }} style={{ ...S.input, width: 44, flex: "none", textAlign: "center" }} />
          <input value={name} onChange={function (e) { setName(e.target.value); }} style={S.input} />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button onClick={saveRoom} style={{ ...S.smBtn, background: "#00897B", color: "#fff", flex: 1 }}>保存</button>
          <button onClick={function () { setEditing(false); }} style={{ ...S.smBtn, background: "#eee", color: "#888" }}>やめる</button>
          <button onClick={delRoom} style={{ ...S.smBtn, background: "#fff", color: "#E53935", border: "1px solid #FFCDD2" }}>🗑 部屋を削除</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>{room.emoji} {room.name}</h2>
      <button onClick={function () { setEditing(true); setName(room.name); setEmoji(room.emoji); }} style={{ ...S.smBtn, fontSize: 11, background: "#eee", color: "#888" }}>✏️ 部屋を編集</button>
    </div>
  );
}

function TaskListItem(p) {
  var task = p.task, cat = p.cat, data = p.data, save = p.save, isFirst = p.isFirst, isLast = p.isLast, onMove = p.onMove;
  const [editing, setEditing] = useState(false);
  const [pts, setPts] = useState(String(task.points || 1));
  var savePts = function () {
    var d = clone(data);
    if (d.tasks[task.id]) d.tasks[task.id].points = Math.max(1, parseInt(pts) || 1);
    save(d);
    setEditing(false);
  };
  var del = function () {
    var d = clone(data);
    if (d.tasks[task.id]) d.tasks[task.id].is_deleted = true;
    if (d.taskOrder) d.taskOrder = d.taskOrder.filter(function (id) { return id !== task.id; });
    save(d);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 0", borderBottom: "1px solid #f5f5f5" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <button onClick={function () { if (!isFirst) onMove(task.id, -1); }} disabled={isFirst} style={{ background: "none", border: "none", fontSize: 10, cursor: isFirst ? "default" : "pointer", color: isFirst ? "#e0e0e0" : "#aaa", padding: 0, lineHeight: 1 }}>▲</button>
        <button onClick={function () { if (!isLast) onMove(task.id, 1); }} disabled={isLast} style={{ background: "none", border: "none", fontSize: 10, cursor: isLast ? "default" : "pointer", color: isLast ? "#e0e0e0" : "#aaa", padding: 0, lineHeight: 1 }}>▼</button>
      </div>
      <span style={{ fontSize: 12, color: cat.color, fontWeight: 700 }}>●</span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{task.name}</span>
      {editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input type="number" min="1" value={pts} onChange={function (e) { setPts(e.target.value); }} style={{ width: 40, padding: "3px 4px", borderRadius: 6, border: "1.5px solid #FFB300", fontSize: 12, textAlign: "center", outline: "none" }} />
          <button onClick={savePts} style={{ background: "#4CAF50", color: "#fff", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✓</button>
        </div>
      ) : (
        <button onClick={function () { setEditing(true); setPts(String(task.points || 1)); }} style={{ background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 8, padding: "2px 8px", fontSize: 11, color: "#FFB300", fontWeight: 700, cursor: "pointer" }}>+{task.points || 1}pt</button>
      )}
      <button onClick={del} style={{ background: "none", border: "none", fontSize: 12, cursor: "pointer", color: "#ccc" }}>🗑</button>
    </div>
  );
}

function AddTaskForm(p) {
  var cat = p.cat, data = p.data, save = p.save, onDone = p.onDone;
  var _n = useState(""), name = _n[0], setName = _n[1];
  var _pt = useState("1"), pts = _pt[0], setPts = _pt[1];
  var add = function () {
    if (!name.trim()) return;
    var d = clone(data);
    var id = "task" + Date.now();
    d.tasks[id] = { id: id, name: name.trim(), category: cat.id, points: parseInt(pts) || 1 };
    if (!d.taskOrder) d.taskOrder = [];
    d.taskOrder.push(id);
    save(d);
    setName("");
    setPts("1");
    onDone();
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={name} onChange={function (e) { setName(e.target.value); }} onKeyDown={function (e) { if (e.key === "Enter") add(); }} placeholder={"例：" + (cat.id === "cooking" ? "夕飯の準備" : cat.id === "cleaning" ? "リビング掃除" : cat.id === "laundry" ? "洗濯物たたみ" : cat.id === "childcare" ? "おむつ替え" : "買い物")} style={S.input} />
        <input type="number" min="1" value={pts} onChange={function (e) { setPts(e.target.value); }} style={{ ...S.input, width: 45, flex: "none", textAlign: "center" }} placeholder="pt" />
        <button onClick={add} style={{ ...S.smBtn, background: cat.color, color: "#fff", whiteSpace: "nowrap" }}>追加</button>
      </div>
    </div>
  );
}

function RewardsTab(p) {
  var data = p.data, save = p.save;
  const [showAdd, setShowAdd] = useState(false);
  const [rN, setRN] = useState("");
  const [rC, setRC] = useState("50");
  const [rE, setRE] = useState("🎁");
  const [confirm, setConfirm] = useState(null);
  const [editingReward, setEditingReward] = useState(null);
  const [editCost, setEditCost] = useState("");
  var pts = data.points || 0;
  var rewards = (data.rewards || []).filter(function (r) { return !r.is_deleted; });
  if (rewards.length === 0) rewards = DEF_REWARDS;
  var hist = data.pointHistory || [];
  var exchange = function (r) {
    if (pts < r.cost) return;
    var d = clone(data);
    d.points = (d.points || 0) - r.cost;
    if (!d.pointHistory) d.pointHistory = [];
    d.pointHistory.push({ type: "spend", amount: r.cost, reason: r.name, date: TD, id: "ps" + Date.now() });
    save(d);
    setConfirm(null);
  };
  var addR = function () {
    if (!rN.trim()) return;
    var d = clone(data);
    if (!d.rewards) d.rewards = [];
    d.rewards.push({ id: "hr" + Date.now(), name: rN.trim(), cost: parseInt(rC) || 50, emoji: rE || "🎁" });
    save(d);
    setRN(""); setRC("50"); setRE("🎁"); setShowAdd(false);
  };
  var delR = function (rid) {
    var d = clone(data);
    d.rewards = (d.rewards || []).map(function (r) {
      return r.id === rid ? Object.assign({}, r, { is_deleted: true }) : r;
    });
    save(d);
  };
  var saveRewardCost = function (rid) {
    var d = clone(data);
    d.rewards = (d.rewards || []).map(function (r) {
      if (r.id === rid) return Object.assign({}, r, { cost: Math.max(1, parseInt(editCost) || 1) });
      return r;
    });
    save(d);
    setEditingReward(null);
  };
  return (
    <div style={{ animation: "fadeIn .3s ease" }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>🎁 ごほうび</h2>
      <div style={{ ...S.card, textAlign: "center", padding: 24, background: "linear-gradient(135deg, #FFF8E1, #fff)" }}>
        <div style={{ fontSize: 13, color: "#888" }}>まどかのポイント</div>
        <div style={{ fontSize: 42, fontWeight: 900, color: "#5D4037", margin: "6px 0" }}>⭐ {pts}</div>
        <div style={{ fontSize: 11, color: "#aaa" }}>家事をするたびにポイントが貯まります</div>
      </div>
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={S.cardTitle}>🏪 ごほうびショップ</div>
          <button onClick={function () { setShowAdd(!showAdd); }} style={{ ...S.addBtn, background: "#5D4037", marginTop: -6 }}>{showAdd ? "✕" : "＋ 追加"}</button>
        </div>
        {showAdd && (
          <div style={{ padding: 10, background: "#f9f9f9", borderRadius: 10, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={rE} onChange={function (e) { setRE(e.target.value); }} style={{ ...S.input, width: 40, textAlign: "center", flex: "none" }} />
              <input value={rN} onChange={function (e) { setRN(e.target.value); }} placeholder="ごほうび名" style={S.input} />
              <input type="number" value={rC} onChange={function (e) { setRC(e.target.value); }} style={{ ...S.input, width: 50, flex: "none" }} placeholder="pt" />
            </div>
            <button onClick={addR} style={{ ...S.smBtn, background: "#5D4037", color: "#fff", width: "100%", marginTop: 6, padding: 8 }}>追加</button>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {rewards.map(function (r) {
            var ok = pts >= r.cost;
            return (
              <div key={r.id} style={{ padding: 12, borderRadius: 14, textAlign: "center", position: "relative", background: ok ? "#fff" : "#f8f8f8", border: ok ? "2px solid #5D403725" : "2px solid #eee", opacity: ok ? 1 : .5 }}>
                <span onClick={function () { delR(r.id); }} style={{ position: "absolute", top: 3, right: 6, fontSize: 10, cursor: "pointer", color: "#ccc" }}>✕</span>
                <div style={{ fontSize: 28 }}>{r.emoji}</div>
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3 }}>{r.name}</div>
                {editingReward === r.id ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, margin: "3px 0" }}>
                    <input type="number" min="1" value={editCost} onChange={function (e) { setEditCost(e.target.value); }} style={{ width: 50, padding: "3px 4px", borderRadius: 6, border: "1.5px solid #FFB300", fontSize: 12, textAlign: "center", outline: "none", fontFamily: "inherit" }} />
                    <button onClick={function () { saveRewardCost(r.id); }} style={{ background: "#4CAF50", color: "#fff", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✓</button>
                    <button onClick={function () { setEditingReward(null); }} style={{ background: "#eee", color: "#999", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✕</button>
                  </div>
                ) : (
                  <div onClick={function () { setEditingReward(r.id); setEditCost(String(r.cost)); }} style={{ fontSize: 13, fontWeight: 800, color: "#FFB300", margin: "3px 0", cursor: "pointer" }}>{r.cost}pt ✏️</div>
                )}
                {confirm === r.id ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={function () { exchange(r); }} style={{ ...S.smBtn, background: "#4CAF50", color: "#fff", flex: 1, fontSize: 10 }}>はい！</button>
                    <button onClick={function () { setConfirm(null); }} style={{ ...S.smBtn, background: "#eee", color: "#666", flex: 1, fontSize: 10 }}>やめる</button>
                  </div>
                ) : (
                  <button onClick={function () { if (ok) setConfirm(r.id); }} style={{ padding: "4px 12px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, background: ok ? "#5D4037" : "#ddd", color: ok ? "#fff" : "#999", cursor: ok ? "pointer" : "default" }}>{ok ? "交換する" : "不足"}</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {hist.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>📜 ポイント履歴</div>
          {hist.slice().reverse().slice(0, 20).map(function (h) {
            return (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "5px 0", borderBottom: "1px solid #f5f5f5" }}>
                <span style={{ color: "#666" }}>{h.reason} <span style={{ color: "#ccc" }}>{h.date}</span></span>
                <span style={{ fontWeight: 800, color: h.type === "earn" ? "#4CAF50" : "#E53935" }}>{h.type === "earn" ? "+" : "-"}{h.amount}pt</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddCategoryForm(p) {
  var data = p.data, save = p.save, cats = p.cats;
  var _show = useState(false), show = _show[0], setShow = _show[1];
  var _name = useState(""), name = _name[0], setName = _name[1];
  var _emoji = useState("📁"), emoji = _emoji[0], setEmoji = _emoji[1];
  var add = function () {
    if (!name.trim()) return;
    var d = clone(data);
    if (!d.categories) d.categories = cats.map(function (c) { return Object.assign({}, c); });
    var visibleCount = d.categories.filter(function (c) { return !c.is_deleted; }).length;
    var colorIdx = visibleCount % CAT_COLORS.length;
    d.categories.push({ id: "cat" + Date.now(), name: name.trim(), emoji: emoji || "📁", color: CAT_COLORS[colorIdx] });
    save(d);
    setName("");
    setEmoji("📁");
    setShow(false);
  };
  return (
    <div style={S.card}>
      {!show ? (
        <button onClick={function () { setShow(true); }} style={{ width: "100%", padding: 10, borderRadius: 10, border: "2px dashed #ccc", background: "transparent", fontSize: 13, fontWeight: 700, color: "#999", cursor: "pointer" }}>
          ＋ カテゴリーを追加
        </button>
      ) : (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>新しいカテゴリー</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={emoji} onChange={function (e) { setEmoji(e.target.value); }} style={{ ...S.input, width: 44, textAlign: "center", flex: "none" }} />
            <input value={name} onChange={function (e) { setName(e.target.value); }} onKeyDown={function (e) { if (e.key === "Enter") add(); }} placeholder="カテゴリー名（例：買い物）" style={S.input} />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={add} style={{ ...S.smBtn, background: "#5D4037", color: "#fff", flex: 1 }}>追加</button>
            <button onClick={function () { setShow(false); }} style={{ ...S.smBtn, background: "#eee", color: "#666", flex: 1 }}>キャンセル</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatsTab(p) {
  var data = p.data, cats = p.cats, save = p.save;
  var logs = data.logs || [];
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const [editingLog, setEditingLog] = useState(null);
  const [editH, setEditH] = useState("");
  const [editM, setEditM] = useState("");
  const [showAddRec, setShowAddRec] = useState(false);
  var viewDate = new Date(NOW.getFullYear(), NOW.getMonth() + monthOffset, 1);
  var viewYear = viewDate.getFullYear();
  var viewMonth = viewDate.getMonth();
  var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  var firstDow = new Date(viewYear, viewMonth, 1).getDay();
  var startPad = firstDow === 0 ? 6 : firstDow - 1;
  var monthPrefix = viewYear + "-" + String(viewMonth + 1).padStart(2, "0");
  var monthLogs = logs.filter(function (l) { return l.date && l.date.startsWith(monthPrefix); });
  var monthSec = monthLogs.reduce(function (s, l) { return s + l.seconds; }, 0);
  var monthPts = monthLogs.reduce(function (s, l) { return s + (l.points || 1); }, 0);
  var calDays = [];
  for (var i = 0; i < startPad; i++) calDays.push(null);
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = monthPrefix + "-" + String(d).padStart(2, "0");
    var dayLogs = logs.filter(function (l) { return l.date === ds; });
    calDays.push({ date: ds, day: d, count: dayLogs.length, sec: dayLogs.reduce(function (s, l) { return s + l.seconds; }, 0), logs: dayLogs });
  }
  var activeDays = calDays.filter(function (d) { return d && d.count > 0; }).length;
  var selLogs = selectedDay ? logs.filter(function (l) { return l.date === selectedDay; }) : [];
  return (
    <div style={{ animation: "fadeIn .3s ease" }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>📊 ふりかえり</h2>
      <div style={{ ...S.card, textAlign: "center", background: "linear-gradient(135deg, #FFF3E0, #fff)", padding: 16 }}>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <MStat l="連続記録" v={data.streak + "日🔥"} c="#FF9800" />
          <MStat l="総タスク" v={logs.length + "回"} c="#4CAF50" />
          <MStat l="総ポイント" v={(data.points || 0) + "pt"} c="#FFB300" />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 10 }}>
        <button onClick={function () { if (monthOffset > -11) setMonthOffset(monthOffset - 1); setSelectedDay(null); setShowAddRec(false); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", opacity: monthOffset > -11 ? 1 : .3 }}>◀</button>
        <div style={{ fontSize: 16, fontWeight: 800, minWidth: 120, textAlign: "center" }}>{viewYear}年{viewMonth + 1}月</div>
        <button onClick={function () { if (monthOffset < 0) setMonthOffset(monthOffset + 1); setSelectedDay(null); setShowAddRec(false); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", opacity: monthOffset < 0 ? 1 : .3 }}>▶</button>
      </div>
      <div style={{ ...S.card, background: "linear-gradient(135deg, #E8F5E9, #fff)" }}>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <MStat l="タスク" v={monthLogs.length + "回"} c="#4CAF50" />
          <MStat l="時間" v={fmtMin(monthSec)} c="#2196F3" />
          <MStat l="ポイント" v={monthPts + "pt"} c="#FFB300" />
          <MStat l="活動日" v={activeDays + "日"} c="#FF9800" />
        </div>
      </div>
      <div style={S.card}>
        <div style={S.cardTitle}>📅 カレンダー（日付をタップで詳細）</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {["月", "火", "水", "木", "金", "土", "日"].map(function (dw) {
            return <div key={dw} style={{ textAlign: "center", fontSize: 10, color: dw === "土" ? "#2196F3" : dw === "日" ? "#E53935" : "#999", fontWeight: 600, paddingBottom: 4 }}>{dw}</div>;
          })}
          {calDays.map(function (md, idx) {
            if (!md) return <div key={"p" + idx} />;
            var isToday = md.date === TD;
            var isSel = md.date === selectedDay;
            var hasAct = md.count > 0;
            return (
              <div key={md.date} onClick={function () { setSelectedDay(isSel ? null : md.date); setShowAddRec(false); setEditingLog(null); }} style={{ textAlign: "center", padding: 3, borderRadius: 6, cursor: "pointer", background: isSel ? "#5D4037" : isToday ? "#5D403715" : hasAct ? "#E8F5E9" : "transparent", border: isToday && !isSel ? "2px solid #5D4037" : "2px solid transparent", minHeight: 36 }}>
                <div style={{ fontSize: 11, fontWeight: isToday || isSel ? 800 : 400, color: isSel ? "#fff" : isToday ? "#5D4037" : "#555" }}>{md.day}</div>
                {hasAct && !isSel && (<div style={{ marginTop: 1 }}><div style={{ fontSize: 7, color: "#4CAF50", fontWeight: 700 }}>{md.count}個</div></div>)}
                {isSel && <div style={{ fontSize: 7, color: "#fff" }}>{md.count}個</div>}
              </div>
            );
          })}
        </div>
      </div>
      {selectedDay && (
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ ...S.cardTitle, marginBottom: 0 }}>📋 {parseInt(selectedDay.split("-")[1])}月{parseInt(selectedDay.split("-")[2])}日の記録</div>
            {selectedDay <= TD && (
              <button onClick={function () { setShowAddRec(!showAddRec); setEditingLog(null); }} style={{ ...S.addBtn, background: "#4CAF50" }}>{showAddRec ? "✕" : "＋ 記録を追加"}</button>
            )}
          </div>
          {selectedDay > TD && <div style={{ fontSize: 11, color: "#bbb", marginBottom: 8 }}>未来の日付には記録を追加できません</div>}
          {showAddRec && selectedDay <= TD && <AddRecordForm data={data} save={save} cats={cats} date={selectedDay} onDone={function () { setShowAddRec(false); }} />}
          {selLogs.length === 0 && !showAddRec && <div style={{ fontSize: 12, color: "#ccc" }}>この日の記録はありません</div>}
          {selLogs.map(function (l) {
            var cat = cats.find(function (c) { return c.id === l.category; }) || cats[cats.length - 1];
            var isEditing = editingLog === l.id;
            return (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: cat.color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{cat.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{l.taskName}</div>
                  <div style={{ fontSize: 11, color: "#aaa" }}>{cat.name} ・ {l.time}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {isEditing ? (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <input type="number" min="0" value={editH} onChange={function (e) { setEditH(e.target.value); }} style={{ width: 32, padding: "2px 3px", borderRadius: 5, border: "1.5px solid #2196F3", fontSize: 12, textAlign: "center", outline: "none", fontFamily: "inherit" }} />
                        <span style={{ fontSize: 10, color: "#888" }}>時間</span>
                        <input type="number" min="0" max="59" value={editM} onChange={function (e) { setEditM(e.target.value); }} style={{ width: 32, padding: "2px 3px", borderRadius: 5, border: "1.5px solid #2196F3", fontSize: 12, textAlign: "center", outline: "none", fontFamily: "inherit" }} />
                        <span style={{ fontSize: 10, color: "#888" }}>分</span>
                      </div>
                      <div style={{ display: "flex", gap: 3, marginTop: 4, justifyContent: "flex-end" }}>
                        <button onClick={function () {
                          var newSec = (Math.max(0, parseInt(editH) || 0) * 3600) + (Math.max(0, Math.min(59, parseInt(editM) || 0)) * 60);
                          var d = clone(data);
                          d.logs = d.logs.map(function (lg) { return lg.id === l.id ? Object.assign({}, lg, { seconds: newSec }) : lg; });
                          save(d);
                          setEditingLog(null);
                        }} style={{ background: "#4CAF50", color: "#fff", border: "none", borderRadius: 5, padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>✓</button>
                        <button onClick={function () { setEditingLog(null); }} style={{ background: "#eee", color: "#999", border: "none", borderRadius: 5, padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>✕</button>
                        <button onClick={function () {
                          if (!window.confirm("この記録を削除しますか？（ポイントも取り消されます）")) return;
                          var d = clone(data);
                          d.logs = d.logs.filter(function (lg) { return lg.id !== l.id; });
                          d.points = Math.max(0, (d.points || 0) - (l.points || 1));
                          d.streak = recalcStreak(d.logs);
                          save(d);
                          sb.from("records").delete().eq("id", l.id).then(function (res) { if (res && res.error) console.error("record delete error:", res.error); });
                          setEditingLog(null);
                        }} style={{ background: "#E53935", color: "#fff", border: "none", borderRadius: 5, padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>🗑 削除</button>
                      </div>
                    </div>
                  ) : (
                    <div onClick={function () {
                      setEditingLog(l.id);
                      var h = Math.floor(l.seconds / 3600);
                      var m = Math.floor((l.seconds % 3600) / 60);
                      setEditH(String(h));
                      setEditM(String(m));
                    }} style={{ cursor: "pointer" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#2196F3" }}>{fmtMin(l.seconds)} ✏️</div>
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: "#FFB300", fontWeight: 700 }}>+{l.points || 1}pt</div>
                </div>
              </div>
            );
          })}
          {selLogs.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", gap: 12, justifyContent: "center", fontSize: 11, color: "#888" }}>
              <span>計{selLogs.length}タスク</span>
              <span>{fmtMin(selLogs.reduce(function (s, l) { return s + l.seconds; }, 0))}</span>
              <span>+{selLogs.reduce(function (s, l) { return s + (l.points || 1); }, 0)}pt</span>
            </div>
          )}
        </div>
      )}
      <div style={S.card}>
        <div style={S.cardTitle}>📊 {viewMonth + 1}月のカテゴリー別</div>
        {cats.map(function (cat) {
          var catLogs = monthLogs.filter(function (l) { return l.category === cat.id; });
          var sec = catLogs.reduce(function (s, l) { return s + l.seconds; }, 0);
          if (catLogs.length === 0) return null;
          var pct = monthSec > 0 ? Math.round((sec / monthSec) * 100) : 0;
          return (
            <div key={cat.id} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ fontWeight: 600 }}>{cat.emoji} {cat.name}（{catLogs.length}回）</span>
                <span style={{ color: cat.color, fontWeight: 700 }}>{fmtMin(sec)}</span>
              </div>
              <div style={S.progBar}><div style={{ height: "100%", borderRadius: 3, background: cat.color, width: pct + "%" }} /></div>
            </div>
          );
        })}
        {monthLogs.length === 0 && <div style={{ fontSize: 12, color: "#ccc" }}>この月の記録はありません</div>}
      </div>
    </div>
  );
}

// 選んだ日（過去日も可）に手動で家事記録を追加するフォーム
function AddRecordForm(p) {
  var data = p.data, save = p.save, cats = p.cats, date = p.date, onDone = p.onDone;
  var order = data.taskOrder || [];
  var tasks = Object.values(data.tasks || {}).filter(function (t) { return !t.is_deleted; });
  tasks.sort(function (a, b) {
    var ai = order.indexOf(a.id); if (ai === -1) ai = 99999;
    var bi = order.indexOf(b.id); if (bi === -1) bi = 99999;
    return ai - bi;
  });
  const [tid, setTid] = useState(tasks.length ? tasks[0].id : "");
  const [h, setH] = useState("0");
  const [m, setM] = useState("0");
  function catOf(t) { return cats.find(function (c) { return c.id === t.category; }) || cats[cats.length - 1] || { emoji: "📦", name: "" }; }
  var add = function () {
    var task = data.tasks[tid];
    if (!task) return;
    var sec = (Math.max(0, parseInt(h) || 0) * 3600) + (Math.max(0, Math.min(59, parseInt(m) || 0)) * 60);
    var d = clone(data);
    var ptAmt = task.points || 1;
    d.logs.push({ id: "log" + Date.now(), taskId: task.id, taskName: task.name, category: task.category, date: date, seconds: sec, time: "手動", points: ptAmt });
    d.points = (d.points || 0) + ptAmt;
    if (!d.pointHistory) d.pointHistory = [];
    d.pointHistory.push({ type: "earn", amount: ptAmt, reason: task.name, date: date, id: "pe" + Date.now() });
    if (!d.lastLogDate || date > d.lastLogDate) d.lastLogDate = date;
    d.streak = recalcStreak(d.logs);
    save(d);
    setH("0"); setM("0");
    if (onDone) onDone();
  };
  if (tasks.length === 0) {
    return <div style={{ fontSize: 12, color: "#bbb", padding: "6px 0" }}>先に「タスク管理」でタスクを追加してください</div>;
  }
  return (
    <div style={{ padding: 10, background: "#f1f8f1", borderRadius: 10, marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>この日にやった家事を記録します（時間が分からなければ0でもOK）</div>
      <select value={tid} onChange={function (e) { setTid(e.target.value); }} style={{ ...S.input, width: "100%", marginBottom: 6 }}>
        {tasks.map(function (t) {
          var c = catOf(t);
          return <option key={t.id} value={t.id}>{c.emoji} {t.name}（+{t.points || 1}pt）</option>;
        })}
      </select>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="number" min="0" value={h} onChange={function (e) { setH(e.target.value); }} style={{ ...S.input, width: 48, flex: "none", textAlign: "center" }} />
        <span style={{ fontSize: 12, color: "#888" }}>時間</span>
        <input type="number" min="0" max="59" value={m} onChange={function (e) { setM(e.target.value); }} style={{ ...S.input, width: 48, flex: "none", textAlign: "center" }} />
        <span style={{ fontSize: 12, color: "#888" }}>分</span>
        <button onClick={add} style={{ ...S.smBtn, background: "#4CAF50", color: "#fff", flex: 1 }}>記録する</button>
      </div>
    </div>
  );
}

function WeekView(p) {
  var data = p.data;
  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(NOW);
    d.setDate(d.getDate() - i);
    var ds = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    var dayLogs = data.logs.filter(function (l) { return l.date === ds; });
    var sec = dayLogs.reduce(function (s, l) { return s + l.seconds; }, 0);
    days.push({ date: ds, count: dayLogs.length, sec: sec, label: (d.getMonth() + 1) + "/" + d.getDate(), day: DJ[d.getDay()] });
  }
  var maxSec = Math.max.apply(null, days.map(function (d) { return d.sec; }).concat([1]));
  return (
    <div style={S.card}>
      <div style={S.cardTitle}>📅 この1週間</div>
      <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 100 }}>
        {days.map(function (d) {
          var h = d.sec > 0 ? Math.max(8, Math.round((d.sec / maxSec) * 80)) : 4;
          var isToday = d.date === TD;
          return (
            <div key={d.date} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#aaa", marginBottom: 2 }}>{d.count > 0 ? d.count + "個" : ""}</div>
              <div style={{ height: h, background: isToday ? "#4CAF50" : d.sec > 0 ? "#A5D6A7" : "#f0f0f0", borderRadius: 4, marginBottom: 4, transition: "height .3s" }} />
              <div style={{ fontSize: 9, color: isToday ? "#4CAF50" : "#999", fontWeight: isToday ? 700 : 400 }}>{d.label}</div>
              <div style={{ fontSize: 8, color: "#ccc" }}>{d.day}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MStat(p) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: p.c }}>{p.v}</div>
      <div style={{ fontSize: 9, color: "#999", marginTop: 1 }}>{p.l}</div>
    </div>
  );
}

var cssText = "@import url('https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700;900&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Zen Maru Gothic',sans-serif}input,select,textarea,button{font-family:inherit}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}";

var S = {
  app: { fontFamily: "'Zen Maru Gothic',sans-serif", background: "#FAFAF7", minHeight: "100vh", maxWidth: 480, margin: "0 auto", paddingBottom: 80 },
  header: { padding: "16px 14px 14px", background: "linear-gradient(135deg, #5D4037, #795548)", color: "#fff", borderRadius: "0 0 20px 20px" },
  streakBadge: { background: "rgba(255,255,255,.2)", borderRadius: 12, padding: "4px 12px", fontSize: 13, fontWeight: 800 },
  card: { background: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, boxShadow: "0 1px 3px rgba(0,0,0,.04)" },
  cardTitle: { fontSize: 14, fontWeight: 800, color: "#333", marginBottom: 10 },
  addBtn: { padding: "5px 12px", borderRadius: 16, border: "none", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" },
  smBtn: { padding: "6px 10px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer" },
  input: { flex: 1, padding: "9px 10px", borderRadius: 9, border: "1.5px solid #e0e0e0", fontSize: 13, outline: "none", background: "#FAFAFA", fontFamily: "inherit" },
  progBar: { height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" },
  nav: { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, display: "flex", justifyContent: "space-around", background: "#fff", borderTop: "1px solid #eee", padding: "6px 0 10px", zIndex: 100 },
  navBtn: { display: "flex", flexDirection: "column", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: "3px 8px" },
};
