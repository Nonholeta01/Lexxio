"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@/lib/chat";
import { getCurrentProfile } from "@/lib/auth";

export default function ChatPanel({ roomId, compact = false }: { roomId: string | null; compact?: boolean }) {
  const { messages, sendMessage } = useChat(roomId);
  const [input, setInput] = useState("");
  const [myId, setMyId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCurrentProfile().then((p) => setMyId(p?.id ?? null));
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
    setInput("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: compact ? "6px 8px" : "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: compact ? 3 : 5,
        }}
      >
        {messages.map((m) => {
          const isMine = m.sender_id === myId;
          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isMine ? "flex-end" : "flex-start",
              }}
            >
              {!isMine && (
                <span style={{ fontSize: compact ? 9 : 10, opacity: 0.45, marginBottom: 1, marginLeft: 4 }}>
                  {m.sender_nickname}
                </span>
              )}
              <div
                style={{
                  maxWidth: "85%",
                  padding: compact ? "3px 8px" : "5px 10px",
                  borderRadius: isMine ? "10px 10px 3px 10px" : "10px 10px 10px 3px",
                  background: isMine ? "rgba(224,48,74,0.85)" : "rgba(255,255,255,0.08)",
                  color: "#fff",
                  fontSize: compact ? 11 : 12,
                  lineHeight: 1.3,
                  wordBreak: "break-word",
                }}
              >
                {m.content}
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p style={{ fontSize: compact ? 10 : 12, opacity: 0.4 }}>아직 채팅이 없어요.</p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: 5,
          padding: compact ? 6 : 10,
          borderTop: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지 입력..."
          maxLength={300}
          style={{
            flex: 1,
            minWidth: 0,
            padding: compact ? "6px 8px" : "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.05)",
            color: "#fff",
            fontSize: compact ? 11 : 13,
            outline: "none",
          }}
        />
        <button
          type="submit"
          style={{
            padding: compact ? "0 10px" : "0 14px",
            borderRadius: 8,
            border: "none",
            background: "#e0304a",
            color: "#fff",
            fontWeight: 700,
            fontSize: compact ? 11 : 13,
          }}
        >
          전송
        </button>
      </form>
    </div>
  );
}
