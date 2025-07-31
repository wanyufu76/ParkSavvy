import "express-session";

declare module "express-session" {
  interface SessionData {
    user: {
      id: number;
      email: string;
    };
  }
}
