import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { apiKeyInput, idParam, oauthClientInput, socialProvidersInput, webhookInput } from '@forum/shared';
import { ZodPipe, parse } from '../common/validation.js';
import { AdminEndpoint } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { OAuthService } from './oauth.service.js';
import { WebhooksService } from './webhooks.service.js';
import { SocialService } from './social.service.js';

const pageQuery = z.object({ page: z.coerce.number().int().min(1).default(1) });

/** Yönetim → Geliştiriciler: OAuth uygulamaları, API anahtarları, webhook'lar, sosyal giriş. */
@Controller('admin/developers')
export class DeveloperAdminController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly webhooks: WebhooksService,
    private readonly social: SocialService,
  ) {}

  @Get()
  @AdminEndpoint('admin.developers')
  async overview() {
    const [clients, keys, hooks] = await Promise.all([this.oauth.adminClients(), this.oauth.adminKeys(), this.webhooks.list()]);
    return { clients, keys, webhooks: hooks, social: this.social.admin(), metadata: this.oauth.metadata() };
  }

  // ----- OAuth uygulamaları -----

  @Post('clients')
  @HttpCode(201)
  @AdminEndpoint('admin.developers')
  createClient(@Body(new ZodPipe(oauthClientInput)) body: z.output<typeof oauthClientInput>, @CurrentViewer() v: RequestViewer) {
    return this.oauth.createClient(v, body);
  }

  @Put('clients/:id')
  @AdminEndpoint('admin.developers')
  async updateClient(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(oauthClientInput)) body: z.output<typeof oauthClientInput>, @CurrentViewer() v: RequestViewer) {
    await this.oauth.updateClient(v, id, body);
    return { ok: true };
  }

  @Post('clients/:id/secret')
  @HttpCode(200)
  @AdminEndpoint('admin.developers')
  rotateClientSecret(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.oauth.rotateSecret(v, id);
  }

  @Delete('clients/:id')
  @AdminEndpoint('admin.developers')
  async deleteClient(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.oauth.deleteClient(v, id);
    return { ok: true };
  }

  // ----- API anahtarları -----

  @Post('keys')
  @HttpCode(201)
  @AdminEndpoint('admin.developers')
  createKey(@Body(new ZodPipe(apiKeyInput)) body: z.output<typeof apiKeyInput>, @CurrentViewer() v: RequestViewer) {
    return this.oauth.createKey(v, body);
  }

  @Delete('keys/:id')
  @AdminEndpoint('admin.developers')
  async revokeKey(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.oauth.revokeKey(v, id);
    return { ok: true };
  }

  // ----- Webhook'lar -----

  @Post('webhooks')
  @HttpCode(201)
  @AdminEndpoint('admin.developers')
  createHook(@Body(new ZodPipe(webhookInput)) body: z.output<typeof webhookInput>, @CurrentViewer() v: RequestViewer) {
    return this.webhooks.save(v, null, body);
  }

  @Put('webhooks/:id')
  @AdminEndpoint('admin.developers')
  updateHook(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(webhookInput)) body: z.output<typeof webhookInput>, @CurrentViewer() v: RequestViewer) {
    return this.webhooks.save(v, id, body);
  }

  @Post('webhooks/:id/secret')
  @HttpCode(200)
  @AdminEndpoint('admin.developers')
  rotateHookSecret(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.webhooks.rotateSecret(v, id);
  }

  @Post('webhooks/:id/ping')
  @HttpCode(200)
  @AdminEndpoint('admin.developers')
  ping(@Param('id', new ZodPipe(idParam)) id: number) {
    return this.webhooks.ping(id);
  }

  @Delete('webhooks/:id')
  @AdminEndpoint('admin.developers')
  async deleteHook(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.webhooks.remove(v, id);
    return { ok: true };
  }

  @Get('webhooks/:id/deliveries')
  @AdminEndpoint('admin.developers')
  deliveries(@Param('id', new ZodPipe(idParam)) id: number, @Query() q: unknown) {
    return this.webhooks.deliveries(id, parse(pageQuery, q).page);
  }

  @Post('deliveries/:id/redeliver')
  @HttpCode(200)
  @AdminEndpoint('admin.developers')
  redeliver(@Param('id', new ZodPipe(idParam)) id: number) {
    return this.webhooks.redeliver(id);
  }

  // ----- Sosyal giriş -----

  @Put('social')
  @AdminEndpoint('admin.developers')
  async saveSocial(@Body(new ZodPipe(socialProvidersInput)) body: z.output<typeof socialProvidersInput>, @CurrentViewer() v: RequestViewer) {
    await this.social.save(v, body);
    return { providers: this.social.admin() };
  }
}
