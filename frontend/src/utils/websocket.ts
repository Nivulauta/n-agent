/**
 * WebSocket Utility
 * 
 * Manages WebSocket connections with automatic reconnection and exponential backoff.
 */

import type { WebSocketMessage } from '../types/api';

export type WebSocketConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSocketManagerOptions {
    url: string;
    token: string;
    onMessage: (message: WebSocketMessage) => void;
    onStateChange: (state: WebSocketConnectionState) => void;
    onReconnectAttempt?: (attempt: number, maxAttempts: number, delay: number) => void;
    maxReconnectAttempts?: number;
    reconnectDelays?: number[]; // Exponential backoff delays in ms
}

export class WebSocketManager {
    private ws: WebSocket | null = null;
    private url: string;
    private token: string;
    private onMessage: (message: WebSocketMessage) => void;
    private onStateChange: (state: WebSocketConnectionState) => void;
    private onReconnectAttempt?: (attempt: number, maxAttempts: number, delay: number) => void;
    private reconnectAttempts = 0;
    private maxReconnectAttempts: number;
    private reconnectDelays: number[];
    private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
    private intentionallyClosed = false;

    constructor(options: WebSocketManagerOptions) {
        this.url = options.url;
        this.token = options.token;
        this.onMessage = options.onMessage;
        this.onStateChange = options.onStateChange;
        this.onReconnectAttempt = options.onReconnectAttempt;
        this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
        this.reconnectDelays = options.reconnectDelays ?? [1000, 2000, 4000, 8000, 16000];
    }

    /**
     * Connect to WebSocket server
     */
    connect(): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            console.log('WebSocket already connected');
            return;
        }

        this.intentionallyClosed = false;
        this.onStateChange('connecting');

        // Log token details before encoding
        console.log('WebSocket connecting with token:');
        console.log('  Token length:', this.token.length);
        console.log('  Token first 50 chars:', this.token.substring(0, 50));
        console.log('  Token last 50 chars:', this.token.substring(this.token.length - 50));
        console.log('  Token contains dots:', this.token.split('.').length - 1);

        // Add token as query parameter for authentication
        const encodedToken = encodeURIComponent(this.token);
        console.log('  Encoded token length:', encodedToken.length);
        console.log('  Encoded token first 50 chars:', encodedToken.substring(0, 50));

        const wsUrl = `${this.url}?token=${encodedToken}`;
        console.log('  WebSocket URL length:', wsUrl.length);
        console.log('  WebSocket URL:', wsUrl.substring(0, 100) + '...');

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = this.handleOpen.bind(this);
        this.ws.onmessage = this.handleMessage.bind(this);
        this.ws.onerror = this.handleError.bind(this);
        this.ws.onclose = this.handleClose.bind(this);
    }

    /**
     * Disconnect from WebSocket server
     */
    disconnect(): void {
        this.intentionallyClosed = true;
        this.clearReconnectTimeout();
        this.clearKeepAlive();

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.onStateChange('disconnected');
    }

    /**
     * Send message to server
     */
    send(message: any): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.error('WebSocket is not connected');
            throw new Error('WebSocket is not connected');
        }
    }

    /**
     * Update the token and reconnect if necessary
     */
    updateToken(newToken: string): void {
        if (this.token === newToken) {
            console.log('Token unchanged, no reconnection needed');
            return;
        }

        console.log('Token updated, reconnecting WebSocket...');
        this.token = newToken;

        // Disconnect and reconnect with new token
        if (this.ws) {
            this.intentionallyClosed = false; // Allow reconnection
            this.disconnect();
            this.connect();
        }
    }

    /**
     * Get current connection state
     */
    getState(): WebSocketConnectionState {
        if (!this.ws) return 'disconnected';

        switch (this.ws.readyState) {
            case WebSocket.CONNECTING:
                return 'connecting';
            case WebSocket.OPEN:
                return 'connected';
            case WebSocket.CLOSING:
            case WebSocket.CLOSED:
                return 'disconnected';
            default:
                return 'disconnected';
        }
    }

    /**
     * Get current reconnection info
     */
    getReconnectInfo(): { attempt: number; maxAttempts: number } {
        return {
            attempt: this.reconnectAttempts,
            maxAttempts: this.maxReconnectAttempts
        };
    }

    private handleOpen(): void {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.onStateChange('connected');
        this.startKeepAlive();
    }

    private handleMessage(event: MessageEvent): void {
        try {
            console.log('Raw WebSocket message received:', event.data);
            const message = JSON.parse(event.data) as WebSocketMessage;
            console.log('Parsed WebSocket message:', message);
            this.onMessage(message);
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
            console.error('Raw message data:', event.data);
        }
    }

    private handleError(event: Event): void {
        console.error('WebSocket error event:', event);
        console.error('WebSocket readyState:', this.ws?.readyState);
        console.error('WebSocket URL:', this.url);
        this.onStateChange('error');
    }

    private handleClose(event: CloseEvent): void {
        console.log('WebSocket closed:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            intentionallyClosed: this.intentionallyClosed
        });

        // Log specific error codes
        if (event.code === 1006) {
            console.error('WebSocket closed abnormally (1006) - likely authentication failure (403)');
            console.error('Check: 1) Token is valid, 2) Token not expired, 3) Session exists in DynamoDB');
            console.error('This can happen immediately after login due to timing - retry should succeed');
        } else if (event.code === 1008) {
            console.error('WebSocket policy violation (1008) - authorization denied');
        } else if (event.code === 1011) {
            console.error('WebSocket server error (1011)');
        }

        this.clearKeepAlive();
        this.onStateChange('disconnected');

        // Attempt reconnection if not intentionally closed
        if (!this.intentionallyClosed && this.reconnectAttempts < this.maxReconnectAttempts) {
            // For authentication failures (1006) on first attempt, use shorter delay
            // This handles the race condition after login where session might not be ready yet
            if (event.code === 1006 && this.reconnectAttempts === 0) {
                console.log('First connection attempt failed with 1006 - retrying quickly (likely post-login timing issue)');
                this.scheduleReconnect(500); // 500ms for first retry after auth failure
            } else {
                this.scheduleReconnect();
            }
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
        }
    }

    private scheduleReconnect(customDelay?: number): void {
        this.clearReconnectTimeout();

        // Use custom delay if provided, otherwise use exponential backoff
        const delay = customDelay ?? (() => {
            const delayIndex = Math.min(this.reconnectAttempts, this.reconnectDelays.length - 1);
            return this.reconnectDelays[delayIndex];
        })();

        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

        // Notify about reconnection attempt
        if (this.onReconnectAttempt) {
            this.onReconnectAttempt(this.reconnectAttempts + 1, this.maxReconnectAttempts, delay);
        }

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }

    private clearReconnectTimeout(): void {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    }

    private startKeepAlive(): void {
        this.clearKeepAlive();

        // Send ping every 5 minutes to keep connection alive
        this.keepAliveInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.send({ action: 'ping' });
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    private clearKeepAlive(): void {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }
}
