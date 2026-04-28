import type { WsClientMessage, WsServerMessage } from '../types';

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = `${WS_PROTOCOL}//${window.location.host}`;
const MAX_RECONNECT_DELAY_MS = 30_000;

export type MessageHandler = (msg: WsServerMessage) => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private gameCode: string;
  private token: string;
  private handler: MessageHandler;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1_000;
  private shouldReconnect = false;

  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(gameCode: string, token: string, handler: MessageHandler) {
    this.gameCode = gameCode;
    this.token = token;
    this.handler = handler;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.openSocket();
  }

  private openSocket(): void {
    const url = `${WS_BASE}/ws/tables/${this.gameCode}?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1_000;
      this.pingInterval = setInterval(() => this.send({ type: 'ping' }), 30_000);
      this.onOpen?.();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as WsServerMessage;
        this.handler(msg);
      } catch {
        // ignore malformed frames
      }
    };

    this.ws.onclose = () => {
      this.clearPing();
      this.onClose?.();
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => {
          if (this.shouldReconnect) this.openSocket();
        }, this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      }
    };

    this.ws.onerror = () => {
      this.clearPing();
      // onclose fires after onerror, reconnect is handled there
    };
  }

  send(msg: WsClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearPing();
    this.clearReconnect();
    this.ws?.close();
    this.ws = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private clearPing(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
