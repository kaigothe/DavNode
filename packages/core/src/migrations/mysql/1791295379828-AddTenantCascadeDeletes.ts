import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `ON DELETE CASCADE` (or, for `users.default_calendar_id`,
 * `ON DELETE SET NULL`) to every foreign key that was missing it, so
 * that a single `DELETE FROM tenants WHERE id = :id` removes a tenant's
 * entire row graph — principals, users, groups, every resource domain
 * and its `*_aces`/`*_locks`/`*_changes`/`*_properties` tables,
 * scheduling inbox items, credentials, ... — without leaving orphaned
 * rows anywhere (M9,
 * milestones/M9-admin-api/03-tenant-management/02-tenant-deletion.md).
 * `users.default_calendar_id` is the one deliberate exception: it is a
 * convenience pointer to one of the user's own calendars, not an
 * ownership relationship, so the calendar being deleted must not delete
 * the user too.
 */
export class AddTenantCascadeDeletes1791295379828 implements MigrationInterface {
  name = 'AddTenantCascadeDeletes1791295379828';

  /** Applies the migration: drops and re-adds every affected foreign key with its new `ON DELETE` behavior. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`principals\` DROP FOREIGN KEY \`FK_f0e7950772e6b6aca9c6f78a525\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` DROP FOREIGN KEY \`FK_540dccbd82902e2d164ca91ca6d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` DROP FOREIGN KEY \`FK_921059bf974517bd075d9c81061\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` DROP FOREIGN KEY \`FK_924c3e536070041d78a1ade1c03\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_aces\` DROP FOREIGN KEY \`FK_af5769209aee6853ae7011138c1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_aces\` DROP FOREIGN KEY \`FK_b0777647b1b015e4305f5782b09\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbooks\` DROP FOREIGN KEY \`FK_827be781a4d20fcdfbce2ab6dbc\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbooks\` DROP FOREIGN KEY \`FK_a662f034e11bb9660ecde042be4\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` DROP FOREIGN KEY \`FK_1f9ca4955716807c430cb94c3a8\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` DROP FOREIGN KEY \`FK_941fdab999183be409b8482cc30\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` DROP FOREIGN KEY \`FK_cac47f6d742edc4c26aabe7d5c6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_aces\` DROP FOREIGN KEY \`FK_58bf92e28b478c6534cf5b4bf0b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_aces\` DROP FOREIGN KEY \`FK_b8a7194ed4db62f4c1ec874d72a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_locks\` DROP FOREIGN KEY \`FK_52fa819b7afe6c73b9ac90ff8c7\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_locks\` DROP FOREIGN KEY \`FK_b687c1bbac285cec3a98cf3efee\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_locks\` DROP FOREIGN KEY \`FK_caa2e72e6b5b67f465e5df6598f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_locks\` DROP FOREIGN KEY \`FK_e5a26600f217355768c3e161054\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_properties\` DROP FOREIGN KEY \`FK_ebd34d3347a1b87beea377d7f4f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_aces\` DROP FOREIGN KEY \`FK_163408d6e9b1ffcaeff70a7f66d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_aces\` DROP FOREIGN KEY \`FK_c0286abf23a6997225d554626ec\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_changes\` DROP FOREIGN KEY \`FK_3d0591021c856656a4f74355888\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_changes\` DROP FOREIGN KEY \`FK_b2f635ae5860db28022e7647287\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_locks\` DROP FOREIGN KEY \`FK_5f3ebcdd331c93c69997e0670b1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_locks\` DROP FOREIGN KEY \`FK_a5a7e6ff45ec59e71ebd88fa4c1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_properties\` DROP FOREIGN KEY \`FK_f56fbc9b44df33e0dae639055d2\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendars\` DROP FOREIGN KEY \`FK_c6809561e0dc82e7ad5b8493e0f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendars\` DROP FOREIGN KEY \`FK_e7a60821a6568f5551eb19ddf31\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_aces\` DROP FOREIGN KEY \`FK_152802f03431b37689985a25433\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_aces\` DROP FOREIGN KEY \`FK_28bda8f1c6b5f350cefc31434f1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_changes\` DROP FOREIGN KEY \`FK_77820bd3f3f8a2da07bf884aaf1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_locks\` DROP FOREIGN KEY \`FK_0ee2f3b99a467ff1547e4e51fd0\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_locks\` DROP FOREIGN KEY \`FK_6e35df3bb6e04309c042888ece6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` DROP FOREIGN KEY \`FK_4227fe7c36e614604e245111372\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` DROP FOREIGN KEY \`FK_5799578b4cbd97d0777d0e3d8d5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` DROP FOREIGN KEY \`FK_89ff9f9b2f154fd9aa951719b52\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_aces\` DROP FOREIGN KEY \`FK_67c6c7c97d8cbcd577410d7aef5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_aces\` DROP FOREIGN KEY \`FK_916060d7b0bb5871250a1934b9d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_locks\` DROP FOREIGN KEY \`FK_bf9308d1ebf2c35711898715ca3\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_locks\` DROP FOREIGN KEY \`FK_e1de505eba49231332daf503a14\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_properties\` DROP FOREIGN KEY \`FK_e73274b0de016a20a459f48f587\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_properties\` DROP FOREIGN KEY \`FK_58a88e8e32a2363da9fad400578\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_properties\` DROP FOREIGN KEY \`FK_10670fbbd7f617aab66b2fbb0ec\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_109638590074998bb72a2f2cf08\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_206a9c98c895e44a2e524b03edd\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_77a9a771ebc3370f1af52736343\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`credentials\` DROP FOREIGN KEY \`FK_c68a6c53e95a7dc357f4ebce8f0\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` DROP FOREIGN KEY \`FK_088edeb6366943a9d94f8272d38\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` DROP FOREIGN KEY \`FK_79f179ded1331d56c1d77f35cbd\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` DROP FOREIGN KEY \`FK_8c9f2d57f09fbab834254cdb351\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_aces\` DROP FOREIGN KEY \`FK_50c39db6813a50ea6a8df5bec97\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_aces\` DROP FOREIGN KEY \`FK_ebb79d587328df2209f597a5097\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_locks\` DROP FOREIGN KEY \`FK_dd3be5955135ee49f14388907c1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_locks\` DROP FOREIGN KEY \`FK_f54427bf1772f846bdbeddc7e55\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_properties\` DROP FOREIGN KEY \`FK_2a9a1fa9b9b0fdd99af45f85381\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`groups\` DROP FOREIGN KEY \`FK_245f58bdfb3e9529b4100d9c5e7\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`groups\` DROP FOREIGN KEY \`FK_49c3ac49d10e25bf2434234fcbe\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`group_memberships\` DROP FOREIGN KEY \`FK_0e588f4e5fa5ddd066e35521540\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`group_memberships\` DROP FOREIGN KEY \`FK_cad344fe877fcee0ac7e065ed05\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`scheduling_inbox_items\` DROP FOREIGN KEY \`FK_792cbbc25cb08b59cddc34e9a52\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`scheduling_inbox_items\` DROP FOREIGN KEY \`FK_7f22de768bcfd46beca3612d35f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`principals\` ADD CONSTRAINT \`FK_f0e7950772e6b6aca9c6f78a525\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` ADD CONSTRAINT \`FK_540dccbd82902e2d164ca91ca6d\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` ADD CONSTRAINT \`FK_921059bf974517bd075d9c81061\` FOREIGN KEY (\`parent_collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` ADD CONSTRAINT \`FK_924c3e536070041d78a1ade1c03\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_aces\` ADD CONSTRAINT \`FK_af5769209aee6853ae7011138c1\` FOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_aces\` ADD CONSTRAINT \`FK_b0777647b1b015e4305f5782b09\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbooks\` ADD CONSTRAINT \`FK_827be781a4d20fcdfbce2ab6dbc\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbooks\` ADD CONSTRAINT \`FK_a662f034e11bb9660ecde042be4\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` ADD CONSTRAINT \`FK_941fdab999183be409b8482cc30\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` ADD CONSTRAINT \`FK_cac47f6d742edc4c26aabe7d5c6\` FOREIGN KEY (\`addressbook_id\`) REFERENCES \`addressbooks\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` ADD CONSTRAINT \`FK_1f9ca4955716807c430cb94c3a8\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_aces\` ADD CONSTRAINT \`FK_58bf92e28b478c6534cf5b4bf0b\` FOREIGN KEY (\`address_object_id\`) REFERENCES \`address_objects\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_aces\` ADD CONSTRAINT \`FK_b8a7194ed4db62f4c1ec874d72a\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_locks\` ADD CONSTRAINT \`FK_52fa819b7afe6c73b9ac90ff8c7\` FOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_locks\` ADD CONSTRAINT \`FK_b687c1bbac285cec3a98cf3efee\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_locks\` ADD CONSTRAINT \`FK_caa2e72e6b5b67f465e5df6598f\` FOREIGN KEY (\`address_object_id\`) REFERENCES \`address_objects\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_locks\` ADD CONSTRAINT \`FK_e5a26600f217355768c3e161054\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_properties\` ADD CONSTRAINT \`FK_ebd34d3347a1b87beea377d7f4f\` FOREIGN KEY (\`address_object_id\`) REFERENCES \`address_objects\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_aces\` ADD CONSTRAINT \`FK_163408d6e9b1ffcaeff70a7f66d\` FOREIGN KEY (\`addressbook_id\`) REFERENCES \`addressbooks\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_aces\` ADD CONSTRAINT \`FK_c0286abf23a6997225d554626ec\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_changes\` ADD CONSTRAINT \`FK_3d0591021c856656a4f74355888\` FOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_changes\` ADD CONSTRAINT \`FK_b2f635ae5860db28022e7647287\` FOREIGN KEY (\`addressbook_id\`) REFERENCES \`addressbooks\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_locks\` ADD CONSTRAINT \`FK_a5a7e6ff45ec59e71ebd88fa4c1\` FOREIGN KEY (\`addressbook_id\`) REFERENCES \`addressbooks\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_locks\` ADD CONSTRAINT \`FK_5f3ebcdd331c93c69997e0670b1\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_properties\` ADD CONSTRAINT \`FK_f56fbc9b44df33e0dae639055d2\` FOREIGN KEY (\`addressbook_id\`) REFERENCES \`addressbooks\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendars\` ADD CONSTRAINT \`FK_c6809561e0dc82e7ad5b8493e0f\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendars\` ADD CONSTRAINT \`FK_e7a60821a6568f5551eb19ddf31\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_aces\` ADD CONSTRAINT \`FK_28bda8f1c6b5f350cefc31434f1\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_aces\` ADD CONSTRAINT \`FK_152802f03431b37689985a25433\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_changes\` ADD CONSTRAINT \`FK_77820bd3f3f8a2da07bf884aaf1\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_locks\` ADD CONSTRAINT \`FK_0ee2f3b99a467ff1547e4e51fd0\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_locks\` ADD CONSTRAINT \`FK_6e35df3bb6e04309c042888ece6\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` ADD CONSTRAINT \`FK_5799578b4cbd97d0777d0e3d8d5\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` ADD CONSTRAINT \`FK_89ff9f9b2f154fd9aa951719b52\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` ADD CONSTRAINT \`FK_4227fe7c36e614604e245111372\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_aces\` ADD CONSTRAINT \`FK_916060d7b0bb5871250a1934b9d\` FOREIGN KEY (\`calendar_object_id\`) REFERENCES \`calendar_objects\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_aces\` ADD CONSTRAINT \`FK_67c6c7c97d8cbcd577410d7aef5\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_locks\` ADD CONSTRAINT \`FK_e1de505eba49231332daf503a14\` FOREIGN KEY (\`calendar_object_id\`) REFERENCES \`calendar_objects\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_locks\` ADD CONSTRAINT \`FK_bf9308d1ebf2c35711898715ca3\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_properties\` ADD CONSTRAINT \`FK_e73274b0de016a20a459f48f587\` FOREIGN KEY (\`calendar_object_id\`) REFERENCES \`calendar_objects\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_properties\` ADD CONSTRAINT \`FK_58a88e8e32a2363da9fad400578\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_properties\` ADD CONSTRAINT \`FK_10670fbbd7f617aab66b2fbb0ec\` FOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD CONSTRAINT \`FK_77a9a771ebc3370f1af52736343\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD CONSTRAINT \`FK_109638590074998bb72a2f2cf08\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD CONSTRAINT \`FK_206a9c98c895e44a2e524b03edd\` FOREIGN KEY (\`default_calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`credentials\` ADD CONSTRAINT \`FK_c68a6c53e95a7dc357f4ebce8f0\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` ADD CONSTRAINT \`FK_8c9f2d57f09fbab834254cdb351\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` ADD CONSTRAINT \`FK_79f179ded1331d56c1d77f35cbd\` FOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` ADD CONSTRAINT \`FK_088edeb6366943a9d94f8272d38\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_aces\` ADD CONSTRAINT \`FK_50c39db6813a50ea6a8df5bec97\` FOREIGN KEY (\`file_resource_id\`) REFERENCES \`file_resources\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_aces\` ADD CONSTRAINT \`FK_ebb79d587328df2209f597a5097\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_locks\` ADD CONSTRAINT \`FK_dd3be5955135ee49f14388907c1\` FOREIGN KEY (\`file_resource_id\`) REFERENCES \`file_resources\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_locks\` ADD CONSTRAINT \`FK_f54427bf1772f846bdbeddc7e55\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_properties\` ADD CONSTRAINT \`FK_2a9a1fa9b9b0fdd99af45f85381\` FOREIGN KEY (\`file_resource_id\`) REFERENCES \`file_resources\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`groups\` ADD CONSTRAINT \`FK_49c3ac49d10e25bf2434234fcbe\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`groups\` ADD CONSTRAINT \`FK_245f58bdfb3e9529b4100d9c5e7\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`group_memberships\` ADD CONSTRAINT \`FK_cad344fe877fcee0ac7e065ed05\` FOREIGN KEY (\`group_id\`) REFERENCES \`groups\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`group_memberships\` ADD CONSTRAINT \`FK_0e588f4e5fa5ddd066e35521540\` FOREIGN KEY (\`member_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`scheduling_inbox_items\` ADD CONSTRAINT \`FK_7f22de768bcfd46beca3612d35f\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`scheduling_inbox_items\` ADD CONSTRAINT \`FK_792cbbc25cb08b59cddc34e9a52\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops and re-adds every affected foreign key back to `ON DELETE NO ACTION`. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`scheduling_inbox_items\` DROP FOREIGN KEY \`FK_792cbbc25cb08b59cddc34e9a52\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`scheduling_inbox_items\` DROP FOREIGN KEY \`FK_7f22de768bcfd46beca3612d35f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`group_memberships\` DROP FOREIGN KEY \`FK_0e588f4e5fa5ddd066e35521540\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`group_memberships\` DROP FOREIGN KEY \`FK_cad344fe877fcee0ac7e065ed05\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`groups\` DROP FOREIGN KEY \`FK_245f58bdfb3e9529b4100d9c5e7\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`groups\` DROP FOREIGN KEY \`FK_49c3ac49d10e25bf2434234fcbe\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_properties\` DROP FOREIGN KEY \`FK_2a9a1fa9b9b0fdd99af45f85381\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_locks\` DROP FOREIGN KEY \`FK_f54427bf1772f846bdbeddc7e55\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_locks\` DROP FOREIGN KEY \`FK_dd3be5955135ee49f14388907c1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_aces\` DROP FOREIGN KEY \`FK_ebb79d587328df2209f597a5097\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_aces\` DROP FOREIGN KEY \`FK_50c39db6813a50ea6a8df5bec97\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` DROP FOREIGN KEY \`FK_088edeb6366943a9d94f8272d38\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` DROP FOREIGN KEY \`FK_79f179ded1331d56c1d77f35cbd\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` DROP FOREIGN KEY \`FK_8c9f2d57f09fbab834254cdb351\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`credentials\` DROP FOREIGN KEY \`FK_c68a6c53e95a7dc357f4ebce8f0\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_206a9c98c895e44a2e524b03edd\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_109638590074998bb72a2f2cf08\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_77a9a771ebc3370f1af52736343\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_properties\` DROP FOREIGN KEY \`FK_10670fbbd7f617aab66b2fbb0ec\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_properties\` DROP FOREIGN KEY \`FK_58a88e8e32a2363da9fad400578\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_properties\` DROP FOREIGN KEY \`FK_e73274b0de016a20a459f48f587\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_locks\` DROP FOREIGN KEY \`FK_bf9308d1ebf2c35711898715ca3\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_locks\` DROP FOREIGN KEY \`FK_e1de505eba49231332daf503a14\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_aces\` DROP FOREIGN KEY \`FK_67c6c7c97d8cbcd577410d7aef5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_aces\` DROP FOREIGN KEY \`FK_916060d7b0bb5871250a1934b9d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` DROP FOREIGN KEY \`FK_4227fe7c36e614604e245111372\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` DROP FOREIGN KEY \`FK_89ff9f9b2f154fd9aa951719b52\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` DROP FOREIGN KEY \`FK_5799578b4cbd97d0777d0e3d8d5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_locks\` DROP FOREIGN KEY \`FK_6e35df3bb6e04309c042888ece6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_locks\` DROP FOREIGN KEY \`FK_0ee2f3b99a467ff1547e4e51fd0\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_changes\` DROP FOREIGN KEY \`FK_77820bd3f3f8a2da07bf884aaf1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_aces\` DROP FOREIGN KEY \`FK_152802f03431b37689985a25433\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_aces\` DROP FOREIGN KEY \`FK_28bda8f1c6b5f350cefc31434f1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendars\` DROP FOREIGN KEY \`FK_e7a60821a6568f5551eb19ddf31\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendars\` DROP FOREIGN KEY \`FK_c6809561e0dc82e7ad5b8493e0f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_properties\` DROP FOREIGN KEY \`FK_f56fbc9b44df33e0dae639055d2\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_locks\` DROP FOREIGN KEY \`FK_5f3ebcdd331c93c69997e0670b1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_locks\` DROP FOREIGN KEY \`FK_a5a7e6ff45ec59e71ebd88fa4c1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_changes\` DROP FOREIGN KEY \`FK_b2f635ae5860db28022e7647287\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_changes\` DROP FOREIGN KEY \`FK_3d0591021c856656a4f74355888\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_aces\` DROP FOREIGN KEY \`FK_c0286abf23a6997225d554626ec\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_aces\` DROP FOREIGN KEY \`FK_163408d6e9b1ffcaeff70a7f66d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_properties\` DROP FOREIGN KEY \`FK_ebd34d3347a1b87beea377d7f4f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_locks\` DROP FOREIGN KEY \`FK_e5a26600f217355768c3e161054\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_locks\` DROP FOREIGN KEY \`FK_caa2e72e6b5b67f465e5df6598f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_locks\` DROP FOREIGN KEY \`FK_b687c1bbac285cec3a98cf3efee\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_locks\` DROP FOREIGN KEY \`FK_52fa819b7afe6c73b9ac90ff8c7\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_aces\` DROP FOREIGN KEY \`FK_b8a7194ed4db62f4c1ec874d72a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_aces\` DROP FOREIGN KEY \`FK_58bf92e28b478c6534cf5b4bf0b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` DROP FOREIGN KEY \`FK_1f9ca4955716807c430cb94c3a8\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` DROP FOREIGN KEY \`FK_cac47f6d742edc4c26aabe7d5c6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` DROP FOREIGN KEY \`FK_941fdab999183be409b8482cc30\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbooks\` DROP FOREIGN KEY \`FK_a662f034e11bb9660ecde042be4\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbooks\` DROP FOREIGN KEY \`FK_827be781a4d20fcdfbce2ab6dbc\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_aces\` DROP FOREIGN KEY \`FK_b0777647b1b015e4305f5782b09\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_aces\` DROP FOREIGN KEY \`FK_af5769209aee6853ae7011138c1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` DROP FOREIGN KEY \`FK_924c3e536070041d78a1ade1c03\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` DROP FOREIGN KEY \`FK_921059bf974517bd075d9c81061\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` DROP FOREIGN KEY \`FK_540dccbd82902e2d164ca91ca6d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`principals\` DROP FOREIGN KEY \`FK_f0e7950772e6b6aca9c6f78a525\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`scheduling_inbox_items\` ADD CONSTRAINT \`FK_7f22de768bcfd46beca3612d35f\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`scheduling_inbox_items\` ADD CONSTRAINT \`FK_792cbbc25cb08b59cddc34e9a52\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`group_memberships\` ADD CONSTRAINT \`FK_cad344fe877fcee0ac7e065ed05\` FOREIGN KEY (\`group_id\`) REFERENCES \`groups\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`group_memberships\` ADD CONSTRAINT \`FK_0e588f4e5fa5ddd066e35521540\` FOREIGN KEY (\`member_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`groups\` ADD CONSTRAINT \`FK_49c3ac49d10e25bf2434234fcbe\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`groups\` ADD CONSTRAINT \`FK_245f58bdfb3e9529b4100d9c5e7\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_properties\` ADD CONSTRAINT \`FK_2a9a1fa9b9b0fdd99af45f85381\` FOREIGN KEY (\`file_resource_id\`) REFERENCES \`file_resources\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_locks\` ADD CONSTRAINT \`FK_f54427bf1772f846bdbeddc7e55\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_locks\` ADD CONSTRAINT \`FK_dd3be5955135ee49f14388907c1\` FOREIGN KEY (\`file_resource_id\`) REFERENCES \`file_resources\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_aces\` ADD CONSTRAINT \`FK_ebb79d587328df2209f597a5097\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_aces\` ADD CONSTRAINT \`FK_50c39db6813a50ea6a8df5bec97\` FOREIGN KEY (\`file_resource_id\`) REFERENCES \`file_resources\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` ADD CONSTRAINT \`FK_8c9f2d57f09fbab834254cdb351\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` ADD CONSTRAINT \`FK_79f179ded1331d56c1d77f35cbd\` FOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` ADD CONSTRAINT \`FK_088edeb6366943a9d94f8272d38\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`credentials\` ADD CONSTRAINT \`FK_c68a6c53e95a7dc357f4ebce8f0\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD CONSTRAINT \`FK_77a9a771ebc3370f1af52736343\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD CONSTRAINT \`FK_206a9c98c895e44a2e524b03edd\` FOREIGN KEY (\`default_calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD CONSTRAINT \`FK_109638590074998bb72a2f2cf08\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_properties\` ADD CONSTRAINT \`FK_10670fbbd7f617aab66b2fbb0ec\` FOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_properties\` ADD CONSTRAINT \`FK_58a88e8e32a2363da9fad400578\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_properties\` ADD CONSTRAINT \`FK_e73274b0de016a20a459f48f587\` FOREIGN KEY (\`calendar_object_id\`) REFERENCES \`calendar_objects\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_locks\` ADD CONSTRAINT \`FK_e1de505eba49231332daf503a14\` FOREIGN KEY (\`calendar_object_id\`) REFERENCES \`calendar_objects\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_locks\` ADD CONSTRAINT \`FK_bf9308d1ebf2c35711898715ca3\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_aces\` ADD CONSTRAINT \`FK_916060d7b0bb5871250a1934b9d\` FOREIGN KEY (\`calendar_object_id\`) REFERENCES \`calendar_objects\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_aces\` ADD CONSTRAINT \`FK_67c6c7c97d8cbcd577410d7aef5\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` ADD CONSTRAINT \`FK_89ff9f9b2f154fd9aa951719b52\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` ADD CONSTRAINT \`FK_5799578b4cbd97d0777d0e3d8d5\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` ADD CONSTRAINT \`FK_4227fe7c36e614604e245111372\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_locks\` ADD CONSTRAINT \`FK_6e35df3bb6e04309c042888ece6\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_locks\` ADD CONSTRAINT \`FK_0ee2f3b99a467ff1547e4e51fd0\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_changes\` ADD CONSTRAINT \`FK_77820bd3f3f8a2da07bf884aaf1\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_aces\` ADD CONSTRAINT \`FK_28bda8f1c6b5f350cefc31434f1\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_aces\` ADD CONSTRAINT \`FK_152802f03431b37689985a25433\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendars\` ADD CONSTRAINT \`FK_e7a60821a6568f5551eb19ddf31\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendars\` ADD CONSTRAINT \`FK_c6809561e0dc82e7ad5b8493e0f\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_properties\` ADD CONSTRAINT \`FK_f56fbc9b44df33e0dae639055d2\` FOREIGN KEY (\`addressbook_id\`) REFERENCES \`addressbooks\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_locks\` ADD CONSTRAINT \`FK_a5a7e6ff45ec59e71ebd88fa4c1\` FOREIGN KEY (\`addressbook_id\`) REFERENCES \`addressbooks\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_locks\` ADD CONSTRAINT \`FK_5f3ebcdd331c93c69997e0670b1\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_changes\` ADD CONSTRAINT \`FK_b2f635ae5860db28022e7647287\` FOREIGN KEY (\`addressbook_id\`) REFERENCES \`addressbooks\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_changes\` ADD CONSTRAINT \`FK_3d0591021c856656a4f74355888\` FOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_aces\` ADD CONSTRAINT \`FK_c0286abf23a6997225d554626ec\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_aces\` ADD CONSTRAINT \`FK_163408d6e9b1ffcaeff70a7f66d\` FOREIGN KEY (\`addressbook_id\`) REFERENCES \`addressbooks\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_properties\` ADD CONSTRAINT \`FK_ebd34d3347a1b87beea377d7f4f\` FOREIGN KEY (\`address_object_id\`) REFERENCES \`address_objects\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_locks\` ADD CONSTRAINT \`FK_e5a26600f217355768c3e161054\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_locks\` ADD CONSTRAINT \`FK_caa2e72e6b5b67f465e5df6598f\` FOREIGN KEY (\`address_object_id\`) REFERENCES \`address_objects\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_locks\` ADD CONSTRAINT \`FK_b687c1bbac285cec3a98cf3efee\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_locks\` ADD CONSTRAINT \`FK_52fa819b7afe6c73b9ac90ff8c7\` FOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_aces\` ADD CONSTRAINT \`FK_b8a7194ed4db62f4c1ec874d72a\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_aces\` ADD CONSTRAINT \`FK_58bf92e28b478c6534cf5b4bf0b\` FOREIGN KEY (\`address_object_id\`) REFERENCES \`address_objects\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` ADD CONSTRAINT \`FK_cac47f6d742edc4c26aabe7d5c6\` FOREIGN KEY (\`addressbook_id\`) REFERENCES \`addressbooks\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` ADD CONSTRAINT \`FK_941fdab999183be409b8482cc30\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` ADD CONSTRAINT \`FK_1f9ca4955716807c430cb94c3a8\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbooks\` ADD CONSTRAINT \`FK_a662f034e11bb9660ecde042be4\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbooks\` ADD CONSTRAINT \`FK_827be781a4d20fcdfbce2ab6dbc\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_aces\` ADD CONSTRAINT \`FK_b0777647b1b015e4305f5782b09\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_aces\` ADD CONSTRAINT \`FK_af5769209aee6853ae7011138c1\` FOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` ADD CONSTRAINT \`FK_924c3e536070041d78a1ade1c03\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` ADD CONSTRAINT \`FK_921059bf974517bd075d9c81061\` FOREIGN KEY (\`parent_collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` ADD CONSTRAINT \`FK_540dccbd82902e2d164ca91ca6d\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`principals\` ADD CONSTRAINT \`FK_f0e7950772e6b6aca9c6f78a525\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
