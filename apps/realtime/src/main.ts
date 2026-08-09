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
const pubClient = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));

interface TokenPayload {
  sub?: string;
  userId: string;
  organizationId?: string;
  role?: string;
}

// 1. Authentication Middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  
  if (!token) {
    return next(new Error("AUTHENTICATION_REQUIRED"));
  }

  try {
    const decoded = jwt.verify(token, config.AUTH_SECRET) as TokenPayload;
    const userId = decoded.userId || decoded.sub;
    if (!userId) return next(new Error("INVALID_TOKEN"));

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { role: true } } },
    });

    if (!user || user.status !== "ACTIVE") return next(new Error("USER_INACTIVE"));

    const activeMemberships = user.memberships.filter((membership: any) => membership.status === "ACTIVE");
    const membership = decoded.organizationId
      ? activeMemberships.find((item: any) => item.organizationId === decoded.organizationId)
      : activeMemberships[0];

    if (!membership) return next(new Error("ORGANIZATION_ACCESS_DENIED"));

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
    socket.to(`conv:${data.conversationId}`).emit("typing", { 
      userId, 
      isTyping: data.isTyping 
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
    pubClient.quit();
    subClient.quit();
    console.log("Realtime server closed cleanly");
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
