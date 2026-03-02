import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import Groq from 'groq-sdk';

// ─── Load environment ─────────────────────────────────────────────────────────
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const groqApiKey = process.env.GROQ_API_KEY;
if (!groqApiKey) {
    throw new Error("GROQ_API_KEY not set in .env");
}

// ─── Groq client ──────────────────────────────────────────────────────────────
const groq = new Groq({ apiKey: groqApiKey });

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(cors({
    origin: [
        "http://localhost:3000",
        "http://localhost:8080",
        "https://medistics-ai-bot.vercel.app",
        "https://medistics-ai-learn.lovable.app",
        "https://medmacs.vercel.app",
        "https://medmacs.app"
    ]
}));

// ─── Load MCAT topics JSON ────────────────────────────────────────────────────
const topicsPath = path.join(__dirname, 'mcat_topics.json');
let topicData: any = {};

try {
    const rawData = fs.readFileSync(topicsPath, 'utf-8');
    topicData = JSON.parse(rawData);
} catch (err) {
    console.error("Could not load mcat_topics.json:", err);
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/test", (req: Request, res: Response) => {
    res.status(200).send("Node.js/TypeScript server is running.");
});

// ─── AI Test Generation ───────────────────────────────────────────────────────
app.post("/generate-ai-test", async (req: Request, res: Response) => {
    const { topic: topicKey, difficulty = "medium", count = 10, prompt: customPrompt } = req.body;

    if (!topicKey) return res.status(400).json({ error: "Topic key is required." });

    const info = topicData[topicKey];
    if (!info) {
        const valid = Object.keys(topicData).join(", ");
        return res.status(400).json({ error: `Unknown topic. Available keys: ${valid}` });
    }

    const questionCount = parseInt(count as string);
    if (isNaN(questionCount) || questionCount < 1 || questionCount > 20) {
        return res.status(400).json({ error: "count must be an integer between 1 and 20." });
    }

    const systemPrompt = `You are Dr. Ahroid, an MBBS Expert AI Bot. Generate multiple-choice tests at MBBS level on the specified topic.`;

    const userPrompt = `
    Topic: ${info.title || topicKey} (${info.subject || ""})
    Key concepts: ${(info.concepts || []).join(", ")}
    Learning objectives: ${(info.objectives || []).join(", ")}
    
    Generate a ${questionCount}-question test at ${difficulty} difficulty.
    For each question:
      • Provide exactly four options labeled A), B), C), D).
      • The “answer” field must exactly match one of those labels.
      • Include a brief 1–2 sentence “explanation”.
    
    Return ONLY JSON with this schema:
    { "questions": [ { "question": "...", "options": ["A)...", "B)...", "C)...", "D)..."], "answer": "A)...", "explanation": "..." } ] }
    ${customPrompt ? `\nAdditional instructions: ${customPrompt}` : ""}
  `;

    try {
        let response = await callGroq(systemPrompt, userPrompt);
        let parsed;

        try {
            parsed = JSON.parse(response);
        } catch (e) {
            // Retry logic if JSON is malformed
            const fixPrompt = `The JSON you returned is malformed. Please return ONLY corrected JSON:\n${response}`;
            response = await callGroq(systemPrompt, fixPrompt);
            parsed = JSON.parse(response);
        }

        res.status(200).json({ questions: parsed.questions });
    } catch (error: any) {
        res.status(500).json({ error: "Failed to generate valid JSON", details: error.message });
    }
});

// ─── Study Chat ───────────────────────────────────────────────────────────────
app.post("/study-chat", async (req: Request, res: Response) => {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: "Question is required." });

    const qLower = question.toLowerCase().trim();

    // Static triggers
    const greetings = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"];
    if (greetings.includes(qLower)) {
        return res.json({ answer: "👋 Hello! I'm Dr. Ahroid, your MBBS tutor. What concept can I help you with today?" });
    }

    if (qLower.includes("list topics") || qLower.includes("what topics")) {
        return res.json({ answer: "I can help you with any MBBS-related chapter: Anatomy, Physiology, Pathology, etc." });
    }

    const restricted = ["sports", "music", "politics", "movies"];
    if (restricted.some(word => qLower.includes(word))) {
        return res.json({ answer: "I’m your MBBS tutor focused on Medical topics. I’m not able to help with that topic." });
    }

    const systemPrompt = `
    You are Dr. Ahroid, expert MBBS tutor. Provide formulas with symbol definitions and concise MBBS-level answers.
    Creator: Dr. Muhammad Ameer Hamza (SMBBMC Karachi). Profession: Doctor at Lyari General Hospital.
    Vision: Accessible healthcare. Contact: https://instagram.com/ameerhamza.exe
  `;

    try {
        const answer = await callGroq(systemPrompt, question);
        res.status(200).json({ answer: answer.trim() });
    } catch (error) {
        res.status(500).json({ answer: "Sorry, I encountered an error generating your answer." });
    }
});

// ─── Helper: Groq API Call ────────────────────────────────────────────────────
async function callGroq(system: string, user: string) {
    const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
    });
    return completion.choices[0]?.message?.content || "";
}

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});