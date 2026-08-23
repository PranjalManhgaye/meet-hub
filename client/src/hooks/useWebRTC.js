import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { MEDIA_MODE, RTC_CONFIG, SOCKET_URL } from "../lib/config";

function useWebRTC(roomId, displayName) {
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const peerMetaRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const peerNamesRef = useRef({});
  const mountedRef = useRef(false);

  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [userCount, setUserCount] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [peerNames, setPeerNames] = useState({});
  const [callState, setCallState] = useState("idle");
  const [chatMessages, setChatMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [isRoomLocked, setIsRoomLocked] = useState(false);
  const [hostId, setHostId] = useState("");
  const [stats, setStats] = useState({ avgRttMs: 0, outboundKbps: 0, packetLossPct: 0 });
  const [activeMediaMode, setActiveMediaMode] = useState(MEDIA_MODE);
  const [hands, setHands] = useState([]);
  const [recordingStatus, setRecordingStatus] = useState("idle");
  const [captions, setCaptions] = useState([]);
  const [waitingRoomStatus, setWaitingRoomStatus] = useState("none");
  const [waitingUsers, setWaitingUsers] = useState([]);
  const [selfSocketId, setSelfSocketId] = useState("");

  const syncRemoteStreams = useCallback(() => {
    setRemoteStreams(
      Array.from(remoteStreamsRef.current.entries()).map(([socketId, stream]) => ({
        socketId,
        stream,
      })),
    );
  }, []);

  const setPeerNamesState = useCallback((updater) => {
    setPeerNames((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      peerNamesRef.current = next;
      return next;
    });
  }, []);

  const getPeerMeta = useCallback((targetSocketId) => {
    if (!peerMetaRef.current.has(targetSocketId)) {
      const selfId = socketRef.current?.id || "";
      peerMetaRef.current.set(targetSocketId, {
        makingOffer: false,
        ignoreOffer: false,
        polite: selfId ? selfId < targetSocketId : true,
        pendingCandidates: [],
      });
    }
    return peerMetaRef.current.get(targetSocketId);
  }, []);

  const removePeer = useCallback(
    (socketId) => {
      const pc = peerConnectionsRef.current.get(socketId);
      if (pc) pc.close();
      peerConnectionsRef.current.delete(socketId);
      peerMetaRef.current.delete(socketId);
      remoteStreamsRef.current.delete(socketId);
      setPeerNamesState((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
      syncRemoteStreams();
    },
    [setPeerNamesState, syncRemoteStreams],
  );

  const createPeerConnection = useCallback(
    (targetSocketId) => {
      const existing = peerConnectionsRef.current.get(targetSocketId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionsRef.current.set(targetSocketId, pc);
      const meta = getPeerMeta(targetSocketId);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      pc.ontrack = (event) => {
        let remoteStream = remoteStreamsRef.current.get(targetSocketId);

        if (event.streams?.[0]) {
          remoteStream = event.streams[0];
        } else {
          if (!remoteStream) {
            remoteStream = new MediaStream();
          }
          const hasTrack = remoteStream
            .getTracks()
            .some((track) => track.id === event.track.id);
          if (!hasTrack) {
            remoteStream.addTrack(event.track);
          }
        }

        remoteStreamsRef.current.set(targetSocketId, remoteStream);
        syncRemoteStreams();
      };

      pc.onicecandidate = (event) => {
        if (!event.candidate || !socketRef.current) return;
        socketRef.current.emit("ice-candidate", {
          roomId,
          target: targetSocketId,
          candidate: event.candidate.toJSON(),
        });
      };

      pc.onnegotiationneeded = async () => {
        if (!socketRef.current) return;
        try {
          meta.makingOffer = true;
          await pc.setLocalDescription();
          socketRef.current.emit("offer", {
            roomId,
            target: targetSocketId,
            sdp: pc.localDescription,
          });
        } catch {
          // Ignore negotiation races; perfect-negotiation handler recovers.
        } finally {
          meta.makingOffer = false;
        }
      };

      pc.onconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
          const leftName = peerNamesRef.current[targetSocketId] || "A participant";
          setNotice(`${leftName} disconnected.`);
          removePeer(targetSocketId);
        }
      };

      return pc;
    },
    [getPeerMeta, removePeer, roomId, syncRemoteStreams],
  );

  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !isMicEnabled;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setIsMicEnabled(next);
  }, [isMicEnabled]);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !isCameraEnabled;
    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setIsCameraEnabled(next);
  }, [isCameraEnabled]);

  const startScreenShare = useCallback(async () => {
    if (!localStreamRef.current) return false;
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const [screenTrack] = displayStream.getVideoTracks();
      if (!screenTrack) return false;

      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) sender.replaceTrack(screenTrack);
      });

      const [cameraTrack] = localStreamRef.current.getVideoTracks();
      const tracks = localStreamRef.current.getTracks().filter((track) => track.kind !== "video");
      const previewStream = new MediaStream([...tracks, screenTrack]);
      localStreamRef.current = previewStream;
      setLocalStream(previewStream);
      setIsScreenSharing(true);
      setNotice("Screen sharing is live.");

      screenTrack.onended = () => {
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
          if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
        });
        const revertStream = new MediaStream([
          ...tracks,
          ...(cameraTrack ? [cameraTrack] : []),
        ]);
        localStreamRef.current = revertStream;
        setLocalStream(revertStream);
        setIsScreenSharing(false);
        setNotice("Screen sharing stopped.");
      };
      return true;
    } catch {
      setNotice("Screen sharing was cancelled.");
      return false;
    }
  }, []);

  const leaveRoom = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    peerMetaRef.current.clear();
    remoteStreamsRef.current.clear();
    syncRemoteStreams();
    setPeerNamesState({});
    setIsScreenSharing(false);
    setCallState("idle");
    setChatMessages([]);
    setReactions([]);
    setIsRoomLocked(false);
    setHostId("");
    setHands([]);
    setRecordingStatus("idle");
    setCaptions([]);
    setWaitingRoomStatus("none");
    setWaitingUsers([]);
    setSelfSocketId("");

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }

    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, [setPeerNamesState, syncRemoteStreams]);

  useEffect(() => {
    mountedRef.current = true;
    if (!roomId) return () => {};

    const setup = async () => {
      setError("");
      setNotice("");
      setCallState("joining");
      let mode = MEDIA_MODE === "livekit" ? "livekit" : "mesh";
      if (mode === "livekit") {
        try {
          const response = await fetch(`${SOCKET_URL}/api/livekit/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              roomId,
              displayName: displayName || "Guest",
              identity: `${(displayName || "guest").replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`,
            }),
          });
          if (!response.ok) throw new Error("livekit token failed");
          const payload = await response.json();
          setNotice(
            `LiveKit adapter ready for ${payload.roomId}. Running mesh fallback until client SDK bridge is enabled.`,
          );
          setActiveMediaMode("livekit-bridge");
        } catch {
          mode = "mesh";
          setActiveMediaMode("mesh");
          setNotice("LiveKit unavailable, using mesh fallback.");
        }
      } else {
        setActiveMediaMode("mesh");
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        if (!mountedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch {
        setError("Camera or microphone permission is required to join.");
        setCallState("failed");
        return;
      }

      const socket = io(SOCKET_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 10,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        setCallState("connected");
        setSelfSocketId(socket.id);
        socket.emit("join-room", { roomId, displayName: displayName || "Guest" });
      });
      socket.on("disconnect", () => {
        setCallState("reconnecting");
      });
      socket.on("reconnect", () => {
        setCallState("connected");
        socket.emit("join-room", { roomId, displayName: displayName || "Guest" });
      });

      socket.on("room-users", ({ participants }) => {
        setUserCount((participants?.length || 0) + 1);
        const incomingNames = {};
        for (const participant of participants || []) {
          const socketId = participant.socketId;
          incomingNames[socketId] = participant.displayName || "Guest";
          createPeerConnection(socketId);
        }
        setPeerNamesState(incomingNames);
      });
      socket.on("room-meta", ({ roomLocked, hostSocketId }) => {
        setIsRoomLocked(Boolean(roomLocked));
        setHostId(hostSocketId || "");
      });
      socket.on("waiting-room", ({ approved, rejected }) => {
        if (approved) {
          setWaitingRoomStatus("approved");
          return;
        }
        setWaitingRoomStatus(rejected ? "rejected" : "pending");
      });
      socket.on("waiting-room-update", ({ users }) => {
        setWaitingUsers(users || []);
      });

      socket.on("room-user-count", ({ count }) => {
        setUserCount(count || 1);
      });

      socket.on("user-joined", ({ socketId, displayName: name }) => {
        setPeerNamesState((prev) => ({ ...prev, [socketId]: name || "Guest" }));
        setNotice(`${name || "Guest"} joined.`);
        createPeerConnection(socketId);
      });
      socket.on("chat-message", (message) => {
        setChatMessages((prev) => [...prev.slice(-39), message]);
      });
      socket.on("reaction", (reaction) => {
        setReactions((prev) => [...prev.slice(-19), reaction]);
      });
      socket.on("room-locked", ({ locked }) => {
        setIsRoomLocked(Boolean(locked));
        setNotice(locked ? "Room locked by host." : "Room unlocked.");
      });
      socket.on("hand-raised", (payload) => {
        setHands((prev) => [...prev.slice(-19), payload]);
      });
      socket.on("recording-status", ({ action }) => {
        setRecordingStatus(action || "idle");
      });
      socket.on("caption-chunk", (payload) => {
        setCaptions((prev) => [...prev.slice(-29), payload]);
      });

      socket.on("offer", async ({ roomId: payloadRoomId, from, sdp }) => {
        if (payloadRoomId && payloadRoomId !== roomId) return;
        const pc = createPeerConnection(from);
        const meta = getPeerMeta(from);
        const offerCollision = meta.makingOffer || pc.signalingState !== "stable";
        meta.ignoreOffer = !meta.polite && offerCollision;
        if (meta.ignoreOffer) return;
        try {
          if (offerCollision) {
            await Promise.all([
              pc.setLocalDescription({ type: "rollback" }),
              pc.setRemoteDescription(new RTCSessionDescription(sdp)),
            ]);
          } else {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          }

          for (const candidate of meta.pendingCandidates) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          meta.pendingCandidates = [];

          await pc.setLocalDescription();
          socket.emit("answer", {
            roomId,
            target: from,
            sdp: pc.localDescription,
          });
        } catch {
          setNotice("Negotiation recovered from a collision.");
        }
      });

      socket.on("answer", async ({ roomId: payloadRoomId, from, sdp }) => {
        if (payloadRoomId && payloadRoomId !== roomId) return;
        const pc = peerConnectionsRef.current.get(from);
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const meta = getPeerMeta(from);
          for (const candidate of meta.pendingCandidates) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          meta.pendingCandidates = [];
        } catch {
          // Ignore stale answers during reconnect races.
        }
      });

      socket.on("ice-candidate", async ({ roomId: payloadRoomId, from, candidate }) => {
        if (payloadRoomId && payloadRoomId !== roomId) return;
        const pc = peerConnectionsRef.current.get(from) || createPeerConnection(from);
        const meta = getPeerMeta(from);
        if (!pc.remoteDescription) {
          meta.pendingCandidates.push(candidate);
          return;
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // Ignore stale candidates during race conditions.
        }
      });

      socket.on("user-left", ({ socketId }) => {
        const leftName = peerNamesRef.current[socketId] || "A participant";
        setNotice(`${leftName} left.`);
        removePeer(socketId);
      });
    };

    setup();

    return () => {
      mountedRef.current = false;
      leaveRoom();
    };
  }, [createPeerConnection, displayName, getPeerMeta, leaveRoom, removePeer, roomId, setPeerNamesState]);

  useEffect(() => {
    let isCancelled = false;
    const timer = setInterval(async () => {
      if (isCancelled) return;
      const peers = Array.from(peerConnectionsRef.current.values());
      if (peers.length === 0) {
        setStats({ avgRttMs: 0, outboundKbps: 0, packetLossPct: 0 });
        return;
      }
      let rttSum = 0;
      let rttCount = 0;
      let bytesSentNow = 0;
      let packetsLost = 0;
      let packetsTotal = 0;
      for (const pc of peers) {
        try {
          const report = await pc.getStats();
          report.forEach((entry) => {
            if (entry.type === "candidate-pair" && entry.state === "succeeded" && entry.currentRoundTripTime) {
              rttSum += entry.currentRoundTripTime * 1000;
              rttCount += 1;
            }
            if (entry.type === "outbound-rtp" && entry.kind === "video") {
              bytesSentNow += entry.bytesSent || 0;
            }
            if (entry.type === "inbound-rtp" && entry.kind === "video") {
              packetsLost += entry.packetsLost || 0;
              packetsTotal += (entry.packetsLost || 0) + (entry.packetsReceived || 0);
            }
          });
        } catch {
          // Best-effort only.
        }
      }
      setStats({
        avgRttMs: rttCount ? Math.round(rttSum / rttCount) : 0,
        outboundKbps: Math.round(bytesSentNow / 1024),
        packetLossPct: packetsTotal ? Number(((packetsLost / packetsTotal) * 100).toFixed(1)) : 0,
      });
    }, 4000);
    return () => {
      isCancelled = true;
      clearInterval(timer);
    };
  }, []);

  const sendChatMessage = useCallback(
    (text) => {
      if (!socketRef.current || !text?.trim()) return;
      socketRef.current.emit("chat-message", {
        roomId,
        text: text.trim().slice(0, 400),
        displayName: displayName || "Guest",
      });
    },
    [displayName, roomId],
  );

  const sendReaction = useCallback(
    (emoji) => {
      if (!socketRef.current || !emoji) return;
      socketRef.current.emit("reaction", {
        roomId,
        emoji,
        displayName: displayName || "Guest",
      });
    },
    [displayName, roomId],
  );

  const toggleRoomLock = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit("toggle-room-lock", { roomId });
  }, [roomId]);

  const raiseHand = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit("raise-hand", { roomId, displayName: displayName || "Guest" });
  }, [displayName, roomId]);

  const setRecording = useCallback(
    (action) => {
      if (!socketRef.current) return;
      socketRef.current.emit("recording-control", { roomId, action });
    },
    [roomId],
  );

  const pushCaption = useCallback(
    (text) => {
      if (!socketRef.current || !text?.trim()) return;
      socketRef.current.emit("caption-chunk", { roomId, text: text.trim() });
    },
    [roomId],
  );

  const approveWaitingUser = useCallback(
    (socketId) => {
      if (!socketRef.current || !socketId) return;
      socketRef.current.emit("approve-waiting-user", { roomId, socketId });
    },
    [roomId],
  );

  const rejectWaitingUser = useCallback(
    (socketId) => {
      if (!socketRef.current || !socketId) return;
      socketRef.current.emit("reject-waiting-user", { roomId, socketId });
    },
    [roomId],
  );

  const state = useMemo(
    () => ({
      localStream,
      activeMediaMode,
      remoteStreams,
      isMicEnabled,
      isCameraEnabled,
      isScreenSharing,
      userCount,
      error,
      notice,
      peerNames,
      callState,
      chatMessages,
      reactions,
      isRoomLocked,
      hostId,
      stats,
      hands,
      recordingStatus,
      captions,
      waitingRoomStatus,
      waitingUsers,
      selfSocketId,
    }),
    [
      error,
      isCameraEnabled,
      isMicEnabled,
      isScreenSharing,
      localStream,
      activeMediaMode,
      notice,
      peerNames,
      callState,
      chatMessages,
      reactions,
      isRoomLocked,
      hostId,
      stats,
      hands,
      recordingStatus,
      captions,
      waitingRoomStatus,
      waitingUsers,
      selfSocketId,
      remoteStreams,
      userCount,
    ],
  );

  return {
    ...state,
    toggleMic,
    toggleCamera,
    leaveRoom,
    startScreenShare,
    sendChatMessage,
    sendReaction,
    toggleRoomLock,
    raiseHand,
    setRecording,
    pushCaption,
    approveWaitingUser,
    rejectWaitingUser,
  };
}

export default useWebRTC;
