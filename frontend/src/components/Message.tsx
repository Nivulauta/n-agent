/**
 * Message Component
 * 
 * Displays individual chat message with document citations for RAG responses.
 */

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, DocumentChunk } from '../types/api';
import './Message.css';

interface MessageProps {
    message: ChatMessage;
}

const Message: React.FC<MessageProps> = ({ message }) => {
    const [showCitations, setShowCitations] = useState(false);
    const isUser = message.role === 'user';
    const hasCitations = message.metadata?.retrievedChunks && message.metadata.retrievedChunks.length > 0;

    const formatTimestamp = (timestamp: number): string => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const renderCitations = (chunks: DocumentChunk[]) => {
        return (
            <div className="citations">
                <div className="citations-header">
                    <span className="citations-icon">📄</span>
                    <span className="citations-title">Sources ({chunks.length})</span>
                </div>
                <div className="citations-list">
                    {chunks.map((chunk, index) => (
                        <div key={chunk.chunkId || index} className="citation-item">
                            <div className="citation-header">
                                <span className="citation-number">[{index + 1}]</span>
                                <span className="citation-document">{chunk.documentName}</span>
                                <span className="citation-page">Page {chunk.pageNumber}</span>
                                {chunk.score && (
                                    <span className="citation-score" title="Relevance score">
                                        {(chunk.score * 100).toFixed(0)}%
                                    </span>
                                )}
                            </div>
                            <div className="citation-text">
                                {chunk.text}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className={`message ${isUser ? 'user' : 'assistant'}`}>
            <div className="message-header">
                <span className="message-role">
                    {isUser ? 'You' : 'Assistant'}
                </span>
                <span className="message-timestamp">
                    {formatTimestamp(message.timestamp)}
                </span>
            </div>

            <div className="message-content">
                {isUser ? (
                    message.content
                ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                    </ReactMarkdown>
                )}
            </div>

            {hasCitations && (
                <div className="message-footer">
                    <button
                        className="citations-toggle"
                        onClick={() => setShowCitations(!showCitations)}
                    >
                        {showCitations ? '▼' : '▶'} View Sources ({message.metadata!.retrievedChunks!.length})
                    </button>
                    {showCitations && renderCitations(message.metadata!.retrievedChunks!)}
                </div>
            )}

            {message.metadata?.cached && (
                <div className="message-badge cached">
                    ⚡ Cached
                </div>
            )}
        </div>
    );
};

export default Message;
