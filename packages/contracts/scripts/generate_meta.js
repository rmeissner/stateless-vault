#!/usr/bin/env node
const IPFS = require('ipfs-http-client');

const fs = require('fs')
const util = require('util')
const path = require('path')

const log = console.log

const copyFile = util.promisify(fs.copyFile)
const writeFile = util.promisify(fs.writeFile)

const contractDir = path.join("build", "contracts")
const metaDir = path.join("build", "meta")
const pkg = require(path.join("..", "package.json"))
const supportedContracts = pkg.ethereum.contracts

function getSourcePath(source) {
    if (source.startsWith(process.cwd())) return source
    const relativeSource = source.startsWith("/contracts/") ? source : path.join("node_modules", source)
    let folder = path.resolve(process.cwd())
    let sourceFile = path.join(folder, relativeSource)
    try {
        while (!fs.existsSync(sourceFile) && folder != "/") {
            folder = path.join(folder, "..")
            sourceFile = path.join(folder, relativeSource)
        }
    } catch (err) {
        console.error(err)
    }
    return sourceFile
}

async function main() {
    const upload = process.argv.findIndex((value) => value === "--upload") >= 0
    const ipfs = IPFS({
        host: 'ipfs.infura.io',
        port: '5001',
        protocol: 'https'
    });

    if (!fs.existsSync(metaDir)) {
        fs.mkdirSync(metaDir);
    }

    log("Generating metadata...")
    log("======================")
    for (contract of supportedContracts) {
        const contractArtifact = require(path.join(process.cwd(), contractDir, `${contract}.json`));
        log();
        log(contractArtifact.contractName);
        log("-".repeat(contractArtifact.contractName.length));

        const etherscanConfig = {
            language: "",
            sources: {},
            settings: {},
            evmVersion: ""
        }

        const meta = JSON.parse(contractArtifact.metadata)
        etherscanConfig.language = meta.language
        etherscanConfig.evmVersion = meta.evmVersion
        for (let source in meta.sources) {
            const sourceFile = getSourcePath(source)
            const pathParts = source.split("/")
            await copyFile(sourceFile, path.join(metaDir, pathParts[pathParts.length - 1]));
            const contractSource = fs.readFileSync(sourceFile)
            etherscanConfig.sources[source] = { content: contractSource.toString() }
            if (upload) {
                for await (const res of ipfs.add(contractSource)) {
                    log(`metadata: ${source} >>> ${res.path}`);
                }
            }
        }

        log(`Write ${contract}Meta.json`);
        const contractMetaFile = path.join(process.cwd(), metaDir, `${contract}Meta.json`);
        await writeFile(contractMetaFile, contractArtifact.metadata)

        log(`Write ${contract}Etherscan.json`);
        const contractEtherscanFile = path.join(process.cwd(), metaDir, `${contract}Etherscan.json`);
        await writeFile(contractEtherscanFile, JSON.stringify(etherscanConfig))
    }

    log();
    log('Finished.');
    log();
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.log(err);
        process.exit(1)
    })