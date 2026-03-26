import { useEffect, useRef } from "react";

function VideoTile({ stream, label, muted = false, isVideoOff = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream || null;
  }, [stream]);

  return (
    <article className="video-tile">
      <video ref={videoRef} autoPlay playsInline muted={muted} />
      <div className="video-label">
        <span>{label}</span>
        {isVideoOff && <span className="video-off-tag">Camera off</span>}
      </div>
    </article>
  );
}

export default VideoTile;
