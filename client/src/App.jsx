import { useMemo, useState } from "react";
import VideoRoom from "./components/VideoRoom";

function App() {
  const [nameInput, setNameInput] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roomId, setRoomId] = useState("");

  const effectiveRoomId = useMemo(() => roomId.trim(), [roomId]);

  const handleJoin = (event) => {
    event.preventDefault();
    if (!roomInput.trim()) return;
    setDisplayName(nameInput.trim() || "Guest");
    setRoomId(roomInput.trim());
  };

  if (effectiveRoomId) {
    return (
      <VideoRoom
        roomId={effectiveRoomId}
        displayName={displayName}
        onLeave={() => setRoomId("")}
      />
    );
  }

  return (
    <main className="join-page">
      <section className="join-card">
        <div className="join-brand">
          <div className="join-logo" aria-hidden="true">
            MH
          </div>
          <div>
            <h1>Meet Hub</h1>
            <p>HD video meetings for your team</p>
          </div>
        </div>
        <form onSubmit={handleJoin} className="join-form">
          <label className="field">
            <span>Your name</span>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Alex"
              aria-label="Display name"
            />
          </label>
          <label className="field">
            <span>Meeting ID</span>
            <input
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="Enter room ID"
              aria-label="Room ID"
              required
            />
          </label>
          <button type="submit" className="btn-primary btn-join">
            Join meeting
          </button>
        </form>
        <p className="join-hint">Share the meeting ID with others to invite them.</p>
      </section>
    </main>
  );
}

export default App;
