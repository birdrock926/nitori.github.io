const TABLE_NAME = 'comments';

const ensureColumn = async (knex, columnName, createFn) => {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) {
    return false;
  }
  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, columnName);
  if (!hasColumn) {
    await knex.schema.alterTable(TABLE_NAME, createFn);
    return true;
  }
  return false;
};

/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  const addedStatus = await ensureColumn(knex, 'status', (table) => {
    table.string('status', 16).notNullable().defaultTo('pending');
  });

  if (addedStatus) {
    await knex(TABLE_NAME).update({ status: 'pending' });
  }

  await ensureColumn(knex, 'meta', (table) => {
    table.json('meta');
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) {
    return;
  }
  const hasStatus = await knex.schema.hasColumn(TABLE_NAME, 'status');
  if (hasStatus) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      table.dropColumn('status');
    });
  }
}
