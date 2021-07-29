import { migrateParamTask } from '..';
import { MIGRATION_DATA_FOLDER, MIGRATION_FOLDER, NETWORK_NAME, MIGRATION_CONFIG } from '../../config';
import { log } from '../logger/logger';
import { Migration } from '../types';
import { importCsjOrEsModule } from 'components/TaskUtils';
import fs from 'fs';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getDefaultParams } from 'migration/engine/task';
import { SystemState } from 'migration/engine/types';
import path from 'path';

export default async (args: migrateParamTask, hre: HardhatRuntimeEnvironment) => {
    const { signer, contracts, migrationsData, initialState, writeState, executionTools } = await getMigrateParams(
        hre,
        args
    );

    let state = initialState;

    // if there is no migration to run, exit
    if (migrationsData.length === 0) {
        log.done(`Nothing to migrate ⚡️`);
        return;
    }

    let currentNetworkState: any = state.networkState;
    for (const migrationData of migrationsData) {
        const migration: Migration = importCsjOrEsModule(migrationData.fullPath);

        log.executing(`Executing ${migrationData.fileName}, timestamp: ${migrationData.migrationTimestamp}`);

        // Save oldState
        const oldState = currentNetworkState;

        try {
            currentNetworkState = await migration.up(signer, contracts, currentNetworkState, executionTools);

            try {
                await migration.healthCheck(signer, contracts, currentNetworkState, executionTools);
                log.success('Health check success ✨ ');
            } catch (e) {
                log.error('Health check failed: ' + e);
                // @TODO revert the migration here
                return;
            }

            // if health check passed, update the state and write it to the system
            state = {
                migrationState: { latestMigration: migrationData.migrationTimestamp },
                networkState: currentNetworkState
            };
            writeState(state);
        } catch (e) {
            log.error('Migration execution failed');
            log.error(e);
            // @TODO revert the migration here
            return;
        }
    }
    log.done(`Migration(s) complete ⚡️`);
};

export const getMigrateParams = async (hre: HardhatRuntimeEnvironment, args: migrateParamTask) => {
    const { signer, contracts, overrides, executionConfig, executionTools } = await getDefaultParams(hre, args);

    const pathToState = path.join(hre.config.paths.root, MIGRATION_DATA_FOLDER, NETWORK_NAME);

    if (args.reset) {
        // If reset, delete all the files in the corresponding network folder
        log.info(`Resetting ${NETWORK_NAME} migratation folder`);
        fs.rmSync(pathToState, {
            recursive: true,
            force: true
        });
    }

    // If network folder doesn't exist, create it
    if (!fs.existsSync(pathToState)) {
        fs.mkdirSync(pathToState);
    }

    // Read all files into the folder and fetch any state file
    const pathToStateFolder = fs.readdirSync(pathToState);
    const stateFile = pathToStateFolder.find((fileName: string) => fileName === 'state.json');

    const writeState = async (state: SystemState) => {
        fs.writeFileSync(path.join(pathToState, 'state.json'), JSON.stringify(state, null, 4));
    };
    const fetchState = (pathToState: string) => {
        return JSON.parse(fs.readFileSync(path.join(pathToState, 'state.json'), 'utf-8')) as SystemState;
    };

    let state = {
        migrationState: {
            latestMigration: -1
        },
        networkState: {}
    };

    // If network is a fork fetch info from original network
    if (args.reset && MIGRATION_CONFIG.isFork) {
        try {
            log.info(`Fetching initial state from ${MIGRATION_CONFIG.originalNetwork}`);
            state = fetchState(
                path.join(hre.config.paths.root, MIGRATION_DATA_FOLDER, MIGRATION_CONFIG.originalNetwork)
            );
        } catch (e) {
            log.error(
                `${MIGRATION_CONFIG.originalNetwork} doesn't have a config (needed if you want to fork it), aborting.`
            );
            process.exit();
        }
    }

    // If there is no state file in the network's folder, create an empty one
    if (!stateFile) {
        writeState(state);
    }
    const initialState = fetchState(pathToState);

    // Migration files
    const pathToMigrationFiles = path.join(hre.config.paths.root, MIGRATION_FOLDER);
    const allMigrationFiles = fs.readdirSync(pathToMigrationFiles);
    const migrationFiles = allMigrationFiles.filter((fileName: string) => fileName.endsWith('.ts'));
    const migrationFilesPath = migrationFiles.map((fileName: string) => path.join(pathToMigrationFiles, fileName));
    const migrationsData: {
        fullPath: string;
        fileName: string;
        migrationTimestamp: number;
    }[] = [];
    for (const migrationFilePath of migrationFilesPath) {
        const fileName = path.basename(migrationFilePath);
        const migrationId = Number(fileName.split('_')[0]);
        if (migrationId > initialState.migrationState.latestMigration) {
            migrationsData.push({
                fullPath: migrationFilePath,
                fileName: fileName,
                migrationTimestamp: migrationId
            });
        }
    }
    // Even if migrations should be automatically sorted by the dir fetching, sort again just in case
    migrationsData.sort((a, b) =>
        a.migrationTimestamp > b.migrationTimestamp ? 1 : b.migrationTimestamp > a.migrationTimestamp ? -1 : 0
    );

    return {
        signer,
        contracts,
        initialState,
        executionTools,
        writeState,
        migrationsData,
        executionConfig,
        overrides
    };
};
