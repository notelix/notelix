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
import * as fs from 'node:fs';
import * as path from 'node:path';

const defaultAnnotationChangeHistoryLatestIdSavePath =
  '/data/.annotation_change_history_latest_id';
const defaultSyncRequestTimeoutMs = 30000;
const defaultSyncMaxResponseBytes = 64 * 1024 * 1024;

function readBoundedInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const configured = process.env[name];
  if (!configured) {
    return fallback;
  }
  const value = Number(configured);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
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
  };
}

@Controller('agentsync')
export class AgentSyncController
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(AgentSyncController.name);
  private readonly syncRequestTimeoutMs = readBoundedInteger(
    'AGENT_SYNC_REQUEST_TIMEOUT_MS',
    defaultSyncRequestTimeoutMs,
    100,
    300000,
  );
  private readonly syncMaxResponseBytes = readBoundedInteger(
    'AGENT_SYNC_MAX_RESPONSE_BYTES',
    defaultSyncMaxResponseBytes,
    1024,
    256 * 1024 * 1024,
  );
  config = emptyAgentConfig();
  private stopping = false;
  private syncLoopPromise?: Promise<void>;
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

  applyDiff = async (diff: any) => {
    switch (diff.kind) {
      case AnnotationChangeHistoryKindSave:
        const annotation = await this.decryptAnnotation(diff.data);
        await Annotation.agentSyncPersist(annotation);
        await meilisearchClient.IndexAnnotation(annotation);
        break;
      case AnnotationChangeHistoryKindDelete:
        const id = diff.data.id;
        await Annotation.remove(diff.data);
        await meilisearchClient.UnIndexAnnotation({ ...diff.data, id });
        break;
      default:
        throw new Error(`unsupported annotation diff kind ${diff.kind}`);
    }
  };

  async onModuleInit() {
    if (isRunModeAgent()) {
      this.syncLoopPromise = this.syncLoop();
    }
  }

  async onApplicationShutdown() {
    this.stopping = true;
    this.activeRequestController?.abort();
    await this.syncLoopPromise;
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
        await this.sync();
      } catch (ex) {
        if (!this.stopping) {
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
    this.config = emptyAgentConfig();
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
    this.config = {
      ...emptyAgentConfig(),
      ...request.config,
    };
    if (this.config.clientSideEncryptionKey) {
      this.config.clientSideEncryptionKeyHexParsed = CryptoJS.enc.Hex.parse(
        this.config.clientSideEncryptionKey,
      );
    }
    const urlOverride = process.env.AGENT_SYNC_URL_OVERRIDE;
    if (urlOverride) {
      this.config.url = urlOverride;
    }

    return { ok: true, enabled: this.config.enabled };
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
        throw new Error(`${operation} failed with status ${response.status}`);
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
    const latestId = this.getAnnotationChangeHistoryLatestId();
    this.logger.debug(`Synchronizing after history id ${latestId ?? 'none'}`);
    if (latestId === null) {
      const data = await this.requestJson(
        'annotation list request',
        '/annotations/list',
      );
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
      await this.resetData();
      this.logger.log(
        `Persisting ${annotations.length} synchronized annotations`,
      );
      for (const annotation of annotations) {
        await Annotation.agentSyncPersist(annotation);
        await meilisearchClient.IndexAnnotation(annotation);
      }
      this.saveAnnotationChangeHistoryLatestId(historyId);
      return;
    }

    const data = await this.requestJson(
      'annotation diff request',
      '/annotations/listDiff',
      { sinceId: latestId },
    );
    if (!data || typeof data.ok !== 'boolean') {
      throw new Error('annotation diff response must contain an ok flag');
    }
    if (!data.ok) {
      this.logger.warn('Sync history is stale; scheduling a full re-list');
      await this.resetData();
      return;
    }
    if (!Array.isArray(data.diff)) {
      throw new Error('annotation diff response must contain a diff list');
    }

    this.logger.debug(`Applying ${data.diff.length} annotation changes`);
    let appliedId = latestId;
    for (const diff of data.diff) {
      const diffId = assertSyncCursor(diff?.id, 'annotation diff id');
      if (diffId <= appliedId) {
        throw new Error('annotation diff ids must be strictly increasing');
      }
      await this.applyDiff(diff);
      this.saveAnnotationChangeHistoryLatestId(diffId);
      appliedId = diffId;
    }
  }

  private async resetData() {
    this.logger.log('Resetting synchronized annotation data');
    this.clearAnnotationChangeHistoryLatestId();
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

  private saveAnnotationChangeHistoryLatestId(id: number): void {
    const cursor = assertSyncCursor(id, 'annotation history id');
    const existingCursor = this.getAnnotationChangeHistoryLatestId();
    if (existingCursor !== null && existingCursor > cursor) {
      return;
    }

    const statePath = getSyncStatePath();
    const temporaryPath = `${statePath}.${process.pid}.tmp`;
    let fileDescriptor: number | undefined;
    try {
      fileDescriptor = fs.openSync(temporaryPath, 'w', 0o600);
      fs.writeFileSync(fileDescriptor, `${cursor}\n`, { encoding: 'utf8' });
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

  private getAnnotationChangeHistoryLatestId(): number | null {
    const statePath = getSyncStatePath();
    if (!fs.existsSync(statePath)) {
      return null;
    }
    const cursor = parseSyncCursor(
      fs.readFileSync(statePath, {
        encoding: 'utf8',
      }),
    );
    if (cursor === null) {
      this.logger.warn(
        'Agent sync cursor is invalid; scheduling a full re-list',
      );
    }
    return cursor;
  }

  private clearAnnotationChangeHistoryLatestId(): void {
    const statePath = getSyncStatePath();
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
      this.syncStateDirectory(statePath);
    }
  }
}
