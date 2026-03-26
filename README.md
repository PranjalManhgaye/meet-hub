# Zoom-like MVP

Minimal full-stack video conferencing MVP using React + Vite, Express, Socket.IO, and WebRTC mesh.

## Project Structure

- `server` - Express + Socket.IO signaling server
- `client` - React app with `VideoRoom` and reusable `useWebRTC` hook

## Features

- Join with display name + room ID
- Join room by room ID
- Multi-user mesh video/audio call
- WebRTC signaling via Socket.IO (`join-room`, `user-joined`, `offer`, `answer`, `ice-candidate`, `user-left`)
- Mic mute/unmute and camera on/off
- Leave room cleanup (tracks, peers, socket listeners)
- Screen share (bonus) with camera fallback when sharing stops
- Live user count in room
- In-call status chips (mic/camera/screen share) and user feedback banners

## Run Locally

### 1) Start server

```bash
cd server
npm install
npm run dev
```

Server runs on `http://localhost:5000`.

### 2) Start client

```bash
cd client
npm install
npm run dev
```

Client runs on `http://localhost:5173` by default.

## Quick UX Test Checklist

- Open 2-3 tabs and join the same room with different names.
- Confirm each tile shows friendly participant names (not only socket IDs).
- Toggle mic/camera and confirm status chips update immediately.
- Start and stop screen sharing; confirm banner/status updates.
- Leave one tab and confirm participant count/tile list updates in remaining tabs.
- Deny media permission in one tab and verify clear user-facing error message.

## Reliability Stress Checklist

- Open 3-4 tabs in the same room and join within a few seconds.
- Refresh one participant repeatedly; confirm others stay connected.
- Refresh two participants back-to-back; confirm room recovers without stuck tiles.
- Watch browser console for repeated SDP/`InvalidStateError` messages.
- Join/leave rapidly and verify participant count remains accurate.

## Advanced Platform Slice (Phase 1-6)

- TURN-ready client config via `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`.
- Client call-state machine and QoS indicators (RTT/packet loss/outbound throughput estimate).
- LiveKit adapter contract endpoint: `GET /api/phase2/media-adapter`.
- In-call chat/reactions and host room lock through Socket.IO.
- Auth and role-aware APIs:
  - `POST /api/auth/token`
  - `POST /api/meetings`, `GET /api/meetings`
  - `POST /api/meetings/:id/notes`
  - `GET /api/meetings/:id/summary` (AI summary stub)
  - `POST /api/orgs` (admin)
  - `POST /api/admin/scim/sync` (admin stub)
  - `GET /api/admin/analytics` (admin)

### Example: get token

```bash
curl -X POST http://localhost:5000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Admin","role":"admin"}'
```

Use returned token as:

```bash
Authorization: Bearer <token>
```

## Phase 2.1 LiveKit Bridge

This repo now supports **LiveKit token minting** with mesh fallback:

- `POST /api/livekit/token`
- `GET /api/phase2/media-adapter` reports adapter readiness

Set server env:

- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_WS_URL` (e.g. `wss://your-livekit-host`)

Set client env (optional):

- `VITE_MEDIA_MODE=livekit` to attempt LiveKit bridge
- `VITE_LIVEKIT_WS_URL` (reserved for upcoming client SDK bridge)

Current behavior:

- In `livekit` mode, client requests LiveKit token and shows bridge readiness notice.
- Media still uses hardened mesh path as fallback until full LiveKit client SDK media transport is wired.

## All-Phases Completion Pack

Additional end-to-end slices now included:

- **Phase 3+ collaboration**: hand raise, recording status controls, caption chunks (Socket.IO events).
- **Phase 4 security/compliance**:
  - audit logging (`GET /api/admin/audit-logs`)
  - invite policy + waiting room list APIs
  - real-time waiting room moderation via socket events (`approve-waiting-user`, `reject-waiting-user`)
- **Phase 5 collaboration suite**:
  - calendar integration stub (`POST /api/integrations/calendar/connect`)
  - meeting schedule bridge (`POST /api/meetings/:id/schedule`)
- **Phase 6 enterprise ops**:
  - retention policy (`POST /api/admin/retention`)
  - residency options (`GET /api/admin/residency/options`)
  - billing usage meter (`POST /api/admin/billing/meter`, `GET /api/admin/billing/usage`)
  - SLA status (`GET /api/admin/sla/status`)

## Environment Variables (optional)

### Server

- `PORT` (default: `5000`)
- `CLIENT_ORIGIN` (default: `*`)

### Client

- `VITE_SERVER_URL` (default: `http://localhost:5000`)

## Notes

- This MVP uses STUN only: `stun:stun.l.google.com:19302`.
- For stricter NAT/firewall environments, add a TURN server in production.
