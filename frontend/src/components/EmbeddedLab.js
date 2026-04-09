import React, { useMemo } from 'react';

const EmbeddedLab = ({ jwt }) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const src = useMemo(() => {
    if (!origin) return '';
    if (!jwt) return `${origin}/signup`;
    const u = new URL(origin);
    u.searchParams.set('token', jwt);
    return u.toString();
  }, [origin, jwt]);

  return (
    <div className="w-full h-screen">
      <iframe
        title="Embedded Lab"
        src={src}
        className="w-full h-full border-0"
        allow="clipboard-read; clipboard-write; fullscreen; camera; microphone; display-capture"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
      />
    </div>
  );
};

export default EmbeddedLab;
