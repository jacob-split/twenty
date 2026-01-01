import { InjectRepository } from '@nestjs/typeorm';

import { Command } from 'nest-commander';
import { IsNull, Repository } from 'typeorm';

import { ActiveOrSuspendedWorkspacesMigrationCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspaces-migration.command-runner';
import { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspaces-migration.command-runner';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DataSourceService } from 'src/engine/metadata-modules/data-source/data-source.service';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { isStandardMetadata } from 'src/engine/metadata-modules/utils/is-standard-metadata.util';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_OBJECTS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-object.constant';
import {
  BASE_OBJECT_STANDARD_FIELD_IDS,
  CUSTOM_OBJECT_STANDARD_FIELD_IDS,
} from 'src/engine/workspace-manager/workspace-sync-metadata/constants/standard-field-ids';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';

type CustomFieldMetadata = {
  fieldMetadataEntity: FieldMetadataEntity;
  fromStandard: boolean;
};

type StandardFieldMetadata = {
  fieldMetadataEntity: FieldMetadataEntity;
  universalIdentifier: string;
};

type AllExceptions = 'unknown_standard_id' | 'existing_universal_id_missmatch';

type FieldMetadataException = {
  fieldMetadataEntity: FieldMetadataEntity;
  exception: AllExceptions;
};

const STANDARD_IDS_THAT_MUST_BECOME_CUSTOM = [
  ...Object.values(CUSTOM_OBJECT_STANDARD_FIELD_IDS),
  ...Object.values(BASE_OBJECT_STANDARD_FIELD_IDS),
] as string[];
@Command({
  name: 'upgrade:1-16:identify-standard-entities',
  description: 'Identify standard entities',
})
export class IdentifyStandardEntitiesCommand extends ActiveOrSuspendedWorkspacesMigrationCommandRunner {
  constructor(
    @InjectRepository(WorkspaceEntity)
    protected readonly workspaceRepository: Repository<WorkspaceEntity>,
    @InjectRepository(FieldMetadataEntity)
    private readonly fieldMetadataRepository: Repository<FieldMetadataEntity>,
    protected readonly twentyORMGlobalManager: GlobalWorkspaceOrmManager,
    protected readonly dataSourceService: DataSourceService,
    protected readonly applicationService: ApplicationService,
    protected readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceRepository, twentyORMGlobalManager, dataSourceService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    this.logger.log(
      `Running identify standard entities for workspace ${workspaceId}`,
    );

    const { twentyStandardFlatApplication, workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );

    const allFieldMetadataEntities = await this.fieldMetadataRepository.find({
      select: {
        id: true,
        universalIdentifier: true,
        applicationId: true,
        name: true,
        standardId: true,
        object: {
          nameSingular: true,
        },
        isCustom: true,
      },
      relations: ['object'],
      where: {
        workspaceId,
        applicationId: IsNull(),
      },
    });

    const customFieldMetadataEntities: CustomFieldMetadata[] = [];
    const standardFieldMetadataEntities: StandardFieldMetadata[] = [];
    const exceptions: FieldMetadataException[] = [];

    for (const fieldMetadataEntity of allFieldMetadataEntities) {
      const shouldBecomeCustom =
        isDefined(fieldMetadataEntity.standardId) &&
        STANDARD_IDS_THAT_MUST_BECOME_CUSTOM.includes(
          fieldMetadataEntity.standardId,
        );
      const isStandardMetadataResult = isStandardMetadata(fieldMetadataEntity);

      if (!isStandardMetadataResult || shouldBecomeCustom) {
        customFieldMetadataEntities.push({
          fieldMetadataEntity,
          fromStandard: shouldBecomeCustom,
        });

        continue;
      }

      const universalIdentifier: string | undefined =
        // @ts-expect-error ignore
        STANDARD_OBJECTS[fieldMetadataEntity.object.nameSingular]?.fields[
          fieldMetadataEntity.name
        ]?.universalIdentifier;

      if (!isDefined(universalIdentifier)) {
        exceptions.push({
          fieldMetadataEntity,
          exception: 'unknown_standard_id',
        });
        continue;
      }

      if (
        isDefined(fieldMetadataEntity.universalIdentifier) &&
        fieldMetadataEntity.universalIdentifier !== universalIdentifier
      ) {
        exceptions.push({
          fieldMetadataEntity,
          exception: 'existing_universal_id_missmatch',
        });
        continue;
      }

      standardFieldMetadataEntities.push({
        fieldMetadataEntity,
        universalIdentifier:
          fieldMetadataEntity.universalIdentifier ?? universalIdentifier,
      });
    }

    const totalUpdates =
      customFieldMetadataEntities.length +
      standardFieldMetadataEntities.length;
    this.logger.log(
      `Successfully validated ${totalUpdates}/${allFieldMetadataEntities.length} field metadata update(s) for workspace ${workspaceId} (${customFieldMetadataEntities.length} custom, ${standardFieldMetadataEntities.length} standard)`,
    );

    if (exceptions.length > 0) {
      this.logger.error(
        `Found ${exceptions.length} exception(s) while processing field metadata for workspace ${workspaceId}. No updates will be applied.`,
      );

      for (const { fieldMetadataEntity, exception } of exceptions) {
        this.logger.error(
          `Exception for field "${fieldMetadataEntity.name}" on object "${fieldMetadataEntity.object.nameSingular}" (id=${fieldMetadataEntity.id} standardId=${fieldMetadataEntity.standardId}): ${exception}`,
        );
      }

      throw new Error(
        `Aborting migration for workspace ${workspaceId} due to ${exceptions.length} exception(s). See logs above for details.`,
      );
    }

    if (!options.dryRun) {
      const customUpdates = customFieldMetadataEntities.map(
        ({ fieldMetadataEntity }) => ({
          id: fieldMetadataEntity.id,
          universalIdentifier: fieldMetadataEntity.universalIdentifier ?? v4(),
          applicationId: workspaceCustomFlatApplication.id,
        }),
      );

      const standardUpdates = standardFieldMetadataEntities.map(
        ({ fieldMetadataEntity, universalIdentifier }) => ({
          id: fieldMetadataEntity.id,
          universalIdentifier,
          applicationId: twentyStandardFlatApplication.id,
        }),
      );

      await this.fieldMetadataRepository.save([
        ...customUpdates,
        ...standardUpdates,
      ]);

      await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
        'flatFieldMetadataMaps',
        'flatObjectMetadataMaps',
        'flatViewFieldMaps',
      ]);

      this.logger.log(
        `Applied ${totalUpdates} field metadata update(s) for workspace ${workspaceId}`,
      );
    } else {
      this.logger.log(
        `Dry run: would apply ${totalUpdates} field metadata update(s) for workspace ${workspaceId}`,
      );
    }
  }
}
