import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import IORedis from "ioredis";
import jwt from "jsonwebtoken";
import { config, getAllowedOrigins } from "@qanoai/config";
import { prisma } from "@qanoai/database";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: getAllowedOrigins(), credentials: true },
});

// Setup Redis Adapter for multi-node / microservices broadcasting
const pubClient = config.REDIS_DISABLED ? null : new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
const subClient = pubClient ? pubClient.duplicate() : null;
if (pubClient && subClient) {
  io.adapter(createAdapter(pubClient, subClient));
} else {
  console.log("Realtime Redis adapter disabled by REDIS_DISABLED=true");
}

interface TokenPayload {
  sub?: string;
  userId: string;
  organizationId?: string;
  role?: string;
}

// 1. Authentication Middleware
io.use(async (socket, next) => {
  // auth.token ONLY. The query-string branch put a bearer token in the URL,
  // where it lands in proxy logs, browser history and Referer headers. The web
  // client already sends it via `auth`, so nothing needed the query form.
  const token = socket.handshake.auth?.token;

  if (!token || typeof token !== "string") {
    return next(new Error("AUTHENTICATION_REQUIRED"));
  }

  try {
    const decoded = jwt.verify(token, config.AUTH_SECRET) as TokenPayload;
    const userId = decoded.userId || decoded.sub;
    if (!userId) return next(new Error("INVALID_TOKEN"));

    // A token minted for the 2FA step must not open a socket.
    if ((decoded as any).typ === "mfa_pending") return next(new Error("MFA_REQUIRED"));

    // The session row is what makes a token revocable. Without this a socket
    // opened before logout kept streaming that organization's messages for the
    // token's full lifetime.
    const jti = (decoded as any).jti;
    if (!jti) return next(new Error("INVALID_TOKEN"));
    const session = await prisma.session.findUnique({
      where: { token: jti },
      select: { userId: true, expiresAt: true },
    });
    if (!session || session.userId !== userId || session.expiresAt <= new Date()) {
      return next(new Error("SESSION_REVOKED"));
    }

    const user = await prisma.user.findFirst({
      // deletedAt: null — a removed user could still hold an open socket.
      where: { id: userId, deletedAt: null },
      include: { memberships: { include: { role: true } } },
    });

    if (!user || user.status !== "ACTIVE") return next(new Error("USER_INACTIVE"));

    const activeMemberships = user.memberships.filter((membership: any) => membership.status === "ACTIVE");

    // An explicit organization is required when the user belongs to more than
    // one. Silently taking the first is how a socket ends up subscribed to the
    // wrong tenant's room.
    const requestedOrgId = decoded.organizationId || socket.handshake.auth?.organizationId;
    let membership;
    if (requestedOrgId) {
      membership = activeMemberships.find((item: any) => item.organizationId === requestedOrgId);
      if (!membership) return next(new Error("ORGANIZATION_ACCESS_DENIED"));
    } else if (activeMemberships.length === 1) {
      membership = activeMemberships[0];
    } else if (activeMemberships.length === 0) {
      return next(new Error("ORGANIZATION_ACCESS_DENIED"));
    } else {
      return next(new Error("ORGANIZATION_REQUIRED"));
    }

    socket.data = {
      userId,
      organizationId: membership.organizationId,
      role: membership.role.name
    };
    
    next();
  } catch (err) {
    return next(new Error("INVALID_TOKEN"));
  }
});

// 2. Connection Handling
io.on("connection", (socket: Socket) => {
  const { userId, organizationId, role } = socket.data;
  console.log(`[+] Client connected: ${socket.id} | User: ${userId} | Org: ${organizationId}`);

  // 3. Auto-join organization room
  const orgRoom = `org:${organizationId}`;
  socket.join(orgRoom);
  console.log(`Socket ${socket.id} auto-joined ${orgRoom}`);

  // Broadcast presence online (only to same org)
  socket.to(orgRoom).emit("presence", { userId, status: "ONLINE" });

  // 4. Conversation Rooms Management
  socket.on("join-conversation", async (conversationId: string) => {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { id: true },
    });

    if (!conversation) {
      socket.emit("error", { code: "CONVERSATION_ACCESS_DENIED" });
      return;
    }

    const convRoom = `conv:${conversationId}`;
    socket.join(convRoom);
    console.log(`Socket ${socket.id} joined ${convRoom}`);
  });

  socket.on("leave-conversation", (conversationId: string) => {
    const convRoom = `conv:${conversationId}`;
    socket.leave(convRoom);
    console.log(`Socket ${socket.id} left ${convRoom}`);
  });

  // 5. Typing Indicators
  socket.on("typing", (data: { conversationId: string; isTyping: boolean }) => {
    // Gated on actually being in the room. `socket.to(room).emit(...)` does not
    // require membership, so any authenticated socket could broadcast "someone
    // is typing" into ANY conversation room, in any organization, just by
    // naming the id — a cheap probe for which ids exist, and a way to put false
    // activity in front of another tenant's agents.
    const convRoom = `conv:${data?.conversationId}`;
    if (!data?.conversationId || !socket.rooms.has(convRoom)) return;

    socket.to(convRoom).emit("typing", {
      userId,
      isTyping: !!data.isTyping,
    });
  });

  // Disconnect Handling
  socket.on("disconnect", () => {
    console.log(`[-] Client disconnected: ${socket.id}`);
    io.to(orgRoom).emit("presence", { userId, status: "OFFLINE" });
  });
});

// 6. Global Broadcast Helpers (Used internally if other services call this node directly, 
// though with Redis Adapter they can just publish to Redis directly)
export function broadcastToOrganization(orgId: string, event: string, data: any) {
  io.to(`org:${orgId}`).emit(event, data);
}

export function broadcastToConversation(convId: string, event: string, data: any) {
  io.to(`conv:${convId}`).emit(event, data);
}

// Simple Health Check Endpoint
httpServer.on("request", (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
  }
});

const port = config.REALTIME_PORT || 3002;
httpServer.listen(port, () => {
  console.log(`🔌 Realtime WebSockets server running on port ${port}`);
});

// Graceful Shutdown
const shutdown = () => {
  console.log("Shutting down Realtime server...");
  io.close(() => {
    pubClient?.quit();
    subClient?.quit();
    console.log("Realtime server closed cleanly");
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
