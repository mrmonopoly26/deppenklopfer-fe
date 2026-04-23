import type { WsClientMessage, WsServerMessage } from '../types';

const WS_BASE = `ws://${window.location.host}`;

export type MessageHandler = (msg: WsServerMessage) => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private gameCode: string;
  private token: string;
  private handler: MessageHandler;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(gameCode: string, token: string, handler: MessageHandler) {
    this.gameCode = gameCode;
    this.token = token;
    this.handler = handler;
  }

  connect(): void {
    const url = `${WS_BASE}/ws/tables/${this.gameCode}?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.pingInterval = setInterval(() => this.send({ type: 'ping' }), 30_000);
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
    };

    this.ws.onerror = () => {
      this.clearPing();
    };
  }

  send(msg: WsClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    this.clearPing();
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
}
