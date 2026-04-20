/**
 * Abstract base for all domain repositories.
 * Enforces a consistent interface for data access.
 */

export abstract class BaseRepository<T> {
  abstract findById(id: string): Promise<T | null>;
  abstract findAll(): Promise<T[]>;
}
