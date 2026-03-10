/**
 * ChatWindow Component
 * 
 * Displays chat message history with streaming responses and document citations.
 */

import React, { useEffect, useRef } from 'react';
import type { ChatMessage, DocumentChunk } from '../types/api';
import Message from './Message';
import TypingIndicator from './TypingIndicator';
import './ChatWindow.css';

interface ChatWindowProps {
    messages: ChatMessage[];
    messageRAGChunks: Record<string, DocumentChunk[]>;
    isTyping: boolean;
    className?: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
    messages,
    messageRAGChunks,
    isTyping,
    className = ''
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastMessageRef = useRef<HTMLDivElement>(null);
    const previousMessageCountRef = useRef(0);

    // Auto-scroll behavior when new messages arrive
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const messageCount = messages.length;
        const isNewMessage = messageCount > previousMessageCountRef.current;
        previousMessageCountRef.current = messageCount;

        if (isNewMessage && messageCount > 0) {
            const lastMessage = messages[messageCount - 1];

            // If the last message is from the user, scroll it to the top of the viewport
            // This ensures the assistant's response will be visible
            if (lastMessage.role === 'user') {
                lastMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                // For assistant messages, check if user is near bottom before scrolling
                const { scrollTop, scrollHeight, clientHeight } = container;
                const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

                if (isNearBottom) {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }
            }
        } else if (isTyping) {
            // When typing indicator appears, ensure it's visible
            const { scrollTop, scrollHeight, clientHeight } = container;
            const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

            if (isNearBottom) {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        }
    }, [messages, isTyping]);

    return (
        <div className={`chat-window ${className}`}>
            <div className="messages-container" ref={containerRef}>
                <div className="messages-list">
                    {messages.map((message, index) => {
                        const ragChunks = messageRAGChunks[message.messageId];
                        const isLastMessage = index === messages.length - 1;
                        return (
                            <div key={message.messageId} ref={isLastMessage ? lastMessageRef : null}>
                                <Message message={message} ragChunks={ragChunks} />
                            </div>
                        );
                    })}

                    {/* Show typing indicator while waiting for response */}
                    {isTyping && <TypingIndicator />}

                    <div ref={messagesEndRef} />
                </div>
            </div>
        </div>
    );
};

export default ChatWindow;
