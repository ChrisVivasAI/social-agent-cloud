"use client";

import { ChatContainer } from "@/components/chat/chat-container";

export default function ChatPage() {
  return (
    <div className="-m-6 flex flex-col" style={{ height: "calc(100vh - 3.5rem)" }}>
      <ChatContainer />
    </div>
  );
}
