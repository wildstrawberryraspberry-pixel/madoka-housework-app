import { useState, useEffect, useCallback, useRef } from "react";

var DEF_CATEGORIES = [
  { id: "cooking", name: "料理", emoji: "🍳", color: "#FF8A65" },
  { id: "cleaning", name: "掃除", emoji: "🧹", color: "#4DB6AC" },
  { id: "laundry", name: "洗濯", emoji: "👕", color: "#7986CB" },
  { id: "childcare", name: "育児", emoji: "👶", color: "#F06292" },
  { id: "other", name: "その他", emoji: "📦", color: "#90A4AE" },
];

var CAT_COLORS = ["#FF8A65", "#4DB6AC", "#7986CB", "#F06292", "#90A4AE", "#AED581", "#FFD54F", "#CE93D8", "#4FC3F7", "#E57373", "#81C784", "#FFB74D"];

var DJ = ["日", "月", "火", "水", "木", "金", "土"];
var SK = "madoka-housework-v1";
var TK = "madoka-housework-timer";

function getToday() {
  var n = new Date();
  return { now: n, td: n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0") };
}
var NOW = new Date();
var TD = getToday().td;

var DEF_REWARDS = [
  { id: "hr1", name: "マッサージに行く", cost: 100, emoji: "💆" },
  { id: "hr2", name: "スパ・温泉に行く", cost: 150, emoji: "♨️" },
  { id: "hr3", name: "カフェでひとり時間", cost: 50, emoji: "☕" },
  { id: "hr4", name: "好きなスイーツを買う", cost: 30, emoji: "🍰" },
  { id: "hr5", name: "ネイルサロン", cost: 120, emoji: "💅" },
  { id: "hr6", name: "映画を観に行く", cost: 80, emoji: "🎬" },
  { id: "hr7", name: "好きな本を買う", cost: 40, emoji: "📖" },
];

function mkData() {
  return { tasks: {}, logs: [], streak: 0, lastLogDate: "", categories: DEF_CATEGORIES.map(function (c) { return Object.assign({}, c); }), points: 0, pointHistory: [], rewards: DEF_REWARDS.map(function (r) { return Object.assign({}, r); }) };
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

function dateLabel(s) {
  try {
    var d = new Date(s);
    return (d.getMonth() + 1) + "/" + d.getDate() + "(" + DJ[d.getDay()] + ")";
  } catch (e) { return s; }
}

function daysBetween(a, b) {
  var d1 = new Date(a); var d2 = new Date(b);
  return Math.round((d2 - d1) / 86400000);
}

export default function App() {
  var _gt = getToday(); NOW = _gt.now; TD = _gt.td;
  var _d = useState(mkData), data = _d[0], setData = _d[1];
  var _r = useState(false), ready = _r[0], setReady = _r[1];
  var _t = useState("home"), tab = _t[0], setTab = _t[1];
  var _at = useState(null), addingTo = _at[0], setAddingTo = _at[1];
  // Running timers: { taskId: { startedAt: timestamp, elapsed: seconds } }
  var _savedTimer = (function () {
    try {
      var raw = localStorage.getItem(TK);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  })();
  var _run = useState(_savedTimer ? _savedTimer.running || {} : {}), running = _run[0], setRunning = _run[1];
  // Paused timers: { taskId: elapsed }
  var _paused = useState(_savedTimer ? _savedTimer.paused || {} : {}), paused = _paused[0], setPaused = _paused[1];
  var tickRef = useRef(null);
  var _now = useState(Date.now()), nowMs = _now[0], setNowMs = _now[1];

  // Tick every second for running timers
  useEffect(function () {
    tickRef.current = setInterval(function () { setNowMs(Date.now()); }, 1000);
    return function () { clearInterval(tickRef.current); };
  }, []);

  // Persist timer state to localStorage
  useEffect(function () {
    try {
      localStorage.setItem(TK, JSON.stringify({ running: running, paused: paused }));
    } catch (e) {}
  }, [running, paused]);

  useEffect(function () {
    try {
      var raw = localStorage.getItem(SK);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.tasks) {
          if (!p.logs) p.logs = [];
          if (!p.streak) p.streak = 0;
          if (!p.lastLogDate) p.lastLogDate = "";
          if (!p.categories) p.categories = DEF_CATEGORIES.map(function (c) { return Object.assign({}, c); });
          if (p.points === undefined) p.points = 0;
          if (!p.pointHistory) p.pointHistory = [];
          if (!p.rewards) p.rewards = DEF_REWARDS.map(function (r) { return Object.assign({}, r); });
          setData(p);
        }
      }
    } catch (e) { /* ignore */ }
    setReady(true);
  }, []);

  var save = useCallback(function (d) {
    setData(d);
    try { localStorage.setItem(SK, JSON.stringify(d)); } catch (e) { }
  }, []);

  // Get elapsed for a task
  function getElapsed(taskId) {
    var p = paused[taskId] || 0;
    var r = running[taskId];
    if (r) return p + Math.floor((nowMs - r) / 1000);
    return p;
  }

  function isRunning(taskId) { return !!running[taskId]; }
  function isPaused(taskId) { return !running[taskId] && (paused[taskId] || 0) > 0; }

  function startTask(taskId) {
    var r = Object.assign({}, running);
    r[taskId] = Date.now();
    setRunning(r);
  }

  function pauseTask(taskId) {
    var r = Object.assign({}, running);
    var p = Object.assign({}, paused);
    if (r[taskId]) {
      var elapsed = Math.floor((Date.now() - r[taskId]) / 1000);
      p[taskId] = (p[taskId] || 0) + elapsed;
      delete r[taskId];
    }
    setRunning(r);
    setPaused(p);
  }

  function resumeTask(taskId) {
    startTask(taskId);
  }

  function finishTask(taskId) {
    var totalSec = getElapsed(taskId);
    var task = data.tasks[taskId];
    if (!task) return;

    var d = clone(data);
    var ptAmt = task.points || 1;

    // Add log
    d.logs.push({
      id: "log" + Date.now(),
      taskId: taskId,
      taskName: task.name,
      category: task.category,
      date: TD,
      seconds: totalSec,
      time: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
      points: ptAmt,
    });

    // Award points
    d.points = (d.points || 0) + ptAmt;
    if (!d.pointHistory) d.pointHistory = [];
    d.pointHistory.push({ type: "earn", amount: ptAmt, reason: task.name, date: TD, id: "pe" + Date.now() });

    // Update streak
    if (d.lastLogDate === "") {
      d.streak = 1;
    } else if (d.lastLogDate === TD) {
      // same day, no change
    } else if (daysBetween(d.lastLogDate, TD) === 1) {
      d.streak += 1;
    } else if (daysBetween(d.lastLogDate, TD) > 1) {
      d.streak = 1;
    }
    d.lastLogDate = TD;

    save(d);

    // Clear timer
    var r = Object.assign({}, running);
    var p = Object.assign({}, paused);
    delete r[taskId];
    delete p[taskId];
    setRunning(r);
    setPaused(p);
  }

  function cancelTimer(taskId) {
    var r = Object.assign({}, running);
    var p = Object.assign({}, paused);
    delete r[taskId];
    delete p[taskId];
    setRunning(r);
    setPaused(p);
  }

  // Categories from data
  var cats = (data.categories && data.categories.length > 0) ? data.categories : DEF_CATEGORIES;

  // Tasks by category
  var tasksByCategory = {};
  cats.forEach(function (c) { tasksByCategory[c.id] = []; });
  Object.values(data.tasks).forEach(function (t) {
    if (tasksByCategory[t.category]) tasksByCategory[t.category].push(t);
    else if (!tasksByCategory[t.category]) { tasksByCategory[t.category] = [t]; }
  });

  // Today's stats
  var todayLogs = data.logs.filter(function (l) { return l.date === TD; });
  var todayCount = todayLogs.length;
  var todaySec = todayLogs.reduce(function (s, l) { return s + l.seconds; }, 0);
  var todayByCat = {};
  cats.forEach(function (c) { todayByCat[c.id] = 0; });
  todayLogs.forEach(function (l) { if (todayByCat[l.category] !== undefined) todayByCat[l.category] += l.seconds; });

  // Any timers running?
  var runningCount = Object.keys(running).length;

  if (!ready) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#FAFAF7" }}>
        <div style={{ fontSize: 50 }}>🏠</div>
        <div style={{ fontSize: 17, fontWeight: 800, marginTop: 12 }}>まどかの家事トラッカー</div>
        <div style={{ fontSize: 13, color: "#999", marginTop: 4 }}>読み込み中...</div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <style>{cssText}</style>

      {/* Header */}
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
            {/* Today Stats */}
            <div style={{ ...S.card, background: "linear-gradient(135deg, #E8F5E9, #fff)" }}>
              <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
                <MStat l="タスク完了" v={todayCount + "個"} c="#4CAF50" />
                <MStat l="合計時間" v={fmtMin(todaySec)} c="#2196F3" />
                <MStat l="ポイント" v={(data.points || 0) + "pt"} c="#FFB300" />
                <MStat l="連続記録" v={data.streak + "日"} c="#FF9800" />
              </div>
            </div>

            {/* Running Timers */}
            {runningCount > 0 && (
              <div style={S.card}>
                <div style={S.cardTitle}>⏱️ 進行中</div>
                {Object.keys(running).map(function (tid) {
                  var task = data.tasks[tid];
                  if (!task) return null;
                  var cat = cats.find(function (c) { return c.id === task.category; }) || cats[cats.length-1];
                  var el = getElapsed(tid);
                  return (
                    <div key={tid} style={{ padding: "10px 0", borderBottom: "1px solid #f3f3f3" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: cat.color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{cat.emoji}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{task.name}</div>
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

            {/* Paused Timers */}
            {Object.keys(paused).filter(function (tid) { return !running[tid] && paused[tid] > 0; }).length > 0 && (
              <div style={S.card}>
                <div style={S.cardTitle}>⏸ 一時停止中</div>
                {Object.keys(paused).filter(function (tid) { return !running[tid] && paused[tid] > 0; }).map(function (tid) {
                  var task = data.tasks[tid];
                  if (!task) return null;
                  var cat = cats.find(function (c) { return c.id === task.category; }) || cats[cats.length-1];
                  return (
                    <div key={tid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f3f3f3" }}>
                      <div style={{ fontSize: 20 }}>{cat.emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{task.name}</div>
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

            {/* Quick Start - Task Grid */}
            <div style={S.card}>
              <div style={S.cardTitle}>▶ 家事をはじめる</div>
              {cats.map(function (cat) {
                var tasks = tasksByCategory[cat.id] || [];
                if (tasks.length === 0) return null;
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
              {Object.values(data.tasks).length === 0 && (
                <div style={{ fontSize: 13, color: "#bbb", textAlign: "center", padding: 10 }}>
                  「タスク管理」タブからタスクを追加してください
                </div>
              )}
            </div>

            {/* Today Category Breakdown */}
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

            {/* Today's Log */}
            {todayLogs.length > 0 && (
              <div style={S.card}>
                <div style={S.cardTitle}>📜 今日の記録</div>
                {todayLogs.slice().reverse().map(function (l) {
                  var cat = cats.find(function (c) { return c.id === l.category; }) || cats[cats.length-1];
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

            {/* Weekly Overview */}
            <WeekView data={data} />
          </div>
        )}

        {tab === "tasks" && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>📋 タスク管理</h2>
            {cats.map(function (cat) {
              var tasks = tasksByCategory[cat.id] || [];
              return (
                <div key={cat.id} style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={S.cardTitle}>{cat.emoji} {cat.name}</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={function () { setAddingTo(addingTo === cat.id ? null : cat.id); }} style={{ ...S.addBtn, background: cat.color }}>{addingTo === cat.id ? "✕" : "＋"}</button>
                      {tasks.length === 0 && (
                        <button onClick={function () {
                          var d = clone(data);
                          d.categories = (d.categories || []).filter(function (c) { return c.id !== cat.id; });
                          save(d);
                        }} style={{ ...S.addBtn, background: "#eee", color: "#999" }}>🗑</button>
                      )}
                    </div>
                  </div>
                  {addingTo === cat.id && <AddTaskForm cat={cat} data={data} save={save} onDone={function () { setAddingTo(null); }} />}
                  {tasks.length > 0 ? tasks.map(function (t) {
                    return <TaskListItem key={t.id} task={t} cat={cat} data={data} save={save} />;
                  }) : (
                    <div style={{ fontSize: 12, color: "#ccc", padding: "4px 0" }}>タスクを追加してください</div>
                  )}
                </div>
              );
            })}

            {/* Add Category */}
            <AddCategoryForm data={data} save={save} cats={cats} />
          </div>
        )}

        {tab === "rewards" && (
          <RewardsTab data={data} save={save} />
        )}

        {tab === "stats" && (
          <StatsTab data={data} cats={cats} save={save} />
        )}
      </main>

      {/* Nav */}
      <nav style={S.nav}>
        {[
          { id: "home", icon: "🏠", l: "ホーム" },
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

function TaskListItem(p) {
  var task = p.task, cat = p.cat, data = p.data, save = p.save;
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
    delete d.tasks[task.id];
    save(d);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #f5f5f5" }}>
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
  var rewards = data.rewards || DEF_REWARDS;
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
    d.rewards = (d.rewards || []).filter(function (r) { return r.id !== rid; });
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
    var colorIdx = d.categories.length % CAT_COLORS.length;
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

  // Build calendar
  var calDays = [];
  for (var i = 0; i < startPad; i++) calDays.push(null);
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = monthPrefix + "-" + String(d).padStart(2, "0");
    var dayLogs = logs.filter(function (l) { return l.date === ds; });
    calDays.push({ date: ds, day: d, count: dayLogs.length, sec: dayLogs.reduce(function (s, l) { return s + l.seconds; }, 0), logs: dayLogs });
  }

  var activeDays = calDays.filter(function (d) { return d && d.count > 0; }).length;

  // Selected day logs
  var selLogs = selectedDay ? logs.filter(function (l) { return l.date === selectedDay; }) : [];

  return (
    <div style={{ animation: "fadeIn .3s ease" }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>📊 ふりかえり</h2>

      {/* Streak */}
      <div style={{ ...S.card, textAlign: "center", background: "linear-gradient(135deg, #FFF3E0, #fff)", padding: 16 }}>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <MStat l="連続記録" v={data.streak + "日🔥"} c="#FF9800" />
          <MStat l="総タスク" v={logs.length + "回"} c="#4CAF50" />
          <MStat l="総ポイント" v={(data.points || 0) + "pt"} c="#FFB300" />
        </div>
      </div>

      {/* Month Navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 10 }}>
        <button onClick={function () { if (monthOffset > -11) setMonthOffset(monthOffset - 1); setSelectedDay(null); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", opacity: monthOffset > -11 ? 1 : .3 }}>◀</button>
        <div style={{ fontSize: 16, fontWeight: 800, minWidth: 120, textAlign: "center" }}>{viewYear}年{viewMonth + 1}月</div>
        <button onClick={function () { if (monthOffset < 0) setMonthOffset(monthOffset + 1); setSelectedDay(null); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", opacity: monthOffset < 0 ? 1 : .3 }}>▶</button>
      </div>

      {/* Month Summary */}
      <div style={{ ...S.card, background: "linear-gradient(135deg, #E8F5E9, #fff)" }}>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <MStat l="タスク" v={monthLogs.length + "回"} c="#4CAF50" />
          <MStat l="時間" v={fmtMin(monthSec)} c="#2196F3" />
          <MStat l="ポイント" v={monthPts + "pt"} c="#FFB300" />
          <MStat l="活動日" v={activeDays + "日"} c="#FF9800" />
        </div>
      </div>

      {/* Calendar */}
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
              <div key={md.date} onClick={function () { setSelectedDay(isSel ? null : md.date); }} style={{ textAlign: "center", padding: 3, borderRadius: 6, cursor: "pointer", background: isSel ? "#5D4037" : isToday ? "#5D403715" : hasAct ? "#E8F5E9" : "transparent", border: isToday && !isSel ? "2px solid #5D4037" : "2px solid transparent", minHeight: 36 }}>
                <div style={{ fontSize: 11, fontWeight: isToday || isSel ? 800 : 400, color: isSel ? "#fff" : isToday ? "#5D4037" : "#555" }}>{md.day}</div>
                {hasAct && !isSel && (
                  <div style={{ marginTop: 1 }}>
                    <div style={{ fontSize: 7, color: "#4CAF50", fontWeight: 700 }}>{md.count}個</div>
                  </div>
                )}
                {isSel && <div style={{ fontSize: 7, color: "#fff" }}>{md.count}個</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Detail */}
      {selectedDay && (
        <div style={S.card}>
          <div style={S.cardTitle}>📋 {parseInt(selectedDay.split("-")[1])}月{parseInt(selectedDay.split("-")[2])}日の記録</div>
          {selLogs.length === 0 && <div style={{ fontSize: 12, color: "#ccc" }}>この日の記録はありません</div>}
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

      {/* Category breakdown for the month */}
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

function WeekView(p) {
  var data = p.data;
  // Last 7 days
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
