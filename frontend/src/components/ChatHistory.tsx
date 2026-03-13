import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChatContext } from '../contexts/ChatContext';
import { API_CONFIG } from '../config/api';
import type { ChatMessage } from '../types/api';
import './ChatHistory.css';

interface ChatHistoryProps {
    sessionId: string;
    onClose?: () => void;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ sessionId, onClose }) => {
    const { token: authToken } = useAuth();
    const { updateMessages } = useChatContext();
    const [history, setHistory] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [nextToken, setNextToken] = useState<string | undefined>();
    const [hasMore, setHasMore] = useState(true);

    useEffect(() => {
        loadHistory();
    }, [sessionId]);

    const loadHistory = async (paginationToken?: string) => {
        if (paginationToken && !hasMore) return;

        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                sessionId,
                limit: '50'
            });

            if (paginationToken) {
                params.append('nextToken', paginationToken);
            }

            const response = await fetch(
                `${API_CONFIG.apiUrl}${API_CONFIG.endpoints.chat.history}?${params}`,
                {
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to load chat history: ${response.statusText}`);
            }

            const data = await response.json();

            setHistory(prev => paginationToken ? [...prev, ...data.messages] : data.messages);
            setNextToken(data.nextToken);
            setHasMore(!!data.nextToken);
        } catch (err) {
            console.error('Error loading chat history:', err);
            setError(err instanceof Error ? err.message : 'Failed to load chat history');
        } finally {
            setLoading(false);
        }
    };

    const loadMore = () => {
        if (nextToken && !loading) {
            loadHistory(nextToken);
        }
    };

    const loadHistoryIntoChat = () => {
        updateMessages(history);
        if (onClose) {
            onClose();
        }
    };

    const formatTimestamp = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString();
    };

    return (
        <div className="chat-history-panel">
            <div className="chat-history-header">
                <h2>Chat History</h2>
                {onClose && (
                    <button
                        className="close-button"
                        onClick={onClose}
                        aria-label="Close history"
                    >
                        ×
                    </button>
                )}
            </div>

            {error && (
                <div className="history-error">
                    <p>{error}</p>
                    <button onClick={() => loadHistory()}>Retry</button>
                </div>
            )}

            {loading && history.length === 0 ? (
                <div className="history-loading">
                    <div className="spinner"></div>
                    <p>Loading history...</p>
                </div>
            ) : history.length === 0 ? (
                <div className="history-empty">
                    <p>No chat history found for this session.</p>
                </div>
            ) : (
                <>
                    <div className="history-actions">
                        <button
                            className="load-history-button"
                            onClick={loadHistoryIntoChat}
                        >
                            Load History into Chat
                        </button>
                    </div>

                    <div className="history-messages">
                        {history.map((message, index) => (
                            <div
                                key={message.messageId || index}
                                className={`history-message ${message.role}`}
                            >
                                <div className="history-message-header">
                                    <span className="history-message-role">
                                        {message.role === 'user' ? 'You' : 'Assistant'}
                                    </span>
                                    <span className="history-message-time">
                                        {formatTimestamp(message.timestamp)}
                                    </span>
                                </div>
                                <div className="history-message-content">
                                    {message.content}
                                </div>
                            </div>
                        ))}
                    </div>

                    {hasMore && (
                        <div className="history-load-more">
                            <button
                                onClick={loadMore}
                                disabled={loading}
                            >
                                {loading ? 'Loading...' : 'Load More'}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ChatHistory;
