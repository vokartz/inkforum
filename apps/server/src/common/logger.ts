import { ConsoleLogger } from '@nestjs/common';

/** Açılıştaki gürültülü rota/modül kayıt satırlarını gizleyen günlükleyici. */
const QUIET_CONTEXTS = new Set(['RouterExplorer', 'RoutesResolver', 'InstanceLoader', 'NestFactory']);

export class ForumLogger extends ConsoleLogger {
  override log(message: unknown, context?: string): void {
    if (context && QUIET_CONTEXTS.has(context)) return;
    super.log(message, context);
  }
}
