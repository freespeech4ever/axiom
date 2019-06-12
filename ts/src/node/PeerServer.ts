import * as WebSocket from "ws";

import Peer from "../iso/Peer";
import Sequence from "../iso/Sequence";

// A PeerServer listens for websockets and exchanges enough information over them
// to construct a Peer connection.
export default class PeerServer {
  verbose: boolean;
  peerHandler: (Peer) => void;
  port: number;
  wss: WebSocket.Server;

  constructor(port: number, verbose: boolean) {
    this.port = port;
    this.verbose = verbose;
    this.peerHandler = null;

    this.wss = new WebSocket.Server({ port: port });
    this.wss.on("connection", ws => {
      let peer = new Peer({ verbose: verbose });

      peer.signals.forEach(data => {
        ws.send(JSON.stringify(data));
      });

      let incomingSignals = new Sequence<object>();
      ws.on("message", encoded => {
        try {
          let signal = JSON.parse(encoded);
          incomingSignals.push(signal);
        } catch (e) {
          console.log("websocket decoding error:", e);
        }
      });
      peer.connect(incomingSignals);

      if (this.peerHandler) {
        this.peerHandler(peer);
      }
    });
  }

  log(...args) {
    if (this.verbose) {
      console.log(...args);
    }
  }

  onPeer(callback: (Peer) => void) {
    if (this.peerHandler) {
      throw new Error("onPeer can only be called once");
    }
    this.peerHandler = callback;
  }
}
