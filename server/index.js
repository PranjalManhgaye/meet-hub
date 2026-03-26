const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { v4: uuid } = require("uuid");
const { AccessToken } = require("livekit-server-sdk");

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";
const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL || "";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN === "*" ? true : CLIENT_ORIGIN }));
app.use(express.json());
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 180,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

const meetings = new Map();
const notesByMeeting = new Map();
const organizations = new Map();
const auditLogs = [];
const calendarLinks = new Map();
const billingMeters = new Map();
const retentionPolicies = new Map();
const waitingRooms = new Map();
const analytics = {
  roomJoins: 0,
  activeRooms: 0,
};

function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return next();
  };
}

function pushAudit(action, actor, target = "", metadata = {}) {
  auditLogs.push({
    id: uuid(),
    action,
    actor,
    target,
    metadata,
    ts: new Date().toISOString(),
  });
  if (auditLogs.length > 1000) auditLogs.shift();
}

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/api/auth/token", (req, res) => {
  const displayName = (req.body.displayName || "Guest").toString().slice(0, 40);
  const role = ["host", "cohost", "participant", "admin"].includes(req.body.role)
    ? req.body.role
    : "participant";
  const token = jwt.sign({ sub: uuid(), displayName, role }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, profile: { displayName, role } });
});

app.get("/api/phase2/media-adapter", (_req, res) => {
  res.json({
    provider: "livekit",
    mode: LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_WS_URL ? "token-ready" : "adapter-ready",
    wsUrl: LIVEKIT_WS_URL || null,
    note:
      LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_WS_URL
        ? "LiveKit credentials loaded."
        : "Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_WS_URL for token minting.",
  });
});

app.post("/api/livekit/token", (req, res) => {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_WS_URL) {
    return res.status(503).json({ error: "LiveKit is not configured on server" });
  }
  const roomId = (req.body.roomId || "").toString().trim();
  if (!roomId) return res.status(400).json({ error: "roomId is required" });
  const identity = (req.body.identity || req.body.displayName || `guest-${uuid().slice(0, 8)}`)
    .toString()
    .slice(0, 64);
  const name = (req.body.displayName || identity).toString().slice(0, 64);
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name,
    ttl: "2h",
  });
  at.addGrant({ roomJoin: true, room: roomId, canPublish: true, canSubscribe: true });
  return res.json({ token: at.toJwt(), wsUrl: LIVEKIT_WS_URL, roomId, identity, name });
});

app.post("/api/meetings", auth, requireRole("host", "cohost", "admin"), (req, res) => {
  const id = uuid();
  const meeting = {
    id,
    title: req.body.title || "Untitled Meeting",
    roomId: req.body.roomId || `room-${id.slice(0, 8)}`,
    startsAt: req.body.startsAt || new Date().toISOString(),
    owner: req.user.sub,
    createdAt: new Date().toISOString(),
  };
  meetings.set(id, meeting);
  pushAudit("meeting.create", req.user.sub, id, { roomId: meeting.roomId });
  res.status(201).json(meeting);
});

app.get("/api/meetings", auth, (_req, res) => {
  res.json(Array.from(meetings.values()));
});

app.post("/api/meetings/:id/notes", auth, (req, res) => {
  const id = req.params.id;
  const entry = {
    id: uuid(),
    text: (req.body.text || "").toString().slice(0, 4000),
    author: req.user.displayName || "User",
    createdAt: new Date().toISOString(),
  };
  if (!notesByMeeting.has(id)) notesByMeeting.set(id, []);
  notesByMeeting.get(id).push(entry);
  res.status(201).json(entry);
});

app.get("/api/meetings/:id/summary", auth, (req, res) => {
  const noteCount = (notesByMeeting.get(req.params.id) || []).length;
  res.json({
    provider: "ai-summary-stub",
    summary: `This meeting has ${noteCount} note item(s). Integrate LLM pipeline in production.`,
    actionItems: [],
  });
});

app.post("/api/orgs", auth, requireRole("admin"), (req, res) => {
  const org = {
    id: uuid(),
    name: req.body.name || "New Org",
    createdAt: new Date().toISOString(),
  };
  organizations.set(org.id, org);
  pushAudit("org.create", req.user.sub, org.id);
  res.status(201).json(org);
});

app.post("/api/integrations/calendar/connect", auth, (req, res) => {
  const provider = ["google", "microsoft"].includes(req.body.provider) ? req.body.provider : "google";
  calendarLinks.set(req.user.sub, { provider, connectedAt: new Date().toISOString() });
  pushAudit("calendar.connect", req.user.sub, provider);
  res.json({ ok: true, provider, mode: "integration-stub" });
});

app.post("/api/meetings/:id/schedule", auth, (req, res) => {
  const meeting = meetings.get(req.params.id);
  if (!meeting) return res.status(404).json({ error: "Meeting not found" });
  meeting.calendarEvent = {
    provider: calendarLinks.get(req.user.sub)?.provider || "google",
    eventId: `evt-${uuid().slice(0, 10)}`,
    startsAt: req.body.startsAt || meeting.startsAt,
  };
  meetings.set(req.params.id, meeting);
  pushAudit("meeting.schedule", req.user.sub, req.params.id, meeting.calendarEvent);
  return res.json(meeting);
});

app.post("/api/rooms/:roomId/invite-policy", auth, requireRole("host", "cohost", "admin"), (req, res) => {
  const roomId = req.params.roomId;
  const required = Boolean(req.body.required);
  const token = required ? `invite-${uuid().slice(0, 10)}` : "";
  roomInvites.set(roomId, { required, token });
  pushAudit("room.invite.policy", req.user.sub, roomId, { required });
  res.json({ roomId, required, token: token || null });
});

app.get("/api/rooms/:roomId/waiting-room", auth, requireRole("host", "cohost", "admin"), (req, res) => {
  const roomId = req.params.roomId;
  const users = Array.from(waitingRooms.get(roomId) || []).map((socketId) => ({
    socketId,
    displayName: socketToName.get(socketId) || "Guest",
  }));
  res.json({ roomId, users });
});

app.get("/api/admin/analytics", auth, requireRole("admin"), (_req, res) => {
  res.json({
    ...analytics,
    activeUsersApprox: socketToRoom.size,
    generatedAt: new Date().toISOString(),
  });
});

app.get("/api/admin/audit-logs", auth, requireRole("admin"), (_req, res) => {
  res.json(auditLogs.slice(-200));
});

app.post("/api/admin/retention", auth, requireRole("admin"), (req, res) => {
  const orgId = req.body.orgId || "default";
  const days = Number(req.body.days || 30);
  retentionPolicies.set(orgId, { days, updatedAt: new Date().toISOString() });
  pushAudit("retention.update", req.user.sub, orgId, { days });
  res.json({ orgId, days });
});

app.get("/api/admin/sla/status", auth, requireRole("admin"), (_req, res) => {
  res.json({
    targetUptimePct: 99.9,
    currentUptimePct: 99.95,
    activeIncident: false,
    generatedAt: new Date().toISOString(),
  });
});

app.get("/api/admin/residency/options", auth, requireRole("admin"), (_req, res) => {
  res.json({
    supportedRegions: ["in-central", "eu-west", "us-east"],
    currentDefault: "in-central",
  });
});

app.post("/api/admin/billing/meter", auth, requireRole("admin"), (req, res) => {
  const orgId = req.body.orgId || "default";
  const minutes = Number(req.body.meetingMinutes || 0);
  const current = billingMeters.get(orgId) || 0;
  billingMeters.set(orgId, current + minutes);
  res.json({ orgId, totalMeetingMinutes: billingMeters.get(orgId) });
});

app.get("/api/admin/billing/usage", auth, requireRole("admin"), (_req, res) => {
  res.json(
    Array.from(billingMeters.entries()).map(([orgId, meetingMinutes]) => ({ orgId, meetingMinutes })),
  );
});

app.post("/api/admin/scim/sync", auth, requireRole("admin"), (req, res) => {
  res.json({
    ok: true,
    importedUsers: Array.isArray(req.body.users) ? req.body.users.length : 0,
    mode: "scim-stub",
  });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN === "*" ? true : CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  },
});

const socketToRoom = new Map();
const socketToName = new Map();
const roomHosts = new Map();
const roomLocks = new Map();
const roomInvites = new Map();
const roomToSockets = new Map();
const pendingJoins = new Map();

function getRoomMembers(roomId) {
  return roomToSockets.has(roomId) ? Array.from(roomToSockets.get(roomId)) : [];
}

function emitRoomCount(roomId) {
  io.to(roomId).emit("room-user-count", { count: getRoomMembers(roomId).length });
  analytics.activeRooms = roomToSockets.size;
}

function emitWaitingRoom(roomId) {
  const users = Array.from(waitingRooms.get(roomId) || []).map((socketId) => ({
    socketId,
    displayName: pendingJoins.get(socketId)?.displayName || socketToName.get(socketId) || "Guest",
  }));
  io.to(roomId).emit("waiting-room-update", { users });
}

function removeSocketFromRoom(socketId, roomId) {
  if (!roomToSockets.has(roomId)) return;
  const members = roomToSockets.get(roomId);
  members.delete(socketId);
  if (members.size === 0) roomToSockets.delete(roomId);
}

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, displayName }) => {
    if (!roomId || typeof roomId !== "string") return;
    const invite = roomInvites.get(roomId);
    if (invite?.required) {
      if (!waitingRooms.has(roomId)) waitingRooms.set(roomId, new Set());
      waitingRooms.get(roomId).add(socket.id);
      pendingJoins.set(socket.id, { roomId, displayName: safeName });
      socket.emit("waiting-room", { roomId, approved: false });
      emitWaitingRoom(roomId);
      return;
    }

    const safeName =
      typeof displayName === "string" && displayName.trim()
        ? displayName.trim().slice(0, 40)
        : "Guest";
    const currentRoom = socketToRoom.get(socket.id);

    if (currentRoom === roomId) {
      const participants = getRoomMembers(roomId)
        .filter((id) => id !== socket.id)
        .map((id) => ({ socketId: id, displayName: socketToName.get(id) || "Guest" }));
      socket.emit("room-users", { participants });
      socket.emit("room-meta", {
        roomLocked: Boolean(roomLocks.get(roomId)),
        hostSocketId: roomHosts.get(roomId) || "",
      });
      emitRoomCount(roomId);
      return;
    }

    if (currentRoom && currentRoom !== roomId) {
      socket.leave(currentRoom);
      removeSocketFromRoom(socket.id, currentRoom);
      socket.to(currentRoom).emit("user-left", { socketId: socket.id });
      emitRoomCount(currentRoom);
    }

    socket.join(roomId);
    socketToRoom.set(socket.id, roomId);
    socketToName.set(socket.id, safeName);
    analytics.roomJoins += 1;

    if (!roomToSockets.has(roomId)) roomToSockets.set(roomId, new Set());
    roomToSockets.get(roomId).add(socket.id);
    if (!roomHosts.has(roomId)) roomHosts.set(roomId, socket.id);

    const participants = getRoomMembers(roomId)
      .filter((id) => id !== socket.id)
      .map((id) => ({ socketId: id, displayName: socketToName.get(id) || "Guest" }));
    socket.emit("room-users", { participants });
    socket.emit("room-meta", {
      roomLocked: Boolean(roomLocks.get(roomId)),
      hostSocketId: roomHosts.get(roomId) || "",
    });

    socket.to(roomId).emit("user-joined", {
      socketId: socket.id,
      displayName: safeName,
      userCount: getRoomMembers(roomId).length,
    });
    emitRoomCount(roomId);
    emitWaitingRoom(roomId);
  });

  socket.on("approve-waiting-user", ({ roomId, socketId }) => {
    if (!roomId || !socketId) return;
    if (roomHosts.get(roomId) !== socket.id) return;
    if (!waitingRooms.has(roomId) || !waitingRooms.get(roomId).has(socketId)) return;

    const targetSocket = io.sockets.sockets.get(socketId);
    const pending = pendingJoins.get(socketId);
    if (!targetSocket || !pending) return;

    waitingRooms.get(roomId).delete(socketId);
    if (waitingRooms.get(roomId).size === 0) waitingRooms.delete(roomId);
    pendingJoins.delete(socketId);

    targetSocket.join(roomId);
    socketToRoom.set(socketId, roomId);
    socketToName.set(socketId, pending.displayName || "Guest");
    if (!roomToSockets.has(roomId)) roomToSockets.set(roomId, new Set());
    roomToSockets.get(roomId).add(socketId);
    analytics.roomJoins += 1;

    const participants = getRoomMembers(roomId)
      .filter((id) => id !== socketId)
      .map((id) => ({ socketId: id, displayName: socketToName.get(id) || "Guest" }));

    targetSocket.emit("waiting-room", { roomId, approved: true });
    targetSocket.emit("room-users", { participants });
    targetSocket.emit("room-meta", {
      roomLocked: Boolean(roomLocks.get(roomId)),
      hostSocketId: roomHosts.get(roomId) || "",
    });

    targetSocket.to(roomId).emit("user-joined", {
      socketId,
      displayName: pending.displayName || "Guest",
      userCount: getRoomMembers(roomId).length,
    });
    emitRoomCount(roomId);
    emitWaitingRoom(roomId);
  });

  socket.on("reject-waiting-user", ({ roomId, socketId }) => {
    if (!roomId || !socketId) return;
    if (roomHosts.get(roomId) !== socket.id) return;
    if (!waitingRooms.has(roomId) || !waitingRooms.get(roomId).has(socketId)) return;

    waitingRooms.get(roomId).delete(socketId);
    if (waitingRooms.get(roomId).size === 0) waitingRooms.delete(roomId);
    pendingJoins.delete(socketId);
    const targetSocket = io.sockets.sockets.get(socketId);
    if (targetSocket) targetSocket.emit("waiting-room", { roomId, approved: false, rejected: true });
    emitWaitingRoom(roomId);
  });

  socket.on("chat-message", ({ roomId, text, displayName }) => {
    if (!roomId || !text) return;
    if (socketToRoom.get(socket.id) !== roomId) return;
    io.to(roomId).emit("chat-message", {
      from: socket.id,
      displayName: displayName || socketToName.get(socket.id) || "Guest",
      text: String(text).slice(0, 400),
      ts: Date.now(),
    });
  });

  socket.on("reaction", ({ roomId, emoji, displayName }) => {
    if (!roomId || !emoji) return;
    if (socketToRoom.get(socket.id) !== roomId) return;
    io.to(roomId).emit("reaction", {
      from: socket.id,
      displayName: displayName || socketToName.get(socket.id) || "Guest",
      emoji: String(emoji).slice(0, 8),
      ts: Date.now(),
    });
  });

  socket.on("toggle-room-lock", ({ roomId }) => {
    if (!roomId) return;
    if (roomHosts.get(roomId) !== socket.id) return;
    const next = !roomLocks.get(roomId);
    roomLocks.set(roomId, next);
    io.to(roomId).emit("room-locked", { locked: next });
    pushAudit("room.lock.toggle", socket.id, roomId, { locked: next });
  });

  socket.on("raise-hand", ({ roomId, displayName }) => {
    if (!roomId) return;
    if (socketToRoom.get(socket.id) !== roomId) return;
    io.to(roomId).emit("hand-raised", {
      socketId: socket.id,
      displayName: displayName || socketToName.get(socket.id) || "Guest",
      ts: Date.now(),
    });
  });

  socket.on("recording-control", ({ roomId, action }) => {
    if (!roomId || !action) return;
    if (roomHosts.get(roomId) !== socket.id) return;
    io.to(roomId).emit("recording-status", { action, ts: Date.now() });
    pushAudit("recording.control", socket.id, roomId, { action });
  });

  socket.on("caption-chunk", ({ roomId, text }) => {
    if (!roomId || !text) return;
    if (socketToRoom.get(socket.id) !== roomId) return;
    io.to(roomId).emit("caption-chunk", {
      from: socket.id,
      text: String(text).slice(0, 240),
      ts: Date.now(),
    });
  });

  socket.on("offer", ({ roomId, target, sdp }) => {
    if (!roomId || !target || !sdp) return;
    const senderRoom = socketToRoom.get(socket.id);
    const targetRoom = socketToRoom.get(target);
    if (senderRoom !== roomId || targetRoom !== roomId) return;
    io.to(target).emit("offer", { roomId, from: socket.id, sdp });
  });

  socket.on("answer", ({ roomId, target, sdp }) => {
    if (!roomId || !target || !sdp) return;
    const senderRoom = socketToRoom.get(socket.id);
    const targetRoom = socketToRoom.get(target);
    if (senderRoom !== roomId || targetRoom !== roomId) return;
    io.to(target).emit("answer", { roomId, from: socket.id, sdp });
  });

  socket.on("ice-candidate", ({ roomId, target, candidate }) => {
    if (!roomId || !target || !candidate) return;
    const senderRoom = socketToRoom.get(socket.id);
    const targetRoom = socketToRoom.get(target);
    if (senderRoom !== roomId || targetRoom !== roomId) return;
    io.to(target).emit("ice-candidate", { roomId, from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;

    socketToRoom.delete(socket.id);
    socketToName.delete(socket.id);
    removeSocketFromRoom(socket.id, roomId);

    socket.to(roomId).emit("user-left", { socketId: socket.id });
    if (roomHosts.get(roomId) === socket.id) {
      const nextHost = getRoomMembers(roomId)[0] || "";
      if (nextHost) roomHosts.set(roomId, nextHost);
      else roomHosts.delete(roomId);
      io.to(roomId).emit("room-meta", {
        roomLocked: Boolean(roomLocks.get(roomId)),
        hostSocketId: roomHosts.get(roomId) || "",
      });
    }
    if (getRoomMembers(roomId).length === 0) roomLocks.delete(roomId);
    pendingJoins.delete(socket.id);
    Array.from(waitingRooms.entries()).forEach(([waitingRoomId, socketIds]) => {
      if (!socketIds.has(socket.id)) return;
      socketIds.delete(socket.id);
      if (socketIds.size === 0) waitingRooms.delete(waitingRoomId);
      emitWaitingRoom(waitingRoomId);
    });
    emitRoomCount(roomId);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
