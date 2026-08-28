import { useEffect, useState } from "react";
import useWebRTC from "../hooks/useWebRTC";
import VideoTile from "./VideoTile";
import ControlBar from "./ControlBar";
import ChatSidebar from "./ChatSidebar";
import { LockIcon, SignalIcon, UsersIcon } from "./Icons";

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getConnectionLabel(stats) {
  if (stats.avgRttMs === 0) return "Connecting";
  if (stats.packetLossPct > 5 || stats.avgRttMs > 300) return "Poor";
  if (stats.packetLossPct > 1 || stats.avgRttMs > 150) return "Fair";
  return "Good";
}

function ReactionOverlay({ reactions }) {
  const recent = reactions.slice(-5);
  if (recent.length === 0) return null;

  return (
    <div className="reaction-overlay" aria-live="polite">
      {recent.map((r, idx) => (
        <span key={`${r.ts || idx}-${idx}`} className="reaction-bubble" style={{ animationDelay: `${idx * 0.1}s` }}>
          <span className="reaction-emoji">{r.emoji}</span>
          <span className="reaction-author">{r.displayName}</span>
        </span>
      ))}
    </div>
  );
}

function VideoRoom({ roomId, displayName, onLeave }) {
  const {
    localStream,
    remoteStreams,
    isMicEnabled,
    isCameraEnabled,
    isScreenSharing,
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
    toggleMic,
    toggleCamera,
    leaveRoom,
    startScreenShare,
    sendChatMessage,
    sendReaction,
    toggleRoomLock,
    raiseHand,
    pushCaption,
    approveWaitingUser,
    rejectWaitingUser,
  } = useWebRTC(roomId, displayName);

  const [chatInput, setChatInput] = useState("");
  const [captionInput, setCaptionInput] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [toast, setToast] = useState("");

  const isHost = Boolean(hostId) && hostId === selfSocketId;
  const visibleParticipants = 1 + remoteStreams.length;
  const remoteCount = remoteStreams.length;
  const connectionLabel = getConnectionLabel(stats);

  const localTile = (
    <VideoTile
      stream={localStream}
      label={`${displayName || "Guest"} (You)`}
      muted
      mirrored
      compact={remoteCount > 0}
      isVideoOff={!isCameraEnabled}
      isMicMuted={!isMicEnabled}
    />
  );

  useEffect(() => {
    if (callState !== "connected") return undefined;
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [callState]);

  useEffect(() => {
    if (!notice) return undefined;
    setToast(notice);
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleLeave = () => {
    leaveRoom();
    onLeave();
  };

  if (waitingRoomStatus === "pending") {
    return (
      <main className="join-page">
        <section className="join-card join-card--centered">
          <div className="waiting-spinner" aria-hidden="true" />
          <h2>Waiting for host</h2>
          <p>The host will let you into <strong>{roomId}</strong> shortly.</p>
          <button type="button" className="btn-danger" onClick={handleLeave}>
            Leave
          </button>
        </section>
      </main>
    );
  }

  if (waitingRoomStatus === "rejected") {
    return (
      <main className="join-page">
        <section className="join-card join-card--centered">
          <h2>Request declined</h2>
          <p>The host did not admit you to this meeting.</p>
          <button type="button" className="btn-danger" onClick={handleLeave}>
            Go back
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="call-room">
      <header className="call-header">
        <div className="call-header__left">
          <span className="call-header__room">{roomId}</span>
          <span className="call-header__timer">{formatDuration(elapsed)}</span>
          {isRoomLocked && (
            <span className="call-header__badge" title="Room locked">
              <LockIcon />
            </span>
          )}
          {recordingStatus === "recording" && (
            <span className="call-header__recording">
              <span className="recording-dot" />
              Recording
            </span>
          )}
        </div>
        <div className="call-header__right">
          <span
            className={`call-header__signal call-header__signal--${connectionLabel.toLowerCase()}`}
            title={`RTT ${stats.avgRttMs}ms · Loss ${stats.packetLossPct}%`}
          >
            <SignalIcon />
            {connectionLabel}
          </span>
          <span className="call-header__participants" title={`${visibleParticipants} on video`}>
            <UsersIcon />
            {visibleParticipants}
          </span>
          {isHost && (
            <button
              type="button"
              className="call-header__lock-btn"
              onClick={toggleRoomLock}
              title={isRoomLocked ? "Unlock room" : "Lock room"}
            >
              {isRoomLocked ? "Unlock" : "Lock"}
            </button>
          )}
        </div>
      </header>

      {error && <div className="call-banner call-banner--error">{error}</div>}
      {toast && !error && <div className="call-toast">{toast}</div>}

      <div className={`call-body${isChatOpen ? " call-body--chat-open" : ""}`}>
        <section className={`video-stage${remoteCount > 0 ? " video-stage--with-pip" : ""}`}>
          {remoteCount === 0 ? (
            <div className="video-stage__solo">{localTile}</div>
          ) : (
            <>
              <div className={`video-stage__grid video-stage__grid--count-${Math.min(remoteCount, 9)}`}>
                {remoteStreams.map(({ socketId, stream }) => (
                  <VideoTile
                    key={socketId}
                    stream={stream}
                    label={peerNames[socketId] || "Guest"}
                  />
                ))}
              </div>
              <div className="video-stage__pip">{localTile}</div>
            </>
          )}
          <ReactionOverlay reactions={reactions} />
        </section>

        <ChatSidebar
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          chatMessages={chatMessages}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSendMessage={() => {
            sendChatMessage(chatInput);
            setChatInput("");
          }}
          isHost={isHost}
          waitingUsers={waitingUsers}
          onApproveUser={approveWaitingUser}
          onRejectUser={rejectWaitingUser}
          hands={hands}
          captions={captions}
          captionInput={captionInput}
          onCaptionInputChange={setCaptionInput}
          onPushCaption={() => {
            pushCaption(captionInput);
            setCaptionInput("");
          }}
        />
      </div>

      <ControlBar
        isMicEnabled={isMicEnabled}
        isCameraEnabled={isCameraEnabled}
        isScreenSharing={isScreenSharing}
        isChatOpen={isChatOpen}
        recordingStatus={recordingStatus}
        localStreamReady={Boolean(localStream)}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onScreenShare={startScreenShare}
        onReaction={sendReaction}
        onRaiseHand={raiseHand}
        onToggleChat={() => setIsChatOpen((open) => !open)}
        onLeave={handleLeave}
      />
    </main>
  );
}

export default VideoRoom;
