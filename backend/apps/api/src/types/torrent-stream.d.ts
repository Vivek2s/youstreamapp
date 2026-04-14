declare module 'torrent-stream' {
  import { EventEmitter } from 'events';

  interface TorrentFile {
    name: string;
    path: string;
    length: number;
    select(): void;
    deselect(): void;
    createReadStream(opts?: { start?: number; end?: number }): NodeJS.ReadableStream;
  }

  interface TorrentSwarm {
    downloaded: number;
    downloadSpeed(): number;
  }

  interface TorrentEngine extends EventEmitter {
    files: TorrentFile[];
    swarm: TorrentSwarm;
    destroy(cb?: () => void): void;
    remove(keepPieces?: boolean, cb?: () => void): void;
    listen(port?: number, cb?: () => void): void;
    connect(addr: string): void;
    disconnect(addr: string): void;
  }

  interface TorrentStreamOptions {
    connections?: number;
    uploads?: number;
    tmp?: string;
    path?: string;
    verify?: boolean;
    dht?: boolean;
    tracker?: boolean;
    trackers?: string[];
  }

  function torrentStream(
    link: string | Buffer,
    opts?: TorrentStreamOptions,
    cb?: () => void
  ): TorrentEngine;

  export = torrentStream;
}
