import { useEffect, useRef, useCallback } from 'react';

/**
 * Single websocket connection to the relay with auto-retry + outbox.
 * Sends are queued while disconnected and flushed on reconnect.
 */
export function useRealtime({ url, room, token, onMessage, enabled = true }) {
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const outboxRef = useRef([]);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const flush = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const box = outboxRef.current;
    outboxRef.current = [];
    for (const m of box) ws.send(JSON.stringify(m));
  }, []);

  useEffect(() => {
    if (!enabled || !url || !room || !token) return undefined;
    let disposed = false;
    let timer = null;

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        ws.send(JSON.stringify({ t: 'hello', room, token, ua: navigator.userAgent }));
        flush();
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.t === 'hello_ok') flush();
          onMessageRef.current(msg);
        } catch {}
      };

      ws.onclose = () => {
        if (disposed) return;
        retryRef.current = Math.min(retryRef.current + 1, 6);
        const delay = 400 * 2 ** retryRef.current + Math.random() * 300;
        timer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [url, room, token, enabled, flush]);

  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      if (outboxRef.current.length > 300) outboxRef.current.shift();
      outboxRef.current.push(msg);
    }
  }, []);

  const status = useRef('connecting');
  return { send, statusRef: status };
}
