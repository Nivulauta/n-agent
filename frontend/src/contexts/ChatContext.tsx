import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { ChatMessage as APIChatMessage } from '../types/api';

// Re-export the API ChatMessage type
export type ChatMessage = APIChatMessage;

interface ChatState {
    messages: ChatMessage[];
    inputText: string;
    isConnected: boolean;
    isTyping: boolean;
    sessionId: string;
}

interface ChatContextType {
    chatState: ChatState;
    updateMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    addMessage: (message: ChatMessage) => void;
    updateInputText: (text: string) => void;
    setIsConnected: (connected: boolean) => void;
    setIsTyping: (typing: boolean) => void;
    clearMessages: () => void;
    setSessionId: (sessionId: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
    const [chatState, setChatState] = useState<ChatState>({
        messages: [],
        inputText: '',
        isConnected: false,
        isTyping: false,
        sessionId: `session-${Date.now()}`,
    });

    const updateMessages = (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
        if (typeof messages === 'function') {
            setChatState((prev) => ({ ...prev, messages: messages(prev.messages) }));
        } else {
            setChatState((prev) => ({ ...prev, messages }));
        }
    };

    const addMessage = (message: ChatMessage) => {
        setChatState((prev) => ({
            ...prev,
            messages: [...prev.messages, message],
        }));
    };

    const updateInputText = (text: string) => {
        setChatState((prev) => ({ ...prev, inputText: text }));
    };

    const setIsConnected = (connected: boolean) => {
        setChatState((prev) => ({ ...prev, isConnected: connected }));
    };

    const setIsTyping = (typing: boolean) => {
        setChatState((prev) => ({ ...prev, isTyping: typing }));
    };

    const clearMessages = () => {
        setChatState((prev) => ({ ...prev, messages: [] }));
    };

    const setSessionId = (sessionId: string) => {
        setChatState((prev) => ({ ...prev, sessionId }));
    };

    return (
        <ChatContext.Provider
            value={{
                chatState,
                updateMessages,
                addMessage,
                updateInputText,
                setIsConnected,
                setIsTyping,
                clearMessages,
                setSessionId,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
}

export function useChatContext() {
    const context = useContext(ChatContext);
    if (context === undefined) {
        throw new Error('useChatContext must be used within a ChatProvider');
    }
    return context;
}
