import {
  Body,
  Controller,
  ForbiddenException,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import sleep from '../utils/sleep';
import {
  AnnotationChangeHistory,
  AnnotationChangeHistoryKindDelete,
  AnnotationChangeHistoryKindSave,
} from '../models/annotationChangeHistory.entity';
import { Annotation } from '../models/annotation.entity';
import { decryptFields } from '../encryption';
import * as CryptoJS from 'crypto-js';
import { meilisearchClient } from '../meilisearch';
import { SetAgentSyncDto } from '../dto/agent.dto';
import { isAgentControlOriginAllowed } from '../agentControl';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppDataSource } from '../database';
import { ensureAgentAnnotationSearchIndexReady } from '../services/agentSearchIndex';
import { readBoundedIntegerEnvironment } from '../../runtime-config';

const defaultAnnotationChangeHistoryLatestIdSavePath =
  '/data/.annotation_change_history_latest_id';
const defaultSyncRequestTimeoutMs = 30000;
const defaultSyncMaxResponseBytes = 64 * 1024 * 1024;
const defaultSyncMaxDiffPagesPerCycle = 10;
const defaultSyncMaxSnapshotPagesPerCycle = 10;
const syncCursorStateVersion = 1;
const syncSnapshotStateVersion = 2;
const snapshotIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AgentSyncCursorState {
  version: typeof syncCursorStateVersion;
  sourceIdentity: string;
  cursor: number;
}

interface AgentSyncSnapshotState {
  version: typeof syncSnapshotStateVersion;
  sourceIdentity: string;
  snapshotId: string;
  afterId: number;
  watermark: number;
}

type AgentSyncState = AgentSyncCursorState | AgentSyncSnapshotState;

class SyncSupersededError extends Error {
  constructor() {
    super('agent sync configuration changed');
  }
}

class SyncRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function getSyncStatePath(): string {
  return (
    process.env.AGENT_SYNC_STATE_PATH ||
    defaultAnnotationChangeHistoryLatestIdSavePath
  );
}

export function parseSyncCursor(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  const cursor = Number(normalized);
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    return null;
  }
  return cursor;
}

export function parseAgentSyncState(value: string): AgentSyncState | null {
  try {
    const state = JSON.parse(value) as {
      version?: unknown;
      sourceIdentity?: unknown;
      cursor?: unknown;
      snapshotId?: unknown;
      afterId?: unknown;
      watermark?: unknown;
    };
    if (
      typeof state.sourceIdentity !== 'string' ||
      !/^[a-f\d]{64}$/.test(state.sourceIdentity)
    ) {
      return null;
    }
    if (
      state.version === syncCursorStateVersion &&
      Number.isSafeInteger(state.cursor) &&
      (state.cursor as number) >= 0
    ) {
      return state as AgentSyncCursorState;
    }
    if (
      state.version === syncSnapshotStateVersion &&
      typeof state.snapshotId === 'string' &&
      snapshotIdPattern.test(state.snapshotId) &&
      Number.isSafeInteger(state.afterId) &&
      (state.afterId as number) >= 0 &&
      Number.isSafeInteger(state.watermark) &&
      (state.watermark as number) >= 0
    ) {
      return state as AgentSyncSnapshotState;
    }
    return null;
  } catch (_error) {
    return null;
  }
}

function digest(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getTokenIdentity(token: string): Record<string, unknown> {
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      );
      const tokenVersion = payload.tokenVersion ?? 0;
      if (
        Number.isSafeInteger(payload.id) &&
        payload.id > 0 &&
        Number.isSafeInteger(tokenVersion) &&
        tokenVersion >= 0
      ) {
        return {
          kind: 'jwt',
          issuer: typeof payload.iss === 'string' ? payload.iss : '',
          userId: payload.id,
          tokenVersion,
        };
      }
    }
  } catch (_error) {
    // Invalid tokens are rejected by the source server. Hashing still keeps
    // their local sync state isolated without persisting the credential.
  }
  return { kind: 'opaque', tokenDigest: digest(token) };
}

export function createAgentSyncSourceIdentity(config: {
  url: string;
  token: string;
  clientSideEncryptionKey?: string | null;
}): string {
  return digest(
    JSON.stringify({
      url: new URL(config.url).toString(),
      token: getTokenIdentity(config.token),
      encryptionKeyDigest: digest(config.clientSideEncryptionKey || ''),
    }),
  );
}

function assertSyncCursor(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value as number;
}

export function isRunModeAgent() {
  return process.env.RUN_MODE === 'AGENT';
}

function assertRunModeAgent() {
  if (!isRunModeAgent()) {
    throw new ForbiddenException('RUN_MODE=AGENT required');
  }
}

function assertAgentControlOrigin(request: Request) {
  const origin = request.headers.origin;
  if (!isAgentControlOriginAllowed(origin)) {
    throw new ForbiddenException('origin is not allowed to control the agent');
  }
}

function emptyAgentConfig() {
  return {
    enabled: false,
    token: '',
    url: '',
    clientSideEncryptionKey: '',
    clientSideEncryptionKeyHexParsed: null as any,
    sourceIdentity: '',
  };
}

@Controller('agentsync')
export class AgentSyncController
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(AgentSyncController.name);
  private readonly syncRequestTimeoutMs = readBoundedIntegerEnvironment(
    'AGENT_SYNC_REQUEST_TIMEOUT_MS',
    defaultSyncRequestTimeoutMs,
    100,
    300000,
  );
  private readonly syncMaxResponseBytes = readBoundedIntegerEnvironment(
    'AGENT_SYNC_MAX_RESPONSE_BYTES',
    defaultSyncMaxResponseBytes,
    1024,
    256 * 1024 * 1024,
  );
  private readonly syncMaxDiffPagesPerCycle = readBoundedIntegerEnvironment(
    'AGENT_SYNC_MAX_DIFF_PAGES_PER_CYCLE',
    defaultSyncMaxDiffPagesPerCycle,
    1,
    100,
  );
  private readonly syncMaxSnapshotPagesPerCycle = readBoundedIntegerEnvironment(
    'AGENT_SYNC_MAX_SNAPSHOT_PAGES_PER_CYCLE',
    defaultSyncMaxSnapshotPagesPerCycle,
    1,
    100,
  );
  config = emptyAgentConfig();
  private stopping = false;
  private configGeneration = 0;
  private syncLoopPromise?: Promise<void>;
  private activeSyncPromise?: Promise<void>;
  private activeRequestController?: AbortController;

  decryptAnnotation = async (annotation) => {
    if (!this.config.clientSideEncryptionKey) {
      return annotation;
    }
    annotation.data = (await decryptFields({
      decryptionKey: this.config.clientSideEncryptionKeyHexParsed,
      object: annotation.data,
      fields: ['notes', 'text', 'textAfter', 'textBefore'],
      iv: annotation.uid,
    })) as any;
    annotation = (await decryptFields({
      decryptionKey: this.config.clientSideEncryptionKeyHexParsed,
      object: annotation,
      fields: ['url', 'title', 'host'],
    })) as any;
    return annotation;
  };

  applyDiff = async (
    diff: any,
    assertCurrent: () => void = () => undefined,
  ) => {
    switch (diff.kind) {
      case AnnotationChangeHistoryKindSave:
        const annotation = await this.decryptAnnotation(diff.data);
        assertCurrent();
        await Annotation.agentSyncPersist(annotation);
        assertCurrent();
        await meilisearchClient.IndexAnnotation(annotation);
        break;
      case AnnotationChangeHistoryKindDelete:
        const id = diff.data.id;
        await Annotation.remove(diff.data);
        assertCurrent();
        await meilisearchClient.UnIndexAnnotation({ ...diff.data, id });
        break;
      default:
        throw new Error(`unsupported annotation diff kind ${diff.kind}`);
    }
  };

  async onModuleInit() {
    if (isRunModeAgent()) {
      await AppDataSource.manager.query(
        'DELETE FROM "annotation_search_outbox"',
      );
      this.syncLoopPromise = this.syncLoop();
    }
  }

  async onApplicationShutdown() {
    this.stopping = true;
    this.configGeneration += 1;
    this.activeRequestController?.abort();
    await this.syncLoopPromise;
  }

  private async runSync(): Promise<void> {
    const syncPromise = this.sync();
    this.activeSyncPromise = syncPromise;
    try {
      await syncPromise;
    } finally {
      if (this.activeSyncPromise === syncPromise) {
        this.activeSyncPromise = undefined;
      }
    }
  }

  private async syncLoop() {
    while (!this.stopping) {
      await sleep(3000);
      if (this.stopping) {
        return;
      }
      if (!this.config.enabled) {
        continue;
      }
      try {
        await this.runSync();
      } catch (ex) {
        if (!this.stopping && !(ex instanceof SyncSupersededError)) {
          const trace = ex instanceof Error ? ex.stack : String(ex);
          this.logger.error('Failed to synchronize annotations', trace);
        }
      }
    }
  }

  @Post('/resetData')
  async ResetData(@Req() request: Request): Promise<any> {
    assertRunModeAgent();
    assertAgentControlOrigin(request);
    this.configGeneration += 1;
    this.config = emptyAgentConfig();
    this.activeRequestController?.abort();
    this.clearAgentSyncState();
    await this.activeSyncPromise?.catch(() => undefined);
    await this.resetData();
    return { ok: true };
  }

  @Post('/set')
  async Set(
    @Req() httpRequest: Request,
    @Body() request: SetAgentSyncDto,
  ): Promise<any> {
    assertRunModeAgent();
    assertAgentControlOrigin(httpRequest);
    const nextConfig = {
      ...emptyAgentConfig(),
      ...request.config,
    };
    if (nextConfig.clientSideEncryptionKey) {
      nextConfig.clientSideEncryptionKeyHexParsed = CryptoJS.enc.Hex.parse(
        nextConfig.clientSideEncryptionKey,
      );
    }
    const urlOverride = process.env.AGENT_SYNC_URL_OVERRIDE;
    if (urlOverride) {
      nextConfig.url = urlOverride;
    }
    nextConfig.sourceIdentity = createAgentSyncSourceIdentity(nextConfig);

    const executionChanged =
      this.config.enabled !== nextConfig.enabled ||
      this.config.sourceIdentity !== nextConfig.sourceIdentity;
    if (executionChanged) {
      this.configGeneration += 1;
      this.activeRequestController?.abort();
    }
    this.config = nextConfig;

    const persistedState = this.loadAgentSyncState();
    if (
      persistedState &&
      persistedState.sourceIdentity !== nextConfig.sourceIdentity
    ) {
      this.logger.log('Sync source changed; scheduling a full re-list');
      this.clearAgentSyncState();
    } else if (!persistedState && fs.existsSync(getSyncStatePath())) {
      this.clearAgentSyncState();
    }
    if (executionChanged) {
      await this.activeSyncPromise?.catch(() => undefined);
    }

    return { ok: true, enabled: this.config.enabled };
  }

  private assertCurrentSync(generation: number, sourceIdentity: string): void {
    if (
      generation !== this.configGeneration ||
      sourceIdentity !== this.config.sourceIdentity ||
      !this.config.enabled
    ) {
      throw new SyncSupersededError();
    }
  }

  private getSyncEndpoint(pathname: string): string {
    const baseUrl = this.config.url.endsWith('/')
      ? this.config.url
      : `${this.config.url}/`;
    return new URL(pathname.replace(/^\//, ''), baseUrl).toString();
  }

  private async requestJson(
    operation: string,
    pathname: string,
    body?: Record<string, unknown>,
    generation = this.configGeneration,
  ): Promise<any> {
    const requestController = new AbortController();
    this.activeRequestController = requestController;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      requestController.abort();
    }, this.syncRequestTimeoutMs);

    try {
      const response = await fetch(this.getSyncEndpoint(pathname), {
        headers: {
          authorization: `jwt ${this.config.token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
        signal: requestController.signal,
      });
      if (response.status < 200 || response.status > 201) {
        await response.body?.cancel();
        throw new SyncRequestError(
          `${operation} failed with status ${response.status}`,
          response.status,
        );
      }
      return await this.readJsonResponse(response, operation);
    } catch (error) {
      if (timedOut) {
        throw new Error(
          `${operation} timed out after ${this.syncRequestTimeoutMs}ms`,
        );
      }
      if (this.stopping && requestController.signal.aborted) {
        throw new Error(`${operation} aborted during shutdown`);
      }
      if (
        generation !== this.configGeneration &&
        requestController.signal.aborted
      ) {
        throw new SyncSupersededError();
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      if (this.activeRequestController === requestController) {
        this.activeRequestController = undefined;
      }
    }
  }

  private async readJsonResponse(
    response: Response,
    operation: string,
  ): Promise<any> {
    const declaredLength = response.headers.get('content-length');
    if (declaredLength !== null) {
      const length = Number(declaredLength);
      if (Number.isFinite(length) && length > this.syncMaxResponseBytes) {
        throw new Error(
          `${operation} response exceeded ${this.syncMaxResponseBytes} bytes`,
        );
      }
    }
    if (!response.body) {
      throw new Error(`${operation} returned an empty response`);
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      receivedBytes += value.byteLength;
      if (receivedBytes > this.syncMaxResponseBytes) {
        await reader.cancel();
        throw new Error(
          `${operation} response exceeded ${this.syncMaxResponseBytes} bytes`,
        );
      }
      chunks.push(value);
    }

    const serialized = Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk)),
      receivedBytes,
    ).toString('utf8');
    if (!serialized) {
      throw new Error(`${operation} returned an empty response`);
    }
    try {
      return JSON.parse(serialized);
    } catch (_error) {
      throw new Error(`${operation} returned invalid JSON`);
    }
  }

  private async sync() {
    const generation = this.configGeneration;
    const sourceIdentity = this.config.sourceIdentity;
    this.assertCurrentSync(generation, sourceIdentity);
    await ensureAgentAnnotationSearchIndexReady();
    this.assertCurrentSync(generation, sourceIdentity);
    const syncState = this.getAgentSyncState(sourceIdentity);
    if (syncState?.version === syncSnapshotStateVersion) {
      this.logger.debug(
        `Resuming snapshot ${syncState.snapshotId} after annotation ${syncState.afterId}`,
      );
      await this.syncFullSnapshot(generation, sourceIdentity, syncState);
      return;
    }
    const latestId = syncState?.cursor ?? null;
    this.logger.debug(`Synchronizing after history id ${latestId ?? 'none'}`);
    if (latestId === null) {
      await this.syncFullSnapshot(generation, sourceIdentity);
      return;
    }

    let appliedId = latestId;
    for (let page = 0; page < this.syncMaxDiffPagesPerCycle; page += 1) {
      const data = await this.requestJson(
        'annotation diff request',
        '/annotations/listDiff',
        { sinceId: appliedId },
        generation,
      );
      this.assertCurrentSync(generation, sourceIdentity);
      if (!data || typeof data.ok !== 'boolean') {
        throw new Error('annotation diff response must contain an ok flag');
      }
      if (!data.ok) {
        this.logger.warn('Sync history is stale; scheduling a full re-list');
        await this.resetData();
        this.assertCurrentSync(generation, sourceIdentity);
        return;
      }
      if (!Array.isArray(data.diff)) {
        throw new Error('annotation diff response must contain a diff list');
      }
      if (data.hasMore !== undefined && typeof data.hasMore !== 'boolean') {
        throw new Error(
          'annotation diff response hasMore flag must be a boolean',
        );
      }
      if (data.hasMore === true && data.diff.length === 0) {
        throw new Error(
          'annotation diff response cannot have more empty pages',
        );
      }

      this.logger.debug(`Applying ${data.diff.length} annotation changes`);
      for (const diff of data.diff) {
        const diffId = assertSyncCursor(diff?.id, 'annotation diff id');
        if (diffId <= appliedId) {
          throw new Error('annotation diff ids must be strictly increasing');
        }
        this.assertCurrentSync(generation, sourceIdentity);
        await this.applyDiff(diff, () =>
          this.assertCurrentSync(generation, sourceIdentity),
        );
        this.assertCurrentSync(generation, sourceIdentity);
        this.saveAnnotationChangeHistoryLatestId(diffId, sourceIdentity);
        appliedId = diffId;
      }
      if (data.hasMore !== true) {
        return;
      }
    }
    this.logger.debug('More annotation changes remain for the next sync cycle');
  }

  private async persistSnapshotPage(
    annotations: any[],
    generation: number,
    sourceIdentity: string,
  ): Promise<void> {
    for (const annotation of annotations) {
      this.assertCurrentSync(generation, sourceIdentity);
      await Annotation.agentSyncPersist(annotation);
      this.assertCurrentSync(generation, sourceIdentity);
      await meilisearchClient.IndexAnnotation(annotation);
      this.assertCurrentSync(generation, sourceIdentity);
    }
  }

  private async syncFullSnapshot(
    generation: number,
    sourceIdentity: string,
    progress?: AgentSyncSnapshotState,
  ): Promise<void> {
    try {
      let page = await this.requestJson(
        'annotation snapshot request',
        '/annotations/listPage',
        progress
          ? { snapshotId: progress.snapshotId, afterId: progress.afterId }
          : {},
        generation,
      );
      let snapshotId = progress?.snapshotId;
      let historyId = progress?.watermark;
      let afterId = progress?.afterId ?? 0;
      let cycleAnnotations = 0;
      let isFirstPage = !progress;
      for (
        let pageIndex = 0;
        pageIndex < this.syncMaxSnapshotPagesPerCycle;
        pageIndex += 1
      ) {
        this.assertCurrentSync(generation, sourceIdentity);
        if (!page || !Array.isArray(page.list)) {
          throw new Error('annotation snapshot response must contain a list');
        }
        if (
          typeof page.snapshotId !== 'string' ||
          !snapshotIdPattern.test(page.snapshotId)
        ) {
          throw new Error(
            'annotation snapshot response must contain a valid snapshotId',
          );
        }
        if (typeof page.hasMore !== 'boolean') {
          throw new Error(
            'annotation snapshot response must contain a hasMore flag',
          );
        }
        const pageHistoryId = assertSyncCursor(
          page.annotationChangeHistoryLatestId,
          'annotationChangeHistoryLatestId',
        );
        const nextAfterId = assertSyncCursor(
          page.nextAfterId,
          'annotation snapshot nextAfterId',
        );
        if (snapshotId && page.snapshotId !== snapshotId) {
          throw new Error('annotation snapshot id changed between pages');
        }
        if (historyId !== undefined && pageHistoryId !== historyId) {
          throw new Error(
            'annotation snapshot watermark changed between pages',
          );
        }
        if (page.hasMore && page.list.length === 0) {
          throw new Error('annotation snapshot cannot have more empty pages');
        }
        let lastAnnotationId = afterId;
        for (const annotation of page.list) {
          const annotationId = assertSyncCursor(
            annotation?.id,
            'annotation snapshot id',
          );
          if (annotationId <= lastAnnotationId) {
            throw new Error(
              'annotation snapshot ids must be strictly increasing',
            );
          }
          lastAnnotationId = annotationId;
        }
        if (nextAfterId !== lastAnnotationId) {
          throw new Error(
            'annotation snapshot nextAfterId does not match its list',
          );
        }

        snapshotId = page.snapshotId;
        historyId = pageHistoryId;
        const annotations = await Promise.all(
          page.list.map((annotation) => this.decryptAnnotation(annotation)),
        );
        this.assertCurrentSync(generation, sourceIdentity);
        if (isFirstPage) {
          await this.resetData();
          this.assertCurrentSync(generation, sourceIdentity);
          isFirstPage = false;
        }
        await this.persistSnapshotPage(annotations, generation, sourceIdentity);
        cycleAnnotations += page.list.length;
        if (!page.hasMore) {
          this.logger.log(
            `Persisted final snapshot page (${cycleAnnotations} annotations this cycle)`,
          );
          this.saveAnnotationChangeHistoryLatestId(historyId, sourceIdentity);
          return;
        }

        afterId = nextAfterId;
        this.saveSnapshotProgress(
          sourceIdentity,
          snapshotId,
          afterId,
          historyId,
        );
        if (pageIndex + 1 >= this.syncMaxSnapshotPagesPerCycle) {
          this.logger.debug(
            `Checkpointed snapshot ${snapshotId} after annotation ${afterId}`,
          );
          return;
        }
        page = await this.requestJson(
          'annotation snapshot request',
          '/annotations/listPage',
          { snapshotId, afterId },
          generation,
        );
      }
    } catch (error) {
      if (error instanceof SyncRequestError && error.status === 410) {
        this.logger.warn(
          'Snapshot session expired; scheduling a fresh re-list',
        );
        this.clearAgentSyncState();
        return;
      }
      if (error instanceof SyncRequestError && error.status === 404) {
        this.clearAgentSyncState();
        this.logger.warn(
          'Source does not support paged snapshots; using the legacy list endpoint',
        );
        await this.syncLegacyFullSnapshot(generation, sourceIdentity);
        return;
      }
      throw error;
    }
  }

  private async syncLegacyFullSnapshot(
    generation: number,
    sourceIdentity: string,
  ): Promise<void> {
    const data = await this.requestJson(
      'annotation list request',
      '/annotations/list',
      undefined,
      generation,
    );
    this.assertCurrentSync(generation, sourceIdentity);
    if (!data || !Array.isArray(data.list)) {
      throw new Error('annotation list response must contain a list');
    }
    const historyId = assertSyncCursor(
      data.annotationChangeHistoryLatestId,
      'annotationChangeHistoryLatestId',
    );
    const annotations = await Promise.all(
      data.list.map((annotation) => this.decryptAnnotation(annotation)),
    );
    this.assertCurrentSync(generation, sourceIdentity);
    await this.resetData();
    this.assertCurrentSync(generation, sourceIdentity);
    this.logger.log(
      `Persisting ${annotations.length} synchronized annotations`,
    );
    for (const annotation of annotations) {
      this.assertCurrentSync(generation, sourceIdentity);
      await Annotation.agentSyncPersist(annotation);
      this.assertCurrentSync(generation, sourceIdentity);
      await meilisearchClient.IndexAnnotation(annotation);
      this.assertCurrentSync(generation, sourceIdentity);
    }
    this.saveAnnotationChangeHistoryLatestId(historyId, sourceIdentity);
  }

  private async resetData() {
    this.logger.log('Resetting synchronized annotation data');
    await ensureAgentAnnotationSearchIndexReady();
    this.clearAgentSyncState();
    await AppDataSource.manager.query('DELETE FROM "annotation_search_outbox"');
    await AnnotationChangeHistory.getRepository().clear();
    await Annotation.getRepository().clear();
    await meilisearchClient.UnIndexAllAnnotations();
  }

  private syncStateDirectory(statePath: string): void {
    const directoryDescriptor = fs.openSync(path.dirname(statePath), 'r');
    try {
      fs.fsyncSync(directoryDescriptor);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  }

  private saveAnnotationChangeHistoryLatestId(
    id: number,
    sourceIdentity: string,
  ): void {
    const cursor = assertSyncCursor(id, 'annotation history id');
    if (!/^[a-f\d]{64}$/.test(sourceIdentity)) {
      throw new Error('agent sync source identity is invalid');
    }
    const existingState = this.loadAgentSyncState();
    if (
      existingState?.sourceIdentity === sourceIdentity &&
      existingState.version === syncCursorStateVersion &&
      existingState.cursor > cursor
    ) {
      return;
    }

    this.writeAgentSyncState({
      version: syncCursorStateVersion,
      sourceIdentity,
      cursor,
    });
  }

  private saveSnapshotProgress(
    sourceIdentity: string,
    snapshotId: string,
    afterId: number,
    watermark: number,
  ): void {
    const state: AgentSyncSnapshotState = {
      version: syncSnapshotStateVersion,
      sourceIdentity,
      snapshotId,
      afterId: assertSyncCursor(afterId, 'annotation snapshot afterId'),
      watermark: assertSyncCursor(watermark, 'annotation snapshot watermark'),
    };
    if (!parseAgentSyncState(JSON.stringify(state))) {
      throw new Error('agent snapshot progress is invalid');
    }
    this.writeAgentSyncState(state);
  }

  private writeAgentSyncState(state: AgentSyncState): void {
    const statePath = getSyncStatePath();
    const temporaryPath = `${statePath}.${process.pid}.tmp`;
    let fileDescriptor: number | undefined;
    try {
      fileDescriptor = fs.openSync(temporaryPath, 'w', 0o600);
      fs.writeFileSync(fileDescriptor, `${JSON.stringify(state)}\n`, {
        encoding: 'utf8',
      });
      fs.fsyncSync(fileDescriptor);
      fs.closeSync(fileDescriptor);
      fileDescriptor = undefined;
      fs.renameSync(temporaryPath, statePath);
      this.syncStateDirectory(statePath);
    } finally {
      if (fileDescriptor !== undefined) {
        fs.closeSync(fileDescriptor);
      }
      if (fs.existsSync(temporaryPath)) {
        fs.unlinkSync(temporaryPath);
      }
    }
  }

  private loadAgentSyncState(): AgentSyncState | null {
    const statePath = getSyncStatePath();
    if (!fs.existsSync(statePath)) {
      return null;
    }
    const serialized = fs.readFileSync(statePath, {
      encoding: 'utf8',
    });
    const state = parseAgentSyncState(serialized);
    if (state === null) {
      const legacyCursor = parseSyncCursor(serialized);
      const reason =
        legacyCursor === null ? 'invalid' : 'not bound to a sync source';
      this.logger.warn(
        `Agent sync state is ${reason}; scheduling a full re-list`,
      );
    }
    return state;
  }

  private getAnnotationChangeHistoryLatestId(
    sourceIdentity: string,
  ): number | null {
    const state = this.getAgentSyncState(sourceIdentity);
    return state?.version === syncCursorStateVersion ? state.cursor : null;
  }

  private getAgentSyncState(sourceIdentity: string): AgentSyncState | null {
    const state = this.loadAgentSyncState();
    if (!state) {
      return null;
    }
    if (state.sourceIdentity !== sourceIdentity) {
      this.logger.warn(
        'Agent sync state belongs to a different source; scheduling a full re-list',
      );
      return null;
    }
    return state;
  }

  private clearAgentSyncState(): void {
    const statePath = getSyncStatePath();
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
      this.syncStateDirectory(statePath);
    }
  }
}
