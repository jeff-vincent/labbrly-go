import React, { useEffect, useMemo, useRef } from 'react';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
// Use a more accessible dark theme, then override specifics in LabText.css
import 'highlight.js/styles/a11y-dark.css';
import './LabText.css';

// Heuristic to decide if content is legacy HTML (Quill) rather than Markdown.
// We look for tags that start at beginning of line or typical Quill wrappers.
const isLikelyHtml = (text) => {
  if (!text) return false;
  if (/class="ql-/.test(text)) return true;
  // If it has block-level tags early on
  if (/^\s*<(p|div|h[1-6]|ul|ol|pre|code|strong|em)[>\s]/im.test(text)) return true;
  // Avoid misclassifying markdown that simply contains angle brackets (like code <example>)
  return false;
};

const LabText = ({ labText, headerActions = null }) => {
  const labTextRef = useRef(null);

  // Markdown-it instance with highlight.js highlighting
  const md = useMemo(() => new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    highlight: (code, lang) => {
      let highlighted;
      if (lang && hljs.getLanguage(lang)) {
        try {
          highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        } catch (_) { /* ignore */ }
      }
      if (!highlighted) {
        try { highlighted = hljs.highlightAuto(code).value; } catch (_) {
          highlighted = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        }
      }
      const languageClass = lang ? `language-${lang}` : 'language-plain';
      return `<pre class="hljs ${languageClass}"><code class="hljs ${languageClass}">${highlighted}</code></pre>`;
    }
  }), []);

  // Legacy Quill HTML -> convert <pre class="ql-syntax"> to highlight.js style blocks
  const convertLegacyQuillHtml = (html) => {
    if (!html) return '';
    return html.replace(/<pre class="ql-syntax" spellcheck="false">([\s\S]+?)<\/pre>/g, (_, code) => {
      return `<pre class="hljs language-plain"><code class="hljs language-plain">${code.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`;
    });
  };

  // Decide how to process incoming labText
  const processedHtml = useMemo(() => {
    if (!labText) return '';
    // Legacy HTML path
  if (isLikelyHtml(labText) && (labText.includes('ql-syntax') || /<p|<pre|<h[1-6]/i.test(labText))) {
      return convertLegacyQuillHtml(labText);
    }

    // Normalize line endings + trim trailing spaces to help markdown-it recognize headings
    let normalized = labText
      .replace(/\r\n?/g, '\n')
      .replace(/^\t+/gm, (m) => ' '.repeat(m.length * 2)) // convert tabs to spaces
      .replace(/^ {1,3}(#+ )/gm, '$1') // remove small leading indents before heading markers
      .replace(/\n{3,}/g, '\n\n'); // collapse huge blank regions

    const rendered = md.render(normalized);

    // Fallback: if original text has heading markers but rendered HTML has no <h1>/<h2>/<h3>, manually promote lines
  if (/^#{1,6}\s+/m.test(normalized) && !/<h[1-6][^>]*>/.test(rendered)) {
      const manual = normalized.split('\n').map(line => {
        const m = line.match(/^(#{1,6})\s+(.*)$/);
        if (!m) return `<p>${line.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`;
        const level = m[1].length;
        const text = m[2].trim();
        return `<h${level}>${text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</h${level}>`;
      }).join('\n');
      return manual;
    }
    return rendered;
  }, [labText, md]);

  // After insertion, highlight any code blocks (legacy HTML path)
  useEffect(() => {
    if (!labTextRef.current) return;
    labTextRef.current.querySelectorAll('pre code').forEach((block) => {
      try { hljs.highlightElement(block); } catch (_) { /* noop */ }
    });
  }, [processedHtml]);

  if (!labText) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 dark:bg-cp-panel dark:border-cp-border dark:shadow-cp">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6 mb-4"></div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden min-h-full flex flex-col dark:bg-cp-panel dark:border-cp-border dark:shadow-cp">
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 shrink-0 dark:bg-cp-panel-alt dark:border-cp-border flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center dark:text-neutral-100">
          <div className="w-3 h-3 bg-blue-500 rounded-full mr-3 dark:bg-cp-green"></div>
          Lab Guide
        </h3>
        {headerActions ? (
          <div className="flex items-center gap-2">{headerActions}</div>
        ) : null}
      </div>
      
      <div className="p-6 flex-1 min-h-0">
        <div 
          ref={labTextRef}
          className="prose prose-lg max-w-none
            prose-headings:text-gray-800 prose-headings:font-semibold dark:prose-headings:text-neutral-100
            prose-p:text-gray-700 prose-p:leading-relaxed dark:prose-p:text-neutral-300
            prose-strong:text-gray-800 dark:prose-strong:text-neutral-100
            prose-code:bg-gray-100 prose-code:px-2 prose-code:py-1 prose-code:rounded prose-code:text-sm prose-code:font-mono dark:prose-code:bg-cp-panel-alt dark:prose-code:text-cp-green
            prose-pre:bg-gray-950 prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto dark:prose-pre:bg-cp-panel-alt dark:prose-pre:border dark:prose-pre:border-cp-border
            prose-ul:text-gray-700 prose-ol:text-gray-700 dark:prose-ul:text-neutral-300 dark:prose-ol:text-neutral-300
            prose-li:text-gray-700 dark:prose-li:text-neutral-300
            prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline dark:prose-a:text-cp-blue"
          dangerouslySetInnerHTML={{ __html: processedHtml }}
        />
      </div>
    </div>
  );
};

export default LabText;
