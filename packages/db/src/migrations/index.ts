import type { Migration, MigrationProvider } from 'kysely/migration';
import * as m0001 from './0001_core.js';
import * as m0002 from './0002_identity.js';
import * as m0003 from './0003_moderation.js';
import * as m0004 from './0004_achievements_notifications.js';
import * as m0005 from './0005_forum.js';
import * as m0006 from './0006_appearance.js';
import * as m0007 from './0007_identity.js';
import * as m0008 from './0008_category_backgrounds.js';
import * as m0009 from './0009_home_blocks.js';
import * as m0010 from './0010_reactions.js';
import * as m0011 from './0011_nav_style.js';
import * as m0012 from './0012_messages.js';
import * as m0013 from './0013_custom_code.js';
import * as m0014 from './0014_tags_polls.js';
import * as m0015 from './0015_custom_emojis.js';
import * as m0016 from './0016_board_cover_mail.js';
import * as m0017 from './0017_developer.js';
import * as m0018 from './0018_wiki.js';
import * as m0019 from './0019_applications.js';
import * as m0020 from './0020_tickets.js';
import * as m0021 from './0021_language.js';
import * as m0022 from './0022_import.js';
import * as m0023 from './0023_quote_i18n.js';
import * as m0024 from './0024_topic_moderation.js';
import * as m0025 from './0025_topic_members.js';
import * as m0026 from './0026_theme_styles.js';
import * as m0027 from './0027_shoutbox.js';
import * as m0028 from './0028_themes.js';
import * as m0029 from './0029_page_code.js';
import * as m0030 from './0030_ticket_auto_assign.js';

/** Statik liste: paketlenmiş (bundle) sunucuda da dosya sistemi taraması gerekmez. */
export const migrations: Record<string, Migration> = {
  '0001_core': m0001,
  '0002_identity': m0002,
  '0003_moderation': m0003,
  '0004_achievements_notifications': m0004,
  '0005_forum': m0005,
  '0006_appearance': m0006,
  '0007_identity': m0007,
  '0008_category_backgrounds': m0008,
  '0009_home_blocks': m0009,
  '0010_reactions': m0010,
  '0011_nav_style': m0011,
  '0012_messages': m0012,
  '0013_custom_code': m0013,
  '0014_tags_polls': m0014,
  '0015_custom_emojis': m0015,
  '0016_board_cover_mail': m0016,
  '0017_developer': m0017,
  '0018_wiki': m0018,
  '0019_applications': m0019,
  '0020_tickets': m0020,
  '0021_language': m0021,
  '0022_import': m0022,
  '0023_quote_i18n': m0023,
  '0024_topic_moderation': m0024,
  '0025_topic_members': m0025,
  '0026_theme_styles': m0026,
  '0027_shoutbox': m0027,
  '0028_themes': m0028,
  '0029_page_code': m0029,
  '0030_ticket_auto_assign': m0030,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};
