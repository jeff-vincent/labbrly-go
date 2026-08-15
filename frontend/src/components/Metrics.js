import React, { useEffect, useMemo, useRef, useState, useId } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { jwtDecode } from "jwt-decode";

export default function Metrics() {
  const { getAccessTokenSilently } = useAuth0();

  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // filters
  const [userQuery, setUserQuery] = useState("");
  // Rolling window selector for KPI & charts
  const [rangeDays, setRangeDays] = useState(7); // 7 | 14 | 30 | 60 | 90 | 180 | 365 | 'ALL'
  const [eventTypeFilters, setEventTypeFilters] = useState(new Set());
  const [sortBy, setSortBy] = useState("date_desc");
  const [groupBy, setGroupBy] = useState("none"); // none | user | date | type
  const [labIdFilter, setLabIdFilter] = useState(""); // new: filter by labId
  const [orgId, setOrgId] = useState("");
  const [token, setToken] = useState(""); // placeholder for Authorization header
  // summaries specific filters
  const [summaryQuery, setSummaryQuery] = useState("");
  const [summaryTagFilters, setSummaryTagFilters] = useState(new Set());
  // Session summaries specific new filters
  const [summaryUser, setSummaryUser] = useState("");
  // Date range now unified with global window selector (rangeDays); per-summary date inputs removed

  // measure chart containers so SVGs don't overflow their cards
  const useContainerWidth = () => {
    const ref = useRef(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
      const node = ref.current;
      if (!node) return;
      const ro = new ResizeObserver((entries) => {
        const cr = entries[0]?.contentRect;
        if (cr) setWidth(cr.width);
      });
      ro.observe(node);
      return () => ro.disconnect();
    }, []);
    return [ref, width];
  };

  const [lineRef, lineW] = useContainerWidth();
  const [barRef, barW] = useContainerWidth();

  // useEffect(() => {
  //   (async () => {
      
  //     setToken(token);
  //     // Decode org_id from token
      
  //     setOrgId(orgId);
  //   })();
  // }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        const token = await getAccessTokenSilently({ audience: process.env.REACT_APP_AUTH0_AUDIENCE });
        const res = await fetch(`/analytics/events`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
        if (!res.ok) throw new Error(`Failed to fetch orgs (${res.status})`);
        const data = await res.json();
        console.log("Fetched orgs/events:", data);
        // Use array form, but wrap single org payloads
        const arr = Array.isArray(data) ? data : [data];
        if (isMounted) setOrgs(arr);
      } catch (e) {
        if (isMounted) setErr(e.message || "Failed to load");
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [getAccessTokenSilently]);

  // Return only events, uniqueUsers, allEventTypes
  const { events, uniqueUsers, allEventTypes } = useMemo(() => {
    const inferEventType = (val) => {
      if (val == null) return "unknown";
      if (typeof val === "string") {
        const s = val.toLowerCase();
        if (s.includes("complete")) return "completed";
        if (s.includes("start") || s.includes("begin")) return "started";
        if (s.includes("view") || s.includes("open")) return "viewed";
        return "event";
      }
      if (typeof val === "object") {
        // Include 'event' property support from new payloads
        const v = val.event && typeof val.event === "string" ? val.event.toLowerCase() : "";
        if (v.includes("complete")) return "completed";
        if (v.includes("start") || v.includes("begin")) return "started";
        if (v.includes("view") || v.includes("open")) return "viewed";
        return val.type || val.eventType || val.action || "event";
      }
      return "event";
    };

    const detailOf = (val) => {
      if (val == null) return "";
      if (typeof val === "string") return val;
      if (typeof val === "object") {
        return (
          val.detail ||
          val.description ||
          val.event || // e.g. "lab started" / "lab completed"
          val.lab ||
          val.name ||
          JSON.stringify(val)
        );
      }
      return String(val);
    };

    const flat = [];
    const usersSet = new Set();
    const typeSet = new Set();

    orgs.forEach((org, idx) => {
      // Prefer org_id and organization_display_name from new payload
      const oid = org?.org_id || (org?._id && (org._id.$oid || org._id)) || org?.id || org?.slug || `org-${String(idx + 1)}`;
      const oname = org?.organization_display_name || org?.organization_name || org?.name || org?.orgName || org?.displayName || oid;

      const users = org?.users || {};
      Object.entries(users).forEach(([userKey, userVal]) => {
        usersSet.add(userKey);
        // New shape: userVal is a dict of ISO -> eventPayload
        // Backward compat: if userVal.events exists, use that
        const eventsDict = (userVal && (userVal.events || userVal)) || {};
        Object.entries(eventsDict).forEach(([iso, payload]) => {
          const ts = new Date(iso);
          if (isNaN(ts)) return;
          const type = inferEventType(payload);
          const labId = (payload && (payload.lab_id || payload.labId)) || null;
          typeSet.add(type);
          flat.push({
            id: `${oid}::${userKey}::${iso}`,
            orgId: oid,
            orgName: oname,
            userKey,
            iso,
            timestamp: ts,
            type,
            detail: detailOf(payload),
            labId,
            raw: payload,
          });
        });
      });
    });

    // If no events were produced and the fetched data looks like a flat list of event records
    // (current /analytics/events response), synthesize events directly from those objects.
    if (flat.length === 0 && Array.isArray(orgs) && orgs.some(o => o && (o.event || o.metrics || o.summary))) {
      orgs.forEach((obj, i) => {
        const oid = obj?.org_id || obj?.orgId || `org-${i + 1}`;
        const userKey = obj?.user_id || obj?.userId || "unknown";
        const tsRaw = obj?.timestamp;
        let ts;
        if (typeof tsRaw === 'string') ts = new Date(tsRaw);
        else if (typeof tsRaw === 'number') ts = new Date(tsRaw);
        else ts = new Date();
        if (isNaN(ts)) return;
        usersSet.add(userKey);
        const type = inferEventType(obj.event || obj);
        typeSet.add(type);
        const labId = obj.lab_id || obj.labId || null;
        flat.push({
          id: `${oid}::${userKey}::${ts.toISOString()}`,
          orgId: oid,
            orgName: oid,
          userKey,
          iso: ts.toISOString(),
          timestamp: ts,
          type,
          detail: detailOf(obj),
          labId,
          raw: obj,
        });
      });
    }

    flat.sort((a, b) => b.timestamp - a.timestamp);

    return {
      events: flat,
      uniqueUsers: usersSet.size,
      allEventTypes: Array.from(typeSet).sort(),
    };
  }, [orgs]);

  // Unique lab IDs for filter select
  const labOptions = useMemo(() => {
    const set = new Set();
    events.forEach((e) => { if (e.labId) set.add(e.labId); });
    return Array.from(set).sort();
  }, [events]);

  // ----- Session Summaries (LLM analytics) -----
  const {
    summaryItems,
    allSummaryTags,
    filteredSummaryItems,
    summaryUserOptions,
    tagFreq,
    maxTagFreq,
  } = useMemo(() => {
    // Date range inputs removed; summaries no longer time-filtered beyond global window controls

    const items = events.filter((e) => {
      // Only synthesized summary style objects (typed 'event' because no explicit word match)
      const raw = e.raw;
      if (!(raw && raw.summary && raw.summary.text)) return false;
      // RA: treat those with metrics as well
      return true;
    });

    // Collect tags, but later we'll scope to selected window for tag button list
    const nowTs = Date.now();
    const tagFreq = new Map();
    const windowCutoff = rangeDays === 'ALL' ? 0 : nowTs - rangeDays*86400000; // use 30 days etc
    items.forEach(e => {
      if (e.timestamp.getTime() >= windowCutoff) {
        (e.raw.summary.tags || []).forEach(t => tagFreq.set(t, (tagFreq.get(t)||0)+1));
      }
    });

    // Apply filters (shared lab/date + summary specific)
    const hasTagFilters = summaryTagFilters.size > 0;
    const q = summaryQuery.trim().toLowerCase();

  // Apply rolling window (rangeDays) to summaries as well
  const cutoff = rangeDays === 'ALL' ? 0 : Date.now() - rangeDays*86400000;

    const filteredItems = items.filter((e) => {
      if (labIdFilter && e.labId !== labIdFilter) return false;
      if (summaryUser && e.userKey !== summaryUser) return false;
  if (e.timestamp.getTime() < cutoff) return false;
      if (q) {
        const text = e.raw.summary.text.toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (hasTagFilters) {
        const tags = e.raw.summary.tags || [];
        let match = false;
        for (const t of tags) if (summaryTagFilters.has(t)) { match = true; break; }
        if (!match) return false;
      }
      return true;
    });

    // Sort newest first
    filteredItems.sort((a, b) => b.timestamp - a.timestamp);

    // Build user list (only those present in summaries)
    const userSet = new Set(items.map(i => i.userKey));
    const userOptions = Array.from(userSet).sort();

    const maxTagFreq = Math.max(1, ...tagFreq.values());
    return {
      summaryItems: items,
      allSummaryTags: Array.from(tagFreq.keys()).sort(),
      filteredSummaryItems: filteredItems,
      summaryUserOptions: userOptions,
      tagFreq,
      maxTagFreq,
    };
  }, [events, labIdFilter, summaryQuery, summaryTagFilters, summaryUser, rangeDays]);

  const toggleSummaryTag = (tag) => {
    setSummaryTagFilters((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  };
  const clearSummaryTags = () => setSummaryTagFilters(new Set());

  const filtered = useMemo(() => {
    // explicit date filtering removed; we rely on rolling window selector for KPI context
    const hasTypeFilter = eventTypeFilters.size > 0;

    let list = events.filter((e) => {
      if (userQuery && !e.userKey.toLowerCase().includes(userQuery.toLowerCase())) return false;
      if (labIdFilter && e.labId !== labIdFilter) return false; // new: lab filter
      if (hasTypeFilter && !eventTypeFilters.has(e.type)) return false;
      return true;
    });

    switch (sortBy) {
      case "date_asc":
        list = [...list].sort((a, b) => a.timestamp - b.timestamp);
        break;
      case "user_asc":
        list = [...list].sort((a, b) => a.userKey.localeCompare(b.userKey) || b.timestamp - a.timestamp);
        break;
      case "user_desc":
        list = [...list].sort((a, b) => b.userKey.localeCompare(a.userKey) || b.timestamp - a.timestamp);
        break;
      default:
        // date_desc
        list = [...list].sort((a, b) => b.timestamp - a.timestamp);
    }
    return list;
  }, [events, userQuery, labIdFilter, eventTypeFilters, sortBy]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map();
    const keyOf = (e) => {
      switch (groupBy) {
        case "user":
          return e.userKey;
        case "date":
          return e.timestamp.toISOString().slice(0, 10); // YYYY-MM-DD
        case "type":
          return e.type;
        default:
          return "";
      }
    };
    filtered.forEach((e) => {
      const k = keyOf(e);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(e);
    });
    // sort group keys nicely
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (groupBy === "date") return b.localeCompare(a);
      return a.localeCompare(b);
    });
    return { keys, map };
  }, [filtered, groupBy]);

  // (moved chart aggregations below after currentWindow definition)

  const toggleTypeFilter = (t) => {
    setEventTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const clearTypeFilters = () => setEventTypeFilters(new Set());

  const formatDT = (d) =>
    `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  const formatDuration = (ms) => {
    if (!ms || ms < 0) return "—";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  };

  // --------- INSIGHT AGGREGATIONS (fancy mode) ---------
  const now = Date.now();
  const DAY_MS = 86400000;
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const byPeriod = (days) => {
    if (days === 'ALL') return events;
    const cutoff = now - days * DAY_MS;
    return events.filter(e => e.timestamp.getTime() >= cutoff);
  };
  const currentWindow = byPeriod(rangeDays);
  const previousWindow = rangeDays === 'ALL' ? [] : events.filter(e => {
    const t = e.timestamp.getTime();
    return t >= now - (2*rangeDays)*DAY_MS && t < now - rangeDays*DAY_MS;
  });
  const last30 = byPeriod(30);
  const growth = (curr, prev) => prev === 0 ? (curr>0?100:0) : ((curr - prev)/prev)*100;

  // Window-scoped aggregations for charts and completion statistics
  const timeSeries = useMemo(() => {
    if (!currentWindow.length) return [];
    const daysBack = rangeDays === 'ALL'
      ? Math.max(1, Math.ceil((now - Math.min(...events.map(e=> e.timestamp.getTime())))/DAY_MS))
      : rangeDays;
    const startTs = now - (daysBack-1)*DAY_MS;
    const counts = new Map();
    currentWindow.forEach(e => {
      const day = new Date(e.timestamp.getFullYear(), e.timestamp.getMonth(), e.timestamp.getDate());
      const key = day.toISOString().slice(0,10);
      counts.set(key, (counts.get(key)||0)+1);
    });
    const arr = [];
    for (let i=0;i<daysBack;i++) {
      const d = new Date(startTs + i*DAY_MS);
      const key = d.toISOString().slice(0,10);
      arr.push({ date:key, count: counts.get(key)||0, ts:d });
    }
    return arr;
  }, [currentWindow, rangeDays, events]);

  const typeCounts = useMemo(() => {
    const map = new Map();
    currentWindow.forEach(e => map.set(e.type, (map.get(e.type)||0)+1));
    const arr = Array.from(map.entries()).map(([type,count])=>({type,count}));
    arr.sort((a,b)=> b.count - a.count || a.type.localeCompare(b.type));
    return arr;
  }, [currentWindow]);

  const completionStats = useMemo(() => {
    const asc = [...currentWindow].sort((a,b)=> a.timestamp - b.timestamp);
    const starts = new Map();
    const durations = [];
    let startedSessions = 0;
    let completedSessions = 0;
    for (const e of asc) {
      const lab = e.labId || '';
      const key = `${e.userKey}::${lab}`;
      if (e.type === 'started' && lab) {
        starts.set(key, e.timestamp.getTime());
        startedSessions++;
      } else if (e.type === 'completed' && lab) {
        completedSessions++;
        const t0 = starts.get(key);
        const t1 = e.timestamp.getTime();
        if (typeof t0 === 'number' && t1 >= t0) {
          durations.push(t1 - t0);
          starts.delete(key);
        }
      }
    }
    const n = durations.length;
    if (!n) return { count:0, avgMs:0, medianMs:0, p90Ms:0, minMs:0, maxMs:0, startedSessions, completedSessions, completionRate: startedSessions? completedSessions/startedSessions:0 };
    durations.sort((a,b)=> a-b);
    const sum = durations.reduce((a,b)=> a+b,0);
    const avg = sum / n;
    const median = n%2? durations[(n-1)/2] : (durations[n/2-1]+durations[n/2])/2;
    const p90 = durations[Math.floor(0.9*(n-1))];
    return { count:n, avgMs:avg, medianMs:median, p90Ms:p90, minMs:durations[0], maxMs:durations[n-1], startedSessions, completedSessions, completionRate: startedSessions? completedSessions/startedSessions:0 };
  }, [currentWindow]);

  const countDistinct = (arr, key) => {
    const s = new Set(arr.map(a => a[key]).filter(Boolean));
    return s.size;
  };
  const activeUsersCurr = countDistinct(currentWindow, 'userKey');
  const activeUsersPrev = countDistinct(previousWindow, 'userKey');
  const activeGrowth = growth(activeUsersCurr, activeUsersPrev);

  // Top labs by activity (last 7 days)
  const labActivity = (() => {
    const m = new Map();
  currentWindow.forEach(e => { if(!e.labId) return; m.set(e.labId, (m.get(e.labId)||0)+1); });
    return Array.from(m.entries()).map(([labId, count])=>({labId,count}))
      .sort((a,b)=> b.count - a.count).slice(0,5);
  })();

  // User engagement: sessions = started events; completions; drop-off
  const funnel = (()=>{
    let starts=0, completes=0;
  currentWindow.forEach(e=>{ if(e.type==='started') starts++; else if(e.type==='completed') completes++; });
    return { starts, completes, rate: starts? completes/starts : 0 };
  })();

  // Engagement distribution by user (events per user last 7 days)
  const engagementDist = (() => {
    const m = new Map();
  currentWindow.forEach(e=> m.set(e.userKey, (m.get(e.userKey)||0)+1));
    const counts = Array.from(m.values()).sort((a,b)=>a-b);
    if(counts.length===0) return {p50:0,p90:0,max:0,avg:0,raw:[]};
    const p = (q)=> counts[Math.min(counts.length-1, Math.floor(q*(counts.length-1)))];
    const avg = counts.reduce((a,b)=>a+b,0)/counts.length;
    return {p50:p(0.5),p90:p(0.9),max:counts[counts.length-1],avg,raw:counts};
  })();

  // Retention proxy: users seen both in last 7 days and previous 7 days
  const retention = (() => {
  const sCurr = new Set(currentWindow.map(e=>e.userKey));
  const sPrev = new Set(previousWindow.map(e=>e.userKey));
    let returning=0; sCurr.forEach(u=>{ if(sPrev.has(u)) returning++; });
    const rate = sCurr.size? returning / sCurr.size : 0;
    return { returning, total:sCurr.size, rate };
  })();

  // Stickiness: 7d active users / 30d active users
  const stickiness = (() => {
  const uSelected = new Set(currentWindow.map(e=>e.userKey));
    const u30 = new Set(last30.map(e=>e.userKey));
    const rate = u30.size ? uSelected.size / u30.size : 0;
    return { rate, active7: uSelected.size, active30: u30.size };
  })();

  // New vs Returning (users in last7 absent from all previous events)
  const newVsReturning = (() => {
  const cutoff = rangeDays === 'ALL' ? 0 : now - rangeDays*DAY_MS;
  const prevAll = new Set(events.filter(e=> e.timestamp.getTime() < cutoff).map(e=> e.userKey));
  const curr = new Set(currentWindow.map(e=> e.userKey));
    let newly=0, returning=0; curr.forEach(u=> { if(prevAll.has(u)) returning++; else newly++; });
    return { newly, returning, total: curr.size };
  })();

  // Churn risk: users active in prev7 not seen in last7
  const churnRisk = (() => {
  const sPrev = new Set(previousWindow.map(e=> e.userKey));
  const sCurr = new Set(currentWindow.map(e=> e.userKey));
    const lost = [...sPrev].filter(u=> !sCurr.has(u));
    const rate = sPrev.size ? lost.length / sPrev.size : 0;
    return { lost, count: lost.length, prev: sPrev.size, rate };
  })();

  // Rolling daily active users (last 14 days) & anomaly detection for yesterday
  const rollingDAU = (() => {
  const cap = rangeDays === 'ALL' ? Math.min(60, Math.max(1, Math.ceil((now - Math.min(...events.map(e=>e.timestamp.getTime())))/DAY_MS))) : Math.min(60, rangeDays);
    const days = [];
    for (let i=cap-1; i>=0; i--) {
      const dayStart = startOf(new Date(now - i*DAY_MS));
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);
      const users = new Set();
      let eventsCount = 0;
  currentWindow.forEach(e=> {
        const t = e.timestamp.getTime();
        if (t >= dayStart.getTime() && t < dayEnd.getTime()) { users.add(e.userKey); eventsCount++; }
      });
      days.push({ date: dayStart.toISOString().slice(0,10), users: users.size, count: eventsCount, ts: dayStart });
    }
    return days;
  })();

  const anomaly = (() => {
    if (rollingDAU.length < 8) return null; // need baseline + last
    const lastDay = rollingDAU[rollingDAU.length-1];
    const baseline = rollingDAU.slice(0,-1);
    const mean = baseline.reduce((a,b)=> a+b.count,0)/baseline.length;
    const variance = baseline.reduce((a,b)=> a+Math.pow(b.count-mean,2),0)/baseline.length;
    const std = Math.sqrt(variance) || 1;
    const z = (lastDay.count - mean)/std;
    let status = 'normal';
    if (z >= 2) status = 'spike'; else if (z <= -2) status = 'drop';
    return { z, status, last: lastDay.count, mean: Math.round(mean) };
  })();

  // Power users: users whose 7d events >= p90 threshold
  const powerUsers = (() => {
  const countsMap = new Map();
  currentWindow.forEach(e=> countsMap.set(e.userKey,(countsMap.get(e.userKey)||0)+1));
    const counts = Array.from(countsMap.values()).sort((a,b)=> a-b);
    if (counts.length === 0) return { threshold:0, count:0, total:0, rate:0 };
    const p90 = counts[Math.min(counts.length-1, Math.floor(0.9*(counts.length-1)))];
    const power = counts.filter(c=> c >= p90).length;
    return { threshold: p90, count: power, total: counts.length, rate: counts.length? power / counts.length : 0 };
  })();

  // Time to first completion (per user last30) & delta vs overall median
  const timeToFirstCompletion = (() => {
    const firstCompletionByUser = new Map();
    const firstStartByUser = new Map();
  const base = [...currentWindow].sort((a,b)=> a.timestamp - b.timestamp);
    base.forEach(e=> {
      const key = e.userKey + '::' + (e.labId || '');
      if (e.type === 'started') {
        if (!firstStartByUser.has(key)) firstStartByUser.set(key, e.timestamp.getTime());
      } else if (e.type === 'completed') {
        if (!firstCompletionByUser.has(key)) firstCompletionByUser.set(key, e.timestamp.getTime());
      }
    });
    const durations = [];
    firstCompletionByUser.forEach((c,key)=> {
      const s = firstStartByUser.get(key);
      if (s && c >= s) durations.push(c - s);
    });
    if (!durations.length) return { median:0, count:0 };
    durations.sort((a,b)=> a-b);
    const n = durations.length;
    const median = n%2? durations[(n-1)/2] : (durations[n/2 -1] + durations[n/2])/2;
    return { median, count: n };
  })();

  // Helper formatters for new metrics
  const fmtStick = (r)=> (r*100).toFixed(1)+'%';
  const fmtRate = (r)=> (r*100).toFixed(1)+'%';

  // Hourly heatmap (selected window capped at 30 days for readability)

  const fancyNumber = (v)=> v.toLocaleString();
  const fmtPct = (p)=> (p*100).toFixed(1) + '%';
  const fmtDelta = (d)=> (d>=0? '+' : '') + d.toFixed(1) + '%';

  const [showAdvanced, setShowAdvanced] = useState(false);
  // export controls
  const [exportFormat, setExportFormat] = useState('json'); // json | csv | ndjson | tsv

  const serializeEvents = (list, format) => {
    if (!list || list.length === 0) return '';
    const base = list.map(e => ({
      id: e.id,
      user: e.userKey,
      lab: e.labId || '',
      type: e.type,
      timestamp: e.timestamp.toISOString(),
      detail: e.detail?.replace(/\n/g,' ')
    }));
    if (format === 'json') return JSON.stringify(base, null, 2);
    if (format === 'ndjson') return base.map(o=> JSON.stringify(o)).join('\n');
    const header = Object.keys(base[0]);
    const esc = (v, sep) => {
      if (v == null) return '';
      const s = String(v);
      if (s.includes('"') || s.includes(sep) || s.includes('\n')) return '"' + s.replace(/"/g,'""') + '"';
      return s;
    };
    const sep = format === 'tsv' ? '\t' : ',';
    const rows = [header.join(sep), ...base.map(r => header.map(k => esc(r[k], sep)).join(sep))];
    return rows.join('\n');
  };

  const handleExport = () => {
    try {
      const dataStr = serializeEvents(filtered, exportFormat);
      const blob = new Blob([dataStr], { type: exportFormat === 'json' ? 'application/json' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:T]/g,'-').slice(0,19);
      a.href = url;
  a.download = `events-${rangeDays==='ALL'?'all':rangeDays+'d'}-${exportFormat}-${ts}.${exportFormat==='ndjson'?'jsonl':exportFormat}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed', e);
      alert('Export failed: ' + (e.message || e));
    }
  };

  return (
    <div className="p-6 space-y-8 dark:bg-cp-bg">
      <header className="flex items-center justify-start">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-neutral-100 tracking-tight">Lab Metrics Intelligence</h1>
          <p className="text-xs text-gray-500 dark:text-neutral-500 mt-1">High-signal insights over event stream.</p>
        </div>
      </header>

      {/* Quick range selector elevated for prominence */}
      <div className="flex items-center flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-neutral-400">Window</span>
          <div className="flex flex-wrap gap-1">
            {['ALL',7,14,30,60,90,180,365].map(d => (
              <button
                key={d}
                type="button"
                onClick={()=> setRangeDays(d)}
                className={`px-2 py-1 rounded border text-[11px] font-medium transition ${rangeDays===d ? 'bg-green-600 text-white border-green-600 shadow-sm' : 'bg-white/70 backdrop-blur text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-cp-panel dark:text-neutral-300 dark:border-cp-border'}`}
                aria-pressed={rangeDays===d}
              >{d==='ALL' ? 'All' : d+'d'}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <label className="font-semibold uppercase tracking-wide text-gray-600 dark:text-neutral-400">Export</label>
          <select
            value={exportFormat}
            onChange={e=> setExportFormat(e.target.value)}
            className="px-2 py-1 rounded-md border border-gray-300 bg-white text-[11px] focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-cp-panel dark:border-cp-border"
          >
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="tsv">TSV</option>
            <option value="ndjson">NDJSON</option>
          </select>
          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-1 rounded-md border border-green-600 bg-green-600 text-white text-[11px] font-semibold hover:bg-green-700 shadow-sm"
            title="Download filtered events"
          >Download</button>
        </div>
  <div className="text-[11px] text-gray-500 dark:text-neutral-500">Applies to KPIs, retention, funnel, engagement & power metrics (stickiness still references 30d).</div>
      </div>

      {/* CORE KPIs */}
      <section className="grid gap-4 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
        <InsightCard
          label={`Users (${rangeDays==='ALL'?'All': rangeDays+'d'})`}
          value={fancyNumber(activeUsersCurr)}
          delta={rangeDays==='ALL'? null : fmtDelta(activeGrowth)}
          deltaBelow
          tooltip={`Distinct users active in the ${rangeDays==='ALL'?'entire dataset':'last '+rangeDays+' days'}. ${rangeDays==='ALL'?'All-time view does not show delta.':'Delta compares to the prior '+rangeDays+'-day window.'}`} />
        <InsightCard
          label={`Events (${rangeDays==='ALL'?'All': rangeDays+'d'})`}
          value={fancyNumber(currentWindow.length)}
          delta={rangeDays==='ALL'? null : fmtDelta(growth(currentWindow.length, previousWindow.length))}
          deltaBelow
          tooltip={`Events recorded in the ${rangeDays==='ALL'?'entire dataset':'last '+rangeDays+' days'}. ${rangeDays==='ALL'?'All-time view omits delta.':'Delta vs previous '+rangeDays+'-day period.'}`} />
        <InsightCard
          label="Labs Active"
          value={fancyNumber(countDistinct(currentWindow,'labId'))}
          tooltip={`Labs with at least one event in ${rangeDays==='ALL'?'the dataset':'the last '+rangeDays+' days'}.`} />
        <InsightCard
          label="Retention"
          value={fmtPct(retention.rate)}
          sub={`${retention.returning}/${retention.total}`}
          tooltip={rangeDays==='ALL' ? 'Percent of users active in the dataset time span who were also active in the preceding comparable window is not defined for All-time.' : `Percent of active users in this ${rangeDays}-day window also seen in the prior ${rangeDays}-day window.`} />
        <InsightCard
          label={`Completion Rate (${rangeDays==='ALL'?'All': rangeDays+'d'})`}
          value={fmtPct(funnel.rate)}
          sub={`${funnel.completes||0}/${funnel.starts||0}`}
          tooltip={`Completions / starts over ${rangeDays==='ALL'?'the full dataset':'the last '+rangeDays+' days'}.`} />
        <InsightCard
          label="Median User Events"
          value={engagementDist.p50}
          sub={`p90 ${engagementDist.p90}`}
          tooltip={`Median & 90th percentile events per user (${rangeDays==='ALL'?'all-time': 'last '+rangeDays+' days'}).`} />
        <InsightCard
          label="Stickiness"
          value={fmtStick(stickiness.rate)}
          sub={`${stickiness.active7}/${stickiness.active30}`}
          tooltip={`${rangeDays==='ALL'?'All-time actives':'Selected window actives ('+rangeDays+'d)'} divided by 30-day actives.`} />
        <InsightCard
          label="Power Users"
          value={fmtRate(powerUsers.rate)}
          sub={`${powerUsers.count}/${powerUsers.total} ≥ p90(${powerUsers.threshold})`}
          tooltip={`Share of users whose ${rangeDays==='ALL'?'all-time':'last '+rangeDays+' days'} event count ≥ p90 threshold.`} />
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={()=> setShowAdvanced(a=>!a)}
          className="text-xs px-3 py-2 rounded-md border bg-white hover:bg-gray-50 dark:bg-cp-panel dark:border-cp-border"
        >{showAdvanced? 'Hide Advanced Insights' : 'Show Advanced Insights'}</button>
        {anomaly && (
          <div
            className={`text-[11px] px-2 py-1 rounded font-medium border ${anomaly.status==='spike'?'bg-green-50 text-green-700 border-green-300': anomaly.status==='drop'?'bg-red-50 text-red-600 border-red-300':'bg-gray-100 text-gray-600 border-gray-300'}`}
            title={`Anomaly detection (z-score). Yesterday had ${anomaly.last} events vs mean of ${anomaly.mean} prior days (z=${anomaly.z.toFixed(2)}). Status: ${anomaly.status}.`}
            aria-label={`Anomaly status ${anomaly.status}. Yesterday ${anomaly.last} events vs baseline mean ${anomaly.mean}.`}
          >
            Activity: {anomaly.status.toUpperCase()}
          </div>
        )}
      </div>

      {showAdvanced && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-cp-panel border border-gray-200 dark:border-cp-border rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-neutral-100 mb-2 flex items-center gap-1">Rolling Daily Active Users ({rollingDAU.length}d) <TooltipIcon text={`Distinct users per day across the selected window (capped at 60d).`} /></h3>
            <MiniSparkline data={rollingDAU} field="users" height={80} />
            <div className="mt-2 text-[11px] text-gray-500 flex flex-wrap gap-3">
              <span>Latest: <strong className="text-gray-800 dark:text-neutral-200">{rollingDAU.length? rollingDAU[rollingDAU.length-1].users : 0}</strong></span>
              <span>Mean (prev): <strong className="text-gray-800 dark:text-neutral-200">{rollingDAU.length? Math.round(rollingDAU.slice(0,-1).reduce((a,b)=>a+b.users,0)/Math.max(1,rollingDAU.length-1)) : 0}</strong></span>
            </div>
          </div>
          <div className="bg-white dark:bg-cp-panel border border-gray-200 dark:border-cp-border rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-neutral-100 mb-2 flex items-center gap-1">New vs Returning ({rangeDays==='ALL'?'All': rangeDays+'d'}) <TooltipIcon text={`Breakdown of users active in the selected window: 'New' have no prior history before the window; 'Returning' were active previously.`} /></h3>
            <div className="text-xs text-gray-600 dark:text-neutral-300 space-y-1">
              <div><strong className="text-gray-800 dark:text-neutral-100">New:</strong> {newVsReturning.newly}</div>
              <div><strong className="text-gray-800 dark:text-neutral-100">Returning:</strong> {newVsReturning.returning}</div>
              <div><strong className="text-gray-800 dark:text-neutral-100">Total:</strong> {newVsReturning.total}</div>
              <div className="mt-2"><span className="inline-block h-2 w-full bg-gray-100 rounded overflow-hidden">
                <span className="block h-full bg-indigo-500" style={{width: newVsReturning.total? (newVsReturning.newly/newVsReturning.total)*100 + '%' : '0%'}} />
              </span>
              <div className="mt-1 text-[10px] text-gray-500">Bar shows proportion of NEW users</div>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-cp-panel border border-gray-200 dark:border-cp-border rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-neutral-100 mb-2 flex items-center gap-1">Churn Risk (Prev Window Lost) <TooltipIcon text={`Users active in the prior ${rangeDays==='ALL'?'comparable':' '+rangeDays+'d'} window but absent in the current window.`} /></h3>
            {churnRisk.count === 0 ? <div className="text-xs text-gray-500">No lost users</div> : (
              <div className="text-xs text-gray-600 dark:text-neutral-300 space-y-1">
                <div><strong className="text-gray-800 dark:text-neutral-100">Lost users:</strong> {churnRisk.count}</div>
                <div><strong className="text-gray-800 dark:text-neutral-100">Prev active:</strong> {churnRisk.prev}</div>
                <div><strong className="text-gray-800 dark:text-neutral-100">Churn rate:</strong> {fmtRate(churnRisk.rate)}</div>
                {churnRisk.lost.slice(0,20).map(u => <span key={u} className="inline-block mt-1 mr-1 px-1.5 py-0.5 bg-red-50 border border-red-100 text-[10px] rounded text-red-700 font-mono">{u}</span>)}
                {churnRisk.count>20 && <div className="text-[10px] text-gray-400">… +{churnRisk.count-20} more</div>}
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-cp-panel border border-gray-200 dark:border-cp-border rounded-lg p-4 shadow-sm xl:col-span-2">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-neutral-100 mb-2 flex items-center gap-1">Time To First Completion ({rangeDays==='ALL'?'All': rangeDays+'d'}) <TooltipIcon text="Median time from first start to first completion per user/lab in the selected window." /></h3>
            <div className="text-xs text-gray-600 dark:text-neutral-300 space-y-1">
              <div><strong className="text-gray-800 dark:text-neutral-100">Median:</strong> {formatDuration(timeToFirstCompletion.median)}</div>
              <div><strong className="text-gray-800 dark:text-neutral-100">Samples:</strong> {timeToFirstCompletion.count}</div>
              <div className="mt-1 text-[10px] text-gray-500">Derived from first start-&gt;completion per user/lab in 30d window</div>
            </div>
          </div>
        </section>
      )}

      {/* TRENDS + DISTRIBUTIONS */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white dark:bg-cp-panel border border-gray-200 dark:border-cp-border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-neutral-100 flex items-center gap-1">Events Over Time <TooltipIcon text={`Daily event counts over the selected window${rangeDays==='ALL'? ' (capped by available history)':''}.`} size="sm" position="bottom" /></h3>
              <span className="text-xs text-gray-500">{timeSeries.length} day{timeSeries.length!==1?'s':''}{rangeDays==='ALL'?' (all)':''}</span>
            </div>
            <div ref={lineRef}><SimpleLineChart data={timeSeries} width={Math.max(0,lineW)} height={220} /></div>
          </div>
          <div className="bg-white dark:bg-cp-panel border border-gray-200 dark:border-cp-border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-neutral-100 flex items-center gap-1">Event Type Mix <TooltipIcon text={`Event type distribution across ${rangeDays==='ALL'? 'all events' : 'the last '+rangeDays+' days'}.`} size="sm" position="bottom" /></h3>
              <span className="text-xs text-gray-500">{typeCounts.length} types</span>
            </div>
            <div ref={barRef}><SimpleBarChart data={typeCounts} width={Math.max(0,barW)} height={220} /></div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="bg-white dark:bg-cp-panel border border-gray-200 dark:border-cp-border rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-neutral-100 mb-3">Top Labs ({rangeDays}d)</h3>
            {labActivity.length===0 ? <div className="text-xs text-gray-500">No lab activity</div> : (
              <ul className="space-y-2 text-sm">
                {labActivity.map(l => (
                  <li key={l.labId} className="flex items-center justify-between group">
                    <span className="font-mono text-xs truncate max-w-[120px]" title={l.labId}>{l.labId}</span>
                    <span className="flex items-center gap-2">
                      <BarMeter value={l.count} max={labActivity[0].count} />
                      <span className="tabular-nums text-gray-700 dark:text-neutral-300">{l.count}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white dark:bg-cp-panel border border-gray-200 dark:border-cp-border rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-neutral-100 mb-3">Engagement Distribution (Events/User)</h3>
            {engagementDist.raw.length===0 ? <div className="text-xs text-gray-500">No user events</div> : (
              <EngagementSpark values={engagementDist.raw} />
            )}
            <div className="mt-2 grid grid-cols-4 gap-2 text-[10px] text-gray-500">
              <div>P50 <span className="text-gray-900 dark:text-neutral-200 font-medium">{engagementDist.p50}</span></div>
              <div>P90 <span className="text-gray-900 dark:text-neutral-200 font-medium">{engagementDist.p90}</span></div>
              <div>MAX <span className="text-gray-900 dark:text-neutral-200 font-medium">{engagementDist.max}</span></div>
              <div>AVG <span className="text-gray-900 dark:text-neutral-200 font-medium">{engagementDist.avg.toFixed(1)}</span></div>
            </div>
          </div>
          <div className="bg-white dark:bg-cp-panel border border-gray-200 dark:border-cp-border rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-neutral-100 mb-3">Completion Time Stats (All Filters)</h3>
            <ul className="text-xs space-y-1 text-gray-600 dark:text-neutral-300">
              <li><strong className="font-medium text-gray-800 dark:text-neutral-100">Median:</strong> {formatDuration(completionStats.medianMs)}</li>
              <li><strong className="font-medium text-gray-800 dark:text-neutral-100">Average:</strong> {formatDuration(completionStats.avgMs)}</li>
              <li><strong className="font-medium text-gray-800 dark:text-neutral-100">P90:</strong> {formatDuration(completionStats.p90Ms)}</li>
              <li><strong className="font-medium text-gray-800 dark:text-neutral-100">Range:</strong> {formatDuration(completionStats.minMs)} – {formatDuration(completionStats.maxMs)}</li>
              <li><strong className="font-medium text-gray-800 dark:text-neutral-100">Completion Rate:</strong> {(completionStats.completionRate*100).toFixed(1)}%</li>
            </ul>
          </div>
        </div>
      </section>

  {/* Raw event drawer & legacy controls removed for cleaner UI */}

      {/* Session Summaries Section */}
      <section className="bg-white border border-indigo-200 rounded-lg shadow-sm dark:bg-cp-panel dark:border-cp-border dark:shadow-cp">
        <div className="p-4 border-b border-gray-100 flex flex-col gap-4 lg:gap-2 lg:flex-row lg:items-end lg:justify-between dark:border-cp-border">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">Session Summaries</h2>
            <p className="text-xs text-gray-500">LLM generated analytics for completed / in-progress lab sessions.</p>
            <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
              <span><strong>{filteredSummaryItems.length}</strong> shown</span>
              <span>{summaryItems.length} total</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col">
              <label className="text-[11px] uppercase tracking-wide font-semibold text-gray-600 dark:text-neutral-400 mb-1">User</label>
              <select
                value={summaryUser}
                onChange={e=> setSummaryUser(e.target.value)}
                className="px-2 py-2 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 min-w-[140px]"
              >
                <option value="">All</option>
                {summaryUserOptions.map(u=> <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-[11px] uppercase tracking-wide font-semibold text-gray-600 dark:text-neutral-400 mb-1">Window</label>
              <div className="flex flex-wrap gap-1 w-[240px]">
                {['ALL',7,14,30,60,90,180,365].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={()=> setRangeDays(d)}
                    className={`px-2 py-1 rounded border text-[10px] font-medium transition ${rangeDays===d ? 'bg-green-600 text-white border-green-600 shadow-sm' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-cp-panel dark:text-neutral-300 dark:border-cp-border'}`}
                    aria-pressed={rangeDays===d}
                  >{d==='ALL'?'All': d+'d'}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-col">
              <label className="text-[11px] uppercase tracking-wide font-semibold text-gray-600 dark:text-neutral-400 mb-1">Search</label>
              <input
                type="text"
                value={summaryQuery}
                onChange={(e) => setSummaryQuery(e.target.value)}
                placeholder="Text…"
                className="px-2 py-2 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-48"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[11px] uppercase tracking-wide font-semibold text-gray-600 dark:text-neutral-400 mb-1">Actions</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setSummaryQuery(""); clearSummaryTags(); setSummaryUser(""); }}
                  className="px-3 py-2 rounded-md border text-xs font-medium bg-white hover:bg-gray-50 border-gray-300"
                >Reset</button>
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 pt-4">
          {allSummaryTags.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={clearSummaryTags}
                className={`px-2 py-1 rounded border text-xs ${summaryTagFilters.size === 0 ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 border-gray-300'}`}
              >All Tags</button>
              {allSummaryTags.map(tag => {
                const active = summaryTagFilters.has(tag);
                const freq = tagFreq.get(tag) || 0;
                const intensity = maxTagFreq ? freq / maxTagFreq : 0;
                // Softer 4-step scale, muted neutrals/greens
                let colorClasses = 'bg-gray-50 text-gray-700 border-gray-300'; // none
                if (intensity > 0.15) colorClasses = 'bg-green-50 text-green-700 border-green-100';
                if (intensity > 0.35) colorClasses = 'bg-green-100 text-green-800 border-green-200';
                if (intensity > 0.6) colorClasses = 'bg-green-200 text-green-800 border-green-300';
                if (intensity > 0.8) colorClasses = 'bg-green-300 text-green-900 border-green-400';
                if (active) colorClasses = 'bg-green-500 text-white border-green-500 shadow-sm';
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleSummaryTag(tag)}
                    className={`px-2 py-1 rounded border text-xs transition hover:border-green-400 hover:bg-green-50/60 ${colorClasses} ${active? 'hover:bg-green-500 hover:border-green-500':''}`}
                    title={`Tag: ${tag} • Frequency: ${freq}`}
                    aria-pressed={active}
                  >{tag}</button>
                );
              })}
            </div>
          )}
          <div className="text-xs text-gray-500 mb-2">Showing {filteredSummaryItems.length} of {summaryItems.length} summaries</div>
        </div>
        {/* TagHeatmap removed; frequency encoded directly in tag buttons above */}
        {filteredSummaryItems.length === 0 ? (
          <div className="p-6 text-gray-500">No summaries match current filters.</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-cp-border">
            {filteredSummaryItems.map(item => {
              const raw = item.raw;
              const metrics = raw.metrics || {};
              const tags = (raw.summary.tags || []);
              return (
                <div key={item.id} className="p-4 flex flex-col gap-3 hover:bg-gray-50 dark:hover:bg-cp-bg/40">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{item.labId || 'no-lab'}</span>
                    <span className="text-gray-500">{item.userKey}</span>
                    <span className="text-gray-400">{formatDT(item.timestamp)}</span>
                    <div className="flex gap-2 text-[11px] text-gray-600 flex-wrap">
                      {metrics.engagement_score != null && <span>Engagement: {(metrics.engagement_score * 100).toFixed(0)}%</span>}
                      {metrics.friction_score != null && <span>Friction: {(metrics.friction_score * 100).toFixed(0)}%</span>}
                      {metrics.tasks_completed != null && <span>Tasks: {metrics.tasks_completed}</span>}
                      {metrics.commands_entered != null && <span>Cmds: {metrics.commands_entered}</span>}
                    </div>
                  </div>
                  <div className="text-sm leading-relaxed text-gray-800 dark:text-neutral-200 whitespace-pre-wrap">
                    {raw.summary.text}
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {tags.map(t => (
                        <span key={t} className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-[11px] text-indigo-700">{t}</span>
                      ))}
                    </div>
                  )}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-gray-500">Raw JSON</summary>
                    <pre className="mt-2 text-[11px] bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto max-h-64">{JSON.stringify(raw, null, 2)}</pre>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function InsightCard({ label, value, sub, delta, tooltip, deltaBelow }) {
  return (
  <div className="relative bg-white dark:bg-cp-panel border border-gray-200 dark:border-cp-border rounded-lg p-4 pt-7 shadow-sm overflow-visible" aria-label={tooltip ? `${label}: ${tooltip}` : label}>
      {tooltip && (
        <div className="absolute top-1 left-2">
          <TooltipIcon text={tooltip} size="sm" position="bottom" />
        </div>
      )}
      <div className="text-[11px] uppercase tracking-wide text-gray-600 dark:text-neutral-400 font-semibold flex items-center gap-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-neutral-100 tabular-nums flex items-baseline gap-2">
        {value}
      </div>
      {delta != null && !deltaBelow && (
        <span className={`ml-1 text-xs font-medium ${delta.startsWith('+')? 'text-green-600':'text-red-600'}`}>{delta}</span>
      )}
      {delta != null && deltaBelow && (
        <div className={`mt-1 text-xs font-medium ${delta.startsWith('+')? 'text-green-600':'text-red-600'}`}>{delta}</div>
      )}
      {sub && <div className="mt-1 text-[10px] text-gray-500 dark:text-neutral-500 truncate">{sub}</div>}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-transparent via-transparent to-green-50/40 dark:to-green-500/5" />
    </div>
  );
}


function BarMeter({ value, max }) {
  const pct = max? (value/max)*100 : 0;
  return (
    <div className="w-16 h-2 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
      <div className="h-full bg-green-500" style={{width: pct+'%'}} />
    </div>
  );
}

function EngagementSpark({ values }) {
  if(!values || values.length===0) return null;
  const w=180,h=40, pad=4;
  const max = Math.max(...values);
  const pts = values.map((v,i)=>{
    const x = pad + (i/(values.length-1))*(w-2*pad);
    const y = h - pad - (v/max)*(h-2*pad);
    return `${i===0?'M':'L'}${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="block">
      <path d={pts} fill="none" stroke="#059669" strokeWidth="1.5" />
      {values.map((v,i)=>{
        const x = pad + (i/(values.length-1))*(w-2*pad);
        const y = h - pad - (v/max)*(h-2*pad);
        return <circle key={i} cx={x} cy={y} r={2} fill="#059669" />;
      })}
    </svg>
  );
}


function TooltipIcon({ text, size='md', position='right' }) {
  const dim = size === 'sm' ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-[10px]';
  const panelPos = (() => {
    switch(position){
      case 'bottom': return 'left-0 top-full mt-1';
      case 'left': return 'right-full top-1/2 -translate-y-1/2 mr-2';
      case 'right': return 'left-full top-1/2 -translate-y-1/2 ml-2';
      case 'top': default: return 'left-1/2 -translate-x-1/2 bottom-full mb-1';
    }
  })();
  return (
    <span className="relative inline-flex items-center group/ti">
      <span
        className={`cursor-help select-none inline-flex items-center justify-center rounded-full font-semibold bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200 opacity-80 hover:opacity-100 transition ${dim}`}
        aria-label={text}
      >i</span>
      <span
        className={`invisible opacity-0 group-hover/ti:visible group-hover/ti:opacity-100 transition-opacity duration-150 absolute z-30 w-64 max-w-[18rem] px-3 py-2 rounded-md text-[11px] leading-snug bg-gray-900 text-gray-100 shadow-lg border border-gray-700 dark:bg-gray-800 dark:border-gray-600 ${panelPos}`}
        role="tooltip"
      >{text}</span>
    </span>
  );
}

// Tiny sparkline for advanced section
function MiniSparkline({ data, field='value', width=360, height=60 }) {
  if (!data || data.length === 0) return <div className="text-gray-500 text-xs">No data</div>;
  const pad = 4;
  const w = width - 2*pad;
  const h = height - 2*pad;
  const vals = data.map(d=> d[field]);
  const max = Math.max(1, ...vals);
  const path = vals.map((v,i)=> {
    const x = pad + (i/(vals.length-1))*w;
    const y = pad + h - (v/max)*h;
    return `${i===0?'M':'L'}${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} className="block">
      <path d={path} fill="none" stroke="#6366f1" strokeWidth="1.5" />
      {vals.map((v,i)=>{
        const x = pad + (i/(vals.length-1))*w;
        const y = pad + h - (v/max)*h;
        return <circle key={i} cx={x} cy={y} r={2} fill="#6366f1" />;
      })}
    </svg>
  );
}

function TableList({ events, formatDT }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <Th>Date/Time</Th>
            <Th>User</Th>
            <Th>Event</Th>
            <Th>Lab</Th>
            <Th>Detail</Th>
            {/* removed Org column */}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {events.map((e) => (
            <tr key={e.id} className="hover:bg-gray-50">
              <Td>{formatDT(e.timestamp)}</Td>
              <Td>
                <span className="font-medium text-gray-900">{e.userKey}</span>
              </Td>
              <Td>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {e.type}
                </span>
              </Td>
              <Td className="text-gray-700 font-mono text-xs">{e.labId || "—"}</Td>
              <Td className="max-w-xl">
                <p className="truncate text-gray-700" title={e.detail}>
                  {e.detail}
                </p>
              </Td>
              {/* removed: <Td className="text-gray-500">{e.orgName}</Td> */}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupedList({ grouped, groupBy, formatDT }) {
  const { keys, map } = grouped;
  const headingLabel = (k) => {
    switch (groupBy) {
      case "user":
        return `User: ${k}`;
      case "date":
        return `Date: ${k}`;
      case "type":
        return `Event: ${k}`;
      default:
        return k;
    }
  };

  return (
    <div className="divide-y divide-gray-200">
      {keys.map((k) => {
        const events = map.get(k) || [];
        return (
          <div key={k} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">{headingLabel(k)}</h3>
              <span className="text-xs text-gray-500">{events.length} events</span>
            </div>
            <div className="overflow-x-auto border border-gray-100 rounded">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Date/Time</Th>
                    <Th>User</Th>
                    <Th>Event</Th>
                    <Th>Lab</Th>
                    <Th>Detail</Th>
                    {/* removed Org column */}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {events.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <Td>{formatDT(e.timestamp)}</Td>
                      <Td>{e.userKey}</Td>
                      <Td>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {e.type}
                        </span>
                      </Td>
                      <Td className="text-gray-700 font-mono text-xs">{e.labId || "—"}</Td>
                      <Td className="max-w-xl">
                        <p className="truncate text-gray-700" title={e.detail}>
                          {e.detail}
                        </p>
                      </Td>
                      {/* removed: <Td className="text-gray-500">{e.orgName}</Td> */}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Th({ children }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
      {children}
    </th>
  );
}

function Td({ children, className = "" }) {
  return <td className={`px-4 py-2 text-sm text-gray-700 ${className}`}>{children}</td>;
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-gray-500 truncate">{sub}</div> : null}
    </div>
  );
}

// Lightweight SVG line chart (no deps)
function SimpleLineChart({ data, width = 640, height = 220 }) {
  const gradientId = useId();
  const clipId = useId();
  const [hover, setHover] = useState(null); // index
  const svgRef = useRef(null);
  if (!data || data.length === 0) return <div className="text-gray-500 text-sm">No data</div>;

  const margin = { top: 10, right: 12, bottom: 28, left: 40 };
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;
  const minX = data[0].ts.getTime();
  const maxX = data[data.length - 1].ts.getTime();
  const maxY = Math.max(1, ...data.map(d=> d.count));
  const xSpan = Math.max(1, maxX - minX);
  const x = t => margin.left + ((t - minX)/xSpan)*w;
  const y = v => margin.top + h - (v/maxY)*h;

  // Smooth path using cubic beziers between midpoints
  const pts = data.map(d => ({x: x(d.ts.getTime()), y: y(d.count)}));
  const smoothPath = pts.reduce((acc,p,i,arr)=>{
    if(i===0) return `M ${p.x},${p.y}`;
    const prev = arr[i-1];
    const midX = (prev.x + p.x)/2;
    return acc + ` C ${midX},${prev.y} ${midX},${p.y} ${p.x},${p.y}`;
  }, "");
  const areaPath = smoothPath + ` L ${margin.left + w},${margin.top + h} L ${margin.left},${margin.top + h} Z`;

  const ticks = 4;
  const yTicks = Array.from({length: ticks+1},(_,i)=> Math.round((i*maxY)/ticks));

  const handleMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    // find nearest point by x
    let nearest = null; let dist = Infinity;
    pts.forEach((p,idx)=>{ const d = Math.abs(p.x - mx); if(d < dist){ dist=d; nearest=idx; }});
    setHover(nearest);
  };
  const handleLeave = () => setHover(null);

  const labelIdxs = [0, Math.floor(data.length/2), data.length-1].filter((v,i,a)=> a.indexOf(v)===i && v>=0);

  return (
    <div className="relative select-none" onMouseLeave={handleLeave}>
      <svg ref={svgRef} width={width} height={height} onMouseMove={handleMove} role="img" aria-label="Events over time sparkline with interactive tooltip">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#059669" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#059669" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0" />
          </linearGradient>
          <clipPath id={clipId}><rect x={margin.left} y={margin.top} width={w} height={h} rx={4} /></clipPath>
        </defs>
        {/* Grid */}
        {yTicks.map((v,i)=>(
          <g key={i}>
            <line x1={margin.left} x2={margin.left + w} y1={y(v)} y2={y(v)} stroke={i===0? '#d1d5db':'#e5e7eb'} strokeDasharray={i===0? '':'3,4'} />
            <text x={margin.left - 8} y={y(v)+4} fontSize={10} textAnchor="end" fill="#6b7280">{v}</text>
          </g>
        ))}
        {/* Area */}
        <path d={areaPath} fill={`url(#${gradientId})`} clipPath={`url(#${clipId})`} />
        {/* Line */}
        <path d={smoothPath} fill="none" stroke="#059669" strokeWidth={2} strokeLinejoin="round" />
        {/* Points */}
        {pts.map((p,i)=>(
          <circle key={i} cx={p.x} cy={p.y} r={hover===i?4:2.5} fill={hover===i? '#10b981':'#059669'} opacity={hover && hover!==i?0.3:1} />
        ))}
        {/* Hover guide */}
        {hover!=null && (
          <g>
            <line x1={pts[hover].x} x2={pts[hover].x} y1={margin.top} y2={margin.top + h} stroke="#10b981" strokeDasharray="3,3" />
            <circle cx={pts[hover].x} cy={pts[hover].y} r={6} fill="#10b981" fillOpacity={0.15} stroke="#10b981" />
          </g>
        )}
        {/* X labels */}
        {labelIdxs.map(idx => (
          <text key={idx} x={pts[idx].x} y={margin.top + h + 16} fontSize={10} textAnchor="middle" fill="#6b7280">{data[idx].date}</text>
        ))}
      </svg>
      {hover!=null && (
        <div className="pointer-events-none absolute -translate-x-1/2" style={{left: pts[hover].x, top: margin.top + 8}}>
          <div className="rounded-md bg-gray-900/90 text-gray-100 text-[10px] px-2 py-1 shadow-lg border border-gray-700 whitespace-nowrap">
            <div className="font-semibold">{data[hover].date}</div>
            <div>{data[hover].count} events</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Lightweight SVG bar chart (no deps)
function SimpleBarChart({ data, width = 640, height = 220 }) {
  const [hover, setHover] = useState(null);
  if (!data || data.length === 0) return <div className="text-gray-500 text-sm">No data</div>;
  const margin = { top: 10, right: 12, bottom: 48, left: 40 };
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;
  const maxY = Math.max(1, ...data.map(d=> d.count));
  const barGap = 10;
  const barW = Math.max(10, Math.min(80, (w - barGap*(data.length-1))/data.length));
  const y = v => margin.top + h - (v/maxY)*h;
  const palette = ['#6366f1','#10b981','#f59e0b','#ec4899','#3b82f6','#84cc16','#f97316','#8b5cf6','#06b6d4'];

  return (
    <div className="relative select-none">
      <svg width={width} height={height} role="img" aria-label="Event type distribution bar chart">
        <line x1={margin.left} y1={margin.top + h} x2={margin.left + w} y2={margin.top + h} stroke="#e5e7eb" />
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + h} stroke="#e5e7eb" />
        {data.map((d,i)=>{
          const x = margin.left + i*(barW + barGap);
          const yTop = y(d.count);
          const barH = margin.top + h - yTop;
          const color = palette[i % palette.length];
          const active = hover===i;
          return (
            <g key={d.type} onMouseEnter={()=> setHover(i)} onMouseLeave={()=> setHover(null)} className="cursor-pointer transition-colors">
              <rect x={x} y={yTop} width={barW} height={barH} rx={4} fill={color} opacity={active?1:0.7} filter={active? 'url(#barGlow)':undefined} />
              <text x={x + barW/2} y={yTop - 6} fontSize={10} textAnchor="middle" fill="#374151" className="font-medium">
                {d.count}
              </text>
              <text x={x + barW/2} y={margin.top + h + 14} fontSize={10} textAnchor="middle" fill="#6b7280">{d.type}</text>
            </g>
          );
        })}
      </svg>
      {hover!=null && (
        <div className="pointer-events-none absolute left-0 top-0 w-full h-full flex" style={{justifyContent:'flex-start'}}>
          {data.map((d,i)=>{
            if(i!==hover) return null;
            const left = margin.left + i*(barW+barGap) + barW/2;
            return (
              <div key={i} className="absolute -translate-x-1/2" style={{left, top: 8}}>
                <div className="bg-gray-900/90 text-gray-100 text-[11px] px-2 py-1 rounded-md shadow-lg border border-gray-700 whitespace-nowrap">
                  <div className="font-semibold flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{background: palette[i % palette.length]}} />{d.type}</div>
                  <div>{d.count} events</div>
                  <div>{((d.count/maxY)*100).toFixed(1)}% of max</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {data.length>1 && (
        <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-gray-500">
          {data.slice(0,8).map((d,i)=>(
            <span key={d.type} className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{background: palette[i % palette.length]}} />{d.type}</span>
          ))}
        </div>
      )}
    </div>
  );
}
