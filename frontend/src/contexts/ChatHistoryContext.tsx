import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface ChatHistoryContextType {
    isHistoryOpen: boolean;
    openHistory: () => void;
    closeHistory: () => void;
    toggleHistory: () => void;
}

const ChatHistoryContext = createContext<ChatHistoryContextType | undefined>(undefined);

export function ChatHistoryProvider({ children }: { children: ReactNode }) {
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    const openHistory = useCallback(() => {
        setIsHistoryOpen(true);
    }, []);

    const closeHistory = useCallback(() => {
        setIsHistoryOpen(false);
    }, []);

    const toggleHistory = useCallback(() => {
        setIsHistoryOpen(prev => !prev);
    }, []);

    return (
        <ChatHistoryContext.Provider
            value={{
                isHistoryOpen,
                openHistory,
                closeHistory,
                toggleHistory,
            }}
        >
            {children}
        </ChatHistoryContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChatHistory() {
    const context = useContext(ChatHistoryContext);
    if (context === undefined) {
        throw new Error('useChatHistory must be used within a ChatHistoryProvider');
    }
    return context;
}
