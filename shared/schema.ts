import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  integer,
  decimal,
  boolean,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const visit_logs = pgTable("visit_logs", {
  date: date("date").primaryKey(),
  count: integer("count").default(0),
});

// User storage table for custom authentication
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 50 }).unique().notNull(),
  email: varchar("email").unique().notNull(),
  password: varchar("password").notNull(), // Will store hashed passwords
  role: varchar("role", { length: 50 }).default("user").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  
});

// Parking spots table
export const parkingSpots = pgTable("parking_spots", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  pricePerHour: integer("price_per_hour").default(30),
  description: text("description"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// 子車格表格
export const parkingSubSpots = pgTable("parking_sub_spots", {
  id: serial("id").primaryKey(),
  spotId: integer("spot_id")
  .notNull()
  .references(() => parkingSpots.id),
  label: varchar("label", { length: 10 }).notNull(), // 例如 A01, A02
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  coords: jsonb("coords").$type<{ lat: number; lng: number }[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// 型別
export type ParkingSubSpot = typeof parkingSubSpots.$inferSelect;
export type InsertParkingSubSpot = typeof parkingSubSpots.$inferInsert;

// 驗證用 schema
export const insertParkingSubSpotSchema = createInsertSchema(parkingSubSpots).omit({
  id: true,
  createdAt: true,
});


// User favorites table
export const userFavorites = pgTable("user_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  parkingSpotId: integer("parking_spot_id").notNull().references(() => parkingSpots.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Image uploads table
export const imageUploads = pgTable("image_uploads", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  location: text("location"),
  description: text("description"),
  processed: boolean("processed").default(false),
  status: varchar("status", { enum: ["uploaded", "processing", "completed", "failed"] }).default("uploaded"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Contact messages table
export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  adminReply: text("admin_reply"),
  isReplied: boolean("is_replied").default(false),
  repliedAt: timestamp("replied_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Admin users table
export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 50 }).unique().notNull(),
  password: varchar("password", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  role: varchar("role", { length: 50 }).default("admin").notNull(),
  isActive: boolean("is_active").default(true),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
});

// User notifications table - for system replies to users
export const userNotifications = pgTable("user_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).default("info").notNull(), // info, success, warning, error
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Schema types
export type InsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export type ParkingSpot = typeof parkingSpots.$inferSelect;
export type InsertParkingSpot = typeof parkingSpots.$inferInsert;

export type UserFavorite = typeof userFavorites.$inferSelect;
export type InsertUserFavorite = typeof userFavorites.$inferInsert;

export type ImageUpload = typeof imageUploads.$inferSelect;
export type InsertImageUpload = typeof imageUploads.$inferInsert;

export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = typeof contactMessages.$inferInsert;

export type Admin = typeof admins.$inferSelect;
export type InsertAdmin = typeof admins.$inferInsert;

export type UserNotification = typeof userNotifications.$inferSelect;
export type InsertUserNotification = typeof userNotifications.$inferInsert;

// Zod schemas
export const insertParkingSpotSchema = createInsertSchema(parkingSpots).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});

export const insertUserFavoriteSchema = createInsertSchema(userFavorites).omit({
  id: true,
  createdAt: true,
});

export const insertImageUploadSchema = createInsertSchema(imageUploads).omit({
  id: true,
  createdAt: true,
});

export const insertContactMessageSchema = createInsertSchema(contactMessages).omit({
  id: true,
  createdAt: true,
  adminReply: true,
  isReplied: true,
  repliedAt: true,
});

export const insertAdminSchema = createInsertSchema(admins).omit({
  id: true,
  createdAt: true,
  lastLogin: true,
});

// User authentication schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  password: z.string().min(6, "密碼至少需要6個字元"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(["user", "admin"]).default("user"),
});

export const loginSchema = z.object({
  username: z.string().min(1, "請輸入使用者名稱"),
  password: z.string().min(1, "請輸入密碼"),
});

export const adminLoginSchema = z.object({
  username: z.string().min(1, "請輸入管理員帳號"),
  password: z.string().min(6, "密碼至少需要 6 個字元"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "請輸入當前密碼"),
  newPassword: z.string().min(6, "新密碼至少6位數"),
  confirmPassword: z.string().min(1, "請確認新密碼"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "新密碼確認不符",
  path: ["confirmPassword"],
});

export const insertUserNotificationSchema = createInsertSchema(userNotifications).omit({
  id: true,
  createdAt: true,
});