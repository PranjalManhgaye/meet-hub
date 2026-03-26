import useWebRTC from "../hooks/useWebRTC";
import VideoTile from "./VideoTile";
import { useState } from "react";

function VideoRoom({ roomId, displayName, onLeave }) {
  const {
    localStream,
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
    activeMediaMode,
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
    setRecording,
    pushCaption,
    approveWaitingUser,
    rejectWaitingUser,
  } = useWebRTC(roomId, displayName);
  const [chatInput, setChatInput] = useState("");
  const [captionInput, setCaptionInput] = useState("");

  const handleLeave = () => {
    leaveRoom();
    onLeave();
  };
  const isHost = Boolean(hostId) && hostId === selfSocketId;

  if (waitingRoomStatus === "pending") {
    return (
      <main className="room-page">
        <section className="join-card">
          <h2>Waiting Room</h2>
          <p>You are waiting for host approval to join room {roomId}.</p>
          <button className="danger-btn" onClick={handleLeave}>
            Leave
          </button>
        </section>
      </main>
    );
  }

  if (waitingRoomStatus === "rejected") {
    return (
      <main className="room-page">
        <section className="join-card">
          <h2>Request Declined</h2>
          <p>Your waiting-room request was rejected by the host.</p>
          <button className="danger-btn" onClick={handleLeave}>
            Back
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="room-page">
      <header className="room-header">
        <div className="room-info">
          <h2>Room: {roomId}</h2>
          <p>
            You are <strong>{displayName || "Guest"}</strong> • {userCount} participant(s)
          </p>
          <p>State: {callState}</p>
          <p>Media: {activeMediaMode}</p>
          <p>{hostId ? "Host connected" : "Host pending"}</p>
        </div>
        <div className="header-actions">
          <button onClick={toggleRoomLock}>{isRoomLocked ? "Unlock Room" : "Lock Room"}</button>
          <button className="danger-btn" onClick={handleLeave}>
            Leave Room
          </button>
        </div>
      </header>

      <section className="status-row">
        <span className={`status-chip ${isMicEnabled ? "ok" : "warn"}`}>
          Mic: {isMicEnabled ? "On" : "Off"}
        </span>
        <span className={`status-chip ${isCameraEnabled ? "ok" : "warn"}`}>
          Camera: {isCameraEnabled ? "On" : "Off"}
        </span>
        <span className={`status-chip ${isScreenSharing ? "ok" : ""}`}>
          Share: {isScreenSharing ? "On" : "Off"}
        </span>
      </section>

      {error && <p className="error-text">{error}</p>}
      {!error && notice && <p className="notice-text">{notice}</p>}
      {!!reactions.length && (
        <p className="notice-text">Reactions: {reactions.slice(-6).map((r) => r.emoji).join(" ")}</p>
      )}
      <section className="status-row">
        <span className="status-chip">RTT: {stats.avgRttMs}ms</span>
        <span className="status-chip">Out: {stats.outboundKbps} KB</span>
        <span className="status-chip">Loss: {stats.packetLossPct}%</span>
      </section>

      <section className="video-grid">
        <VideoTile
          stream={localStream}
          label={`${displayName || "Guest"} (You)`}
          muted
          isVideoOff={!isCameraEnabled}
        />
        {remoteStreams.map(({ socketId, stream }) => (
          <VideoTile
            key={socketId}
            stream={stream}
            label={peerNames[socketId] || "Guest"}
          />
        ))}
      </section>

      <footer className="controls">
        <button
          className={isMicEnabled ? "control-on" : "control-off"}
          disabled={!localStream}
          onClick={toggleMic}
        >
          {isMicEnabled ? "Mute" : "Unmute"}
        </button>
        <button
          className={isCameraEnabled ? "control-on" : "control-off"}
          disabled={!localStream}
          onClick={toggleCamera}
        >
          {isCameraEnabled ? "Turn Camera Off" : "Turn Camera On"}
        </button>
        <button disabled={!localStream} onClick={startScreenShare}>
          {isScreenSharing ? "Sharing..." : "Share Screen"}
        </button>
        <button onClick={() => sendReaction("👍")}>👍</button>
        <button onClick={() => sendReaction("👏")}>👏</button>
        <button onClick={raiseHand}>Raise Hand</button>
        <button onClick={() => setRecording(recordingStatus === "recording" ? "stopped" : "recording")}>
          {recordingStatus === "recording" ? "Stop Recording" : "Start Recording"}
        </button>
      </footer>
      {!!hands.length && (
        <p className="notice-text">
          Hands: {hands.slice(-5).map((h) => h.displayName).join(", ")}
        </p>
      )}
      {isHost && (
        <section className="chat-panel">
          <p>
            <strong>Waiting Room Queue</strong>
          </p>
          {waitingUsers.length === 0 ? (
            <p>No pending users.</p>
          ) : (
            waitingUsers.map((user) => (
              <p key={user.socketId}>
                {user.displayName}{" "}
                <button onClick={() => approveWaitingUser(user.socketId)}>Approve</button>{" "}
                <button onClick={() => rejectWaitingUser(user.socketId)}>Reject</button>
              </p>
            ))
          )}
        </section>
      )}
      {!!captions.length && (
        <div className="chat-panel">
          <p>
            <strong>Captions</strong>
          </p>
          {captions.slice(-5).map((c, idx) => (
            <p key={`${c.ts || idx}`}>{c.text}</p>
          ))}
          <form
            className="join-form"
            onSubmit={(e) => {
              e.preventDefault();
              pushCaption(captionInput);
              setCaptionInput("");
            }}
          >
            <input
              value={captionInput}
              onChange={(e) => setCaptionInput(e.target.value)}
              placeholder="Type caption stub..."
            />
            <button type="submit">Publish Caption</button>
          </form>
        </div>
      )}
      <section className="chat-panel">
        <div className="chat-list">
          {chatMessages.map((message, idx) => (
            <p key={`${message.ts || idx}-${idx}`}>
              <strong>{message.displayName || "Guest"}:</strong> {message.text}
            </p>
          ))}
        </div>
        <form
          className="join-form"
          onSubmit={(e) => {
            e.preventDefault();
            sendChatMessage(chatInput);
            setChatInput("");
          }}
        >
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type message..."
          />
          <button type="submit">Send</button>
        </form>
      </section>
    </main>
  );
}

export default VideoRoom;
