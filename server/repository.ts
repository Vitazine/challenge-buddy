import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { CreateChallengeInput } from "../shared/contracts";

export interface ChallengeRecord extends CreateChallengeInput {
  id: string;
  ownerId: string;
  createdAt: string;
  archivedAt: string | null;
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
    `);
    const version = Number(
      this.db.prepare("PRAGMA user_version").get()!.user_version,
    );
    if (version < 2) {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.exec(`
          ALTER TABLE challenges ADD COLUMN archivedAt TEXT DEFAULT NULL;
          PRAGMA user_version = 2;
          COMMIT;
        `);
      } catch (error) {
        this.db.exec("ROLLBACK");
        this.db.close();
        throw error;
      }
    }
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
      archivedAt: null,
    };
    this.db
      .prepare(
        "INSERT INTO challenges (id, ownerId, title, startDate, duration, timeZone, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
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
  list(
    ownerId: string,
    limit: number,
    offset: number,
    archived = false,
  ): ChallengeRecord[] {
    return this.db
      .prepare(
        "SELECT * FROM challenges WHERE ownerId = ? AND (archivedAt IS NOT NULL) = ? ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?",
      )
      .all(
        ownerId,
        Number(archived),
        limit,
        offset,
      ) as unknown as ChallengeRecord[];
  }
  count(ownerId: string, archived = false): number {
    return Number(
      this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM challenges WHERE ownerId = ? AND (archivedAt IS NOT NULL) = ?",
        )
        .get(ownerId, Number(archived))!.count,
    );
  }
  find(id: string, ownerId: string): ChallengeRecord | undefined {
    return this.db
      .prepare("SELECT * FROM challenges WHERE id = ? AND ownerId = ?")
      .get(id, ownerId) as unknown as ChallengeRecord | undefined;
  }
  archive(id: string, ownerId: string, now: Date): void {
    this.db
      .prepare(
        "UPDATE challenges SET archivedAt = ? WHERE id = ? AND ownerId = ? AND archivedAt IS NULL",
      )
      .run(now.toISOString(), id, ownerId);
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
