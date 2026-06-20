import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.GEMINI_API_KEY || "";

const ai = new GoogleGenAI({ apiKey });
const chats = new Map();

const systemInstruction = `You are a professional and friendly Doctor Chatbot.

Your role is to assist users with general health-related questions, symptoms, wellness advice, medications, nutrition, fitness, and preventive care.

Guidelines:
- Respond politely, clearly, and empathetically.
- Act like a doctor speaking with a patient in a professional consultation.
- Provide detailed explanations, comprehensive health information, and complete advice. Do not provide overly brief responses.
- Ask relevant follow-up questions before giving suggestions when symptoms are unclear.
- Explain medical concepts in simple language that patients can understand.
- Provide general medical information only and do not claim to diagnose diseases with certainty.
- Encourage users to consult a licensed healthcare professional for diagnosis, treatment, emergencies, or serious medical conditions.
- If a user describes severe symptoms such as chest pain, difficulty breathing, signs of stroke, severe bleeding, or suicidal thoughts, advise seeking immediate medical attention or emergency services.
- Never prescribe controlled medications or provide unsafe medical instructions.
- Maintain a caring doctor-patient conversation style.`;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function getChat(sessionId) {
  const id =
    typeof sessionId === "string" && sessionId.trim()
      ? sessionId.trim()
      : randomUUID();

  if (!chats.has(id)) {
    chats.set(
      id,
      ai.chats.create({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction,
          maxOutputTokens: 2048,
          temperature: 0.7,
        },
      }),
    );
  }

  return { id, chat: chats.get(id) };
}

function getErrorMessage(error) {
  const message = error?.message || String(error);

  if (
    error?.status === 429 ||
    message.includes("quota") ||
    message.includes("Quota") ||
    message.includes("limit")
  ) {
    return "The medical AI service has reached its request limit. Please try again later or update the Gemini API key.";
  }

  if (error?.status === 503) {
    return "The medical AI service is busy right now. Please try again in a few moments.";
  }

  if ([400, 401, 403].includes(error?.status)) {
    return "The Gemini API key or request is not being accepted. Set a valid GEMINI_API_KEY environment variable and restart the server.";
  }

  return "The medical AI service could not answer right now. Please try again.";
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const decodedPath = decodeURIComponent(requestedPath);
  const filePath = normalize(join(publicDir, decodedPath));

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    const appPath = join(publicDir, "index.html");
    createReadStream(appPath).pipe(
      res.writeHead(200, { "Content-Type": mimeTypes[".html"] }),
    );
    return;
  }

  if (statSync(filePath).isDirectory()) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const extension = extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "MedAI", model: "gemini-2.5-flash" });
    return;
  }

  if (url.pathname === "/api/dashboard") {
    sendJson(res, 200, {
      user: "Guest User",
      stats: {
        consultations: 3,
        appointments: 0,
        reports: 2,
        prescriptions: 1,
      },
      vitals: [
        { label: "Blood Pressure", value: "120/80 mmHg" },
        { label: "Heart Rate", value: "72 bpm" },
        { label: "SpO2", value: "98%" },
      ],
      recommendations: [
        "Drink more water and stay hydrated based on your last chat symptom.",
        "Schedule a follow-up with Dr. Smith next week.",
        "Keep a symptom diary if fever, pain, or fatigue continues.",
      ],
    });
    return;
  }

  if (url.pathname === "/api/chat" && req.method === "POST") {
    let body;
    try {
      body = await readJson(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body." });
      return;
    }

    try {
      const message = String(body.message || "").trim();

      if (!message) {
        sendJson(res, 400, { error: "Please enter a symptom or medical question." });
        return;
      }

      const { id, chat } = getChat(body.sessionId);
      const response = await chat.sendMessage({ message });
      sendJson(res, 200, {
        sessionId: id,
        reply: response.text,
        disclaimer:
          "This AI gives general information only and is not a replacement for emergency care or a licensed clinician.",
      });
    } catch (error) {
      sendJson(res, 500, { error: getErrorMessage(error) });
    }
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "API route not found" });
    return;
  }

  serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`MedAI frontend and API running at http://localhost:${port}`);
});
