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
    ragChunks?: DocumentChunk[];
}

const Message: React.FC<MessageProps> = ({ message, ragChunks }) => {
    const [showCitations, setShowCitations] = useState(false);
    const isUser = message.role === 'user';

    // Calculate hasCitations from ragChunks prop
    const hasCitations = ragChunks && ragChunks.length > 0;

    console.log('=== Message Component Render ===');
    console.log('Message ID:', message.messageId);
    console.log('Role:', message.role);
    console.log('ragChunks prop:', ragChunks);
    console.log('ragChunks type:', typeof ragChunks);
    console.log('ragChunks is array:', Array.isArray(ragChunks));
    console.log('ragChunks length:', ragChunks?.length);
    console.log('hasCitations:', hasCitations);
    console.log('==============================');


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

            {/* Citations section */}
            {hasCitations && ragChunks && (
                <div className="message-footer">
                    <button
                        className="citations-toggle"
                        onClick={() => setShowCitations(!showCitations)}
                    >
                        {showCitations ? '▼' : '▶'} View Sources ({ragChunks.length})
                    </button>
                    {showCitations && renderCitations(ragChunks)}
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
