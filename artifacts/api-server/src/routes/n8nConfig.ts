import { Router } from "express";
import { db } from "@workspace/db";
import { n8nConfigTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { UpdateN8nConfigBody } from "@workspace/api-zod";

export const n8nConfigRouter = Router();

n8nConfigRouter.get("/n8n/config", async (req, res): Promise<void> => {
  const [config] = await db
    .select()
    .from(n8nConfigTable)
    .orderBy(sql`${n8nConfigTable.id} desc`)
    .limit(1);

  res.json({
    webhookUrl: config?.webhookUrl ?? null,
    isConfigured: !!(config?.webhookUrl),
  });
});

n8nConfigRouter.put("/n8n/config", async (req, res): Promise<void> => {
  const parsed = UpdateN8nConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(n8nConfigTable)
    .orderBy(sql`${n8nConfigTable.id} desc`)
    .limit(1);

  let config;
  if (existing.length > 0) {
    const [updated] = await db
      .update(n8nConfigTable)
      .set({ webhookUrl: parsed.data.webhookUrl })
      .returning();
    config = updated;
  } else {
    const [inserted] = await db
      .insert(n8nConfigTable)
      .values({ webhookUrl: parsed.data.webhookUrl })
      .returning();
    config = inserted;
  }

  res.json({
    webhookUrl: config.webhookUrl ?? null,
    isConfigured: !!(config.webhookUrl),
  });
});
