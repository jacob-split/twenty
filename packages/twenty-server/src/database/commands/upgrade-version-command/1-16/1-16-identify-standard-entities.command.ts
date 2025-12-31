import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';

import { Command } from 'nest-commander';
import { DataSource, IsNull, Not, Or, Repository } from 'typeorm';

import { ActiveOrSuspendedWorkspacesMigrationCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspaces-migration.command-runner';
import { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspaces-migration.command-runner';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DataSourceService } from 'src/engine/metadata-modules/data-source/data-source.service';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_OBJECTS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-object.constant';
import { isDefined } from 'twenty-shared/utils';

@Command({
  name: 'upgrade:1-16:identify-standard-entities',
  description: 'Identify standard entities',
})
export class IdentifyStandardEntitiesCommand extends ActiveOrSuspendedWorkspacesMigrationCommandRunner {
  constructor(
    @InjectRepository(WorkspaceEntity)
    protected readonly workspaceRepository: Repository<WorkspaceEntity>,
    protected readonly twentyORMGlobalManager: GlobalWorkspaceOrmManager,
    protected readonly dataSourceService: DataSourceService,
    protected readonly workspaceCacheService: WorkspaceCacheService,
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
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

    const queryRunner = this.coreDataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const fieldMetadataRepository =
        queryRunner.manager.getRepository(FieldMetadataEntity);

      const standardFieldMetadataEntities = await fieldMetadataRepository.find({
        select: {
          id: true,
          universalIdentifier: true,
          applicationId: true,
          name: true,
          object: {
            nameSingular: true,
          },
        },
        where: {
          workspaceId,
          applicationId: IsNull(),
          isCustom: Or(IsNull(), Not(true)),
          // should check for defined standard id too ?
          // should cehck for null universalIdentifier ?
        },
        withDeleted: true,
      });

      for (const fieldMetadataEntity of standardFieldMetadataEntities) {
        this.logger.log(`Processing entity id=${fieldMetadataEntity.id}`);

        const universalIdentifier: string | undefined =
          // @ts-expect-error ignore
          STANDARD_OBJECTS[fieldMetadataEntity.object.nameSingular]?.fields[
            fieldMetadataEntity.name
          ]?.universalIdentifier;

        if (!isDefined(universalIdentifier)) {
          throw new Error(
            `Should not occur could not find a universalIdentifier for a standard entity ${universalIdentifier} object ${fieldMetadataEntity.object.nameSingular} field ${fieldMetadataEntity.name}`,
          );
        }

        if (
          isDefined(fieldMetadataEntity.universalIdentifier) &&
          fieldMetadataEntity.universalIdentifier !== universalIdentifier
        ) {
          // We could just replace tbh but used for logging ftm
          throw new Error(
            `Should not occur invalid universalIdentifier set for standard entity expected ${universalIdentifier} got ${fieldMetadataEntity.universalIdentifier}`,
          );
        }

        await fieldMetadataRepository.update(fieldMetadataEntity.id, {
          universalIdentifier:
            fieldMetadataEntity.universalIdentifier ?? universalIdentifier,
          applicationId: fieldMetadataEntity.id,
        });
      }

      // TODO improve devx should be computed dynamically
      await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
        'flatFieldMetadataMaps',
        'flatObjectMetadataMaps',
        'flatViewFieldMaps',
      ]);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // TODO: Implement the logic here
  }
}
