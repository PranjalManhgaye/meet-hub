function ChatSidebar({
  isOpen,
  onClose,
  chatMessages,
  chatInput,
  onChatInputChange,
  onSendMessage,
  isHost,
  waitingUsers,
  onApproveUser,
  onRejectUser,
  hands,
  captions,
  captionInput,
  onCaptionInputChange,
  onPushCaption,
}) {
  if (!isOpen) return null;

  return (
    <aside className="chat-sidebar" aria-label="Chat panel">
      <header className="chat-sidebar__header">
        <h3>Chat</h3>
        <button type="button" className="chat-sidebar__close" onClick={onClose} aria-label="Close chat">
          ×
        </button>
      </header>

      {isHost && waitingUsers.length > 0 && (
        <section className="chat-sidebar__section">
          <h4>Waiting room</h4>
          {waitingUsers.map((user) => (
            <div key={user.socketId} className="waiting-user">
              <span>{user.displayName}</span>
              <div className="waiting-user__actions">
                <button type="button" onClick={() => onApproveUser(user.socketId)}>
                  Admit
                </button>
                <button type="button" className="btn-ghost" onClick={() => onRejectUser(user.socketId)}>
                  Deny
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {hands.length > 0 && (
        <section className="chat-sidebar__section">
          <h4>Raised hands</h4>
          <p className="hands-list">{hands.slice(-8).map((h) => h.displayName).join(", ")}</p>
        </section>
      )}

      <div className="chat-sidebar__messages">
        {chatMessages.length === 0 ? (
          <p className="chat-empty">No messages yet. Say hello!</p>
        ) : (
          chatMessages.map((message, idx) => (
            <div key={`${message.ts || idx}-${idx}`} className="chat-message">
              <span className="chat-message__author">{message.displayName || "Guest"}</span>
              <span className="chat-message__text">{message.text}</span>
            </div>
          ))
        )}
      </div>

      {captions.length > 0 && (
        <section className="chat-sidebar__section chat-sidebar__captions">
          <h4>Captions</h4>
          {captions.slice(-4).map((c, idx) => (
            <p key={`${c.ts || idx}`}>{c.text}</p>
          ))}
        </section>
      )}

      <form
        className="chat-sidebar__form"
        onSubmit={(e) => {
          e.preventDefault();
          onSendMessage();
        }}
      >
        <input
          value={chatInput}
          onChange={(e) => onChatInputChange(e.target.value)}
          placeholder="Type a message..."
          aria-label="Chat message"
        />
        <button type="submit">Send</button>
      </form>

      <form
        className="chat-sidebar__form chat-sidebar__form--caption"
        onSubmit={(e) => {
          e.preventDefault();
          onPushCaption();
        }}
      >
        <input
          value={captionInput}
          onChange={(e) => onCaptionInputChange(e.target.value)}
          placeholder="Add caption..."
          aria-label="Caption"
        />
        <button type="submit">Caption</button>
      </form>
    </aside>
  );
}

export default ChatSidebar;
