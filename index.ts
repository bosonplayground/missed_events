import { ethers } from "ethers";
import Web3 from 'web3';
import dotenv from 'dotenv';
dotenv.config();


const infuraApiKey = process.env.INFURA_API_KEY as string;
const jsonRpcUrl = process.env.JSON_RPC_URL as string;
const contractAddr = process.env.CONTRACT_ADDR as string;
const contractAbiStr = process.env.CONTRACT_ABI as string;

const contractAbi = JSON.parse(contractAbiStr);

async function main() {
    const wssUrl = `wss://mainnet.infura.io/ws/v3/${infuraApiKey}`;
    const eventName = 'Transfer';
    const numTransactionsToCheck = 200;

    const ethersHashesRpcMap = new Map<string, boolean>();
    const ethersHashesMap = new Map<string, boolean>();
    const web3HashesMap = new Map<string, boolean>();

    const ethersHashesRpcSet = new Set<string>();
    const ethersHashesSet = new Set<string>();
    const web3HashesSet = new Set<string>();

    const jsonRpcProvider = new ethers.providers.JsonRpcProvider(jsonRpcUrl);
    const jsonRpcContract = new ethers.Contract(contractAddr, contractAbi, jsonRpcProvider);

    const webSocketProvider = new ethers.providers.WebSocketProvider(wssUrl);
    const websocketContract = new ethers.Contract(contractAddr, contractAbi, webSocketProvider);

    const web3 = new Web3(wssUrl);
    const web3Contract = new web3.eth.Contract(contractAbi, contractAddr);

    const sharedMap = new Map<string, number>();
    let canProcessTx = false;

    const printCount = (preText: string, transactionHash: string) => {
        !canProcessTx && console.log(`${preText} checking transaction`, transactionHash)
    }

    const areContractsProcessingSameTx = (transactionHash: string) => {
        return (sharedMap.get(transactionHash) || 0) >= 3;
    }

    const updateMaps = (_tag: string, contractMap: Map<string, boolean>, transactionHash: string) => {
        const sameTx = areContractsProcessingSameTx(transactionHash);
        if (sameTx) {
            canProcessTx = true;
        }
        if (!contractMap.has(transactionHash)) { // not duplicated in same provider
            sharedMap.set(transactionHash, (sharedMap.get(transactionHash) || 0) + 1);
            contractMap.set(transactionHash, true);
        }
    }

    await Promise.all([
        new Promise<void>((resolve, reject) => {
            try {
                let k = 0;
                let isFirstTx = false;
                jsonRpcContract.on(eventName, (from, to, qty, otherArgs) => {

                    if (k >= numTransactionsToCheck) {
                        jsonRpcContract.removeAllListeners();
                        resolve();
                    } else {
                        const { transactionHash } = otherArgs;
                        updateMaps('ethers.js-rpc', ethersHashesRpcMap, transactionHash);
                        printCount(`${k}[ethers.js-rpc]`, transactionHash);
                        if (canProcessTx) {
                            !isFirstTx && console.log(`${k}[ethers.js-rpc] first tx!!`, transactionHash)

                            isFirstTx = true;
                            if (ethersHashesRpcSet.has(transactionHash)) {
                                console.log(`${k}[ethers.js-rpc] transaction already exist!`, transactionHash)
                            } else {
                                ethersHashesRpcSet.add(transactionHash);
                                console.log(`${k}[ethers.js-rpc] transaction received with hash`, transactionHash)
                                k++;
                            }
                        }



                    }
                });
            } catch (err) {
                reject(err);
            }
        }),
        new Promise<void>((resolve, reject) => {
            try {
                let isFirstTx = false;
                let i = 0;
                websocketContract.on(eventName, (from, to, qty, otherArgs) => {
                    if (i >= numTransactionsToCheck) {
                        websocketContract.removeAllListeners();
                        resolve();
                    } else {
                        const { transactionHash } = otherArgs;

                        updateMaps('ethers.js-wss', ethersHashesMap, transactionHash);
                        printCount(`${i}[ethers.js-wss]`, transactionHash);
                        if (canProcessTx) {
                            !isFirstTx && console.log(`${i}[ethers.js-wss] first tx!!`, transactionHash)

                            isFirstTx = true;
                            if (ethersHashesSet.has(transactionHash)) {
                                console.log(`${i}[ethers.js-wss] transaction already exist!`, transactionHash)
                            } else {
                                ethersHashesSet.add(transactionHash);
                                console.log(`${i}[ethers.js-wss] transaction received with hash`, transactionHash)
                                i++;
                            }
                        }
                    }
                });
            } catch (err) {
                reject(err);
            }
        }),
        new Promise<void>((resolve, reject) => {
            try {
                let isFirstTx = false;
                let j = 0;
                web3Contract.events[eventName](null, (error: Error, eventData: Record<string, any>) => {
                    if (error) {
                        console.log('transaction received with error', error);
                    } else {
                        if (j >= numTransactionsToCheck) {
                            resolve();
                        } else {
                            const { transactionHash } = eventData;

                            updateMaps('web3.js', web3HashesMap, transactionHash);
                            printCount(`${j}[web3.js]`, transactionHash);

                            if (canProcessTx) {
                                !isFirstTx && console.log(`${j}[web3.js] first tx!!`, transactionHash)
                                isFirstTx = true;
                                if (web3HashesSet.has(transactionHash)) {
                                    console.log(`${j}[web3.js] transaction already exist!`, transactionHash)
                                } else {
                                    web3HashesSet.add(transactionHash);
                                    console.log(`${j}[web3.js] transaction received with hash`, transactionHash)
                                    j++;
                                }
                            }
                        }
                    }
                });
            } catch (err) {
                reject(err);
            }
        })]);
    console.log('ethersHashesRpcSet.size', ethersHashesRpcSet.size);
    console.log('ethersHashesSet.size', ethersHashesSet.size);
    console.log('web3HashesSet.size', web3HashesSet.size);
    let missingInWeb3 = 0;
    let missingInEthersRpc = 0;
    for (const hash of ethersHashesSet) {
        if (!ethersHashesRpcSet.has(hash)) {
            console.log('hash in ethers but not in ethers rpc set', hash);
            missingInEthersRpc++;
        }
        if (!web3HashesSet.has(hash)) {
            console.log('hash in ethers but not in web3 set', hash);
            missingInWeb3++;
        }
    }
    let missingInEthers = 0;
    for (const hash of web3HashesSet) {
        if (!ethersHashesRpcSet.has(hash)) {
            console.log('hash in web3 but not in ethers rpc set', hash);
            missingInEthersRpc++;
        }
        if (!ethersHashesSet.has(hash)) {
            console.log('hash in web3 but not in ethers set', hash);
            missingInEthers++;
        }
    }
    for (const hash of ethersHashesRpcSet) {
        if (!web3HashesSet.has(hash)) {
            console.log('hash in ethers rpc but not in web3', hash);
            missingInWeb3++;
        }
        if (!ethersHashesSet.has(hash)) {
            console.log('hash in ethers rpc but not in ethers', hash);
            missingInEthers++;
        }
    }
    console.log({ missingInEthers, missingInWeb3, missingInEthersRpc });
}

main().then(() => {
    console.log('Finished')
    process.exit(0);
}).catch(() => {
    process.exit(1);
})