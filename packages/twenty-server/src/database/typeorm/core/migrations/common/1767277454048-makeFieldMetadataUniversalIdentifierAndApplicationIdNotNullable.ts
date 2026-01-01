import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeFieldMetadataUniversalIdentifierAndApplicationIdNotNullable1767277454048
  implements MigrationInterface
{
  name = 'MakeFieldMetadataUniversalIdentifierAndApplicationIdNotNullable1767277454048';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."fieldMetadata" DROP CONSTRAINT "FK_05453a954e458e3d91f2ff5043f"`,
    );
    await queryRunner.query(
      `DROP INDEX "core"."IDX_f1c88fdfc3ad8910b17fc1fd73"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."fieldMetadata" ALTER COLUMN "universalIdentifier" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."fieldMetadata" ALTER COLUMN "applicationId" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f1c88fdfc3ad8910b17fc1fd73" ON "core"."fieldMetadata" ("workspaceId", "universalIdentifier") `,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."fieldMetadata" ADD CONSTRAINT "FK_05453a954e458e3d91f2ff5043f" FOREIGN KEY ("applicationId") REFERENCES "core"."application"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."fieldMetadata" DROP CONSTRAINT "FK_05453a954e458e3d91f2ff5043f"`,
    );
    await queryRunner.query(
      `DROP INDEX "core"."IDX_f1c88fdfc3ad8910b17fc1fd73"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."fieldMetadata" ALTER COLUMN "applicationId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."fieldMetadata" ALTER COLUMN "universalIdentifier" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f1c88fdfc3ad8910b17fc1fd73" ON "core"."fieldMetadata" ("workspaceId", "universalIdentifier") `,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."fieldMetadata" ADD CONSTRAINT "FK_05453a954e458e3d91f2ff5043f" FOREIGN KEY ("applicationId") REFERENCES "core"."application"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}

