import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { CreateChallengeInput } from "../shared/contracts";

export interface ChallengeRecord extends CreateChallengeInput {
  id: string;
  ownerId: string;
  createdAt: string;
}

export class ChallengeRepository {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS challenges (
        id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, title TEXT NOT NULL,
        startDate TEXT NOT NULL, duration INTEGER NOT NULL CHECK(duration BETWEEN 1 AND 30),
        timeZone TEXT NOT NULL, createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS challenges_owner ON challenges(ownerId, createdAt);
      CREATE TABLE IF NOT EXISTS check_ins (
        challengeId TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
        date TEXT NOT NULL, PRIMARY KEY(challengeId, date)
      );
      PRAGMA user_version = 1;
    `);
  }
  create(
    ownerId: string,
    input: CreateChallengeInput,
    now: Date,
  ): ChallengeRecord {
    const record = {
      ...input,
      id: randomUUID(),
      ownerId,
      createdAt: now.toISOString(),
    };
    this.db
      .prepare("INSERT INTO challenges VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(
        record.id,
        ownerId,
        input.title,
        input.startDate,
        input.duration,
        input.timeZone,
        record.createdAt,
      );
    return record;
  }
  list(ownerId: string, limit: number, offset: number): ChallengeRecord[] {
    return this.db
      .prepare(
        "SELECT * FROM challenges WHERE ownerId = ? ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?",
      )
      .all(ownerId, limit, offset) as unknown as ChallengeRecord[];
  }
  count(ownerId: string): number {
    return Number(
      this.db
        .prepare("SELECT COUNT(*) AS count FROM challenges WHERE ownerId = ?")
        .get(ownerId)!.count,
    );
  }
  find(id: string, ownerId: string): ChallengeRecord | undefined {
    return this.db
      .prepare("SELECT * FROM challenges WHERE id = ? AND ownerId = ?")
      .get(id, ownerId) as unknown as ChallengeRecord | undefined;
  }
  dates(id: string): string[] {
    return this.db
      .prepare("SELECT date FROM check_ins WHERE challengeId = ? ORDER BY date")
      .all(id)
      .map((row) => String(row.date));
  }
  mark(id: string, date: string): void {
    this.db
      .prepare("INSERT INTO check_ins VALUES (?, ?) ON CONFLICT DO NOTHING")
      .run(id, date);
  }
  unmark(id: string, date: string): void {
    this.db
      .prepare("DELETE FROM check_ins WHERE challengeId = ? AND date = ?")
      .run(id, date);
  }
  close(): void {
    this.db.close();
  }
}
