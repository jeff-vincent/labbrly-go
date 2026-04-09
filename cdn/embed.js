// embed.js
(function () {
  // ========= CONFIG / BASE DETECTION =========
  const DEFAULT_BASE = "https://subnode1.xyz"; // Auth + embed live here

  function getCurrentScript() {
    // Prefer document.currentScript, fallback to last matching src
    const cs = document.currentScript;
    if (cs) return cs;
    const scripts = document.querySelectorAll('script[src]');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const s = scripts[i];
      try {
        const u = new URL(s.src, location.href);
        if (u.pathname.endsWith('/embed.js')) return s;
      } catch {}
    }
    return null;
  }

  function normalizeBase(urlLike) {
    try {
      const u = new URL(urlLike);
      return u.origin; // strip paths/query
    } catch {
      return DEFAULT_BASE;
    }
  }

  function getBaseFromScript() {
    const s = getCurrentScript();
    if (!s) return DEFAULT_BASE;
    try {
      const u = new URL(s.src, location.href);
      // Allow override via query (?base=https://foo.example)
      const qp = u.searchParams.get('base');
      if (qp) return normalizeBase(qp);
    } catch {}
    // Or via data attribute on the script tag
    const dataBase = s.getAttribute('data-subnode-base');
    if (dataBase) return normalizeBase(dataBase);
    return DEFAULT_BASE;
  }

  const SUBNODE_BASE = getBaseFromScript();

  // ========= HELPERS =========
  function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const opts = { ...options, signal: controller.signal };
    return fetch(url, opts).finally(() => clearTimeout(id));
  }

  async function getLabToken(labId) {
    if (!labId) throw new Error('Missing data-embed-lab');
    const url = `${SUBNODE_BASE}/auth/embed/token`;

    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          lab_id: labId
        }),
        credentials: 'omit',
        mode: 'cors',
      },
      15000
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Auth error ${res.status}: ${text || res.statusText}`);
    }
    const data = await res.json().catch(() => ({}));
    if (!data || !data.access_token) throw new Error('No token in auth response');
    return data.access_token;
  }

  // ========= UI CREATION =========
  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.6)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '999999';
    overlay.style.backdropFilter = 'blur(2px)';
    return overlay;
  }

  function createContent(width = '90%', height = '90%') {
    const content = document.createElement('div');
    content.style.position = 'relative';
    content.style.width = width;
    content.style.maxWidth = '1200px';
    content.style.height = height;
    content.style.maxHeight = '95vh';
    content.style.background = 'white';
    content.style.borderRadius = '12px';
    content.style.overflow = 'hidden';
    content.style.boxShadow = '0 12px 40px rgba(0,0,0,0.35)';
    content.style.border = '1px solid rgba(0,0,0,0.08)';
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    return content;
  }

  function createCloseButton(onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '×';
    btn.setAttribute('aria-label', 'Close');
    btn.style.position = 'absolute';
    btn.style.top = '8px';
    btn.style.right = '8px';
    btn.style.background = '#111';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.borderRadius = '9999px';
    btn.style.width = '32px';
    btn.style.height = '32px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '18px';
    btn.style.lineHeight = '32px';
    btn.style.display = 'grid';
    btn.style.placeItems = 'center';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function createSpinner() {
    const wrap = document.createElement('div');
    wrap.style.position = 'absolute';
    wrap.style.inset = '0';
    wrap.style.display = 'grid';
    wrap.style.placeItems = 'center';
    wrap.style.background = 'linear-gradient(#fff, #fff)';
    wrap.style.pointerEvents = 'none';

    const spinner = document.createElement('div');
    spinner.style.width = '36px';
    spinner.style.height = '36px';
    spinner.style.border = '3px solid rgba(0,0,0,0.1)';
    spinner.style.borderTopColor = '#111';
    spinner.style.borderRadius = '50%';
    spinner.style.animation = 'subnode-spin 1s linear infinite';

    const style = document.createElement('style');
    style.textContent = `@keyframes subnode-spin { to { transform: rotate(360deg); } }`;
    wrap.appendChild(style);
    wrap.appendChild(spinner);
    return wrap;
  }

  function createIframe(src) {
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.referrerPolicy = 'no-referrer';
    iframe.setAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-forms allow-downloads'
    );
    iframe.setAttribute('loading', 'eager');
    return iframe;
  }

  function openModalWithIframe(href, opts = {}) {
    // Ensure only one modal
    const existing = document.querySelector('[data-subnode-embed="open"]');
    if (existing) existing.remove();

    const overlay = createOverlay();
    overlay.dataset.subnodeEmbed = 'open';

    const content = createContent(opts.width, opts.height);
    const close = () => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      document.body.style.overflow = '';
    };

    const closeBtn = createCloseButton(close);
    const spinner = createSpinner();
    const iframe = createIframe(href);

    iframe.style.visibility = 'hidden';
    iframe.addEventListener('load', () => {
      spinner.remove();
      iframe.style.visibility = 'visible';
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Close on Escape
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);

    content.appendChild(closeBtn);
    content.appendChild(spinner);
    content.appendChild(iframe);
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  }

  // ========= BOOTSTRAP =========
  async function handleClick(link) {
    const labId = link.getAttribute('data-embed-lab');
    let token;
    try {
      token = await getLabToken(labId);
    } catch (err) {
      console.error('Failed to get lab token:', err);
      alert('Error: could not load lab.');
      return;
    }

    const params = new URLSearchParams({ token });
    const href = `${SUBNODE_BASE}/embed?${params.toString()}`;

    openModalWithIframe(href, {
      width: link.getAttribute('data-embed-width') || '90%',
      height: link.getAttribute('data-embed-height') || '90%',
    });
  }

  function initEmbed() {
    const links = document.querySelectorAll('[data-embed-lab]');
    links.forEach((link) => {
      if (link.dataset.subnodeBound === '1') return;
      link.dataset.subnodeBound = '1';

      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const prevDisabled = link.getAttribute('aria-disabled');
        link.setAttribute('aria-disabled', 'true');
        link.style.pointerEvents = 'none';
        try {
          await handleClick(link);
        } finally {
          if (prevDisabled == null) link.removeAttribute('aria-disabled');
          else link.setAttribute('aria-disabled', prevDisabled);
          link.style.pointerEvents = '';
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmbed);
  } else {
    initEmbed();
  }
})();
