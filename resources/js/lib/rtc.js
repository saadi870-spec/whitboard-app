/**
 * Minimal mesh WebRTC (audio/video, muted-by-default, toggle on join).
 * Signaling rides the relay; STUN only (no TURN in this build).
 */
export function createRtc({ send, selfId, onStreams }) {
  const peers = new Map(); // guestId -> { pc, stream }
  let localStream = null;

  async function ensureStream(video) {
    if (localStream) return localStream;
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240 },
      audio: true,
    });
    onStreams(new Map(peers), localStream, selfId);
    return localStream;
  }

  function attach(guestId) {
    let p = peers.get(guestId);
    if (p) return p;
    p = { pc: new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }), stream: null };
    peers.set(guestId, p);

    p.pc.onicecandidate = (e) => {
      if (e.candidate) send({ t: 'rtc', to: guestId, signal: { kind: 'ice', data: e.candidate } });
    };
    p.pc.ontrack = (e) => {
      p.stream = e.streams[0];
      onStreams(new Map(peers), localStream, selfId);
    };
    p.pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(p.pc.connectionState)) {
        peers.delete(guestId);
        onStreams(new Map(peers), localStream, selfId);
      }
    };
    return p;
  }

  function detach(guestId) {
    const p = peers.get(guestId);
    if (p) {
      try { p.pc.close(); } catch {}
      peers.delete(guestId);
      onStreams(new Map(peers), localStream, selfId);
    }
  }

  async function onSignal(from, sig) {
    if (!sig || !sig.data) return;
    const p = attach(from);
    try {
      if (sig.kind === 'offer') {
        const stream = await ensureStream(true);
        stream.getTracks().forEach((tr) => p.pc.addTrack(tr, stream));
        await p.pc.setRemoteDescription(new RTCSessionDescription(sig.data));
        const answer = await p.pc.createAnswer();
        await p.pc.setLocalDescription(answer);
        send({ t: 'rtc', to: from, signal: { kind: 'answer', data: answer } });
      } else if (sig.kind === 'answer') {
        await p.pc.setRemoteDescription(new RTCSessionDescription(sig.data));
      } else if (sig.kind === 'ice') {
        await p.pc.addIceCandidate(new RTCIceCandidate(sig.data));
      }
    } catch (e) {
      console.warn('rtc signal error', e);
    }
  }

  async function call(guestId, withVideo) {
    const p = attach(guestId);
    const stream = await ensureStream(withVideo);
    stream.getTracks().forEach((tr) => p.pc.addTrack(tr, stream));
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);
    send({ t: 'rtc', to: guestId, signal: { kind: 'offer', data: offer } });
  }

  return { call, onSignal, detach, stream: () => localStream };
}
