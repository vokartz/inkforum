import type { Kysely } from 'kysely';
import { flag, helpers, intDefault, notNull, ref, textDefault } from './_helpers.js';

/**
 * Geliştirici platformu: OAuth 2.0 sağlayıcı (uygulamalar, yetkilendirme kodları, erişim belirteçleri,
 * onaylar), sunucudan sunucuya API anahtarları, webhook'lar ve sosyal giriş kimlikleri.
 */
export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);

  await h
    .table('oauth_clients')
    .addColumn('client_id', 'text', notNull)
    .addColumn('name', 'text', notNull)
    .addColumn('description', 'text', textDefault(''))
    .addColumn('homepage_url', 'text')
    .addColumn('logo_url', 'text')
    .addColumn('redirect_uris_json', 'text', textDefault('[]'))
    .addColumn('scopes_json', 'text', textDefault('[]'))
    .addColumn('is_confidential', 'smallint', flag(1))
    .addColumn('secret_hash', 'text')
    .addColumn('is_trusted', 'smallint', flag(0))
    .addColumn('is_enabled', 'smallint', flag(1))
    .addColumn('created_by', 'integer', ref('users.id', 'set null', false))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('oauth_clients_client_id_uq').on('oauth_clients').column('client_id').unique().execute();

  await db.schema
    .createTable('oauth_codes')
    .addColumn('code_hash', 'text', (c) => c.primaryKey())
    .addColumn('client_id', 'integer', ref('oauth_clients.id'))
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('redirect_uri', 'text', notNull)
    .addColumn('scopes_json', 'text', notNull)
    .addColumn('code_challenge', 'text')
    .addColumn('challenge_method', 'text')
    .addColumn('expires_at', 'bigint', notNull)
    .addColumn('created_at', 'bigint', notNull)
    .execute();

  await h
    .table('oauth_tokens', { big: true })
    .addColumn('access_hash', 'text', notNull)
    .addColumn('refresh_hash', 'text')
    .addColumn('client_id', 'integer', ref('oauth_clients.id'))
    .addColumn('user_id', 'integer', ref('users.id', 'cascade', false))
    .addColumn('scopes_json', 'text', notNull)
    .addColumn('expires_at', 'bigint', notNull)
    .addColumn('refresh_expires_at', 'bigint')
    .addColumn('revoked_at', 'bigint')
    .addColumn('last_used_at', 'bigint')
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('oauth_tokens_access_uq').on('oauth_tokens').column('access_hash').unique().execute();
  await db.schema.createIndex('oauth_tokens_refresh_idx').on('oauth_tokens').column('refresh_hash').execute();
  await db.schema.createIndex('oauth_tokens_user_idx').on('oauth_tokens').columns(['user_id', 'client_id']).execute();

  await db.schema
    .createTable('oauth_consents')
    .addColumn('client_id', 'integer', ref('oauth_clients.id'))
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('scopes_json', 'text', notNull)
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .addPrimaryKeyConstraint('oauth_consents_pk', ['client_id', 'user_id'])
    .execute();

  await h
    .table('api_keys')
    .addColumn('name', 'text', notNull)
    .addColumn('prefix', 'text', notNull)
    .addColumn('key_hash', 'text', notNull)
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('scopes_json', 'text', notNull)
    .addColumn('created_by', 'integer', ref('users.id', 'set null', false))
    .addColumn('expires_at', 'bigint')
    .addColumn('revoked_at', 'bigint')
    .addColumn('last_used_at', 'bigint')
    .addColumn('last_ip', 'text')
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('api_keys_hash_uq').on('api_keys').column('key_hash').unique().execute();

  await h
    .table('webhooks')
    .addColumn('name', 'text', notNull)
    .addColumn('url', 'text', notNull)
    .addColumn('secret', 'text', notNull)
    .addColumn('events_json', 'text', textDefault('[]'))
    .addColumn('is_enabled', 'smallint', flag(1))
    .addColumn('failure_count', 'integer', intDefault(0))
    .addColumn('last_status', 'integer')
    .addColumn('last_delivery_at', 'bigint')
    .addColumn('created_by', 'integer', ref('users.id', 'set null', false))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();

  await h
    .table('webhook_deliveries', { big: true })
    .addColumn('webhook_id', 'integer', ref('webhooks.id'))
    .addColumn('uuid', 'text', notNull)
    .addColumn('event', 'text', notNull)
    .addColumn('payload_json', 'text', notNull)
    .addColumn('status', 'text', textDefault('pending'))
    .addColumn('response_code', 'integer')
    .addColumn('response_body', 'text')
    .addColumn('error', 'text')
    .addColumn('attempts', 'integer', intDefault(0))
    .addColumn('duration_ms', 'integer')
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('delivered_at', 'bigint')
    .execute();
  await db.schema.createIndex('webhook_deliveries_hook_idx').on('webhook_deliveries').columns(['webhook_id', 'id']).execute();

  await h
    .table('user_identities')
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('provider', 'text', notNull)
    .addColumn('subject', 'text', notNull)
    .addColumn('email', 'text')
    .addColumn('display_name', 'text')
    .addColumn('avatar_url', 'text')
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('last_login_at', 'bigint')
    .execute();
  await db.schema.createIndex('user_identities_provider_uq').on('user_identities').columns(['provider', 'subject']).unique().execute();
  await db.schema.createIndex('user_identities_user_idx').on('user_identities').column('user_id').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['user_identities', 'webhook_deliveries', 'webhooks', 'api_keys', 'oauth_consents', 'oauth_tokens', 'oauth_codes', 'oauth_clients']) {
    await db.schema.dropTable(t).execute();
  }
}
