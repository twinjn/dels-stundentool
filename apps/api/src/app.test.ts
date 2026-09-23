import request from "supertest";
import { describe, expect, test } from "vitest";
import { baueApp } from "./app.js";

const app = baueApp();

describe("API-Grundgeruest", () => {
  test("Health-Route antwortet ohne Login", async () => {
    const antwort = await request(app).get("/api/health");
    expect(antwort.status).toBe(200);
    expect(antwort.body.status).toBe("ok");
  });

  test("unbekannte Route gibt 404 mit sauberer Struktur", async () => {
    const antwort = await request(app).get("/api/gibtsnicht");
    expect(antwort.status).toBe(404);
    expect(antwort.body.code).toBe("route_unbekannt");
  });

  test("verraet nicht, dass Express läuft", async () => {
    const antwort = await request(app).get("/api/health");
    expect(antwort.headers["x-powered-by"]).toBeUndefined();
  });
});
