import {
  Controller,
  ForbiddenException,
  OnModuleInit,
  Post,
  Req,
  Request,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import sleep from '../utils/sleep';
import {
  AnnotationChangeHistory,
  AnnotationChangeHistoryKindDelete,
  AnnotationChangeHistoryKindSave,
} from '../models/annotationChangeHistory.entity';
import { Annotation } from '../models/annotation.entity';
import { AnnotationEncryptedFields, decryptFields } from '../encryption';
import * as CryptoJS from 'crypto-js';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');

const AnnotationChangeHistoryLatestIdSavePath =
  '/data/.annotation_change_history_latest_id';

function assertRunModeAgent() {
  if (process.env.RUN_MODE !== 'AGENT') {
    throw new ForbiddenException('RUN_MODE=AGENT required');
  }
}

@Controller('agentsync')
export class AgentSyncController implements OnModuleInit {
  config = {
    enabled: false,
    decodedJwt: null as any,
    token: '',
    url: '',
    clientSideEncryptionKey: '',
    clientSideEncryptionKeyHexParsed: null as any,
  };

  decryptAnnotation = async (annotation) => {
    if (!this.config.clientSideEncryptionKey) {
      return annotation;
    }
    const decrypted = (await decryptFields({
      decryptionKey: this.config.clientSideEncryptionKeyHexParsed,
      object: { ...annotation.data, url: annotation.url },
      fields: AnnotationEncryptedFields,
    })) as any;
    annotation.url = decrypted.url;
    delete decrypted.url;
    annotation.data = decrypted;
    return annotation;
  };

  applyDiff = async (diff: any) => {
    switch (diff.kind) {
      case AnnotationChangeHistoryKindSave:
        await Annotation.persist(await this.decryptAnnotation(diff.data));
        break;
      case AnnotationChangeHistoryKindDelete:
        await Annotation.remove(diff.data);
        break;
    }
  };

  async onModuleInit() {
    setTimeout(async () => {
      this.syncLoop();
    });
  }

  private async syncLoop() {
    while (true) {
      await sleep(3000);
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

  @Post('/set')
  async Set(@Req() request: Request): Promise<any> {
    assertRunModeAgent();
    this.config = request.body['config'] || {};
    this.config.decodedJwt = jwt.decode(this.config.token || '', {});
    if (this.config.clientSideEncryptionKey) {
      this.config.clientSideEncryptionKeyHexParsed = CryptoJS.enc.Hex.parse(
        this.config.clientSideEncryptionKey,
      );
    }
    return this.config;
  }

  private async sync() {
    const latestId = this.getAnnotationChangeHistoryLatestId();
    if (latestId === 0) {
      await this.resetData();
    }
    if (latestId === 0) {
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
      for (const annotation of data.list) {
        await Annotation.persist(await this.decryptAnnotation(annotation));
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

    for (const diff of data.diff) {
      await this.applyDiff(diff);
      this.saveAnnotationChangeHistoryLatestId(diff.id);
    }
  }

  private async resetData() {
    await AnnotationChangeHistory.getRepository().clear();
    await Annotation.getRepository().clear();
    await this.clearAnnotationChangeHistoryLatestId();
    // TODO: meili search truncate
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
