import {
  CameraIcon,
  ChatIcon,
  HandIcon,
  LeaveIcon,
  MicIcon,
  ScreenShareIcon,
} from "./Icons";

function ControlButton({ active, danger, off, label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      className={[
        "control-btn",
        active ? "control-btn--active" : "",
        off ? "control-btn--off" : "",
        danger ? "control-btn--danger" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {children}
      <span className="control-btn__label">{label}</span>
    </button>
  );
}

function ControlBar({
  isMicEnabled,
  isCameraEnabled,
  isScreenSharing,
  isChatOpen,
  recordingStatus,
  localStreamReady,
  onToggleMic,
  onToggleCamera,
  onScreenShare,
  onReaction,
  onRaiseHand,
  onToggleChat,
  onLeave,
}) {
  return (
    <footer className="control-bar">
      <div className="control-bar__group">
        <ControlButton
          label={isMicEnabled ? "Mute" : "Unmute"}
          off={!isMicEnabled}
          onClick={onToggleMic}
          disabled={!localStreamReady}
        >
          <MicIcon muted={!isMicEnabled} />
        </ControlButton>
        <ControlButton
          label={isCameraEnabled ? "Stop Video" : "Start Video"}
          off={!isCameraEnabled}
          onClick={onToggleCamera}
          disabled={!localStreamReady}
        >
          <CameraIcon off={!isCameraEnabled} />
        </ControlButton>
        <ControlButton
          label={isScreenSharing ? "Stop Share" : "Share Screen"}
          active={isScreenSharing}
          onClick={onScreenShare}
          disabled={!localStreamReady}
        >
          <ScreenShareIcon />
        </ControlButton>
      </div>

      <div className="control-bar__group">
        <ControlButton label="React 👍" onClick={() => onReaction("👍")}>
          <span className="control-emoji">👍</span>
        </ControlButton>
        <ControlButton label="React 👏" onClick={() => onReaction("👏")}>
          <span className="control-emoji">👏</span>
        </ControlButton>
        <ControlButton label="Raise Hand" onClick={onRaiseHand}>
          <HandIcon />
        </ControlButton>
        <ControlButton label="Chat" active={isChatOpen} onClick={onToggleChat}>
          <ChatIcon />
        </ControlButton>
      </div>

      <div className="control-bar__group">
        {recordingStatus === "recording" && (
          <span className="recording-badge" title="Recording">
            <span className="recording-dot" />
            REC
          </span>
        )}
        <ControlButton label="Leave" danger onClick={onLeave}>
          <LeaveIcon />
        </ControlButton>
      </div>
    </footer>
  );
}

export default ControlBar;
