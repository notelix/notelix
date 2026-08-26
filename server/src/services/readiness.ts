import { Injectable } from '@nestjs/common';
import { AppDataSource } from '../database';
import { meilisearchClient } from '../meilisearch';

export type DependencyStatus = 'up' | 'down';

export interface ReadinessStatus {
  postgres: DependencyStatus;
  meilisearch: DependencyStatus;
}

function readTimeout(): number {
  const configured = process.env.READINESS_TIMEOUT_MS;
  if (!configured) {
    return 2000;
  }
  const timeout = Number(configured);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 30000) {
    throw new Error(
      'READINESS_TIMEOUT_MS must be an integer between 100 and 30000',
    );
  }
  return timeout;
}

@Injectable()
export class ReadinessService {
  private readonly timeoutMs = readTimeout();

  async check(): Promise<ReadinessStatus> {
    const [postgres, meilisearch] = await Promise.allSettled([
      this.withTimeout(this.checkPostgres()),
      this.withTimeout(this.checkMeilisearch()),
    ]);

    return {
      postgres: postgres.status === 'fulfilled' ? 'up' : 'down',
      meilisearch: meilisearch.status === 'fulfilled' ? 'up' : 'down',
    };
  }

  private async checkPostgres(): Promise<void> {
    if (!AppDataSource.isInitialized) {
      throw new Error('PostgreSQL is not initialized');
    }
    await AppDataSource.query('SELECT 1');
  }

  private async checkMeilisearch(): Promise<void> {
    const status = await meilisearchClient.health();
    if (status.status !== 'available') {
      throw new Error('Meilisearch is unavailable');
    }
  }

  private withTimeout<T>(operation: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Readiness check timed out')),
        this.timeoutMs,
      );
      operation.then(
        (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }
}
