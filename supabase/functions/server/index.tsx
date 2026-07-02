import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-432c3bf6/health", (c) => {
  return c.json({ status: "ok" });
});

// GET /data — load all workforce data
app.get("/make-server-432c3bf6/data", async (c) => {
  const data = await kv.get("workforce_data");
  return c.json({ data: data ?? null });
});

// POST /data — persist all workforce data
app.post("/make-server-432c3bf6/data", async (c) => {
  const body = await c.req.json();
  await kv.set("workforce_data", body);
  return c.json({ success: true });
});

Deno.serve(app.fetch);
