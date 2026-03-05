/**
 * Chat Component
 * 
 * Main chat interface that integrates ChatWindow, MessageInput, and WebSocket connection.
 * Implements optimistic UI updates and streaming response handling.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WebSocketManager } from '../utils/websocket';
import type { WebSocketConnectionState } from '../utils/websocket';
import { parseError } from '../utils/errorHandler';
import type {
    ChatMessage,
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

const Chat: React.FC<ChatProps> = ({ token, userId, sessionId, websocketUrl }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('disconnected');
    const [wsManager, setWsManager] = useState<WebSocketManager | null>(null);
    const currentMessageIdRef = useRef<string | null>(null);
    const currentRAGChunksRef = useRef<any[] | undefined>(undefined);
    const streamingContentRef = useRef<string>('');
    const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
    const [rateLimitError, setRateLimitError] = useState<number | null>(null);
    const [reconnectInfo, setReconnectInfo] = useState<{ attempt: number; maxAttempts: number; delay: number } | null>(null);

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

                // Show error if connection fails
                if (state === 'error') {
                    setError({
                        message: 'Failed to connect to chat server. The WebSocket API may not be deployed yet.',
                        retryable: true
                    });
                }
            },
            onReconnectAttempt: (attempt, maxAttempts, delay) => {
                console.log(`Reconnection attempt ${attempt}/${maxAttempts}, delay: ${delay}ms`);
                setReconnectInfo({ attempt, maxAttempts, delay });
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
        console.log('Current streaming state:', streamingContent ? `${streamingContent.length} chars` : 'EMPTY');
        console.log('Current streaming ref:', streamingContentRef.current ? `${streamingContentRef.current.length} chars` : 'EMPTY');
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

        if (isComplete) {
            console.log('Complete message received, adding to messages array');
            console.log('Current streaming content (state):', streamingContent?.length || 0);
            console.log('Current streaming content (ref):', streamingContentRef.current?.length || 0);
            console.log('Content from payload:', content?.substring(0, 50) || '(none)');
            console.log('Final RAG chunks:', currentRAGChunksRef.current);

            // Use content from payload (backend now sends full content in complete message)
            // Fall back to accumulated streaming content if payload is empty (for backwards compatibility)
            const finalContent = content || streamingContentRef.current || streamingContent || '';
            console.log('Final content length:', finalContent.length);
            console.log('Final content preview:', finalContent.substring(0, 100));

            // Don't add empty messages
            if (!finalContent && (!currentRAGChunksRef.current || currentRAGChunksRef.current.length === 0)) {
                console.warn('Skipping empty complete message');
                setStreamingContent('');
                setIsTyping(false);
                currentMessageIdRef.current = null;
                currentRAGChunksRef.current = undefined;
                streamingContentRef.current = '';
                return;
            }

            // Complete message received - add to messages array
            const completeMessage: ChatMessage = {
                messageId: messageId || `msg-${Date.now()}`,
                role: 'assistant',
                content: finalContent,
                timestamp: Date.now(),
                metadata: currentRAGChunksRef.current ? { retrievedChunks: currentRAGChunksRef.current } : undefined
            };

            console.log('Complete message object:', {
                messageId: completeMessage.messageId,
                contentLength: completeMessage.content.length,
                hasMetadata: !!completeMessage.metadata,
                hasRAGChunks: !!completeMessage.metadata?.retrievedChunks
            });

            // Add message to array
            setMessages(prev => {
                console.log('Adding complete message to array, current count:', prev.length);
                const newMessages = [...prev, completeMessage];
                console.log('New message count:', newMessages.length);
                console.log('Last message content length:', newMessages[newMessages.length - 1]?.content?.length || 0);
                return newMessages;
            });

            // Clear streaming state immediately (no setTimeout needed since we have the full content)
            console.log('Clearing streaming state');
            setStreamingContent('');
            setIsTyping(false);
            currentMessageIdRef.current = null;
            currentRAGChunksRef.current = undefined;
            streamingContentRef.current = '';
        } else {
            // Streaming token - update streaming content
            if (content) {
                console.log('Streaming update - content length:', content.length);
                console.log('Content preview:', content.substring(0, 100));
                console.log('Current messageId:', messageId, 'Previous messageId (ref):', currentMessageIdRef.current);

                // Set the message ID on first chunk
                if (!currentMessageIdRef.current && messageId) {
                    console.log('Setting initial message ID:', messageId);
                    currentMessageIdRef.current = messageId;
                }

                // Backend sends full accumulated content each time, so just replace
                console.log('Updating streaming content (backend sends full content)');
                setStreamingContent(content);
                streamingContentRef.current = content; // Also store in ref
                setIsTyping(false);
            } else if (retrievedChunks && retrievedChunks.length > 0) {
                // Message has RAG chunks but no content - keep showing streaming state
                console.log('Streaming message with RAG chunks but no content yet');
                setIsTyping(false);
            } else {
                console.log('No content in streaming message');
            }
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
        setStreamingContent('');
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
                isTyping={isTyping}
                streamingContent={streamingContent}
                streamingRAGChunks={currentRAGChunksRef.current}
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

