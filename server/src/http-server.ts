import type { Socket } from "node:net"
import type { Server } from "node:http"

export function configureHttpServer(server: Server): void {
  server.headersTimeout = 10_000
  server.requestTimeout = 30_000
  server.keepAliveTimeout = 5_000
  server.maxRequestsPerSocket = 1_000
  server.setTimeout(30_000, (socket: Socket) => socket.destroy())
}
