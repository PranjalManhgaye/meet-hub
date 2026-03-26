export const SOCKET_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";
export const MEDIA_MODE = import.meta.env.VITE_MEDIA_MODE || "mesh";
export const LIVEKIT_WS_URL = import.meta.env.VITE_LIVEKIT_WS_URL || "";

const turnUrls = (import.meta.env.VITE_TURN_URLS || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const turnServer =
  turnUrls.length > 0
    ? {
        urls: turnUrls,
        username: import.meta.env.VITE_TURN_USERNAME || "",
        credential: import.meta.env.VITE_TURN_CREDENTIAL || "",
      }
    : null;

export const RTC_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }, ...(turnServer ? [turnServer] : [])],
};
