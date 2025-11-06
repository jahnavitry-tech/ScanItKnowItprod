// Generate a random UUID (version 4)
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Define types directly instead of importing from shared/schema
export interface User {
  id: string;
  username: string;
  password: string;
}

export interface InsertUser {
  username: string;
  password: string;
}

export interface ProductAnalysis {
  id: string;
  productName: string;
  productSummary: string; // Renamed from summary to productSummary for clarity in this file
  extractedText: any;
  imageUrl: string | null;
  featuresData: any | null; // NEW FIELD
  ingredientsData: any | null;
  compositionData: any | null;
  redditData: any | null;
  createdAt: Date;
}

export interface InsertProductAnalysis {
  productName: string;
  productSummary: string;
  extractedText: any;
  imageUrl?: string | null;
  featuresData?: any | null; // NEW FIELD
  ingredientsData?: any | null;
  compositionData?: any | null;
  redditData?: any | null;
}

export interface ChatMessage {
  id: string;
  analysisId: string;
  message: string;
  response: string;
  createdAt: Date;
}

export interface InsertChatMessage {
  analysisId: string;
  message: string;
  response: string;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createProductAnalysis(analysis: InsertProductAnalysis): Promise<ProductAnalysis>;
  getProductAnalysis(id: string): Promise<ProductAnalysis | undefined>;
  updateProductAnalysis(id: string, updates: Partial<ProductAnalysis>): Promise<ProductAnalysis | undefined>;
  
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessages(analysisId: string): Promise<ChatMessage[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private productAnalyses: Map<string, ProductAnalysis>;
  private chatMessages: Map<string, ChatMessage>;

  constructor() {
    this.users = new Map();
    this.productAnalyses = new Map();
    this.chatMessages = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = generateUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createProductAnalysis(analysis: InsertProductAnalysis): Promise<ProductAnalysis> {
    const id = generateUUID();
    const productAnalysis: ProductAnalysis = {
      ...analysis,
      id,
      createdAt: new Date(),
      imageUrl: analysis.imageUrl || null,
      featuresData: analysis.featuresData || null, // Initialize new field
      ingredientsData: analysis.ingredientsData || null,
      compositionData: analysis.compositionData || null,
      redditData: analysis.redditData || null,
    };
    this.productAnalyses.set(id, productAnalysis);
    return productAnalysis;
  }

  async getProductAnalysis(id: string): Promise<ProductAnalysis | undefined> {
    return this.productAnalyses.get(id);
  }

  async updateProductAnalysis(id: string, updates: Partial<ProductAnalysis>): Promise<ProductAnalysis | undefined> {
    const existing = this.productAnalyses.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates };
    this.productAnalyses.set(id, updated);
    return updated;
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const id = generateUUID();
    const chatMessage: ChatMessage = {
      ...message,
      id,
      createdAt: new Date(),
    };
    this.chatMessages.set(id, chatMessage);
    return chatMessage;
  }

  async getChatMessages(analysisId: string): Promise<ChatMessage[]> {
    return Array.from(this.chatMessages.values())
      .filter(msg => msg.analysisId === analysisId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

export const storage = new MemStorage();