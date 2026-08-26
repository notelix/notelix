import { Injectable } from '@nestjs/common';
import { AppDataSource } from '../database';
import {
  isAnnotationIndexSchemaReady,
  meilisearchClient,
} from '../meilisearch';
import { readBoundedIntegerEnvironment } from '../../runtime-config';

export type DependencyStatus = 'up' | 'down';

export interface ReadinessStatus {
  postgres: DependencyStatus;
  meilisearch: DependencyStatus;
}

@Injectable()
export class ReadinessService {
  private readonly timeoutMs = readBoundedIntegerEnvironment(
    'READINESS_TIMEOUT_MS',
    2000,
    100,
    30000,
  );

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
    if (!isAnnotationIndexSchemaReady()) {
      throw new Error('Meilisearch annotation index is not ready');
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
