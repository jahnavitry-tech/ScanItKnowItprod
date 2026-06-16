import fs from "fs";
import path from "path";

// ── Log file setup ────────────────────────────────────────────────────────────
const LOG_DIR  = path.resolve(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, `dev-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.log`);

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });

function ts() {
  return new Date().toISOString();
}

function write(level: string, ...args: any[]) {
  const line = `[${ts()}] [${level}] ${args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")}\n`;
  process.stdout.write(line);
  logStream.write(line);
}

export const logger = {
  info:  (...a: any[]) => write("INFO ", ...a),
  warn:  (...a: any[]) => write("WARN ", ...a),
  error: (...a: any[]) => write("ERROR", ...a),
  debug: (...a: any[]) => write("DEBUG", ...a),
  api:   (method: string, path: string, status: number, ms: number, body?: any) => {
    const tag = status >= 500 ? "ERROR" : status >= 400 ? "WARN " : "API  ";
    const extra = body && status >= 400 ? ` :: ${JSON.stringify(body).slice(0, 200)}` : "";
    write(tag, `${method} ${path} → ${status} (${ms}ms)${extra}`);
  },
  filePath: () => LOG_FILE,
};

// Patch console.* so all third-party logging also lands in the file
const _log   = console.log.bind(console);
const _warn  = console.warn.bind(console);
const _error = console.error.bind(console);

console.log   = (...a) => { const line = `[${ts()}] [INFO ] ${a.map(String).join(" ")}\n`; logStream.write(line); _log(...a); };
console.warn  = (...a) => { const line = `[${ts()}] [WARN ] ${a.map(String).join(" ")}\n`; logStream.write(line); _warn(...a); };
console.error = (...a) => { const line = `[${ts()}] [ERROR] ${a.map(String).join(" ")}\n`; logStream.write(line); _error(...a); };
