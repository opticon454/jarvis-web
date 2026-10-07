"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useChat, WarmupState } from "@/hooks/useChat";
import { fetchNodes, NodeInfo } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ChatInput } from "@/components/chat/ChatInput";
import { QuickActions } from "@/components/chat/QuickActions";
import { RotateCw, ChevronDown, Loader2 } from "lucide-react";

function WarmupBadge({ state }: { state: WarmupState }) {
  if (state === "ready") return null;
  const labels: Record<WarmupState, string> = {
    idle: "Disconnected",
    loading_tools: "Loading tools...",
    warming_up: "Warming up...",
    ready: "",
  };
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
      <Loader2 className="h-3 w-3 animate-spin" />
      {labels[state]}
    </span>
  );
}

export default function ChatPage() {
  const { user, accessToken, householdId, loading: authLoading } = useAuth();
  const router = useRouter();
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const [showNodePicker, setShowNodePicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, isLoading, warmupState, sendMessage, clearConversation } = useChat({
    nodeId: selectedNode?.node_id ?? null,
    householdId,
    accessToken,
  });

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  // Load nodes (filtered to current household)
  useEffect(() => {
    if (!accessToken || !householdId) return;
    fetchNodes(accessToken).then((n) => {
      const filtered = n.filter((node) => node.household_id === householdId);
      setNodes(filtered);
      if (filtered.length > 0 && !selectedNode) setSelectedNode(filtered[0]);
      if (selectedNode && !filtered.some((node) => node.node_id === selectedNode.node_id)) {
        setSelectedNode(filtered[0] ?? null);
      }
    });
  }, [accessToken, householdId, selectedNode]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (authLoading || !user) return null;

  const nodeLabel = selectedNode
    ? `${selectedNode.room ?? "node"}${selectedNode.user ? ` (${selectedNode.user})` : ""}`
    : "Select a node";

  return (
    <div className="flex h-full">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b border-zinc-800 px-4">
          <div className="relative">
            <button
              onClick={() => setShowNodePicker(!showNodePicker)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              {nodeLabel}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {showNodePicker && nodes.length > 0 && (
              <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
                {nodes.map((node) => (
                  <button
                    key={node.node_id}
                    onClick={() => { setSelectedNode(node); setShowNodePicker(false); clearConversation(); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    <span className="font-medium">{node.room ?? "node"}</span>
                    {node.user && <span className="text-zinc-500">{node.user}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <WarmupBadge state={warmupState} />
            <button
              onClick={clearConversation}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              title="New conversation"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4">
          {messages.length === 0 ? (
            <QuickActions onSelect={sendMessage} />
          ) : (
            <div className="mx-auto max-w-2xl py-4">
              {messages.map((msg) => (
                <ChatBubble key={msg.id} message={msg} />
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="mx-auto w-full max-w-2xl">
          <ChatInput
            onSend={sendMessage}
            disabled={isLoading || !selectedNode || warmupState === "idle"}
          />
        </div>
      </div>
    </div>
  );
}
