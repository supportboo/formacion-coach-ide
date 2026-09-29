import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { newId } from "../src/util/id.js";
import { agentMessage, agentThread, feedback } from "../src/db/schema.js";
import { addMember, createCompany, createUser } from "../src/services/org.js";
import * as fb from "../src/services/feedback.js";
import { exportUserData, eraseUserData } from "../src/services/privacy.js";

const deps = { db, newId };

describe("feedback (integración contra Postgres)", () => {
  it("un voto por persona y respuesta (upsert), quitar el voto, bandeja por empresa y aviso al resolver", async () => {
    const orgA = await createCompany(deps, "ACME Feedback");
    const orgB = await createCompany(deps, "Beta Feedback");
    const ana = await createUser(deps, "Ana", `ana-${newId()}@t.local`);
    const beto = await createUser(deps, "Beto", `beto-${newId()}@t.local`);
    await addMember(deps, orgA, ana, "empleado");
    await addMember(deps, orgB, beto, "empleado");
    const threadId = newId(), msgId = newId();
    await db.insert(agentThread).values({ id: threadId, organizationId: orgA, userId: ana, role: "empleado" });
    await db.insert(agentMessage).values([
      { id: newId(), organizationId: orgA, threadId, sender: "user", content: "[instrucciones internas] ¿qué es un partner?", display: "¿qué es un partner?" },
      { id: msgId, organizationId: orgA, threadId, sender: "agent", content: "Un partner es…" },
    ]);
    const a = { orgId: orgA, userId: ana, role: "empleado" };

    await fb.rate(deps, a, fb.rateSchema.parse({ messageId: msgId, rating: "up" }));
    await fb.rate(deps, a, fb.rateSchema.parse({ messageId: msgId, rating: "down", reasons: ["dato_incorrecto"], comment: "no es así" }));
    let rows = await db.select().from(feedback).where(and(eq(feedback.organizationId, orgA), eq(feedback.userId, ana)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rating: "down", reasons: ["dato_incorrecto"], answerText: "Un partner es…", promptText: "¿qué es un partner?" });

    // Nadie valora mensajes de otra persona (ni de otra empresa).
    await expect(fb.rate(deps, { orgId: orgB, userId: beto, role: "empleado" }, fb.rateSchema.parse({ messageId: msgId, rating: "up" }))).rejects.toThrow();

    await fb.rate(deps, a, fb.rateSchema.parse({ messageId: msgId, rating: null }));
    rows = await db.select().from(feedback).where(and(eq(feedback.organizationId, orgA), eq(feedback.userId, ana)));
    expect(rows).toHaveLength(0);

    await fb.rate(deps, a, fb.rateSchema.parse({ ref: "roleplay:s1:1", rating: "down", reasons: ["voz"], answer: "hola", course: "outbound-sales" }));
    const { id } = await fb.submitGeneral(deps, a, { type: "sugerencia", text: "Más ejemplos de talleres" });
    await fb.submitGeneral(deps, { orgId: orgB, userId: beto, role: "empleado" }, { type: "error", text: "No carga el vídeo" });

    const inboxA = await fb.list(deps, {}, orgA);
    expect(inboxA.items.every((r) => r.organizationId === orgA)).toBe(true);
    expect(inboxA.items).toHaveLength(2);
    expect(inboxA.stats.topReasons).toEqual([{ reason: "voz", n: 1 }]);
    const byReason = await fb.list(deps, { reason: "voz" }, orgA);
    expect(byReason.items).toHaveLength(1);

    expect(await fb.notices(deps, a)).toEqual([]);
    await fb.setStatus(deps, id, "resuelto", "Añadidos 3 casos de taller", { userId: "sa", name: "Soporte" });
    const n = await fb.notices(deps, a);
    expect(n).toHaveLength(1);
    expect(n[0]!.note).toBe("Añadidos 3 casos de taller");
    expect(await fb.notices(deps, a)).toEqual([]); // se ve una vez

    const exp = await exportUserData(deps, orgA, ana);
    expect(exp.feedback).toHaveLength(2);
    await eraseUserData(deps, orgA, ana);
    expect(await db.select().from(feedback).where(eq(feedback.userId, ana))).toHaveLength(0);
  });
});
