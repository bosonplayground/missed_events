import { ethers } from "ethers";
import Web3 from 'web3';
import dotenv from 'dotenv';
dotenv.config();


const infuraApiKey = process.env.INFURA_API_KEY as string;
const contractAddr = process.env.CONTRACT_ADDR as string;
const contractAbiStr = process.env.CONTRACT_ABI as string;

const contractAbi = JSON.parse(contractAbiStr);

async function main() {
    const wssUrl = `wss://mainnet.infura.io/ws/v3/${infuraApiKey}`;
    const eventName = 'Transfer';
    const numTransactionsToCheck = 1000;
    const ethersHashesSet = new Set<string>();
    const web3HashesSet = new Set<string>();

    await Promise.all([new Promise<void>((resolve, reject) => {
        try {
            const provider = new ethers.providers.WebSocketProvider(wssUrl);
            const contract = new ethers.Contract(contractAddr, contractAbi, provider)
            let i = 0;
            contract.on(eventName, (from, to, qty, otherArgs) => {
                i++;
                if (i === numTransactionsToCheck) {
                    contract.removeAllListeners();
                    resolve();
                } else {
                    const { transactionHash } = otherArgs;
                    ethersHashesSet.add(transactionHash);
                    console.log(`${i}[ethers.js] transaction received with hash`, transactionHash)
                }
            });
        } catch (err) {
            reject(err);
        }
    }),
    new Promise<void>((resolve, reject) => {
        try {
            const web3 = new Web3(wssUrl);
            const web3Contract = new web3.eth.Contract(contractAbi, contractAddr);

            let j = 0;
            web3Contract.events[eventName](null, (error: Error, eventData: Record<string, any>) => {
                if (error) {
                    console.log('transaction received with error', error);
                } else {
                    j++;
                    if (j === numTransactionsToCheck) {
                        resolve();
                    } else {
                        const { transactionHash } = eventData;
                        web3HashesSet.add(transactionHash);
                        console.log(`${j}[web3.js] transaction received with hash`, transactionHash);
                    }
                }
            });
        } catch (err) {
            reject(err);
        }
    })]);
    console.log('ethersHashesSet.size', ethersHashesSet.size);
    console.log('web3HashesSet.size', web3HashesSet.size);
    let missingInWeb3 = 0;
    for (const hash of ethersHashesSet) {
        if (!web3HashesSet.has(hash)) {
            console.log('hash in ethers but not in web3 set', hash);
            missingInWeb3++;
        }
    }
    let missingInEthers = 0;
    for (const hash of web3HashesSet) {
        if (!ethersHashesSet.has(hash)) {
            console.log('hash in web3 but not in ethers set', hash);
            missingInEthers++;
        }
    }
    console.log({ missingInEthers, missingInWeb3 });
}

main().then(() => {
    console.log('Finished')
    process.exit(0);
}).catch(() => {
    process.exit(1);
})