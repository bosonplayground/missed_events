# Missed events

This repository has the goal to detect whether ethers.js v5.5.3 misses any smart contract events in comparison to web3.js. We'll use different protocols as well.

Given different providers (infura, alchemy), protocols (wss, https) and libraries (ethers.js, web3.js), we collect an X amount of blocks by listening to the Transfer event on a smart contract. We then disregard the records which have no data for some providers due to race conditions and for the block which we have data for all of them, we compare all the transactions.

## Prerequisites

Copy and paste the .env.example and rename it to .env. Add the missing values

## Getting started

```
npm ci
```

```
npm run watch
```

In another terminal run:

```
npm start
```