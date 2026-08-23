import { useEffect, useRef } from "react";

function VideoTile({ stream, label, muted = false, isVideoOff = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream || null;
    if (!stream) return;

    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => {
        // Mobile browsers may block autoplay until user interaction.
      });
    }
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
