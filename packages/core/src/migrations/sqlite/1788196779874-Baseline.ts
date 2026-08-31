import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline migration. Intentionally empty — there is no schema yet (the
 * first entities land in M1). Its purpose is to prove the migration
 * workflow itself works end to end before any real schema exists.
 */
export class Baseline1788196779874 implements MigrationInterface {
  name = 'Baseline1788196779874';

  /** Applies the migration. No-op: nothing to create yet. */
  public async up(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally empty.
  }

  /** Reverts the migration. No-op: nothing to tear down. */
  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally empty.
  }
}
