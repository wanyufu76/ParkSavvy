import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage.js";
import { User as SelectUser } from "../shared/schema.js";
import connectPg from "connect-pg-simple";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

/* ─────────────── 雜湊工具 ─────────────── */
const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

/* ─────────────── 角色驗證 Middleware ─────────────── */
export function requireRole(role: string) {
  return (req: any, res: any, next: any) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

/* ─────────────── 主函式 ─────────────── */
export function setupAuth(app: Express) {
  /* Session Store：明確指定 sessions 表，自動建表 */
  const PostgresSessionStore = connectPg(session);

  const sessionStore = new PostgresSessionStore({
    conString: process.env.DATABASE_URL,
    tableName: "sessions",         // ← 用複數
    createTableIfMissing: true,    // ← 第一次自動建
  });

  const isProd = process.env.NODE_ENV === "production";

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: isProd,              // 只有佈署 HTTPS 時才設 true
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
      sameSite: isProd ? "lax" : "strict",
    },
  };

  app.set("trust proxy", 1); // 如果有 reverse proxy（e.g. Vercel / Render）
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  /* ── LocalStrategy ── */
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "使用者名稱或密碼錯誤" });
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );

  /* ── serialize / deserialize ── */
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  /* ─────────────── Routes ─────────────── */
  /* 註冊 */
  app.post("/api/register", async (req, res, next) => {
    try {
      const { username, email, password, firstName, lastName } = req.body;

      // 1. 檢查是否重複
      if (await storage.getUserByUsername(username)) {
        return res.status(400).json({ message: "使用者名稱已存在" });
      }
      if (await storage.getUserByEmail(email)) {
        return res.status(400).json({ message: "電子信箱已被使用" });
      }

      // 2. 建立使用者
      const user = await storage.createUser({
        username,
        email,
        password: await hashPassword(password),
        firstName,
        lastName,
        role: "user",   // 預設註冊都是 user
      });

      // 3. 立即登入
      req.login(user as any, (err) => {
        if (err) return next(err);
        const { password: _pw, ...safeUser } = user;
        res.status(201).json(safeUser);
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "註冊失敗，請稍後再試" });
    }
  });

  /* 登入 */
  app.post("/api/login", passport.authenticate("local"), async (req, res) => {
  const { password: _pw, ...safeUser } = req.user!;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    const existing = await storage.getVisitLog(today);
    console.log("[DEBUG] getVisitLog 回傳：", existing);

    if (!existing) {
      await storage.insertVisitLog(today, 1);
      console.log("[DEBUG] insertVisitLog 完成");
    } else {
      await storage.updateVisitLog(today, existing.count + 1);
      console.log("[DEBUG] updateVisitLog 完成");
    }

    console.log("[LOG] 訪客紀錄更新完成");
  } catch (e) {
    console.error("更新訪客數錯誤", e);
  }

  res.status(200).json(safeUser);
});

  /* 登出 */
  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  /* 取得當前登入者資訊 */
  app.get("/api/user", (req, res) => {
    console.log(
      "GET /api/user - isAuthenticated:",
      req.isAuthenticated(),
      "sessionID:",
      req.sessionID
    );
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { password: _pw, ...safeUser } = req.user!;
    res.json(safeUser);
  });

  /* 測試用：只有 admin 才能存取 */
  app.get("/api/admin-only", requireRole("admin"), (req, res) => {
    res.json({ message: "Hello Admin!" });
  });
}
