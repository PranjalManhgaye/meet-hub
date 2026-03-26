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
        <h1>Zoom MVP</h1>
        <p>Join a room to start a video call.</p>
        <form onSubmit={handleJoin} className="join-form">
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Your name (optional)"
            aria-label="Display name"
          />
          <input
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            placeholder="Enter room ID"
            aria-label="Room ID"
          />
          <button type="submit">Join Room</button>
        </form>
      </section>
    </main>
  );
}

export default App;
