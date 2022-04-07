import { ethers } from "ethers";
import Web3 from 'web3';
import dotenv from 'dotenv';
dotenv.config();


const infuraApiKey = process.env.INFURA_API_KEY as string;
const jsonRpcUrlAlchemy = process.env.JSON_RPC_URL_ALCHEMY as string;
const contractAddr = process.env.CONTRACT_ADDR as string;
const contractAbiStr = process.env.CONTRACT_ABI as string;

const contractAbi = JSON.parse(contractAbiStr);

async function listenEthersContractEvents({ eventName, contract, numBlocksToCheck, map, label, initializeBlockEntry }: { eventName: string, contract: ethers.Contract, numBlocksToCheck: number, map: Map<number, Map<string, Set<string>>>, label: string, initializeBlockEntry: (map: Map<number, Map<string, Set<string>>>, blockNumber: number) => void }) {
    return new Promise<void>((resolve, reject) => {
        try {
            let k = 0;
            contract.on(eventName, (_from: unknown, _to: unknown, _qty: unknown, otherArgs: Record<string, unknown> & { transactionHash: string }) => {
                const { transactionHash, blockNumber: _blockNumber } = otherArgs;
                const blockNumber = _blockNumber as number;
                if (!map.has(blockNumber) || (map.has(blockNumber) && !map.get(blockNumber)!.get(label)?.size)) {
                    k++;
                }
                if (k > numBlocksToCheck) {
                    contract.removeAllListeners();
                    return resolve();
                }
                let set;
                if (map.has(blockNumber)) {
                    const providersMap = map.get(blockNumber);
                    set = providersMap?.get(label)!;
                    if (set.has(transactionHash)) {
                        // if a transaction contains multiple transfer events, then we only log the hash
                        console.log(`${k}[${label}][blockNumber=${blockNumber}] transaction already exists!`, transactionHash)
                    } else {
                        console.log(`${k}[${label}][blockNumber=${blockNumber}] received transaction with hash`, transactionHash)
                        set.add(transactionHash);
                    }
                } else {
                    initializeBlockEntry(map, blockNumber);
                    const providersMap = map.get(blockNumber);
                    set = providersMap?.get(label)!;
                    set.add(transactionHash);
                    console.log(`${k}[${label}][blockNumber=${blockNumber}] received transaction with hash`, transactionHash)
                }
                console.log(`${k}[${label}][blockNumber=${blockNumber}] set size = ${set.size}`)
            });
        } catch (err) {
            reject(err);
        }
    })
}

async function listenWeb3ContractEvents({ eventName, contract, numBlocksToCheck, map, label, initializeBlockEntry }: { eventName: string, contract: InstanceType<Web3['eth']['Contract']>, numBlocksToCheck: number, map: Map<number, Map<string, Set<string>>>, label: string, initializeBlockEntry: (map: Map<number, Map<string, Set<string>>>, blockNumber: number) => void }) {
    return new Promise<void>((resolve, reject) => {
        try {
            let k = 0;
            contract.events[eventName](null, (error: Error, otherArgs: Record<string, any>) => {
                const { transactionHash, blockNumber: _blockNumber } = otherArgs;
                const blockNumber = _blockNumber as number;
                if (!map.has(blockNumber) || (map.has(blockNumber) && !map.get(blockNumber)!.get(label)?.size)) {
                    k++;
                }
                if (k > numBlocksToCheck) {
                    return resolve();
                }
                let set;
                if (map.has(blockNumber)) {
                    const providersMap = map.get(blockNumber);
                    set = providersMap?.get(label)!;
                    if (set.has(transactionHash)) {
                        // if a transaction contains multiple transfer events, then we only log the hash
                        console.log(`${k}[${label}][blockNumber=${blockNumber}] transaction already exists!`, transactionHash)
                    } else {
                        console.log(`${k}[${label}][blockNumber=${blockNumber}] received transaction with hash`, transactionHash)
                        set.add(transactionHash);
                    }
                } else {
                    initializeBlockEntry(map, blockNumber);
                    const providersMap = map.get(blockNumber);
                    set = providersMap?.get(label)!;
                    set.add(transactionHash);
                    console.log(`${k}[${label}][blockNumber=${blockNumber}] received transaction with hash`, transactionHash)
                }
                console.log(`${k}[${label}][blockNumber=${blockNumber}] set size = ${set.size}`)
            });
        } catch (err) {
            reject(err);
        }
    })
}

/**
 * Given different providers (infura, alchemy), protocols (wss, https) and libraries (ethers.js, web3.js), we collect an X amount of blocks
 * by listening to the Transfer event on a smart contract. We then disregard the records which have no data for some providers due to race conditions and
 * for the block which we have data for all of them, we compare all the transactions.
 */ 
async function main() {
    const wssInfuraUrl = `wss://mainnet.infura.io/ws/v3/${infuraApiKey}`;
    const httpInfuraUrl = `https://mainnet.infura.io/v3/${infuraApiKey}`;

    const eventName = 'Transfer';
    const numBlocksToCheck = 80;

    const blockMap = new Map<number, Map<string, Set<string>>>();
    const ethersJsRpcAlchemyLabel = 'ethers.js-rpc-alchemy';
    const ethersJsRpcInfuraLabel = 'ethers.js-rpc-infura';
    const ethersJsWssInfuraLabel = 'ethers.js-wss-infura';
    const web3JsWssInfuraLabel = 'web3.js-wss-infura';

    const initializeBlockEntry = (map: typeof blockMap, blockNumber: number): void => {
        const setsToTxsMap = new Map();
        setsToTxsMap.set(ethersJsRpcAlchemyLabel, new Set());
        setsToTxsMap.set(ethersJsRpcInfuraLabel, new Set());
        setsToTxsMap.set(ethersJsWssInfuraLabel, new Set());
        setsToTxsMap.set(web3JsWssInfuraLabel, new Set());
        map.set(blockNumber, setsToTxsMap);
    }


    const jsonRpcProviderAlchemy = new ethers.providers.JsonRpcProvider(jsonRpcUrlAlchemy);
    const ethersJsonRpcAlchemyContract = new ethers.Contract(contractAddr, contractAbi, jsonRpcProviderAlchemy);

    const jsonRpcProviderInfura = new ethers.providers.JsonRpcProvider(httpInfuraUrl);
    const ethersJsonRpcInfuraContract = new ethers.Contract(contractAddr, contractAbi, jsonRpcProviderInfura);

    const webSocketProvider = new ethers.providers.WebSocketProvider(wssInfuraUrl);
    const ethersWssInfuraContract = new ethers.Contract(contractAddr, contractAbi, webSocketProvider);

    const web3wss = new Web3(wssInfuraUrl);
    const web3wssInfuraContract = new web3wss.eth.Contract(contractAbi, contractAddr);


    await Promise.all([
        listenEthersContractEvents({
            eventName,
            contract: ethersJsonRpcAlchemyContract,
            label: ethersJsRpcAlchemyLabel,
            numBlocksToCheck,
            map: blockMap,
            initializeBlockEntry
        }),
        listenEthersContractEvents({
            eventName,
            contract: ethersJsonRpcInfuraContract,
            label: ethersJsRpcInfuraLabel,
            numBlocksToCheck,
            map: blockMap,
            initializeBlockEntry
        }),
        listenEthersContractEvents({
            eventName,
            contract: ethersWssInfuraContract,
            label: ethersJsWssInfuraLabel,
            numBlocksToCheck,
            map: blockMap,
            initializeBlockEntry
        }),
        listenWeb3ContractEvents({
            eventName,
            contract: web3wssInfuraContract,
            label: web3JsWssInfuraLabel,
            numBlocksToCheck,
            map: blockMap,
            initializeBlockEntry
        })]);
    
    function eqSet(as: Set<any>, bs: Set<any>) {
        if (as.size !== bs.size) return false;
        for (var a of as) if (!bs.has(a)) return false;
        return true;
    }
    const convertMapToObjDeeply = (o: unknown): unknown => {
        const recurseOnEntries = (a: Array<any>) => Object.fromEntries(
            a.map(([k, v]) => [k, convertMapToObjDeeply(v)])
        );
        if (o instanceof Set) {
            o = [...o]
        }
        if (o instanceof Map) {
            return recurseOnEntries([...o]);
        }
        else if (Array.isArray(o)) {
            return o.map(convertMapToObjDeeply);
        }
        else if (typeof o === "object" && o !== null) {
            return recurseOnEntries(Object.entries(o));
        }

        return o;
    };
    // sort block entries by blockNumber
    const blockEntries = [...blockMap.entries()].sort(([blockNumberA], [blockNumberB]) => blockNumberA - blockNumberB);
    console.log('blockEntries', blockEntries)
    const nonEmptyBlockEntries = blockEntries.filter(([, m]) => [...m.values()].every(set => set.size > 0));
    console.log('nonEmptyBlockEntries', nonEmptyBlockEntries)
    const firstCommonBlockIdx = nonEmptyBlockEntries.findIndex(([, setsMap]) => [...setsMap.values()].every(set => set.size >= 1));
    console.log('first block where all sets have at least one tx', firstCommonBlockIdx)
    if (firstCommonBlockIdx === -1) {
        console.log('not enough blocks! try again with more')
        console.log('blockMap=',
            JSON.stringify(convertMapToObjDeeply(blockMap))
        )
        return;
    }
    const commonBlocks = nonEmptyBlockEntries.slice(firstCommonBlockIdx + 1);
    const sameTxInAllSets = commonBlocks.every(([blockNumber, setsMap]) => {
        const allSetsArr = [...setsMap.values()];
        const [firstSet, ...sets] = allSetsArr;
        const sameTxInAllSets = sets.every(set => eqSet(set, firstSet));
        if (!sameTxInAllSets) {
            console.log(`there is at least a missing tx in blockNumber=${blockNumber}, ${allSetsArr.map(set => JSON.stringify([...set]))}`)
        }
        return sameTxInAllSets;
    });
    console.log(`sameTxInAllSets=${sameTxInAllSets}=> ${sameTxInAllSets ? 'All good, no missing txs' : 'At least one missing tx'}`);
    console.log('blockMap=',
        JSON.stringify(convertMapToObjDeeply(blockMap))
    )
}

main().then(() => {
    console.log('Finished')
    process.exit(0);
}).catch(() => {
    process.exit(1);
})