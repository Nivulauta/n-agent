/**
 * Chat Component
 * 
 * Main chat interface that integrates ChatWindow, MessageInput, and WebSocket connection.
 * Implements optimistic UI updates and streaming response handling.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { WebSocketManager } from '../utils/websocket';
import type { WebSocketConnectionState } from '../utils/websocket';
import { parseError } from '../utils/errorHandler';
import type {
    ChatMessage,
    DocumentChunk,
    WebSocketMessage,
    ChatResponseMessage,
    TypingIndicatorMessage,
    ErrorMessage as ErrorMessageType
} from '../types/api';
import ChatWindow from './ChatWindow';
import MessageInput from './MessageInput';
import ConnectionStatus from './ConnectionStatus';
import ErrorMessage from './ErrorMessage';
import RateLimitError from './RateLimitError';
import './Chat.css';

interface ChatProps {
    token: string;
    userId: string;
    sessionId: string;
    websocketUrl: string;
}

const Chat: React.FC<ChatProps> = ({ token, userId: _userId, sessionId, websocketUrl }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [messageRAGChunks, setMessageRAGChunks] = useState<Record<string, DocumentChunk[]>>({});
    const [isTyping, setIsTyping] = useState(false);
    const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('disconnected');
    const [wsManager, setWsManager] = useState<WebSocketManager | null>(null);
    const currentMessageIdRef = useRef<string | null>(null);
    const currentRAGChunksRef = useRef<any[] | undefined>(undefined);
    const streamingMessageIndexRef = useRef<number | null>(null);
    const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
    const [rateLimitError, setRateLimitError] = useState<number | null>(null);
    const [reconnectInfo, setReconnectInfo] = useState<{ attempt: number; maxAttempts: number; delay: number } | null>(null);

    // Debug: Monitor messageRAGChunks state changes
    useEffect(() => {
        console.log('=== messageRAGChunks STATE CHANGED ===');
        console.log('New state:', messageRAGChunks);
        console.log('Keys:', Object.keys(messageRAGChunks));
        console.log('Values:', Object.values(messageRAGChunks));
        console.log('====================================');
    }, [messageRAGChunks]);

    // Initialize WebSocket connection
    useEffect(() => {
        console.log('WebSocket useEffect triggered');
        console.log('Initializing WebSocket connection to:', websocketUrl);
        console.log('Token value:', token);
        console.log('Token length:', token?.length);

        // Verify token is fresh from localStorage
        const storedToken = localStorage.getItem('chatbot_session_token');
        if (storedToken) {
            const parsed = JSON.parse(storedToken);
            console.log('Token from localStorage:', parsed.token.substring(0, 20) + '...');
            console.log('Token from prop:', token?.substring(0, 20) + '...');
            console.log('Tokens match:', parsed.token === token);
        }

        const manager = new WebSocketManager({
            url: websocketUrl,
            token,
            onMessage: handleWebSocketMessage,
            onStateChange: (state) => {
                console.log('WebSocket state changed to:', state);
                setConnectionState(state);

                // Clear error when connection succeeds
                if (state === 'connected') {
                    setError(null);
                    setReconnectInfo(null);
                }

                // Don't show error on initial connection failure - let auto-retry handle it
                // Only show error if we're in error state and have exhausted retries
                if (state === 'error') {
                    // Error will be shown via reconnectInfo if retries are exhausted
                    console.log('WebSocket error state - auto-retry will attempt reconnection');
                }
            },
            onReconnectAttempt: (attempt, maxAttempts, delay) => {
                console.log(`Reconnection attempt ${attempt}/${maxAttempts}, delay: ${delay}ms`);
                setReconnectInfo({ attempt, maxAttempts, delay });

                // Only show error if we've exhausted all retry attempts
                if (attempt >= maxAttempts) {
                    setError({
                        message: 'Failed to connect to chat server after multiple attempts. Please check your connection and try again.',
                        retryable: true
                    });
                }
            }
        });

        manager.connect();
        setWsManager(manager);

        return () => {
            console.log('Cleaning up WebSocket connection');
            manager.disconnect();
        };
    }, [websocketUrl, token]);

    // Handle incoming WebSocket messages
    const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
        console.log('Received WebSocket message:', message);

        try {
            switch (message.type) {
                case 'chat_response':
                    handleChatResponse(message as ChatResponseMessage);
                    break;
                case 'typing_indicator':
                    handleTypingIndicator(message as TypingIndicatorMessage);
                    break;
                case 'error':
                    handleError(message as ErrorMessageType);
                    break;
                default:
                    console.log('Unknown message type:', message);
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error, message);
        }
    }, []);

    // Handle chat response (streaming)
    const handleChatResponse = (message: ChatResponseMessage) => {
        // Add safety check for message.payload
        if (!message.payload) {
            console.error('Chat response missing payload:', message);
            return;
        }

        const { messageId, content, isComplete, retrievedChunks } = message.payload;

        // Log the received payload for debugging
        console.log('=== Chat Response Debug ===');
        console.log('Message ID:', messageId);
        console.log('Is Complete:', isComplete);
        console.log('Content from payload:', content ? `"${content.substring(0, 100)}..." (${content.length} chars)` : 'NULL/EMPTY');
        console.log('Has RAG chunks:', !!retrievedChunks, retrievedChunks?.length || 0);
        console.log('========================');

        // If we have retrieved chunks but no content, this might be a RAG context message
        if (retrievedChunks && retrievedChunks.length > 0 && !content) {
            console.log('Received RAG context with retrieved chunks:', retrievedChunks);
            // Store RAG chunks for the final message
            currentRAGChunksRef.current = retrievedChunks;
            // Show typing indicator while waiting for actual response
            setIsTyping(true);
            return;
        }

        // Store RAG chunks if present in any message
        if (retrievedChunks && retrievedChunks.length > 0) {
            console.log('Storing RAG chunks:', retrievedChunks.length);
            currentRAGChunksRef.current = retrievedChunks;
        }

        // First streaming chunk - add message to array immediately
        if (!currentMessageIdRef.current && messageId && content) {
            console.log('First streaming chunk - adding message to array');
            console.log('RAG chunks at first chunk:', currentRAGChunksRef.current);
            currentMessageIdRef.current = messageId;

            const newMessage: ChatMessage = {
                messageId,
                role: 'assistant',
                content: content,
                timestamp: Date.now(),
                isStreaming: true,
                metadata: currentRAGChunksRef.current ? { retrievedChunks: currentRAGChunksRef.current } : undefined
            };

            console.log('New message object:', {
                messageId: newMessage.messageId,
                hasMetadata: !!newMessage.metadata,
                chunksCount: newMessage.metadata?.retrievedChunks?.length || 0
            });

            setMessages(prev => {
                streamingMessageIndexRef.current = prev.length;
                return [...prev, newMessage];
            });
            setIsTyping(false);
            return;
        }

        // Subsequent streaming chunks - update message in place
        if (!isComplete && content && streamingMessageIndexRef.current !== null) {
            console.log('Updating streaming message in place');
            console.log('Current RAG chunks during update:', currentRAGChunksRef.current);
            setMessages(prev => {
                const updated = [...prev];
                const index = streamingMessageIndexRef.current!;
                if (updated[index]) {
                    // Preserve existing metadata and update with new RAG chunks if available
                    const existingMetadata = updated[index].metadata;
                    const newMetadata = currentRAGChunksRef.current
                        ? { ...existingMetadata, retrievedChunks: currentRAGChunksRef.current }
                        : existingMetadata;

                    console.log('Updating message metadata:', {
                        hadExistingMetadata: !!existingMetadata,
                        hasNewRAGChunks: !!currentRAGChunksRef.current,
                        finalMetadata: newMetadata
                    });

                    updated[index] = {
                        ...updated[index],
                        content: content,
                        metadata: newMetadata
                    };
                }
                return updated;
            });
            return;
        }

        // Complete message - finalize the streaming message
        if (isComplete) {
            console.log('=== COMPLETE MESSAGE HANDLER ===');
            console.log('Current RAG chunks:', currentRAGChunksRef.current);
            console.log('Current message ID:', currentMessageIdRef.current);
            const indexValue = streamingMessageIndexRef.current;
            console.log('streamingMessageIndexRef.current:', indexValue);

            const finalContent = content || '';

            if (indexValue !== null) {
                console.log('Path: Updating existing streaming message at index:', indexValue);

                // Store RAG chunks separately if they exist
                const hasRAGChunks = currentRAGChunksRef.current && currentRAGChunksRef.current.length > 0;
                const hasMessageId = currentMessageIdRef.current !== null;
                console.log('Has RAG chunks:', hasRAGChunks, 'Has message ID:', hasMessageId);

                if (hasRAGChunks && hasMessageId) {
                    const msgId = currentMessageIdRef.current!;
                    const chunks = currentRAGChunksRef.current!;
                    console.log('BEFORE setMessageRAGChunks - msgId:', msgId, 'chunks count:', chunks.length);

                    // Use flushSync to ensure RAG chunks are set BEFORE messages update
                    flushSync(() => {
                        setMessageRAGChunks(prev => {
                            console.log('INSIDE setMessageRAGChunks setter - prev state:', prev);
                            const newState = {
                                ...prev,
                                [msgId]: chunks
                            };
                            console.log('INSIDE setMessageRAGChunks setter - new state:', newState);
                            return newState;
                        });
                    });

                    console.log('AFTER setMessageRAGChunks call (flushed)');
                } else {
                    console.log('SKIPPING RAG chunks storage - hasRAGChunks:', hasRAGChunks, 'hasMessageId:', hasMessageId);
                }

                // Update existing streaming message to mark it as complete
                setMessages(prev => {
                    // Use map to create completely new array and objects
                    return prev.map((msg, idx) => {
                        if (idx !== indexValue) {
                            return msg; // Return unchanged messages as-is
                        }

                        console.log('Finalizing message:', msg.messageId);

                        // Return completely new message object
                        return {
                            messageId: msg.messageId,
                            role: msg.role,
                            content: finalContent || msg.content,
                            timestamp: msg.timestamp,
                            isStreaming: false
                        };
                    });
                });
            } else {
                // No streaming message exists, add complete message directly
                console.log('Path: No streaming message, adding complete message directly');
                console.log('Final content length:', finalContent.length);
                console.log('Has RAG chunks:', !!currentRAGChunksRef.current);

                if (finalContent || currentRAGChunksRef.current) {
                    const msgId = messageId || `msg-${Date.now()}`;

                    // Store RAG chunks separately if they exist
                    const hasRAGChunks = currentRAGChunksRef.current && currentRAGChunksRef.current.length > 0;
                    console.log('Has RAG chunks for new message:', hasRAGChunks);

                    if (hasRAGChunks) {
                        const chunks = currentRAGChunksRef.current!;
                        console.log('BEFORE setMessageRAGChunks (new msg) - msgId:', msgId, 'chunks count:', chunks.length);

                        // Use flushSync to ensure RAG chunks are set BEFORE messages update
                        flushSync(() => {
                            setMessageRAGChunks(prev => {
                                console.log('INSIDE setMessageRAGChunks setter (new msg) - prev state:', prev);
                                const newState = {
                                    ...prev,
                                    [msgId]: chunks
                                };
                                console.log('INSIDE setMessageRAGChunks setter (new msg) - new state:', newState);
                                return newState;
                            });
                        });

                        console.log('AFTER setMessageRAGChunks call (new msg, flushed)');
                    }

                    const completeMessage: ChatMessage = {
                        messageId: msgId,
                        role: 'assistant',
                        content: finalContent,
                        timestamp: Date.now()
                    };

                    console.log('Adding complete message:', msgId);
                    setMessages(prev => [...prev, completeMessage]);
                }
            }

            // Clear streaming state
            setIsTyping(false);
            currentMessageIdRef.current = null;
            currentRAGChunksRef.current = undefined;
            streamingMessageIndexRef.current = null;

            console.log('Finalized streaming message');
        }
    };

    // Handle typing indicator
    const handleTypingIndicator = (message: TypingIndicatorMessage) => {
        setIsTyping(message.payload.isTyping);
    };

    // Handle error messages
    const handleError = (message: ErrorMessageType) => {
        const appError = parseError(message.payload);

        // Check if it's a rate limit error
        if (appError.code === 'RATE_LIMIT_EXCEEDED' && appError.retryAfter) {
            setRateLimitError(appError.retryAfter);
            setError(null);
        } else {
            // Regular error
            setError({ message: appError.message, retryable: appError.retryable });
            setRateLimitError(null);
        }

        setIsTyping(false);
    };

    // Send message (optimistic UI update)
    const handleSendMessage = useCallback((content: string) => {
        if (!wsManager || connectionState !== 'connected') {
            setError({
                message: 'Cannot send message: Not connected to server',
                retryable: true
            });
            return;
        }

        // Clear any existing errors
        setError(null);
        setRateLimitError(null);

        // Generate temporary message ID
        const messageId = `temp-${Date.now()}`;

        // Optimistic UI update - display user message immediately
        const userMessage: ChatMessage = {
            messageId,
            role: 'user',
            content,
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, userMessage]);

        // Send message via WebSocket
        try {
            wsManager.send({
                action: 'chat_message',
                data: {
                    message: content,
                    sessionId
                }
            });

            // Show typing indicator
            setIsTyping(true);
        } catch (error) {
            console.error('Failed to send message:', error);
            setError({
                message: 'Failed to send message. Please try again.',
                retryable: true
            });
        }
    }, [wsManager, connectionState, sessionId]);

    return (
        <div className="chat-container">
            {/* Connection Status - shows when not connected */}
            {connectionState !== 'connected' && (
                <ConnectionStatus
                    state={connectionState}
                    reconnectAttempt={reconnectInfo?.attempt}
                    maxReconnectAttempts={reconnectInfo?.maxAttempts}
                    reconnectDelay={reconnectInfo?.delay}
                />
            )}

            {/* Rate Limit Error */}
            {rateLimitError && (
                <RateLimitError
                    retryAfterSeconds={rateLimitError}
                    onRetryAvailable={() => setRateLimitError(null)}
                    onDismiss={() => setRateLimitError(null)}
                />
            )}

            {/* General Error Messages */}
            {error && (
                <ErrorMessage
                    title="Error"
                    message={error.message}
                    severity="error"
                    retryable={error.retryable}
                    onRetry={() => {
                        setError(null);
                        // Optionally trigger reconnection if it's a connection error
                        if (connectionState !== 'connected' && wsManager) {
                            wsManager.connect();
                        }
                    }}
                    onDismiss={() => setError(null)}
                />
            )}

            <ChatWindow
                messages={messages}
                messageRAGChunks={messageRAGChunks}
                isTyping={isTyping}
                className="chat-window-flex"
            />

            <MessageInput
                onSendMessage={handleSendMessage}
                disabled={connectionState !== 'connected' || rateLimitError !== null}
                placeholder={
                    connectionState === 'connected'
                        ? rateLimitError
                            ? 'Rate limit exceeded. Please wait...'
                            : 'Type your message...'
                        : 'Connecting...'
                }
            />
        </div>
    );
};

export default Chat;

