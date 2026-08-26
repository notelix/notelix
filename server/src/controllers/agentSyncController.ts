import {
  Body,
  Controller,
  ForbiddenException,
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');

const AnnotationChangeHistoryLatestIdSavePath =
  '/data/.annotation_change_history_latest_id';

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
  config = emptyAgentConfig();
  private stopping = false;
  private syncLoopPromise?: Promise<void>;

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
    }
  };

  async onModuleInit() {
    if (isRunModeAgent()) {
      this.syncLoopPromise = this.syncLoop();
    }
  }

  async onApplicationShutdown() {
    this.stopping = true;
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
        console.log('failed to do sync', ex);
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

  private async sync() {
    const latestId = this.getAnnotationChangeHistoryLatestId();
    console.log('SYNC latestId=', latestId);
    if (latestId === 0) {
      await this.resetData();
    }
    if (latestId === 0) {
      console.log('fetching list');
      const resp = await fetch(`${this.config.url}/annotations/list`, {
        headers: {
          authorization: 'jwt ' + this.config.token,
        },
        method: 'POST',
      });

      if (!(resp.status >= 200 && resp.status <= 201)) {
        throw new Error('list failed ' + resp.status);
      }
      const data = await resp.json();
      console.log('/list ok, persisting', data.list.length, 'items');
      for (const annotation of data.list) {
        const decryptedAnnotation = await this.decryptAnnotation(annotation);
        await Annotation.agentSyncPersist(decryptedAnnotation);
        await meilisearchClient.IndexAnnotation(decryptedAnnotation);
      }
      this.saveAnnotationChangeHistoryLatestId(
        data.annotationChangeHistoryLatestId,
      );
      return;
    }
    const resp = await fetch(`${this.config.url}/annotations/listDiff`, {
      headers: {
        authorization: 'jwt ' + this.config.token,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify({
        sinceId: latestId,
      }),
    });
    if (!(resp.status >= 200 && resp.status <= 201)) {
      throw new Error('listDiff failed ' + resp.status);
    }
    const data = await resp.json();
    if (!data.ok) {
      console.warn('listDiff failed - data is stale, doing a full re-list');
      await this.resetData();
      return;
    }

    console.log('found ', data.diff.length, 'diff');
    for (const diff of data.diff) {
      await this.applyDiff(diff);
      this.saveAnnotationChangeHistoryLatestId(diff.id);
    }
  }

  private async resetData() {
    console.log('resetData');
    await AnnotationChangeHistory.getRepository().clear();
    await Annotation.getRepository().clear();
    await this.clearAnnotationChangeHistoryLatestId();
    await meilisearchClient.UnIndexAllAnnotations();
  }

  private saveAnnotationChangeHistoryLatestId(id) {
    if (this.getAnnotationChangeHistoryLatestId() > id) {
      return;
    }
    fs.writeFileSync(AnnotationChangeHistoryLatestIdSavePath, id.toString(), {
      encoding: 'utf8',
    });
  }

  private getAnnotationChangeHistoryLatestId(): number {
    if (!fs.existsSync(AnnotationChangeHistoryLatestIdSavePath)) {
      return 0;
    }
    return +fs.readFileSync(AnnotationChangeHistoryLatestIdSavePath, {
      encoding: 'utf8',
    });
  }

  private clearAnnotationChangeHistoryLatestId() {
    if (fs.existsSync(AnnotationChangeHistoryLatestIdSavePath)) {
      fs.unlinkSync(AnnotationChangeHistoryLatestIdSavePath);
    }
  }
}
