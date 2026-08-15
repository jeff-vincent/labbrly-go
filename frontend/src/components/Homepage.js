import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import './components.css';
import Header from './Header';

const featureColumns = [
  {
    title: 'Embed Anywhere',
    iconBg: 'bg-gradient-to-br from-blue-600 to-blue-500 text-white',
    icon: (
      <svg viewBox="0 0 48 48" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="10" width="36" height="24" rx="4" className="fill-blue-500/10" />
        <path d="M14 18h12M14 24h8M34 18v12" />
        <path d="M30 30h8" />
      </svg>
    ),
    body: 'DevRel & product teams drop runnable labs into docs, blogs, launch posts or in‑app prompts with a single script.'
  },
  {
    title: 'Free to Start',
    iconBg: 'bg-gradient-to-br from-green-600 to-green-500 text-white',
    icon: (
      <svg viewBox="0 0 48 48" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="24" r="16" className="fill-green-500/10" />
        <path d="M18 27c1.5 2 3.5 3 6 3 3 0 6-2 6-5s-3-5-6-5c-2.5 0-4.5 1-6 3M24 14v4M24 30v4" />
      </svg>
    ),
    body: 'Prove value early: spin up a PLG activation funnel before budget approval for a bespoke internal platform.'
  },
  {
    title: 'Built by Devs for Devs',
    iconBg: 'bg-gradient-to-br from-slate-700 to-slate-600 text-white',
    icon: (
      <svg viewBox="0 0 48 48" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path className="fill-slate-500/10" d="M10 10h28v10H10z" />
        <path d="M18 30h12M12 20v14a4 4 0 004 4h16a4 4 0 004-4V20" />
        <path d="M16 16h2M22 16h10" />
        <path d="M18 24h12" />
      </svg>
    ),
    body: 'A pragmatic DevRel toolkit: no infra ceremony—just containers, scripts, analytics & iteration loops.'
  }
];

// Group deep features into related clusters for alternating layout
const deepFeatureGroups = [
  {
    heading: 'Acquisition & Activation',
    visual: (
      <div className="relative w-full max-w-sm">
        <div className="absolute -inset-4 bg-gradient-to-br from-blue-600/10 via-sky-500/10 to-green-500/10 rounded-3xl blur-2xl" />
        <div className="relative rounded-2xl border border-blue-500/20 dark:border-blue-400/10 bg-white/80 dark:bg-cp-panel/80 backdrop-blur-xl shadow-xl overflow-hidden">
          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-3 h-8 border-b border-blue-500/10 dark:border-white/5 text-[10px] tracking-wide uppercase text-gray-500 dark:text-neutral-500 bg-gradient-to-r from-blue-50/60 to-green-50/40 dark:from-blue-900/20 dark:to-green-900/10">
            <span className="flex gap-1 mr-2">
              <span className="w-2 h-2 rounded-full bg-red-400/80" />
              <span className="w-2 h-2 rounded-full bg-amber-400/80" />
              <span className="w-2 h-2 rounded-full bg-emerald-400/80" />
            </span>
            docs.example.dev / quickstart
          </div>
          {/* Content split */}
          <div className="grid grid-cols-3">
            <div className="col-span-2 p-4 space-y-3">
              <div className="h-3 w-32 rounded bg-blue-600/30" />
              <div className="h-2 w-44 rounded bg-blue-500/20" />
              <div className="h-2 w-40 rounded bg-blue-500/10" />
              {/* code block */}
              <div className="mt-4 p-3 rounded-lg bg-slate-900 text-[10px] font-mono text-slate-200 space-y-1 ring-1 ring-white/5">
                <div>$ curl -sL labbrly.sh | bash</div>
                <div className="text-emerald-400">✔ environment ready</div>
                <div className="text-blue-400">open → embedded shell</div>
              </div>
            </div>
            <div className="relative p-3 border-l border-blue-500/10 dark:border-white/5 bg-gradient-to-b from-white/30 to-transparent dark:from-white/5">
              <div className="text-[9px] font-semibold tracking-wide text-gray-500 dark:text-neutral-500 mb-2">EMBED</div>
              <div className="rounded-md border border-blue-500/20 dark:border-blue-400/20 bg-white/70 dark:bg-slate-800/70 shadow-inner p-2">
                <div className="h-2 w-20 bg-blue-500/30 rounded mb-2" />
                <div className="h-16 rounded bg-slate-900 flex items-center justify-center text-[9px] text-slate-400 font-mono">shell</div>
              </div>
              <div className="mt-4 flex flex-col gap-1">
                <div className="h-2 w-14 rounded bg-green-500/40" />
                <div className="h-2 w-10 rounded bg-green-500/20" />
              </div>
            </div>
          </div>
          {/* Analytics footer */}
          <div className="flex justify-between items-center px-3 py-2 border-t border-blue-500/10 dark:border-white/5 text-[9px] text-gray-500 dark:text-neutral-500 bg-gradient-to-r from-blue-50/50 to-green-50/30 dark:from-blue-900/10 dark:to-green-900/5">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> session events: 42</span>
            <span className="text-blue-500 dark:text-blue-400">live</span>
          </div>
        </div>
      </div>
    ),
    items: [
      { title: 'Marketing + Product Integration', body: 'Embed labs inside docs, landing pages & in‑app flows—track conversion events tied to real usage.' },
      { title: 'Embed Anywhere', body: 'One script tag drops a secure iframe + messaging bridge; progressive enhancement if JS disabled.' },
      { title: 'Advanced Usage Analytics', body: 'Session timelines: commands, file edits, port views—privacy-aware aggregation for product insight.' },
      { title: 'DevRel Funnel Metrics', body: 'Measure trial → first success → retained usage without stitching brittle custom dashboards.' },
      { title: 'Champion Signals', body: 'Identify early product champions by depth of interaction & feature surface touched.' }
    ]
  },
  {
    heading: 'Runtime Experience',
    visual: (
      <div className="relative w-full max-w-sm">
        <div className="absolute -inset-4 bg-gradient-to-br from-green-600/10 via-emerald-500/10 to-blue-600/10 rounded-3xl blur-2xl" />
        <div className="relative rounded-2xl border border-green-500/25 dark:border-green-400/10 bg-slate-950/80 backdrop-blur-xl shadow-xl overflow-hidden font-mono text-[10px] text-slate-200">
          <div className="flex items-center gap-2 px-3 h-7 bg-slate-900/70 border-b border-green-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="ml-2 text-slate-400">terminal • user@lab:~</span>
          </div>
          <div className="p-3 space-y-1">
            <div className="text-emerald-400">$ docker build -t app .</div>
            <div>Sending build context…</div>
            <div className="text-blue-400">Layer cache: hit</div>
            <div className="text-emerald-400">✔ built image sha256:91af…</div>
            <div className="text-emerald-400">$ npm start</div>
            <div className="text-blue-400">Ready on :5173</div>
          </div>
          <div className="grid grid-cols-3 gap-2 px-3 pb-3">
            <div className="col-span-2 rounded-lg bg-slate-900/70 border border-green-500/20 p-2 flex flex-col gap-1">
              <div className="h-2 w-20 bg-green-500/40 rounded" />
              <div className="h-10 rounded bg-slate-800/80 flex items-center justify-center text-[9px] text-slate-400">web preview</div>
            </div>
            <div className="rounded-lg bg-slate-900/70 border border-green-500/20 p-2 flex flex-col gap-1">
              <div className="h-2 w-10 bg-green-500/40 rounded" />
              <div className="h-10 rounded bg-slate-800/80 flex items-center justify-center text-[9px] text-slate-400">files</div>
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-t border-green-500/20 text-[9px] text-slate-400 bg-slate-900/70">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400" /> cpu 42%</span>
            <span className="text-green-400">low latency proxy</span>
          </div>
        </div>
      </div>
    ),
    items: [
      { title: 'Real Container Isolation', body: 'Per-user namespaces with quotas, TTL enforcement & fast cold starts (seconds, not minutes).' },
      { title: 'Inline Terminal, Files & Proxy', body: 'Live terminal + editor + secure reverse proxy streaming any exposed port back to the browser.' },
      { title: 'Native Video Streaming', body: 'Stream guided walkthroughs directly from the environment surface.' },
      { title: 'BYOK AI: RAG Chatbot', body: 'Context-aware assistant grounded in your docs & repo content using your chosen model endpoint.' },
      { title: 'Low Effort Authoring', body: 'Ship a new lab by combining a base image + bootstrap script—no YAML sprawl.' }
    ]
  },
  {
    heading: 'Reliability, Insight & Control',
    visual: (
      <div className="relative w-full max-w-sm">
        <div className="absolute -inset-4 bg-gradient-to-br from-slate-600/10 via-blue-600/10 to-emerald-600/10 rounded-3xl blur-2xl" />
        <div className="relative rounded-2xl border border-slate-500/20 dark:border-slate-400/10 bg-white/80 dark:bg-cp-panel/80 backdrop-blur-xl shadow-xl overflow-hidden">
          <div className="px-4 py-2 text-[10px] font-semibold tracking-wide uppercase text-slate-500 dark:text-neutral-500 border-b border-slate-500/10 dark:border-white/5 bg-gradient-to-r from-slate-50/70 to-blue-50/50 dark:from-slate-900/30 dark:to-blue-900/20">cluster metrics</div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-3 text-[9px]">
              <div className="rounded-lg p-2 bg-gradient-to-br from-blue-600/10 to-blue-500/5 border border-blue-600/20 flex flex-col gap-1">
                <span className="text-blue-600 font-semibold">92%</span>
                <span className="text-slate-500 dark:text-neutral-500">uptime (test)</span>
              </div>
              <div className="rounded-lg p-2 bg-gradient-to-br from-emerald-600/10 to-emerald-500/5 border border-emerald-600/20 flex flex-col gap-1">
                <span className="text-emerald-600 font-semibold">4.8s</span>
                <span className="text-slate-500 dark:text-neutral-500">p95 launch</span>
              </div>
              <div className="rounded-lg p-2 bg-gradient-to-br from-amber-500/20 to-orange-400/10 border border-amber-500/30 flex flex-col gap-1">
                <span className="text-amber-600 font-semibold">low</span>
                <span className="text-slate-500 dark:text-neutral-500">error rate</span>
              </div>
            </div>
            <div className="h-28 rounded-lg border border-slate-500/10 dark:border-white/5 bg-gradient-to-b from-slate-50/60 to-slate-100/40 dark:from-slate-800/40 dark:to-slate-900/20 relative overflow-hidden">
              <div className="absolute inset-0 opacity-40">
                <svg viewBox="0 0 120 40" preserveAspectRatio="none" className="w-full h-full stroke-blue-600/60 fill-transparent">
                  <polyline points="0,30 10,28 20,25 30,20 40,22 50,18 60,16 70,14 80,15 90,12 100,10 110,8 120,7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <svg viewBox="0 0 120 40" preserveAspectRatio="none" className="w-full h-full stroke-emerald-500/60 fill-transparent">
                  <polyline points="0,34 10,33 20,32 30,30 40,28 50,26 60,24 70,22 80,21 90,20 100,20 110,19 120,18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="absolute bottom-1 left-2 text-[8px] text-slate-500 dark:text-neutral-500">time →</div>
              <div className="absolute top-1 right-2 text-[8px] text-slate-500 dark:text-neutral-500">resources</div>
            </div>
            <div className="flex justify-between text-[9px] text-slate-500 dark:text-neutral-500">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-600" /> latency</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> memory</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> errors</span>
            </div>
          </div>
          <div className="px-4 py-2 border-t border-slate-500/10 dark:border-white/5 text-[9px] flex justify-between items-center bg-gradient-to-r from-slate-50/70 to-blue-50/60 dark:from-slate-900/30 dark:to-blue-900/20">
            <span className="text-slate-500 dark:text-neutral-500">audit events: 128</span>
            <span className="text-blue-600 dark:text-blue-400">streaming</span>
          </div>
        </div>
      </div>
    ),
    items: [
      { title: 'Security & Governance', body: 'JWT middleware, enforced resource classes, audit event stream & safe teardown.' },
      { title: 'Observability & Metrics', body: 'Prometheus metrics + structured logs for latency, resource saturation & feature adoption.' },
      { title: 'Privacy-Aware Attribution', body: 'High-signal product telemetry with minimal PII surface—opt-out & retention policies.' },
      { title: 'DevRel Iterate Loop', body: 'See friction points quickly—optimize docs & lab steps based on real command trails.' }
    ]
  }
];

const Homepage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const isChrome = navigator.userAgent.indexOf("Chrome") !== -1;
    if (!isChrome) {
      alert("Your browser isn't supported by Lab Thingy. Please switch to Chrome for the best experience.");
    }
  }, []);

  const handleGetStarted = () => navigate('/signup');
  const handleViewDemo = async () => {
    try {
      const res = await fetch('/auth/demo-token', { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { access_token } = await res.json();
      const url = `${window.location.origin}/?token=${encodeURIComponent(access_token)}`;
      window.location.href = url;
    } catch (err) {
      console.error('Error fetching demo token:', err);
      alert('Unable to launch the demo right now. Please try again later.');
    }
  };
  const handleLearnMore = () => navigate('/info');
  const handleDocs = () => {
    window.open("/docs", "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen bg-white dark:bg-cp-bg dark:bg-cp-hero transition-colors">
      {/* Hero */}
      <div className="relative overflow-hidden">
        {/* Removed dotted radial background for cleaner consistent styling */}
        <div className="absolute top-0 left-0 w-72 h-72 bg-gradient-to-br from-cp-purple/30 to-cp-blue/30 rounded-full mix-blend-screen filter blur-3xl opacity-40 animate-pulse" />
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-cp-green/30 to-cp-purple/20 rounded-full mix-blend-screen filter blur-3xl opacity-40 animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-br from-cp-blue/30 to-cp-green/20 rounded-full mix-blend-screen filter blur-3xl opacity-40 animate-pulse" style={{ animationDelay: '4s' }} />

        <div className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <div className="mb-8 flex justify-center"><Header/></div>
            <div className="inline-flex items-center px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-medium mb-6 border border-blue-100 dark:border-transparent dark:bg-blue-900/30 dark:text-blue-300">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
              DevRel & PLG Lab Toolkit
            </div>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-gray-900 dark:text-neutral-100 mb-6 leading-tight tracking-tight">Build<span className="bg-gradient-to-r from-blue-600 via-blue-500 to-green-500 bg-clip-text text-transparent"> 10x </span>Labs</h1>
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-700 dark:text-neutral-300 mb-8">and Stuff.</h2>
            <p className="text-xl text-gray-600 dark:text-neutral-400 mb-10 max-w-2xl mx-auto leading-relaxed">Enhance your DevRel presence with interactive, embeddable labs. Plug Labbrly into your existing marketing and product pipelines.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-14">
              <button onClick={handleGetStarted} className="px-7 py-3 rounded-lg font-medium bg-green-600 text-white hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/40 transition-colors">Create a Free Account</button>
              <button onClick={handleViewDemo} className="px-7 py-3 rounded-lg font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-cp-panel dark:text-neutral-200 dark:hover:bg-cp-panel/80 border border-gray-200 dark:border-cp-border focus:outline-none focus:ring-2 focus:ring-cp-blue/30 transition-colors">Live Demo</button>
              <button onClick={handleLearnMore} className="px-7 py-3 rounded-lg font-medium text-gray-700 dark:text-neutral-300 hover:text-gray-900 dark:hover:text-neutral-100 focus:outline-none focus:underline transition">Learn More</button>
              <button onClick={handleDocs} className="px-7 py-3 rounded-lg font-medium text-gray-700 dark:text-neutral-300 hover:text-gray-900 dark:hover:text-neutral-100 focus:outline-none focus:underline transition">Docs</button>
            </div>

            {/* Quick feature cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-4">
              {featureColumns.map(f => (
        <div key={f.title} className="group bg-white/70 backdrop-blur-sm p-6 rounded-xl border border-gray-200 dark:bg-cp-panel dark:border-cp-border transition-colors relative overflow-hidden">
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-blue-600/5 via-transparent to-green-500/5" />
                  <div className={`w-14 h-14 ${f.iconBg} rounded-xl flex items-center justify-center mb-5 mx-auto shadow-sm shadow-black/10 ring-1 ring-white/20 dark:ring-white/10`}>{f.icon}</div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-neutral-200 mb-2 relative z-10">{f.title}</h3>
                  <p className="text-gray-600 dark:text-neutral-400 text-sm leading-relaxed relative z-10">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Deep feature clusters with alternating layout */}
      <section className="relative py-28 px-6 sm:px-10 max-w-7xl mx-auto space-y-28">
        {deepFeatureGroups.map((group, idx) => {
          const isEven = idx % 2 === 0; // even index: text left, icon right; odd: icon left
          return (
            <div key={group.heading} className={`grid md:grid-cols-2 gap-16 items-center ${!isEven ? 'md:[&>div:first-child]:order-2' : ''}`}>                
              {/* Text Column */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-7 w-1 rounded-full bg-gradient-to-b from-blue-600 to-green-500" />
                  <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-neutral-100">{group.heading}</h3>
                </div>
                <ul className="space-y-5">
                  {group.items.map(item => (
                    <li key={item.title} className="flex items-start gap-3">
                      <span className="mt-1 inline-flex w-5 h-5 rounded-full bg-blue-600 text-white items-center justify-center text-[10px] font-bold">✓</span>
                      <div>
                        <p className="font-semibold text-gray-800 dark:text-neutral-200">{item.title}</p>
                        <p className="text-sm text-gray-600 dark:text-neutral-400 leading-relaxed">{item.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Visual Column */}
              <div className="relative flex justify-center md:justify-end">
                <div className="relative group w-full max-w-sm">
                  <div className="animate-[pulse_6s_ease-in-out_infinite] will-change-transform">
                    {group.visual}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Metrics section (factual, pre-launch) */}
      <section className="py-24 px-6 sm:px-10">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-neutral-100 mb-6">Early Internal Benchmarks</h3>
            <p className="text-lg text-gray-600 dark:text-neutral-400 max-w-3xl mx-auto">Indicative numbers from internal test clusters. These will evolve as we broaden hardware profiles and multi-region capacity.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="p-6 rounded-xl bg-white/70 dark:bg-cp-panel border border-gray-200 dark:border-cp-border backdrop-blur-sm shadow-sm">
              <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent mb-2">&lt;5s</div>
              <div className="text-sm font-semibold text-gray-700 dark:text-neutral-300 mb-1">Median Launch Time</div>
              <p className="text-xs text-gray-500 dark:text-neutral-500 leading-relaxed">Cold start to usable shell (Python + Node base images, 3‑node test cluster).</p>
            </div>
            <div className="p-6 rounded-xl bg-white/70 dark:bg-cp-panel border border-gray-200 dark:border-cp-border backdrop-blur-sm shadow-sm">
              <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-green-500 bg-clip-text text-transparent mb-2">3</div>
              <div className="text-sm font-semibold text-gray-700 dark:text-neutral-300 mb-1">Resource Tiers</div>
              <p className="text-xs text-gray-500 dark:text-neutral-500 leading-relaxed">Small / Medium / Large presets govern CPU, memory & TTL.</p>
            </div>
            <div className="p-6 rounded-xl bg-white/70 dark:bg-cp-panel border border-gray-200 dark:border-cp-border backdrop-blur-sm shadow-sm">
              <div className="text-3xl font-bold bg-gradient-to-r from-yellow-500 to-orange-600 bg-clip-text text-transparent mb-2">0</div>
              <div className="text-sm font-semibold text-gray-700 dark:text-neutral-300 mb-1">Config Required</div>
              <p className="text-xs text-gray-500 dark:text-neutral-500 leading-relaxed">Launch a default lab instantly; customize later via images & manifests.</p>
            </div>
            <div className="p-6 rounded-xl bg-white/70 dark:bg-cp-panel border border-gray-200 dark:border-cp-border backdrop-blur-sm shadow-sm">
              <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent mb-2">10x</div>
              <div className="text-sm font-semibold text-gray-700 dark:text-neutral-300 mb-1">Faster Iteration (Goal)</div>
              <p className="text-xs text-gray-500 dark:text-neutral-500 leading-relaxed">Reduce manual setup vs. bespoke VM or local onboarding scripts.</p>
            </div>
          </div>
          <p className="mt-8 text-[11px] text-center text-gray-500 dark:text-neutral-600 tracking-wide">All figures illustrative / internal; not production SLAs.</p>
        </div>
      </section>

      {/* Integration focus (emphasize internal extensibility over external infra complexity) */}
      <section className="py-28 px-6 sm:px-10 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-neutral-100 mb-6">Keep Labs Current. Skip Heavy Infra.</h3>
            <p className="text-lg text-gray-600 dark:text-neutral-400 max-w-3xl mx-auto mb-5"></p>
            <p className="text-lg text-gray-600 dark:text-neutral-400 max-w-3xl mx-auto"></p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {[{
              name: 'Custom Base Images',
              note: 'Build per-lab images directly in-app or reference existing registries; pin digest for reproducibility.'
            }, {
              name: 'Namespace-Level Config',
              note: 'User controlled ConfigMaps & Secrets injection—scoped, revocable, no opaque black box.'
            }, {
              name: 'CI/CD Sync Hooks',
              note: 'Trigger lab refresh on main branch merges or tagged releases to keep examples version-aligned.'
            }, {
              name: 'Definition as Code',
              note: 'Store lab spec (image, ports, bootstrap script) alongside project; diff & review like application code.'
            }, {
              name: 'Ephemeral, Cheap Runtime',
              note: 'Auto-sleep + TTL reclaim ensures you pay for active exploration, not idle VMs.'
            }, {
              name: 'Simple Embeds',
              note: 'Single script inject + postMessage API; no iframe anti-pattern hacks or origin sprawl.'
            }].map(block => (
              <div key={block.name} className="relative group p-6 rounded-xl border border-gray-200 dark:border-cp-border bg-white/70 dark:bg-cp-panel backdrop-blur-sm hover:border-blue-600 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-neutral-200 tracking-wide">{block.name}</h4>
                  <span className="text-[10px] uppercase font-bold tracking-wide text-gray-400 dark:text-neutral-500">Core</span>
                </div>
                <p className="text-[12px] leading-relaxed text-gray-600 dark:text-neutral-400">{block.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-xs text-gray-500 dark:text-neutral-500">Delivering fast, product-focused experiences.</p>
        </div>
      </section>

      {/* Pricing teaser (transparent pre-launch messaging) */}
      <section className="py-28 px-6 sm:px-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-neutral-100 mb-6">Pricing During Early Access</h3>
            <p className="text-lg text-gray-600 dark:text-neutral-400 max-w-3xl mx-auto">We want feedback more than revenue right now. Early access participants can run labs without platform fees. Usage-based limits may apply to prevent abuse.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="relative p-8 rounded-2xl border border-gray-200 dark:border-cp-border bg-white/70 dark:bg-cp-panel backdrop-blur-sm shadow-sm">
              <div className="text-xs font-bold tracking-wide text-cp-blue mb-3">CURRENT</div>
              <h4 className="text-xl font-semibold text-gray-900 dark:text-neutral-100 mb-2">Early Access</h4>
              <p className="text-sm text-gray-600 dark:text-neutral-400 mb-6">Core lab provisioning + terminal + file editing. Ideal for fast DevRel prototyping & PLG activation.</p>
              <div className="text-3xl font-bold mb-2">$0<span className="text-sm font-medium text-gray-500 dark:text-neutral-500"> / beta</span></div>
              <ul className="text-xs space-y-2 text-gray-600 dark:text-neutral-400 mb-6">
                <li>• Shared cluster capacity</li>
                <li>• Limited concurrent environments</li>
                <li>• Community support channel</li>
              </ul>
              <button onClick={handleGetStarted} className="w-full px-5 py-3 rounded-lg font-medium bg-green-600 text-white hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/40 transition-colors">Join Waitlist</button>
            </div>
            <div className="relative p-8 rounded-2xl border border-dashed border-gray-300 dark:border-cp-border/50 bg-white/30 dark:bg-cp-panel/40 backdrop-blur-sm">
              <div className="text-xs font-bold tracking-wide text-gray-500 mb-3">PLANNED</div>
              <h4 className="text-xl font-semibold text-gray-800 dark:text-neutral-200 mb-2">Team</h4>
              <p className="text-sm text-gray-600 dark:text-neutral-400 mb-6">Org controls, usage dashboards & private networking.</p>
              <div className="text-3xl font-bold mb-2 text-gray-400 dark:text-neutral-500">TBD</div>
              <ul className="text-xs space-y-2 text-gray-500 dark:text-neutral-500 mb-6">
                <li>• Dedicated resource pools</li>
                <li>• SSO & policy controls</li>
                <li>• Metrics export</li>
              </ul>
              <button disabled className="w-full px-5 py-3 rounded-lg font-medium bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-neutral-500 border border-dashed border-gray-300 dark:border-cp-border/50 cursor-not-allowed">In Design</button>
            </div>
            <div className="relative p-8 rounded-2xl border border-dashed border-gray-300 dark:border-cp-border/50 bg-white/30 dark:bg-cp-panel/40 backdrop-blur-sm">
              <div className="text-xs font-bold tracking-wide text-gray-500 mb-3">PLANNED</div>
              <h4 className="text-xl font-semibold text-gray-800 dark:text-neutral-200 mb-2">Enterprise</h4>
              <p className="text-sm text-gray-600 dark:text-neutral-400 mb-6">Private clusters, compliance options & premium support.</p>
              <div className="text-3xl font-bold mb-2 text-gray-400 dark:text-neutral-500">Custom</div>
              <ul className="text-xs space-y-2 text-gray-500 dark:text-neutral-500 mb-6">
                <li>• Single-tenant control plane</li>
                <li>• Audit log retention</li>
                <li>• SLA / Support escalation</li>
              </ul>
              <button disabled className="w-full px-5 py-3 rounded-lg font-medium bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-neutral-500 border border-dashed border-gray-300 dark:border-cp-border/50 cursor-not-allowed">Contact Soon</button>
            </div>
          </div>
          <p className="mt-8 text-center text-[11px] text-gray-500 dark:text-neutral-600 tracking-wide">Pricing subject to change prior to GA. We will communicate updates clearly.</p>
        </div>
      </section>

  {/* FAQ section (differentiation-focused) */}
      <section className="py-28 px-6 sm:px-10 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-neutral-100 mb-6">FAQ</h3>
            <p className="text-lg text-gray-600 dark:text-neutral-400 max-w-2xl mx-auto">Straight answers while we build in the open.</p>
          </div>
          <div className="space-y-6">
            {[
              { q: 'How is this different from infra training platforms?', a: 'We target product & integration labs: fast container sessions you can embed. No multi-hour cluster simulations or heavy scenario orchestration.' },
              { q: 'DevRel vs building in-house?', a: 'Skip a 3–6 month internal platform build. Provide labs, analytics & iteration loops day one with minimal infra ownership.' },
              { q: 'Can I build and manage custom images?', a: 'Yes. Supply a Dockerfile or registry reference; we snapshot digests so labs stay deterministic.' },
              { q: 'How do labs stay up to date?', a: 'Optional CI/CD hook re-builds the image & refreshes the lab spec on merges or tagged releases.' },
              { q: 'What about secrets & configuration?', a: 'Scoped Kubernetes Secrets & ConfigMaps per namespace—mounted or env-injected; easy revoke & rotate.' },
              { q: 'Do you orchestrate full cloud networks?', a: 'No. We intentionally avoid recreating production topologies. Focus stays on CLI / SDK / API adoption flows.' },
              { q: 'Cost philosophy?', a: 'Ephemeral and resource-capped. Sleep + TTL reclaim idle pods so you do not pay VM tax for inactive demos.' },
              { q: 'Languages & stacks?', a: 'Any OCI image works. We provide tuned starters for Python, Node.js, Go and lightweight polyglot examples.' },
              { q: 'Joining early access?', a: 'Hit “Join Waitlist”. We onboard in waves to refine quotas, analytics and image builder UX.' }
            ].map(item => (
              <div key={item.q} className="group rounded-xl border border-gray-200 dark:border-cp-border bg-white/70 dark:bg-cp-panel backdrop-blur-sm p-6 hover:border-blue-600 transition-colors">
                <h4 className="font-semibold text-gray-900 dark:text-neutral-100 mb-2 flex items-start gap-2"><span className="text-blue-600 mt-0.5">?</span>{item.q}</h4>
                <p className="text-sm text-gray-600 dark:text-neutral-400 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-xs text-gray-500 dark:text-neutral-500">Need something not answered here? Reach out after joining the waitlist.</p>
        </div>
      </section>

      {/* Early access notice */}
      <section className="py-28 px-6 sm:px-10">
        <div className="max-w-5xl mx-auto text-center">
          <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-neutral-100 mb-6">Early Access Coming Soon</h3>
          <p className="text-lg text-gray-600 dark:text-neutral-400 mb-10 max-w-2xl mx-auto">Be the first to try Labbrly. Sign up for early access and updates.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button onClick={handleGetStarted} className="px-7 py-3 rounded-lg font-medium bg-green-600 text-white hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/40 transition-colors">Get Early Access</button>
            <button onClick={handleViewDemo} className="px-7 py-3 rounded-lg font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-cp-panel dark:text-neutral-200 dark:hover:bg-cp-panel/80 border border-gray-200 dark:border-cp-border focus:outline-none focus:ring-2 focus:ring-cp-blue/30 transition-colors">Watch Demo</button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Homepage;
