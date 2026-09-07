import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";

/* Supabase config. Baked in at build time from .env (see build.mjs); can also be
   entered at runtime in the Tests tab, which stores it in localStorage. */
const ENV_SUPABASE_URL = process.env.SUPABASE_URL || "";
const ENV_SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "";
const CFG_KEY = "threshold-log-supabase";
const loadCfg = () => {
  try {
    const raw = window.localStorage.getItem(CFG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    /* fall through to env */
  }
  return { url: ENV_SUPABASE_URL, key: ENV_SUPABASE_KEY };
};

/* ------------------------------------------------------------------ */
/*  Palette + type                                                     */
/* ------------------------------------------------------------------ */
const C = {
  ink: "#0F1319",
  panel: "#171E26",
  panel2: "#1D2731",
  line: "#2B3743",
  chalk: "#E9E5DB",
  muted: "#8A95A3",
  dim: "#5C6773",
  amber: "#F0A431",
  green: "#66A97F",
  rust: "#C96F53",
};
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const KEY = "jhw:threshold:v1";

/* ------------------------------------------------------------------ */
/*  Block calendar                                                     */
/* ------------------------------------------------------------------ */
const CALIBRATION = "2026-08-29";
const BLOCK_START = "2026-08-31";
const BLOCK_END = "2026-10-04";
const RETEST = "2026-10-05";

const ymd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const parse = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const dayDiff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const pretty = (s) =>
  parse(s).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/* watts per heartbeat — the aerobic progress metric */
const eff = (d) =>
  d && d.watts && d.hr && Number(d.hr) > 0
    ? (Number(d.watts) / Number(d.hr)).toFixed(2)
    : null;

function Spark({ points }) {
  if (!points || points.length < 2)
    return (
      <div style={{ fontSize: 12, color: "#5C6773", marginTop: 8 }}>
        Two rides with watts and heart rate will start the trend.
      </div>
    );
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 300;
  const h = 70;
  const pts = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (w - 10) + 5;
    const y = h - 10 - ((p - min) / span) * (h - 20);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full mt-3">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="#F0A431"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {pts.map((p, i) => {
        const [x, y] = p.split(",");
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="3"
            fill="#0F1319"
            stroke="#F0A431"
            strokeWidth="2"
          />
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  The six patterns + their ladders                                   */
/* ------------------------------------------------------------------ */
const PATTERNS = [
  {
    id: "hpush",
    short: "H-PUSH",
    name: "Horizontal push",
    goal: "Straddle planche pushup",
    variable: "Forward lean — how far your shoulders sit past your hands",
    gear: "Floor. Parallettes or pushup handles from stage 5.",
    suggested: 4,
    why: "10 clean pushups puts you at real lean work from day one.",
    stages: [
      ["Zero", "Hands down, feet walked forward past your hands. Full range, no load."],
      ["Incline pushup", "Hands on a bench or a barbell in the rack. Chest to bar."],
      ["Full pushup", "Hands under shoulders, chest to fist height, ribs down."],
      ["Lean pushup", "Shoulders 1–2 in past your hands at the bottom."],
      ["Pseudo-planche pushup", "Lean 3–5 in. Hips level with shoulders, elbows tucked back."],
      ["Parallette PPPU", "Lean 6 in+, posterior pelvic tilt, shoulders protracted at lockout."],
      ["Tuck planche pushup", "Feet leave the floor at the top of the rep."],
      ["Straddle planche pushup", "Legs straddled, no ground contact. The goal."],
    ],
  },
  {
    id: "hpull",
    short: "H-PULL",
    name: "Horizontal pull",
    goal: "Front lever row",
    variable: "Body angle — heel distance from under the handles",
    gear: "Rings, or a barbell set at hip height in the rack.",
    suggested: 3,
    why: "Rows carry over from your barbell work; start near horizontal.",
    stages: [
      ["Zero", "Feet far under the bar, torso near vertical, arms only guiding."],
      ["Incline row", "Torso around 45°. Elbows past the body at the top."],
      ["Horizontal row, knees bent", "Feet flat, thighs and torso in one line."],
      ["Horizontal row, legs straight", "Heels on the floor, body rigid, chest to handles."],
      ["Feet elevated row", "Heels on a box level with the handles. Full protraction at the bottom."],
      ["Tuck front lever row", "Knees tucked, hips off the floor the whole set."],
      ["Advanced tuck / one-leg row", "Open the tuck, or extend one leg."],
      ["Straddle → full front lever row", "Body horizontal, no ground contact. The goal."],
    ],
  },
  {
    id: "vpull",
    short: "V-PULL",
    name: "Vertical pull",
    goal: "One-arm chin-up",
    variable: "Assistance — how much foot or band support you take",
    gear: "Pull-up bar, a chair or box, a long resistance band.",
    suggested: 1,
    why: "2 pull-ups means most of your set should be assisted, not failed reps.",
    stages: [
      ["Zero", "Both feet on a chair under the bar. Stand through the range."],
      ["One-foot assist", "One foot on the chair, pressure reduced until you barely make it."],
      ["Toe-tip or band assist", "Minimal contact. Reduce further at the top until you're forced down."],
      ["Full chin-ups", "Unassisted reps, dead hang to chin over bar."],
      ["Chins + slow negatives", "Full reps, then 8–10 second lowers once you can't press up."],
      ["Weighted chin", "Vest or plate. Add load until the top rep is a fight."],
      ["Archer / towel uneven chin", "One arm takes most of the load, the other assists on a towel."],
      ["One-arm chin-up", "Free hand off the bar entirely. The goal."],
    ],
  },
  {
    id: "vpush",
    short: "V-PUSH",
    name: "Vertical push",
    goal: "Handstand pushup",
    variable: "Foot height — how vertical your torso is",
    gear: "A box or bench, a wall, parallettes for deficit work.",
    suggested: 1,
    why: "Overhead pressing bodyweight is new load; start on the floor and raise the box.",
    stages: [
      ["Zero", "Hands on the wall, standing. Press pattern with no load."],
      ["Pike pushup, feet on floor", "Hips high, head to the floor between the hands."],
      ["Pike pushup, 12 in box", "Feet elevated, shoulders stacking over hands."],
      ["Pike pushup, 20–24 in box", "Hips directly over shoulders. Near-vertical press."],
      ["Deficit pike pushup", "Hands on parallettes so the head passes below the hands."],
      ["Wall HSPU, partial", "Feet on the wall, partial range from lockout down."],
      ["Wall HSPU, full range", "Head touches the floor, press to lockout."],
      ["Freestanding HSPU", "No wall. The goal."],
    ],
  },
  {
    id: "squat",
    short: "SQUAT",
    name: "Squat / hip extension",
    goal: "Single-leg squat + 75% bodyweight",
    variable: "Assistance, then external load",
    gear: "Rack uprights or rings to hold, a box, a weight vest or plate.",
    suggested: 3,
    why: "Barbell squatting means you have the strength; single-leg balance is the limiter.",
    stages: [
      ["Zero", "Both hands on the rack, the other leg carrying most of the weight."],
      ["Split squat", "Rear foot down, then elevated. Full depth on the front leg."],
      ["Box pistol, high box", "Sit to a high box, two hands assisting up."],
      ["Box pistol, low box", "Lower box, fingertip assist only."],
      ["Full pistol", "To the floor and back up, no assistance, no box."],
      ["Pistol + 20% BW", "Vest or held plate."],
      ["Pistol + 40% BW", "Load climbing. Assist only at the very bottom."],
      ["Pistol + 75% BW", "The goal."],
    ],
  },
  {
    id: "knee",
    short: "KNEE",
    name: "Knee flexion",
    goal: "Full Nordic curl",
    variable: "Hip pike + how early your hands catch you",
    gear: "Ankles under a loaded barbell in the rack (pad them), or under a couch. Knee pad.",
    suggested: 0,
    why: "Nordics are brutal from a standing start. Begin piked and hand-supported.",
    stages: [
      ["Zero", "Hips piked hard, hands on the floor taking nearly all the weight."],
      ["Piked Nordic", "Hands catch early. Push back up with the arms."],
      ["Straight body, catch at 45°", "Hips locked out. Control down to 45°, then catch."],
      ["Straight body, catch at 30°", "Control further before the hands take over."],
      ["Full negative", "Control all the way to the floor, push back up with the hands."],
      ["Full Nordic", "Down and up under hamstring power alone."],
      ["Paused Nordic", "2 second pause mid-range on the way down."],
      ["Weighted Nordic", "Plate held to the chest. The goal."],
    ],
  },
];
const P = Object.fromEntries(PATTERNS.map((p) => [p.id, p]));

/* ------------------------------------------------------------------ */
/*  Weekly schedule                                                    */
/* ------------------------------------------------------------------ */
const SESSIONS = {
  1: { code: "A", title: "Strength A", patterns: ["hpush", "hpull"], effort: "Full effort" },
  2: { code: "B", title: "Strength B", patterns: ["vpull", "squat"], effort: "Full effort" },
  3: { code: "Z", title: "Zone 2", patterns: [], effort: "60 min" },
  4: { code: "C", title: "Strength C", patterns: ["vpush", "knee"], effort: "Full effort" },
  5: { code: "Z", title: "Zone 2", patterns: [], effort: "60 min" },
  6: { code: "D", title: "Weak-link day", patterns: ["vpull", "hpush"], effort: "~85%, stop short" },
  0: { code: "Z", title: "Zone 2", patterns: [], effort: "60 min" },
};

function dayInfo(date) {
  if (date === CALIBRATION)
    return { kind: "test", title: "Calibration day", patterns: [], effort: "Find zero, find threshold, stop short", week: 0 };
  if (date === RETEST)
    return { kind: "test", title: "Retest day", patterns: [], effort: "Repeat calibration exactly", week: 6 };
  if (dayDiff(BLOCK_START, date) < 0 || dayDiff(date, BLOCK_END) < 0)
    return { kind: "off", title: "Outside the block", patterns: [], effort: "Steps only", week: 0 };
  const week = Math.floor(dayDiff(BLOCK_START, date) / 7) + 1;
  const s = SESSIONS[parse(date).getDay()];
  let effort = s.effort;
  if (s.code !== "Z") {
    if (week === 1) effort = "Week 1 — run at ~80%, stop a minute early";
    else if (week === 5 && s.code === "C") effort = "Week 5 — ~85%, taper";
  }
  return {
    kind: s.code === "Z" ? "cardio" : "strength",
    code: s.code,
    title: s.title,
    patterns: s.patterns,
    effort,
    week,
    skip: week === 5 && s.code === "D",
  };
}

/* ------------------------------------------------------------------ */
/*  Small UI atoms                                                     */
/* ------------------------------------------------------------------ */
const Eyebrow = ({ children, color = C.muted }) => (
  <div
    style={{ fontFamily: MONO, color, fontSize: 10, letterSpacing: 2 }}
    className="uppercase"
  >
    {children}
  </div>
);

const Field = ({ value, onChange, placeholder, mono = true, wide = true }) => (
  <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className={`${wide ? "w-full" : "w-24"} px-3 py-2 rounded outline-none`}
    style={{
      background: C.ink,
      border: `1px solid ${C.line}`,
      color: C.chalk,
      fontFamily: mono ? MONO : SANS,
      fontSize: 14,
    }}
  />
);

const Btn = ({ children, onClick, tone = "ghost", className = "" }) => {
  const map = {
    solid: { background: C.amber, color: C.ink, border: `1px solid ${C.amber}` },
    ghost: { background: "transparent", color: C.chalk, border: `1px solid ${C.line}` },
    quiet: { background: "transparent", color: C.muted, border: `1px solid transparent` },
    good: { background: C.green, color: C.ink, border: `1px solid ${C.green}` },
  };
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded uppercase ${className}`}
      style={{
        ...map[tone],
        fontFamily: MONO,
        fontSize: 11,
        letterSpacing: 1.5,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
};

/* Signature element: the notched difficulty ladder */
function Ladder({ pattern, stage, counts, onPick }) {
  return (
    <div className="mt-3">
      {pattern.stages.map((s, i) => {
        const current = i === stage;
        const below = i < stage;
        const ticks = counts?.[i] || 0;
        return (
          <button
            key={i}
            onClick={() => onPick && onPick(i)}
            className="w-full flex items-stretch text-left"
            style={{ opacity: below ? 0.55 : 1 }}
          >
            <div
              className="flex items-center justify-center"
              style={{
                width: 34,
                fontFamily: MONO,
                fontSize: 11,
                color: current ? C.ink : below ? C.dim : C.muted,
                background: current ? C.amber : "transparent",
                borderLeft: `2px solid ${current ? C.amber : below ? C.dim : C.line}`,
              }}
            >
              {i}
            </div>
            <div
              className="flex-1 py-2 px-3"
              style={{ borderBottom: `1px solid ${C.line}` }}
            >
              <div
                style={{
                  color: current ? C.amber : C.chalk,
                  fontSize: 13,
                  fontWeight: current ? 700 : 500,
                }}
              >
                {s[0]}
                {ticks > 0 && (
                  <span style={{ fontFamily: MONO, color: C.dim, fontSize: 11 }}>
                    {"  " + "•".repeat(Math.min(ticks, 8))}
                  </span>
                )}
              </div>
              {(current || !below) && (
                <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.4 }}>
                  {s[1]}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */
const BLANK = {
  v: 1,
  stages: Object.fromEntries(PATTERNS.map((p) => [p.id, p.suggested])),
  log: [],
  days: {},
  z2target: "",
  tests: { base: {}, retest: {} },
};

const TEST_FIELDS = [
  ["pushups", "Max push-ups"],
  ["pullups", "Max pull-ups"],
  ["hollow", "Hollow hold (s)"],
  ["bodyweight", "Bodyweight"],
];

function ThresholdLog() {
  const [state, setState] = useState(BLANK);
  const [ready, setReady] = useState(false);
  const [save, setSave] = useState({ status: "idle", at: null });
  const [tab, setTab] = useState("today");
  const [date, setDate] = useState(ymd(new Date()));
  const [open, setOpen] = useState(null);
  const [timer, setTimer] = useState({ id: null, sec: 0, running: false });
  const [draft, setDraft] = useState({});
  const [paste, setPaste] = useState("");
  const [ping, setPing] = useState("");
  const saveRef = useRef(null);
  const latest = useRef(BLANK);

  /* Safari's localStorage. Autosaves on every change; survives tab closes,
     reboots, and app switches. File export stays as the off-device backup. */
  const LS_KEY = "threshold-log-v1";
  const [store, setStore] = useState({ ok: true, at: null, why: null });
  const [dirty, setDirty] = useState(false);
  const [backedUpAt, setBackedUpAt] = useState(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (raw) {
        const loaded = { ...BLANK, ...JSON.parse(raw) };
        setState(loaded);
        latest.current = loaded;
        setStore({ ok: true, at: Date.now(), why: null });
      }
    } catch (e) {
      setStore({
        ok: false,
        at: null,
        why: "This browser is blocking local storage. Use Save file in Tests.",
      });
    }
    setReady(true);
  }, []);

  const writeLocal = (payload) => {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(payload));
      setStore({ ok: true, at: Date.now(), why: null });
    } catch (e) {
      setStore({
        ok: false,
        at: null,
        why:
          (e && e.name === "QuotaExceededError"
            ? "Storage full."
            : "This browser is blocking local storage.") + " Use Save file in Tests.",
      });
    }
  };

  /* ---------------- Supabase sync ----------------
     Local-first. localStorage is the cache; the cloud row is the source of
     truth across devices. Whole-document, last-write-wins by updatedAt. */
  const [cfg, setCfg] = useState(loadCfg);
  const [cfgDraft, setCfgDraft] = useState({ url: "", key: "" });
  const supa = useRef(null);
  const [session, setSession] = useState(null);
  const [sync, setSync] = useState({ status: "off", at: null, why: null });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const pushRef = useRef(null);
  const sessionRef = useRef(null);
  sessionRef.current = session;

  useEffect(() => {
    if (!cfg.url || !cfg.key) {
      supa.current = null;
      setSession(null);
      setSync({ status: "off", at: null, why: null });
      return;
    }
    let client;
    try {
      client = createClient(cfg.url, cfg.key);
    } catch (e) {
      setSync({ status: "error", at: null, why: "Bad Supabase URL or key." });
      return;
    }
    supa.current = client;
    setSync({ status: "signedout", at: null, why: null });
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = client.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [cfg.url, cfg.key]);

  const push = async () => {
    const c = supa.current;
    const s = sessionRef.current;
    if (!c || !s) return;
    setSync((v) => ({ ...v, status: "syncing" }));
    const { error } = await c.from("training_logs").upsert({
      user_id: s.user.id,
      data: latest.current,
      updated_at: new Date().toISOString(),
    });
    if (error)
      setSync({
        status: navigator.onLine === false ? "offline" : "error",
        at: null,
        why: error.message,
      });
    else setSync({ status: "synced", at: Date.now(), why: null });
  };

  const pull = async () => {
    const c = supa.current;
    const s = sessionRef.current;
    if (!c || !s) return;
    setSync((v) => ({ ...v, status: "syncing" }));
    const { data, error } = await c
      .from("training_logs")
      .select("data")
      .eq("user_id", s.user.id)
      .maybeSingle();
    if (error) {
      setSync({ status: "error", at: null, why: error.message });
      return;
    }
    const remote = data && data.data;
    const localAt = latest.current.updatedAt || 0;
    const remoteAt = (remote && remote.updatedAt) || 0;
    if (remote && remoteAt > localAt) {
      const merged = { ...BLANK, ...remote };
      setState(merged);
      latest.current = merged;
      writeLocal(merged);
      setSync({ status: "synced", at: Date.now(), why: null });
    } else if (localAt > remoteAt) {
      await push();
    } else {
      setSync({ status: "synced", at: Date.now(), why: null });
    }
  };

  useEffect(() => {
    if (session) pull();
    else if (supa.current) setSync({ status: "signedout", at: null, why: null });
  }, [session]);

  /* retry a push when the network comes back */
  useEffect(() => {
    const onUp = () => {
      if (sessionRef.current) push();
    };
    window.addEventListener("online", onUp);
    return () => window.removeEventListener("online", onUp);
  }, []);

  const sendCode = async () => {
    if (!supa.current || !email) return;
    setAuthMsg("Sending…");
    const { error } = await supa.current.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.href.split("#")[0] },
    });
    setAuthMsg(
      error
        ? error.message
        : "Check your email. Tap the link, or paste the code below."
    );
  };

  const verifyCode = async () => {
    if (!supa.current || !email || !code) return;
    setAuthMsg("Verifying…");
    const { error } = await supa.current.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setAuthMsg(error ? error.message : "");
    if (!error) setCode("");
  };

  const signOut = async () => {
    if (supa.current) await supa.current.auth.signOut();
  };

  const saveCfg = () => {
    const next = { url: cfgDraft.url.trim(), key: cfgDraft.key.trim() };
    try {
      window.localStorage.setItem(CFG_KEY, JSON.stringify(next));
    } catch (e) {
      /* runs from memory this session */
    }
    setCfg(next);
  };

  const clearCfg = () => {
    try {
      window.localStorage.removeItem(CFG_KEY);
    } catch (e) {
      /* ignore */
    }
    setCfg({ url: ENV_SUPABASE_URL, key: ENV_SUPABASE_KEY });
  };

  const persist = useCallback((next) => {
    const stamped = { ...next, updatedAt: Date.now() };
    setState(stamped);
    latest.current = stamped;
    setDirty(true);
    clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => writeLocal(stamped), 300);
    clearTimeout(pushRef.current);
    pushRef.current = setTimeout(() => push(), 1500);
  }, []);

  /* write immediately when the tab goes to the background */
  useEffect(() => {
    const bail = () => {
      writeLocal(latest.current);
      if (sessionRef.current) push();
    };
    window.addEventListener("pagehide", bail);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") bail();
    });
    return () => window.removeEventListener("pagehide", bail);
  }, []);

  const downloadBackup = () => {
    try {
      const blob = new Blob([JSON.stringify(latest.current)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `threshold-log-${ymd(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDirty(false);
      setBackedUpAt(Date.now());
    } catch (e) {
      setPing("Download failed: " + (e && (e.message || String(e))));
    }
  };

  const loadBackup = (file) => {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const parsed = JSON.parse(String(fr.result));
        const merged = { ...BLANK, ...parsed };
        setState(merged);
        latest.current = merged;
        writeLocal(merged);
        setDirty(false);
        setBackedUpAt(Date.now());
        setPing("Restored from file.");
      } catch (e) {
        setPing("That file isn't a valid backup.");
      }
    };
    fr.readAsText(file);
  };

  /* stopwatch */
  useEffect(() => {
    if (!timer.running) return;
    const t = setInterval(() => setTimer((v) => ({ ...v, sec: v.sec + 1 })), 1000);
    return () => clearInterval(t);
  }, [timer.running]);

  const mmss = (s) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const info = dayInfo(date);
  const dayRec = state.days[date] || {};
  const loggedToday = state.log.filter((e) => e.date === date);
  const isLogged = (pid) => loggedToday.some((e) => e.pattern === pid);

  const setDay = (patch) =>
    persist({ ...state, days: { ...state.days, [date]: { ...dayRec, ...patch } } });

  const logSet = (pid) => {
    const d = draft[pid] || {};
    if (!d.setting && !d.duration) return;
    const entry = {
      id: `${date}-${pid}-${Date.now()}`,
      date,
      pattern: pid,
      stage: state.stages[pid],
      setting: d.setting || "",
      duration: d.duration || (timer.id === pid ? mmss(timer.sec) : ""),
      notes: d.notes || "",
    };
    persist({ ...state, log: [entry, ...state.log] });
    setDraft({ ...draft, [pid]: {} });
    if (timer.id === pid) setTimer({ id: null, sec: 0, running: false });
  };

  const setStage = (pid, i) =>
    persist({ ...state, stages: { ...state.stages, [pid]: i } });

  const stageCounts = (pid) => {
    const m = {};
    state.log.filter((e) => e.pattern === pid).forEach((e) => {
      m[e.stage] = (m[e.stage] || 0) + 1;
    });
    return m;
  };

  const lastFor = (pid) => state.log.find((e) => e.pattern === pid);

  const blockDays = dayDiff(BLOCK_START, BLOCK_END) + 1;
  const elapsed = Math.min(
    Math.max(dayDiff(BLOCK_START, date) + 1, 0),
    blockDays
  );
  const strengthDone = new Set(state.log.map((e) => e.date + e.pattern)).size;
  const cardioDone = Object.values(state.days).filter((d) => d.zone2).length;
  const stepDays = Object.values(state.days).filter((d) => d.steps).length;

  const rides = Object.entries(state.days)
    .filter(([, v]) => eff(v))
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const effPoints = rides.map(([, v]) => Number(eff(v)));
  const trend =
    effPoints.length > 1
      ? `${(((effPoints[effPoints.length - 1] - effPoints[0]) / effPoints[0]) * 100).toFixed(1)}% vs first ride`
      : "";

  if (!ready)
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: C.ink, color: C.muted, fontFamily: MONO, fontSize: 12 }}
      >
        Loading your log…
      </div>
    );

  return (
    <div
      className="min-h-screen pb-24"
      style={{ background: C.ink, color: C.chalk, fontFamily: SANS }}
    >
      {/* Header */}
      <div
        className="px-4 pt-5 pb-4"
        style={{ borderBottom: `1px solid ${C.line}`, background: C.panel }}
      >
        <div className="flex items-baseline justify-between">
          <div
            className="uppercase"
            style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}
          >
            Threshold Log
          </div>
          <Eyebrow>{info.week > 0 && info.week < 6 ? `WK ${info.week}/5` : "—"}</Eyebrow>
        </div>
        <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
          Woods method · Aug 31 – Oct 5 · one max set per pattern per week
        </div>
        <div
          className="mt-3 flex"
          style={{ height: 4, background: C.line, borderRadius: 2, overflow: "hidden" }}
        >
          <div
            style={{
              width: `${(elapsed / blockDays) * 100}%`,
              background: C.amber,
            }}
          />
        </div>
        <div className="flex justify-between mt-2">
          <Eyebrow>{strengthDone} sets logged</Eyebrow>
          <Eyebrow>{cardioDone} zone 2</Eyebrow>
          <Eyebrow>{stepDays} step days</Eyebrow>
        </div>
        {(() => {
          const t = (ms) =>
            new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
          const localColor = !store.ok ? C.rust : store.at ? C.green : C.dim;
          const localText = !store.ok
            ? store.why
            : store.at
            ? `Saved ${t(store.at)}`
            : "Nothing logged yet";
          const cloud = {
            off: [C.dim, "Cloud: not connected"],
            signedout: [C.amber, "Cloud: sign in to sync"],
            syncing: [C.muted, "Cloud: syncing…"],
            synced: [C.green, sync.at ? `Cloud: synced ${t(sync.at)}` : "Cloud: synced"],
            offline: [C.amber, "Cloud: offline, will retry"],
            error: [C.rust, `Cloud: ${sync.why || "error"}`],
          }[sync.status] || [C.dim, ""];
          return (
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <div style={{ color: localColor, fontFamily: MONO, fontSize: 11 }}>
                  {localText}
                </div>
                <Btn
                  tone={!store.ok || (dirty && !backedUpAt) ? "solid" : "ghost"}
                  onClick={downloadBackup}
                >
                  Save file
                </Btn>
              </div>
              <div
                style={{ color: cloud[0], fontFamily: MONO, fontSize: 11, marginTop: 4 }}
              >
                {cloud[1]}
              </div>
            </div>
          );
        })()}
      </div>

      {/* TODAY */}
      {tab === "today" && (
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between mb-3">
            <Btn tone="quiet" onClick={() => setDate(addDays(date, -1))}>
              ← Prev
            </Btn>
            <div className="text-center">
              <div style={{ fontSize: 15, fontWeight: 700 }}>{pretty(date)}</div>
              <Eyebrow color={info.kind === "strength" ? C.amber : C.muted}>
                {info.title}
              </Eyebrow>
            </div>
            <Btn tone="quiet" onClick={() => setDate(addDays(date, 1))}>
              Next →
            </Btn>
          </div>

          <div
            className="px-3 py-2 rounded mb-4"
            style={{ background: C.panel, border: `1px solid ${C.line}` }}
          >
            <div style={{ fontSize: 13, color: info.skip ? C.rust : C.chalk }}>
              {info.skip ? "Taper week — skip this one. Steps and Zone 2 only." : info.effort}
            </div>
          </div>

          {info.kind === "test" && (
            <div
              className="p-3 rounded mb-4"
              style={{ background: C.panel, border: `1px solid ${C.amber}` }}
            >
              <Eyebrow color={C.amber}>Test day</Eyebrow>
              <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5, color: C.muted }}>
                Record your numbers in the Tests tab, then set each pattern's
                starting notch in Ladder. For each of the six: find zero first,
                then raise difficulty until you're forced down, and write that
                setting down.
              </div>
            </div>
          )}

          {info.patterns.map((pid) => {
            const p = P[pid];
            const d = draft[pid] || {};
            const last = lastFor(pid);
            const done = isLogged(pid);
            return (
              <div
                key={pid}
                className="mb-4 rounded"
                style={{ background: C.panel, border: `1px solid ${done ? C.green : C.line}` }}
              >
                <div className="px-3 pt-3 pb-2 flex items-start justify-between">
                  <div>
                    <Eyebrow color={done ? C.green : C.amber}>
                      {p.short} {done ? "· logged" : ""}
                    </Eyebrow>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                      {p.stages[state.stages[pid]][0]}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
                      {p.stages[state.stages[pid]][1]}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 20,
                      color: C.amber,
                      paddingLeft: 10,
                    }}
                  >
                    {state.stages[pid]}
                  </div>
                </div>

                <div className="px-3 pb-3">
                  <div style={{ fontSize: 11, color: C.dim, fontFamily: MONO }}>
                    DIAL: {p.variable}
                  </div>
                  {last && (
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                      Last: {last.setting || "—"} · {last.duration || "—"} ·{" "}
                      {pretty(last.date)}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3">
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 24,
                        color: timer.id === pid ? C.amber : C.dim,
                        minWidth: 74,
                      }}
                    >
                      {timer.id === pid ? mmss(timer.sec) : "0:00"}
                    </div>
                    <Btn
                      tone={timer.id === pid && timer.running ? "solid" : "ghost"}
                      onClick={() =>
                        setTimer((t) =>
                          t.id === pid
                            ? { ...t, running: !t.running }
                            : { id: pid, sec: 0, running: true }
                        )
                      }
                    >
                      {timer.id === pid && timer.running ? "Pause" : "Start set"}
                    </Btn>
                    <Btn
                      tone="quiet"
                      onClick={() => setTimer({ id: null, sec: 0, running: false })}
                    >
                      Reset
                    </Btn>
                  </div>

                  <div className="mt-3 space-y-2">
                    <Field
                      value={d.setting || ""}
                      onChange={(v) => setDraft({ ...draft, [pid]: { ...d, setting: v } })}
                      placeholder="Setting at failure — e.g. lean 4 in"
                    />
                    <div className="flex gap-2">
                      <Field
                        wide={false}
                        value={d.duration ?? (timer.id === pid ? mmss(timer.sec) : "")}
                        onChange={(v) => setDraft({ ...draft, [pid]: { ...d, duration: v } })}
                        placeholder="1:45"
                      />
                      <Field
                        value={d.notes || ""}
                        onChange={(v) => setDraft({ ...draft, [pid]: { ...d, notes: v } })}
                        placeholder="Notes"
                        mono={false}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Btn tone="solid" onClick={() => logSet(pid)}>
                        Log set
                      </Btn>
                      <Btn
                        onClick={() => {
                          setTab("ladder");
                          setOpen(pid);
                        }}
                      >
                        Change notch
                      </Btn>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Zone 2 + steps */}
          <div
            className="rounded p-3 mb-4"
            style={{ background: C.panel, border: `1px solid ${C.line}` }}
          >
            <div className="flex items-center justify-between">
              <Eyebrow color={dayRec.zone2 ? C.green : C.muted}>
                Zone 2 · Keiser M3
              </Eyebrow>
              <Btn
                tone={dayRec.zone2 ? "good" : "ghost"}
                onClick={() => setDay({ zone2: !dayRec.zone2 })}
              >
                {dayRec.zone2 ? "Ridden" : "Mark ridden"}
              </Btn>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>
              {state.z2target
                ? `Hold ${state.z2target} W at 85–95 rpm for 60 minutes.`
                : "First ride: 85–95 rpm, let the talk test pick the gear, then note the watts."}
            </div>

            <div className="grid grid-cols-4 gap-2 mt-3">
              {[
                ["gear", "Gear"],
                ["watts", "Avg W"],
                ["hr", "Avg HR"],
                ["mins", "Min"],
              ].map(([k, label]) => (
                <div key={k}>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      color: C.dim,
                      letterSpacing: 1,
                    }}
                    className="uppercase"
                  >
                    {label}
                  </div>
                  <input
                    value={dayRec[k] || ""}
                    onChange={(e) => setDay({ [k]: e.target.value })}
                    placeholder="—"
                    inputMode="numeric"
                    className="w-full px-2 py-2 rounded outline-none mt-1"
                    style={{
                      background: C.ink,
                      border: `1px solid ${C.line}`,
                      color: C.chalk,
                      fontFamily: MONO,
                      fontSize: 14,
                    }}
                  />
                </div>
              ))}
            </div>

            {eff(dayRec) && (
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  color: C.amber,
                  marginTop: 8,
                }}
              >
                {eff(dayRec)} W per beat
              </div>
            )}

            <div
              className="flex items-center justify-between mt-4 pt-3"
              style={{ borderTop: `1px solid ${C.line}` }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>10,000 steps</div>
                <div style={{ fontSize: 12, color: C.muted }}>Every day, no exceptions.</div>
              </div>
              <Btn
                tone={dayRec.steps ? "good" : "ghost"}
                onClick={() => setDay({ steps: !dayRec.steps })}
              >
                {dayRec.steps ? "Done" : "Mark"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* LADDER */}
      {tab === "ladder" && (
        <div className="px-4 pt-4">
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            Your current notch on each pattern. Move up only when you can hold
            the setting at real intensity for a full set — the notch is the
            progress metric, not reps.
          </div>
          {PATTERNS.map((p) => {
            const isOpen = open === p.id;
            return (
              <div
                key={p.id}
                className="mt-3 rounded"
                style={{ background: C.panel, border: `1px solid ${C.line}` }}
              >
                <button
                  className="w-full px-3 py-3 flex items-center justify-between text-left"
                  onClick={() => setOpen(isOpen ? null : p.id)}
                >
                  <div>
                    <Eyebrow>{p.short}</Eyebrow>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                      {p.stages[state.stages[p.id]][0]}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      Goal: {p.goal}
                    </div>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 22, color: C.amber }}>
                    {state.stages[p.id]}
                    <span style={{ color: C.dim, fontSize: 12 }}>/7</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="pb-3">
                    <div className="px-3" style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                      <div>
                        <span style={{ color: C.dim, fontFamily: MONO, fontSize: 11 }}>DIAL </span>
                        {p.variable}
                      </div>
                      <div className="mt-1">
                        <span style={{ color: C.dim, fontFamily: MONO, fontSize: 11 }}>GEAR </span>
                        {p.gear}
                      </div>
                      <div className="mt-1" style={{ color: C.amber }}>
                        Suggested start: {p.suggested} — {p.why}
                      </div>
                    </div>
                    <Ladder
                      pattern={p}
                      stage={state.stages[p.id]}
                      counts={stageCounts(p.id)}
                      onPick={(i) => setStage(p.id, i)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* LOG */}
      {tab === "log" && (
        <div className="px-4 pt-4">
          {state.log.length === 0 && (
            <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>
              No sets yet. Log your first one from Today — the setting you fail
              at is the only number worth keeping.
            </div>
          )}
          {state.log.map((e) => (
            <div
              key={e.id}
              className="mb-2 rounded px-3 py-2 flex items-start justify-between"
              style={{ background: C.panel, border: `1px solid ${C.line}` }}
            >
              <div style={{ flex: 1 }}>
                <div className="flex items-center gap-2">
                  <Eyebrow color={C.amber}>{P[e.pattern].short}</Eyebrow>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.dim }}>
                    notch {e.stage}
                  </span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 14, marginTop: 3 }}>
                  {e.setting || "—"}
                </div>
                {e.notes && (
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{e.notes}</div>
                )}
              </div>
              <div className="text-right" style={{ paddingLeft: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 13, color: C.amber }}>
                  {e.duration || "—"}
                </div>
                <div style={{ fontSize: 11, color: C.dim }}>{pretty(e.date)}</div>
                <button
                  onClick={() =>
                    persist({ ...state, log: state.log.filter((x) => x.id !== e.id) })
                  }
                  style={{ fontFamily: MONO, fontSize: 10, color: C.dim, marginTop: 4 }}
                >
                  DELETE
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TESTS */}
      {tab === "tests" && (
        <div className="px-4 pt-4">
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            Same tests, same order, same time of day. Aug 29 against Oct 5 is
            the verdict on the block.
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 mb-2">
            <div />
            <Eyebrow color={C.amber}>Aug 29</Eyebrow>
            <Eyebrow color={C.green}>Oct 5</Eyebrow>
          </div>

          {TEST_FIELDS.map(([k, label]) => (
            <div key={k} className="grid grid-cols-3 gap-2 mb-2 items-center">
              <div style={{ fontSize: 12 }}>{label}</div>
              <Field
                value={state.tests.base[k] || ""}
                onChange={(v) =>
                  persist({
                    ...state,
                    tests: { ...state.tests, base: { ...state.tests.base, [k]: v } },
                  })
                }
                placeholder="—"
              />
              <Field
                value={state.tests.retest[k] || ""}
                onChange={(v) =>
                  persist({
                    ...state,
                    tests: { ...state.tests, retest: { ...state.tests.retest, [k]: v } },
                  })
                }
                placeholder="—"
              />
            </div>
          ))}

          <div className="mt-6">
            <Eyebrow>Threshold settings</Eyebrow>
            {PATTERNS.map((p) => (
              <div key={p.id} className="grid grid-cols-3 gap-2 mb-2 mt-2 items-center">
                <div style={{ fontSize: 12 }}>{p.short}</div>
                <Field
                  value={state.tests.base[p.id] || ""}
                  onChange={(v) =>
                    persist({
                      ...state,
                      tests: { ...state.tests, base: { ...state.tests.base, [p.id]: v } },
                    })
                  }
                  placeholder="setting"
                />
                <Field
                  value={state.tests.retest[p.id] || ""}
                  onChange={(v) =>
                    persist({
                      ...state,
                      tests: { ...state.tests, retest: { ...state.tests.retest, [p.id]: v } },
                    })
                  }
                  placeholder="setting"
                />
              </div>
            ))}
          </div>
          <div
            className="mt-8 rounded p-3"
            style={{ background: C.panel, border: `1px solid ${C.line}` }}
          >
            <Eyebrow color={C.amber}>Cloud sync</Eyebrow>

            {!cfg.url || !cfg.key ? (
              <div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>
                  Connect a Supabase project to sync between devices. Project URL
                  and anon key from Settings → API. They're safe to keep here;
                  row-level security is what protects your data.
                </div>
                <div className="mt-3 space-y-2">
                  <Field
                    value={cfgDraft.url}
                    onChange={(v) => setCfgDraft({ ...cfgDraft, url: v })}
                    placeholder="https://xxxx.supabase.co"
                  />
                  <Field
                    value={cfgDraft.key}
                    onChange={(v) => setCfgDraft({ ...cfgDraft, key: v })}
                    placeholder="anon public key"
                  />
                  <Btn tone="solid" onClick={saveCfg}>
                    Connect
                  </Btn>
                </div>
              </div>
            ) : !session ? (
              <div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>
                  Sign in with your email. No password — you get a link and a code.
                </div>
                <div className="mt-3 space-y-2">
                  <Field
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    mono={false}
                  />
                  <Btn tone="solid" onClick={sendCode}>
                    Send code
                  </Btn>
                  <div className="flex gap-2">
                    <Field
                      wide={false}
                      value={code}
                      onChange={setCode}
                      placeholder="123456"
                    />
                    <Btn onClick={verifyCode}>Verify</Btn>
                  </div>
                  {authMsg && (
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
                      {authMsg}
                    </div>
                  )}
                  <button
                    onClick={clearCfg}
                    style={{ fontFamily: MONO, fontSize: 10, color: C.dim, marginTop: 4 }}
                  >
                    DISCONNECT PROJECT
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, marginTop: 6 }}>{session.user.email}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>
                  Every change pushes to the cloud a second or two after you make
                  it. Opening the app on another device pulls the latest copy.
                </div>
                <div className="flex gap-2 mt-3">
                  <Btn tone="solid" onClick={pull}>
                    Sync now
                  </Btn>
                  <Btn onClick={signOut}>Sign out</Btn>
                </div>
              </div>
            )}
          </div>

          <div
            className="mt-4 rounded p-3"
            style={{ background: C.panel, border: `1px solid ${C.line}` }}
          >
            <Eyebrow>Backup</Eyebrow>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>
              Your log saves to this browser automatically. Save a file every
              week or two as well — Safari can clear site data, and a file is the
              only copy that survives that.
            </div>

            <div className="flex gap-2 mt-3">
              <Btn tone="solid" onClick={downloadBackup}>
                Save file
              </Btn>
              <label>
                <span
                  className="px-3 py-2 rounded uppercase inline-block"
                  style={{
                    border: `1px solid ${C.line}`,
                    color: C.chalk,
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: 1.5,
                    fontWeight: 600,
                  }}
                >
                  Load file
                </span>
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => e.target.files[0] && loadBackup(e.target.files[0])}
                />
              </label>
            </div>
            {ping && (
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: C.muted,
                  marginTop: 8,
                  whiteSpace: "pre-wrap",
                }}
              >
                {ping}
              </div>
            )}
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>
              Everything you've logged, as text. Copy it into a note if you want
              a copy outside this app.
            </div>
            <textarea
              readOnly
              value={JSON.stringify(state)}
              onFocus={(e) => e.target.select()}
              className="w-full mt-2 px-2 py-2 rounded outline-none"
              rows={3}
              style={{
                background: C.ink,
                border: `1px solid ${C.line}`,
                color: C.muted,
                fontFamily: MONO,
                fontSize: 11,
              }}
            />
            <div className="flex gap-2 mt-2">
              <Btn
                onClick={() => {
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(JSON.stringify(state));
                    setPing("Copied to clipboard.");
                  }
                }}
              >
                Copy as text
              </Btn>
            </div>

            <div style={{ fontSize: 12, color: C.muted, marginTop: 14 }}>
              Paste a backup here to restore it. This replaces everything
              currently in the app.
            </div>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="Paste backup text"
              rows={2}
              className="w-full mt-2 px-2 py-2 rounded outline-none"
              style={{
                background: C.ink,
                border: `1px solid ${C.line}`,
                color: C.chalk,
                fontFamily: MONO,
                fontSize: 11,
              }}
            />
            <div className="mt-2">
              <Btn
                tone="solid"
                onClick={() => {
                  try {
                    persist({ ...BLANK, ...JSON.parse(paste) });
                    setPaste("");
                  } catch (e) {
                    setPaste("That text isn't a valid backup. Paste the whole thing.");
                  }
                }}
              >
                Restore
              </Btn>
            </div>
          </div>
        </div>
      )}
      {tab === "cardio" && (
        <div className="px-4 pt-4">
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            Steer by watts, not heart rate. Hold the same power every ride —
            progress is that power costing you fewer beats.
          </div>

          <div
            className="mt-4 rounded p-3"
            style={{ background: C.panel, border: `1px solid ${C.line}` }}
          >
            <Eyebrow color={C.amber}>Target power</Eyebrow>
            <div className="flex items-center gap-3 mt-2">
              <Field
                wide={false}
                value={state.z2target || ""}
                onChange={(v) => persist({ ...state, z2target: v })}
                placeholder="W"
              />
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
                Watts at 85–95 rpm. Set it after your first ride. Add 5–10 W only
                when your average HR sits at the bottom of the range twice running.
              </div>
            </div>
          </div>

          <div
            className="mt-3 rounded p-3"
            style={{ background: C.panel, border: `1px solid ${C.line}` }}
          >
            <Eyebrow>Watts per beat</Eyebrow>
            <Spark points={effPoints} />
            {effPoints.length > 1 && (
              <div className="flex justify-between mt-1">
                <Eyebrow>{rides.length} rides</Eyebrow>
                <Eyebrow color={effPoints[effPoints.length - 1] >= effPoints[0] ? C.green : C.rust}>
                  {trend}
                </Eyebrow>
              </div>
            )}
          </div>

          <div className="mt-4">
            {rides.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>
                No rides logged yet. Enter gear, average watts, average heart rate
                and minutes on the Today tab after each session.
              </div>
            ) : (
              rides
                .slice()
                .reverse()
                .map(([d, v]) => (
                  <div
                    key={d}
                    className="mb-2 rounded px-3 py-2 flex items-center justify-between"
                    style={{ background: C.panel, border: `1px solid ${C.line}` }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{pretty(d)}</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>
                        G{v.gear || "—"} · {v.watts}W · {v.hr}bpm · {v.mins || "—"}min
                      </div>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 17, color: C.amber }}>
                      {eff(v)}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div
        className="fixed bottom-0 left-0 right-0 flex"
        style={{ background: C.panel2, borderTop: `1px solid ${C.line}` }}
      >
        {[
          ["today", "Today"],
          ["ladder", "Ladder"],
          ["cardio", "Zone 2"],
          ["log", "Log"],
          ["tests", "Tests"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="flex-1 py-4 uppercase"
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 0.5,
              color: tab === k ? C.amber : C.dim,
              borderTop: `2px solid ${tab === k ? C.amber : "transparent"}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<ThresholdLog />);
