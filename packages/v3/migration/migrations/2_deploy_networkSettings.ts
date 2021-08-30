import { deployedContract, Migration } from '../engine/types';
import { NextState as InitialState } from './1_deploy_proxyAdmin';

export type NextState = InitialState & {
    networkSettings: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, deployProxy }): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.proxyAdmin);

        const networkSettings = await deployProxy(proxyAdmin, contracts.NetworkSettings, []);

        return {
            ...initialState,

            networkSettings: networkSettings.address
        };
    },

    healthCheck: async (signer, contracts, initialState: InitialState, state: NextState, { deploy, execute }) => {
        const networkSettings = await contracts.NetworkSettings.attach(state.networkSettings);

        if ((await networkSettings.owner()) !== (await signer.getAddress())) throw new Error('Invalid Owner');
    },

    down: async (
        signer,
        contracts,
        initialState: InitialState,
        newState: NextState,
        { deploy, execute }
    ): Promise<InitialState> => {
        return initialState;
    }
};
export default migration;
