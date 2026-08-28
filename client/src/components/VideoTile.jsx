import { useEffect, useRef, useState } from "react";
import { MicIcon } from "./Icons";

function getInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function hasVisibleVideo(stream, isVideoOff) {
  if (isVideoOff || !stream) return false;
  return stream.getVideoTracks().some((track) => track.enabled && track.readyState !== "ended");
}

function VideoTile({
  stream,
  label,
  muted = false,
  isVideoOff = false,
  isMicMuted = false,
  mirrored = false,
  compact = false,
}) {
  const videoRef = useRef(null);
  const [showVideo, setShowVideo] = useState(() => hasVisibleVideo(stream, isVideoOff));

  useEffect(() => {
    const updateVisibility = () => {
      setShowVideo(hasVisibleVideo(stream, isVideoOff));
    };

    updateVisibility();
    if (!stream) return undefined;

    const onTrackChange = () => updateVisibility();
    stream.addEventListener("addtrack", onTrackChange);
    stream.addEventListener("removetrack", onTrackChange);

    const trackCleanups = stream.getTracks().map((track) => {
      track.addEventListener("mute", onTrackChange);
      track.addEventListener("unmute", onTrackChange);
      track.addEventListener("ended", onTrackChange);
      return () => {
        track.removeEventListener("mute", onTrackChange);
        track.removeEventListener("unmute", onTrackChange);
        track.removeEventListener("ended", onTrackChange);
      };
    });

    return () => {
      stream.removeEventListener("addtrack", onTrackChange);
      stream.removeEventListener("removetrack", onTrackChange);
      trackCleanups.forEach((cleanup) => cleanup());
    };
  }, [stream, isVideoOff]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream || null;
    if (!stream) return;

    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => {});
    }
  }, [stream, showVideo]);

  return (
    <article
      className={[
        "video-tile",
        mirrored ? "video-tile--mirrored" : "",
        compact ? "video-tile--compact" : "",
        showVideo ? "video-tile--has-video" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {stream && (
        <video ref={videoRef} autoPlay playsInline muted={muted} />
      )}
      {!showVideo && (
        <div className="video-avatar" aria-hidden="true">
          <span>{getInitials(label)}</span>
        </div>
      )}
      <div className="video-label">
        {isMicMuted && (
          <span className="video-mic-badge" title="Muted">
            <MicIcon muted />
          </span>
        )}
        <span className="video-name">{label}</span>
        {isVideoOff && <span className="video-off-tag">Camera off</span>}
      </div>
    </article>
  );
}

export default VideoTile;
