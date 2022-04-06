import { ethers } from "ethers";
import Web3 from 'web3';
import dotenv from 'dotenv';
dotenv.config();


const infuraApiKey = process.env.INFURA_API_KEY as string;
const jsonRpcUrlAlchemy = process.env.JSON_RPC_URL_ALCHEMY as string;
const contractAddr = process.env.CONTRACT_ADDR as string;
const contractAbiStr = process.env.CONTRACT_ABI as string;

const contractAbi = JSON.parse(contractAbiStr);

async function listenEthersContractEvents({ eventName, contract, numTransactionsToCheck, set, label }: { eventName: string, contract: ethers.Contract, numTransactionsToCheck: number, set: Set<string>, label: string }) {
    return new Promise<void>((resolve, reject) => {
        try {
            let k = 0;
            contract.on(eventName, (_from: unknown, _to: unknown, _qty: unknown, otherArgs: Record<string, unknown> & { transactionHash: string }) => {

                if (k >= numTransactionsToCheck) {
                    contract.removeAllListeners();
                    resolve();
                } else {
                    const { transactionHash } = otherArgs;
                    if (set.has(transactionHash)) {
                        console.log(`${k}[${label}] transaction already exists!`, transactionHash)
                    } else {
                        set.add(transactionHash);
                        console.log(`${k}[${label}] received transaction with hash`, transactionHash)
                        k++;
                    }
                }
            });
        } catch (err) {
            reject(err);
        }
    })
}

async function listenWeb3ContractEvents({ eventName, contract, numTransactionsToCheck, set, label }: { eventName: string, contract: InstanceType<Web3['eth']['Contract']>, numTransactionsToCheck: number, set: Set<string>, label: string }) {
    return new Promise<void>((resolve, reject) => {
        try {
            let j = 0;
            contract.events[eventName](null, (error: Error, eventData: Record<string, any>) => {
                if (error) {
                    console.log('received transaction with error', error);
                } else {
                    if (j >= numTransactionsToCheck) {
                        resolve();
                    } else {
                        const { transactionHash } = eventData;

                        if (set.has(transactionHash)) {
                            console.log(`${j}[${label}] transaction already exists!`, transactionHash)
                        } else {
                            set.add(transactionHash);
                            console.log(`${j}[${label}] received transaction with hash`, transactionHash)
                            j++;
                        }

                    }
                }
            });
        } catch (err) {
            reject(err);
        }
    })
}

async function main() {
    const wssInfuraUrl = `wss://mainnet.infura.io/ws/v3/${infuraApiKey}`;
    const httpInfuraUrl = `https://mainnet.infura.io/v3/${infuraApiKey}`;

    const eventName = 'Transfer';
    const numTransactionsToCheck = 1000;

    const ethersHashesRpcAlchemySet = new Set<string>();
    const ethersHashesRpcInfuraSet = new Set<string>();
    const ethersHashesWssInfuraSet = new Set<string>();
    const web3HashesWssInfuraSet = new Set<string>();

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
            label: 'ethers.js-rpc-alchemy',
            numTransactionsToCheck,
            set: ethersHashesRpcAlchemySet
        }),
        listenEthersContractEvents({
            eventName,
            contract: ethersJsonRpcInfuraContract,
            label: 'ethers.js-rpc-infura',
            numTransactionsToCheck,
            set: ethersHashesRpcInfuraSet
        }),
        listenEthersContractEvents({
            eventName,
            contract: ethersWssInfuraContract,
            label: 'ethers.js-wss-infura',
            numTransactionsToCheck,
            set: ethersHashesWssInfuraSet
        }),
        listenWeb3ContractEvents({
            eventName,
            contract: web3wssInfuraContract,
            label: 'web3.js-wss-infura',
            numTransactionsToCheck,
            set: web3HashesWssInfuraSet
        })]);
    console.log('ethersHashesRpcAlchemySet.size', ethersHashesRpcAlchemySet.size);
    console.log('ethersHashesRpcInfuraSet.size', ethersHashesRpcInfuraSet.size);
    console.log('ethersHashesWssInfuraSet.size', ethersHashesWssInfuraSet.size);
    console.log('web3HashesWssInfuraSet.size', web3HashesWssInfuraSet.size);

    const otherSets = [ethersHashesRpcInfuraSet, ethersHashesWssInfuraSet, web3HashesWssInfuraSet]; // all except the first one to compare

    const ethersHashesArr = [...ethersHashesRpcAlchemySet.values()]; // first set
    const firstCommonHash = ethersHashesArr.find(hash => otherSets.every((set) => set.has(hash)));
    const lastCommonHash = [...ethersHashesArr].reverse().find(hash => otherSets.every((set) => set.has(hash)));
    if (!firstCommonHash) {
        console.log('no first common hashes?');
        return;
    }
    if (!lastCommonHash) {
        console.log('no last common hashes?');
        return;
    }
    const ethersHashesRpcAlchemyFixedSet: Set<string> = new Set(ethersHashesArr.slice(ethersHashesArr.indexOf(firstCommonHash), ethersHashesArr.lastIndexOf(lastCommonHash) + 1));

    const ethersHashesRpcInfuraArr = [...ethersHashesRpcInfuraSet.values()];
    const ethersHashesRpcInfuraFixedSet: Set<string> = new Set(ethersHashesRpcInfuraArr.slice(ethersHashesRpcInfuraArr.indexOf(firstCommonHash), ethersHashesRpcInfuraArr.lastIndexOf(lastCommonHash) + 1));

    const ethersHashesWssInfuraArr = [...ethersHashesWssInfuraSet.values()];
    const ethersHashesWssInfuraFixedSet: Set<string> = new Set(ethersHashesWssInfuraArr.slice(ethersHashesWssInfuraArr.indexOf(firstCommonHash), ethersHashesWssInfuraArr.lastIndexOf(lastCommonHash) + 1));

    const web3HashesWssInfuraArr = [...web3HashesWssInfuraSet.values()];
    const web3HashesWssInfuraFixedSet: Set<string> = new Set(web3HashesWssInfuraArr.slice(web3HashesWssInfuraArr.indexOf(firstCommonHash), web3HashesWssInfuraArr.lastIndexOf(lastCommonHash) + 1));

    console.log('ethersHashesRpcAlchemyFixedSet.size', ethersHashesRpcAlchemyFixedSet.size);
    console.log('ethersHashesRpcInfuraFixedSet.size', ethersHashesRpcInfuraFixedSet.size);
    console.log('ethersHashesWssInfuraFixedSet.size', ethersHashesWssInfuraFixedSet.size);
    console.log('web3HashesWssInfuraFixedSet.size', web3HashesWssInfuraFixedSet.size);

    let missingInWeb3wssInfura = 0;
    let missingInEthersRpcAlchemy = 0;
    let missingInEthersRpcInfura = 0;
    let missingInEthersWssInfura = 0;
    for (const hash of ethersHashesRpcAlchemyFixedSet) {
        if (!ethersHashesRpcInfuraFixedSet.has(hash)) {
            console.log('hash in ethers rpc alchemy but not in ethers rpc infura set', hash);
            missingInEthersRpcInfura++;
        }
        if (!ethersHashesWssInfuraFixedSet.has(hash)) {
            console.log('hash in ethers rpc alchemy but not in ethers wss infura set', hash);
            missingInEthersWssInfura++;
        }
        if (!web3HashesWssInfuraFixedSet.has(hash)) {
            console.log('hash in ethers rpc alchemy but not in web3 wss infura set', hash);
            missingInWeb3wssInfura++;
        }
    }
    for (const hash of ethersHashesRpcInfuraFixedSet) {
        if (!ethersHashesRpcAlchemyFixedSet.has(hash)) {
            console.log('hash in ethers rpc infura but not in ethers rpc alchemy', hash);
            missingInEthersRpcAlchemy++;
        }
        if (!ethersHashesWssInfuraFixedSet.has(hash)) {
            console.log('hash in ethers rpc infura but not in ethers wss infura set', hash);
            missingInEthersWssInfura++;
        }
        if (!web3HashesWssInfuraFixedSet.has(hash)) {
            console.log('hash in ethers rpc infura but not in web3', hash);
            missingInWeb3wssInfura++;
        }
    }
    for (const hash of ethersHashesWssInfuraFixedSet) {
        if (!ethersHashesRpcAlchemyFixedSet.has(hash)) {
            console.log('hash in ethers wss infura but not in ethers rpc alchemy', hash);
            missingInEthersRpcAlchemy++;
        }
        if (!ethersHashesRpcInfuraFixedSet.has(hash)) {
            console.log('hash in ethers wss infura but not in ethers rpc infura set', hash);
            missingInEthersRpcInfura++;
        }
        if (!web3HashesWssInfuraFixedSet.has(hash)) {
            console.log('hash in ethers wss infura but not in web3 wss infura set', hash);
            missingInWeb3wssInfura++;
        }
    }
    for (const hash of web3HashesWssInfuraFixedSet) {
        if (!ethersHashesRpcAlchemyFixedSet.has(hash)) {
            console.log('hash in ethers wss infura but not in ethers rpc alchemy', hash);
            missingInEthersRpcAlchemy++;
        }
        if (!ethersHashesRpcInfuraFixedSet.has(hash)) {
            console.log('hash in ethers wss infura but not in ethers rpc infura set', hash);
            missingInEthersRpcInfura++;
        }
        if (!ethersHashesWssInfuraFixedSet.has(hash)) {
            console.log('hash in ethers wss infura but not in ethers wss infura set', hash);
            missingInEthersWssInfura++;
        }
    }

    console.log({
        missingInWeb3wssInfura,
        missingInEthersRpcAlchemy,
        missingInEthersRpcInfura,
        missingInEthersWssInfura,
    });

    console.log('ORIGINAL SETS');
    console.log('original ethersHashesRpcAlchemySet', JSON.stringify([...ethersHashesRpcAlchemySet.values()]));
    console.log('original ethersHashesRpcInfuraSet', JSON.stringify([...ethersHashesRpcInfuraSet.values()]));
    console.log('original ethersHashesWssInfuraSet', JSON.stringify([...ethersHashesWssInfuraSet.values()]));
    console.log('original web3HashesWssInfuraSet', JSON.stringify([...web3HashesWssInfuraSet.values()]));

    console.log('FIXED SETS');
    console.log('fixed ethersHashesRpcAlchemySet', JSON.stringify([...ethersHashesRpcAlchemyFixedSet.values()]));
    console.log('fixed ethersHashesRpcInfuraSet', JSON.stringify([...ethersHashesRpcInfuraFixedSet.values()]));
    console.log('fixed ethersHashesWssInfuraSet', JSON.stringify([...ethersHashesWssInfuraFixedSet.values()]));
    console.log('fixed web3HashesWssInfuraSet', JSON.stringify([...web3HashesWssInfuraFixedSet.values()]));
}

main().then(() => {
    console.log('Finished')
    process.exit(0);
}).catch(() => {
    process.exit(1);
})