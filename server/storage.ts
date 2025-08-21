import {
  users,
  parkingSpots,
  userFavorites,
  imageUploads,
  contactMessages,
  admins,
  userNotifications,
  visit_logs,
  type User,
  type InsertUser,
  type ParkingSpot,
  type InsertParkingSpot,
  type UserFavorite,
  type InsertUserFavorite,
  type ImageUpload,
  type InsertImageUpload,
  type ContactMessage,
  type InsertContactMessage,
  type Admin,
  type InsertAdmin,
  type UserNotification,
  type InsertUserNotification,
} from "../shared/schema.js";
import { db } from "./db.js";
import { eq, and, desc } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  //使用人次統計方法
  getVisitLog(date: string): Promise<{ date: string; count: number } | null>;
  insertVisitLog(date: string, count: number): Promise<void>;
  updateVisitLog(date: string, count: number): Promise<void>;

  // User operations for custom authentication
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Parking spot operations
  getAllParkingSpots(): Promise<ParkingSpot[]>;
  getParkingSpot(id: number): Promise<ParkingSpot | undefined>;
  createParkingSpot(spot: InsertParkingSpot): Promise<ParkingSpot>;
  updateParkingSpot(id: number, spot: Partial<InsertParkingSpot>): Promise<ParkingSpot>;
  deleteParkingSpot(id: number): Promise<void>;

  // User favorites operations
  getUserFavorites(userId: number): Promise<(UserFavorite & { parkingSpot: ParkingSpot })[]>;
  addUserFavorite(favorite: InsertUserFavorite): Promise<UserFavorite>;
  removeUserFavorite(userId: number, parkingSpotId: number): Promise<void>;

  // Image upload operations
  createImageUpload(upload: InsertImageUpload): Promise<ImageUpload>;
  getUserUploads(userId: number): Promise<ImageUpload[]>;
  getAllUploads(): Promise<ImageUpload[]>;
  getAllUploadsWithUsers(): Promise<any[]>;
  updateImageUpload(id: number, upload: Partial<InsertImageUpload>): Promise<ImageUpload>;
  deleteImageUpload(id: number): Promise<void>;
  getImageUploadById(id: number): Promise<ImageUpload | undefined>;

  // Contact message operations
  createContactMessage(message: InsertContactMessage): Promise<ContactMessage>;
  getAllContactMessages(): Promise<ContactMessage[]>;
  updateContactMessage(id: number, reply: string): Promise<ContactMessage>;

  // Admin operations
  getAdmin(id: number): Promise<Admin | undefined>;
  getAdminByUsername(username: string): Promise<Admin | undefined>;
  createAdmin(admin: InsertAdmin): Promise<Admin>;
  updateAdminLastLogin(id: number): Promise<void>;

  // Password change operations
  updateUserPassword(id: number, hashedPassword: string): Promise<void>;
  updateAdminPassword(id: number, hashedPassword: string): Promise<void>;

  // User notification operations
  getUserNotifications(userId: number): Promise<UserNotification[]>;
  createUserNotification(notification: InsertUserNotification): Promise<UserNotification>;
  markNotificationAsRead(id: number): Promise<void>;
  markAllNotificationsAsRead(userId: number): Promise<void>;
}

// storage.ts
export class DatabaseStorage implements IStorage {
  // ✅ 取得今日訪客記錄
  async getVisitLog(date: string): Promise<{ date: string; count: number } | null> {
    const result = await db.query.visit_logs.findFirst({
      where: (log, { eq }) => eq(log.date, date),
    });
    if (!result) return null;
    return { date: result.date, count: result.count ?? 0 };
  }

  // ✅ 新增今日訪客記錄
  async insertVisitLog(date: string, count: number): Promise<void> {
    await db.insert(visit_logs).values({ date, count });
  }

  // ✅ 更新今日訪客記錄
  async updateVisitLog(date: string, newCount: number): Promise<void> {
    await db
      .update(visit_logs)
      .set({ count: newCount })
      .where(eq(visit_logs.date, date));
  }

  // User operations for custom authentication
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values({
      ...userData,
      role: userData.role ?? "user", // 預設為 user
    }).returning();
    return user;
  }

  // Parking spot operations
  async getAllParkingSpots(): Promise<ParkingSpot[]> {
    return await db.select().from(parkingSpots).orderBy(parkingSpots.name);
  }

  async getParkingSpot(id: number): Promise<ParkingSpot | undefined> {
    const [spot] = await db.select().from(parkingSpots).where(eq(parkingSpots.id, id));
    return spot;
  }

  async createParkingSpot(spot: InsertParkingSpot): Promise<ParkingSpot> {
    const [createdSpot] = await db.insert(parkingSpots).values(spot).returning();
    return createdSpot;
  }

  async updateParkingSpot(id: number, spot: Partial<InsertParkingSpot>): Promise<ParkingSpot> {
    const [updatedSpot] = await db.update(parkingSpots).set({ ...spot, lastUpdated: new Date() }).where(eq(parkingSpots.id, id)).returning();
    return updatedSpot;
  }

  async deleteParkingSpot(id: number): Promise<void> {
    await db.delete(parkingSpots).where(eq(parkingSpots.id, id));
  }

  // User favorites operations
  async getUserFavorites(userId: number): Promise<(UserFavorite & { parkingSpot: ParkingSpot })[]> {
    const favorites = await db
      .select({
        id: userFavorites.id,
        userId: userFavorites.userId,
        parkingSpotId: userFavorites.parkingSpotId,
        createdAt: userFavorites.createdAt,
        parkingSpot: parkingSpots,
      })
      .from(userFavorites)
      .innerJoin(parkingSpots, eq(userFavorites.parkingSpotId, parkingSpots.id))
      .where(eq(userFavorites.userId, userId))
      .orderBy(desc(userFavorites.createdAt));

    return favorites;
  }

  async addUserFavorite(favorite: InsertUserFavorite): Promise<UserFavorite> {
    const [createdFavorite] = await db.insert(userFavorites).values(favorite).returning();
    return createdFavorite;
  }

  async removeUserFavorite(userId: number, parkingSpotId: number): Promise<void> {
    await db.delete(userFavorites).where(and(eq(userFavorites.userId, userId), eq(userFavorites.parkingSpotId, parkingSpotId)));
  }

  // Image upload operations
  async createImageUpload(upload: InsertImageUpload): Promise<ImageUpload> {
    const [createdUpload] = await db.insert(imageUploads).values(upload).returning();
    return createdUpload;
  }

  async getUserUploads(userId: number): Promise<ImageUpload[]> {
    return await db.select().from(imageUploads).where(eq(imageUploads.userId, userId)).orderBy(desc(imageUploads.createdAt));
  }

  async getAllUploads(): Promise<ImageUpload[]> {
    return await db.select().from(imageUploads).orderBy(desc(imageUploads.createdAt));
  }

  async getAllUploadsWithUsers(): Promise<any[]> {
    const uploads = await db
    .select({
      id: imageUploads.id,
      userId: imageUploads.userId,  // 補上這行
      filename: imageUploads.filename,
      originalName: imageUploads.originalName,
      mimeType: imageUploads.mimeType,
      size: imageUploads.size,
      status: imageUploads.status,
      createdAt: imageUploads.createdAt,
      username: users.username
    })
    .from(imageUploads)
    .leftJoin(users, eq(imageUploads.userId, users.id))
    .orderBy(desc(imageUploads.createdAt));

    return uploads;
  }

  async updateImageUpload(id: number, upload: Partial<InsertImageUpload>): Promise<ImageUpload> {
    const [updatedUpload] = await db.update(imageUploads).set(upload).where(eq(imageUploads.id, id)).returning();
    return updatedUpload;
  }

  async deleteImageUpload(id: number): Promise<void> {
    await db.delete(imageUploads).where(eq(imageUploads.id, id));
  }

  async getImageUploadById(id: number): Promise<ImageUpload | undefined> {
    const [upload] = await db.select().from(imageUploads).where(eq(imageUploads.id, id));
    return upload;
  }

  // Contact message operations
  async createContactMessage(message: InsertContactMessage): Promise<ContactMessage> {
    const [createdMessage] = await db.insert(contactMessages).values(message).returning();
    return createdMessage;
  }

  async getAllContactMessages(): Promise<ContactMessage[]> {
    return await db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt));
  }

  async updateContactMessage(id: number, reply: string): Promise<ContactMessage> {
    const [updated] = await db.update(contactMessages).set({ adminReply: reply, isReplied: true, repliedAt: new Date() }).where(eq(contactMessages.id, id)).returning();
    return updated;
  }

  // Admin operations
  async getAdmin(id: number): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.id, id));
    return admin || undefined;
  }

  async getAdminByUsername(username: string): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.username, username));
    return admin || undefined;
  }

  async createAdmin(adminData: InsertAdmin): Promise<Admin> {
    const [admin] = await db.insert(admins).values(adminData).returning();
    return admin;
  }

  async updateAdminLastLogin(id: number): Promise<void> {
    await db.update(admins).set({ lastLogin: new Date() }).where(eq(admins.id, id));
  }

  // Password change operations
  async updateUserPassword(id: number, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, id));
  }

  async updateAdminPassword(id: number, hashedPassword: string): Promise<void> {
    await db.update(admins).set({ password: hashedPassword }).where(eq(admins.id, id));
  }

  // User notification operations
  async getUserNotifications(userId: number): Promise<any[]> {
    return await db
      .select({
        id: userNotifications.id,
        message: userNotifications.message,
        isRead: userNotifications.isRead,
        createdAt: userNotifications.createdAt,
      })
      .from(userNotifications)
      .leftJoin(users, eq(userNotifications.userId, users.id))
      .where(eq(userNotifications.userId, userId))
      .orderBy(desc(userNotifications.createdAt));
  }

  async createUserNotification(notification: InsertUserNotification): Promise<UserNotification> {
    const [created] = await db.insert(userNotifications).values(notification).returning();
    return created;
  }

  // 單筆已讀
  async markNotificationAsRead(id: number): Promise<void> {
    await db
      .update(userNotifications)
      .set({ isRead: true })
      .where(eq(userNotifications.id, id));
  }

  // 全部已讀
  async markAllNotificationsAsRead(userId: number): Promise<void> {
    await db
      .update(userNotifications)
      .set({ isRead: true })
      .where(eq(userNotifications.userId, userId));
  }

  }

export const storage = new DatabaseStorage();
