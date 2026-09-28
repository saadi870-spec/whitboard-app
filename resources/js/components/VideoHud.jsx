import { useEffect, useRef } from 'react';

/** Bottom-right filmstrip of peer videos plus the local camera preview. */
export default function VideoHud({ streams, selfStream, selfName, enabled, onToggle, onCallPeer }) {
  const selfVideoRef = useRef(null);

  useEffect(() => {
    if (selfVideoRef.current && selfStream) {
      selfVideoRef.current.srcObject = selfStream;
    }
  }, [selfStream]);

  if (!enabled) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="absolute bottom-4 right-4 z-20 rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-indigo-500"
      >
        Join with camera &amp; mic
      </button>
    );
  }

  return (
    <div className="absolute bottom-4 right-4 z-20 flex items-end gap-2">
      {streams.map((s) => (
        <PeerTile key={s.guest} stream={s.stream} label={s.name || 'Guest'} muted={false} />
      ))}
      <div className="relative">
        <video
          ref={selfVideoRef}
          autoPlay
          muted
          playsInline
          className="h-28 w-40 rounded-lg border border-slate-600 bg-slate-900 object-cover shadow-xl"
        />
        <span className="absolute bottom-1 left-2 rounded bg-slate-900/80 px-1 text-[10px] text-slate-200">
          {selfName} (you)
        </span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="rounded-full bg-slate-800 px-3 py-2 text-xs text-slate-200 shadow hover:bg-slate-700"
      >
        Leave call
      </button>
    </div>
  );
}

function PeerTile({ stream, label, muted }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="relative">
      <video
        ref={ref}
        autoPlay
        muted={muted}
        playsInline
        className="h-28 w-40 rounded-lg border border-slate-700 bg-slate-900 object-cover shadow-xl"
      />
      <span className="absolute bottom-1 left-2 rounded bg-slate-900/80 px-1 text-[10px] text-slate-200">
        {label}
      </span>
    </div>
  );
}
