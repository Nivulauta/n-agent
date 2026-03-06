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

    // Auto-scroll to bottom when new messages arrive (only if user is near bottom)
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

        if (isNearBottom) {
            // Use instant scroll to avoid blocking user interaction
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
        }
    }, [messages, isTyping]);

    return (
        <div className={`chat-window ${className}`}>
            <div className="messages-container" ref={containerRef}>
                <div className="messages-list">
                    {messages.map((message) => {
                        const ragChunks = messageRAGChunks[message.messageId];
                        return <Message key={message.messageId} message={message} ragChunks={ragChunks} />;
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
