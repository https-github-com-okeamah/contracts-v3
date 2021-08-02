import Contracts, { Contract, ContractBuilder } from 'components/Contracts';
import { BaseContract, BigNumber, ContractFactory } from 'ethers';
import { isEqual } from 'lodash';
import { toAddress } from 'test/helpers/Utils';
import { ProxyAdmin } from 'typechain';

const TOTAL_SUPPLY = BigNumber.from(1_000_000_000).mul(BigNumber.from(10).pow(18));

type CtorArgs = Parameters<any>;
type InitArgs = Parameters<any>;

interface ProxyArguments {
    skipInitialization?: boolean;
    initArgs?: InitArgs;
    ctorArgs?: CtorArgs;
}

interface Logic {
    ctorArgs: CtorArgs;
    contract: BaseContract;
}

let logicContractsCache: Record<string, Logic> = {};
let admin: ProxyAdmin;

export const proxyAdmin = async () => {
    if (!admin) {
        admin = await Contracts.ProxyAdmin.deploy();
    }

    return admin;
};

const createLogic = async <F extends ContractFactory>(factory: ContractBuilder<F>, ctorArgs: CtorArgs = []) => {
    // check if we can reuse a previously cached exact logic contract (e.g., the same contract and constructor arguments)
    const cached = logicContractsCache[factory.contractName];
    if (cached && isEqual(cached.ctorArgs, ctorArgs)) {
        return cached.contract;
    }

    const logicContract = await (factory.deploy as Function)(...(ctorArgs || []));
    logicContractsCache[factory.contractName] = { ctorArgs, contract: logicContract };

    return logicContract;
};

const createTransparentProxy = async (
    logicContract: BaseContract,
    skipInitialization: boolean = false,
    initArgs: InitArgs = []
) => {
    const admin = await proxyAdmin();
    const data = skipInitialization ? [] : logicContract.interface.encodeFunctionData('initialize', initArgs);
    return Contracts.TransparentUpgradeableProxy.deploy(logicContract.address, admin.address, data);
};

const createProxy = async <F extends ContractFactory>(
    factory: ContractBuilder<F>,
    args?: ProxyArguments
): Promise<Contract<F>> => {
    const logicContract = await createLogic(factory, args?.ctorArgs);
    const proxy = await createTransparentProxy(logicContract, args?.skipInitialization, args?.initArgs);

    return factory.attach(proxy.address);
};

export const createNetworkToken = async () => Contracts.TestERC20Token.deploy('BNT', 'BNT', TOTAL_SUPPLY);

export const createTokenHolder = async () => {
    const tokenHolder = await Contracts.TokenHolderUpgradeable.deploy();
    await tokenHolder.initialize();

    return tokenHolder;
};

export const createLiquidityPoolCollection = async (network: string | BaseContract) =>
    Contracts.LiquidityPoolCollection.deploy(toAddress(network));

export const createSystem = async () => {
    const networkSettings = await createProxy(Contracts.NetworkSettings);

    const network = await createProxy(Contracts.TestBancorNetwork, {
        skipInitialization: true,
        ctorArgs: [toAddress(networkSettings)]
    });

    const networkToken = await createNetworkToken();
    const vault = await createProxy(Contracts.BancorVault, { ctorArgs: [toAddress(networkToken)] });
    const networkTokenPool = await createProxy(Contracts.NetworkTokenPool, {
        ctorArgs: [toAddress(network), toAddress(vault)]
    });
    const pendingWithdrawals = await createProxy(Contracts.PendingWithdrawals, {
        ctorArgs: [toAddress(network), toAddress(networkTokenPool)]
    });
    const collection = await createLiquidityPoolCollection(network);

    await network.initialize(pendingWithdrawals.address);

    return { networkSettings, network, networkToken, vault, networkTokenPool, pendingWithdrawals, collection };
};