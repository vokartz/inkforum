import { sql, type Kysely } from 'kysely';

const COLUMNS: Array<[table: string, column: string]> = [
  ['posts', 'body_html'],
  ['conversation_messages', 'body_html'],
  ['boards', 'about_html'],
  ['custom_pages', 'body_html'],
  ['wiki_pages', 'body_html'],
  ['application_forms', 'description_html'],
  ['ticket_categories', 'intro_html'],
  ['ticket_messages', 'body_html'],
];

const REPLACEMENTS: Array<[from: string, to: string]> = [
  ['</span> yazdı:', '</span><span class="bb-quote-says"></span>'],
  ['<div class="bb-quote-head">Alıntı:', '<div class="bb-quote-head"><span class="bb-quote-label"></span>'],
  [' aria-label="Alıntılanan mesaja git"', ''],
];

export async function up(db: Kysely<any>): Promise<void> {
  for (const [table, column] of COLUMNS) {
    let expr = sql.ref(column);
    for (const [from, to] of REPLACEMENTS) expr = sql`replace(${expr}, ${from}, ${to})`;
    await db
      .updateTable(table)
      .set({ [column]: expr })
      .where(column, 'like', '%bb-quote-head%')
      .execute();
  }
}

export async function down(): Promise<void> {
}
