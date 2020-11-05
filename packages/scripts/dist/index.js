"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Vault = exports.VaultFactory = void 0;
var Factory_json_1 = __importDefault(require("./abis/Factory.json"));
var dotenv_1 = require("dotenv");
var ipfs_http_client_1 = __importDefault(require("ipfs-http-client"));
var eth_typed_data_1 = __importDefault(require("eth-typed-data"));
var ethers_1 = require("ethers");
var proof_1 = require("./utils/proof");
var ipfs_1 = require("./utils/ipfs");
var StatelessVault_json_1 = __importDefault(require("@rmeissner/stateless-vault-contracts/build/contracts/StatelessVault.json"));
dotenv_1.config();
var mnemonic = process.env.MNEMONIC;
var rpcUrl = process.env.RPC_URL;
var browserUrlTx = process.env.BROWSER_URL_TX;
var browserUrlAddress = process.env.BROWSER_URL_ADDRESS;
var VaultFactory = /** @class */ (function () {
    function VaultFactory(config) {
        this.vaultInterface = ethers_1.Contract.getInterface(StatelessVault_json_1.default.abi);
        this.config = config;
        this.factoryInstance = new ethers_1.Contract(config.factoryAddress, Factory_json_1.default, config.signer);
    }
    VaultFactory.prototype.calculateAddress = function (initializer, saltNonce) {
        return __awaiter(this, void 0, void 0, function () {
            var initializerHash, salt, proxyCreationCode, proxyDeploymentCode, proxyDeploymentCodeHash, address;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        initializerHash = ethers_1.utils.solidityKeccak256(["bytes"], [initializer]);
                        salt = ethers_1.utils.solidityKeccak256(['bytes32', 'uint256'], [initializerHash, saltNonce]);
                        return [4 /*yield*/, this.factoryInstance.proxyCreationCode()];
                    case 1:
                        proxyCreationCode = _a.sent();
                        proxyDeploymentCode = ethers_1.utils.solidityPack(['bytes', 'uint256'], [proxyCreationCode, this.config.vaultImplementationAddress]);
                        proxyDeploymentCodeHash = ethers_1.utils.solidityKeccak256(["bytes"], [proxyDeploymentCode]);
                        address = ethers_1.utils.solidityKeccak256(['bytes1', 'address', 'bytes32', 'bytes32'], ["0xFF", this.config.factoryAddress, salt, proxyDeploymentCodeHash]);
                        return [2 /*return*/, "0x" + address.slice(-40)];
                }
            });
        });
    };
    VaultFactory.prototype.create = function (vaultSetup, saltString) {
        return __awaiter(this, void 0, void 0, function () {
            var initializer, saltNonce, tx, e_1, address;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        initializer = this.vaultInterface.encodeFunctionData("setup(address[],uint256,address,address,address)", [vaultSetup.signers, vaultSetup.threshold, ethers_1.constants.AddressZero, ethers_1.constants.AddressZero, ethers_1.constants.AddressZero]);
                        saltNonce = ethers_1.utils.keccak256(Buffer.from(saltString || "" + new Date()));
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, this.factoryInstance.createProxyWithNonce(this.config.vaultImplementationAddress, initializer, saltNonce)];
                    case 2:
                        tx = _a.sent();
                        return [4 /*yield*/, tx.wait()];
                    case 3:
                        _a.sent();
                        console.log(tx);
                        return [3 /*break*/, 5];
                    case 4:
                        e_1 = _a.sent();
                        return [3 /*break*/, 5];
                    case 5: return [4 /*yield*/, this.calculateAddress(initializer, saltNonce)];
                    case 6:
                        address = _a.sent();
                        return [2 /*return*/, new Vault(this.config.signer, address)];
                }
            });
        });
    };
    return VaultFactory;
}());
exports.VaultFactory = VaultFactory;
var Vault = /** @class */ (function () {
    function Vault(signer, vaultAddress) {
        this.address = vaultAddress;
        this.signer = signer;
        this.vaultInstance = new ethers_1.Contract(vaultAddress, StatelessVault_json_1.default.abi, signer);
    }
    Vault.prototype.loadTransactions = function () {
        return __awaiter(this, void 0, void 0, function () {
            var txs, configTopic, failedTopic, successTopic, events, _i, events_1, e, config_1, exec, exec;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        txs = [];
                        configTopic = this.vaultInstance.interface.getEventTopic("Configuration");
                        failedTopic = this.vaultInstance.interface.getEventTopic("ExecutionFailure");
                        successTopic = this.vaultInstance.interface.getEventTopic("ExecutionSuccess");
                        return [4 /*yield*/, this.vaultInstance.queryFilter({
                                address: this.vaultInstance.address,
                                topics: [
                                    [
                                        configTopic, failedTopic, successTopic
                                    ]
                                ]
                            })];
                    case 1:
                        events = _a.sent();
                        for (_i = 0, events_1 = events; _i < events_1.length; _i++) {
                            e = events_1[_i];
                            if (e.topics[0] == configTopic) {
                                config_1 = this.vaultInstance.interface.decodeEventLog("Configuration", e.data);
                                if (config_1.currentNonce.eq(0)) {
                                    txs.push("Vault setup @ " + browserUrlTx.replace("{}", e.transactionHash));
                                }
                                else {
                                    txs.push("Config change (nonce " + (config_1.currentNonce - 1) + ") @ " + browserUrlTx.replace("{}", e.transactionHash));
                                }
                            }
                            else if (e.topics[0] == failedTopic) {
                                exec = this.vaultInstance.interface.decodeEventLog("ExecutionFailure", e.data);
                                txs.push("Tx failure (nonce " + exec.usedNonce + ") @ " + browserUrlTx.replace("{}", e.transactionHash));
                            }
                            else if (e.topics[0] == successTopic) {
                                exec = this.vaultInstance.interface.decodeEventLog("ExecutionSuccess", e.data);
                                txs.push("Tx success (nonce " + exec.usedNonce + ") @ " + browserUrlTx.replace("{}", e.transactionHash));
                            }
                        }
                        return [2 /*return*/, txs.reverse()];
                }
            });
        });
    };
    Vault.prototype.loadConfig = function () {
        return __awaiter(this, void 0, void 0, function () {
            var configTopic, failedTopic, successTopic, events, currentConfig, _i, events_2, e, config_2, exec, exec;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        configTopic = this.vaultInstance.interface.getEventTopic("Configuration");
                        failedTopic = this.vaultInstance.interface.getEventTopic("ExecutionFailure");
                        successTopic = this.vaultInstance.interface.getEventTopic("ExecutionSuccess");
                        return [4 /*yield*/, this.vaultInstance.queryFilter({
                                address: this.vaultInstance.address,
                                topics: [
                                    [
                                        configTopic, failedTopic, successTopic
                                    ]
                                ]
                            })];
                    case 1:
                        events = _a.sent();
                        currentConfig = {
                            implementation: ethers_1.constants.AddressZero,
                            signatureChecker: ethers_1.constants.AddressZero,
                            requestGuard: ethers_1.constants.AddressZero,
                            fallbackHandler: ethers_1.constants.AddressZero,
                            signers: [],
                            threshold: ethers_1.BigNumber.from(0),
                            nonce: ethers_1.BigNumber.from(-1)
                        };
                        for (_i = 0, events_2 = events; _i < events_2.length; _i++) {
                            e = events_2[_i];
                            if (e.topics[0] == configTopic) {
                                config_2 = this.vaultInstance.interface.decodeEventLog("Configuration", e.data);
                                if (config_2.currentNonce >= currentConfig.nonce) {
                                    currentConfig.signers = config_2.signers;
                                    currentConfig.threshold = config_2.threshold;
                                    currentConfig.nonce = config_2.currentNonce;
                                    currentConfig.implementation = config_2.implementation;
                                    currentConfig.signatureChecker = config_2.signatureChecker;
                                    currentConfig.requestGuard = config_2.requestGuard;
                                    currentConfig.fallbackHandler = config_2.fallbackHandler;
                                }
                            }
                            else if (e.topics[0] == failedTopic) {
                                exec = this.vaultInstance.interface.decodeEventLog("ExecutionFailure", e.data);
                                if (currentConfig.nonce <= exec.usedNonce) {
                                    currentConfig.nonce = exec.usedNonce.add(1);
                                }
                            }
                            else if (e.topics[0] == successTopic) {
                                exec = this.vaultInstance.interface.decodeEventLog("ExecutionSuccess", e.data);
                                if (currentConfig.nonce <= exec.usedNonce) {
                                    currentConfig.nonce = exec.usedNonce.add(1);
                                }
                            }
                            else {
                                console.warn("Unknown log");
                            }
                        }
                        if (currentConfig.nonce.eq(-1))
                            throw Error("could not load config");
                        return [2 /*return*/, currentConfig];
                }
            });
        });
    };
    Vault.prototype.signExec = function (to, value, data, operation, nonce) {
        return __awaiter(this, void 0, void 0, function () {
            var dataHash;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.vaultInstance.generateTxHash(to, value, data, operation, 0, nonce)];
                    case 1:
                        dataHash = _a.sent();
                        return [4 /*yield*/, this.signer.signMessage(ethers_1.utils.arrayify(dataHash))];
                    case 2: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    Vault.prototype.signExecFromHash = function (ipfs, txHash) {
        return __awaiter(this, void 0, void 0, function () {
            var hashData, tx, txData, to, value, data, operation, minAvailableGas, nonce, metaHash, dataHash;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, ipfs_1.pullWithKeccak(ipfs, txHash)];
                    case 1:
                        hashData = _a.sent();
                        return [4 /*yield*/, ipfs_1.pullWithKeccak(ipfs, hashData.substring(68))];
                    case 2:
                        tx = _a.sent();
                        return [4 /*yield*/, ipfs_1.pullWithKeccak(ipfs, tx.substring(3 * 64, 4 * 64))];
                    case 3:
                        txData = _a.sent();
                        to = ethers_1.utils.getAddress(tx.substring(64 + 24, 2 * 64));
                        value = ethers_1.BigNumber.from("0x" + tx.substring(2 * 64, 3 * 64));
                        data = "0x" + txData;
                        operation = parseInt(tx.substring(4 * 64, 5 * 64), 16);
                        minAvailableGas = ethers_1.BigNumber.from("0x" + tx.substring(5 * 64, 6 * 64));
                        nonce = ethers_1.BigNumber.from("0x" + tx.substring(6 * 64, 7 * 64));
                        metaHash = "0x" + tx.substring(7 * 64, 8 * 64);
                        console.log("To: " + to);
                        console.log("Value: " + value);
                        console.log("Data: " + data);
                        console.log("Operation: " + operation);
                        console.log("Minimum available gas: " + minAvailableGas);
                        console.log("Nonce: " + nonce);
                        console.log("Meta hash: " + metaHash);
                        return [4 /*yield*/, this.vaultInstance.generateTxHash(to, value, data, operation, minAvailableGas, nonce, metaHash)];
                    case 4:
                        dataHash = _a.sent();
                        return [4 /*yield*/, this.signer.signMessage(ethers_1.utils.arrayify(dataHash))];
                    case 5: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    Vault.prototype.publishExec = function (ipfs, to, value, dataString, operation, nonce) {
        var e_2, _a, e_3, _b, e_4, _c;
        return __awaiter(this, void 0, void 0, function () {
            var data, vaultDomain, VaultTx, minAvailableGas, vaultTx, _d, _e, res, e_2_1, _f, _g, res, e_3_1, txHash, _h, _j, res, e_4_1;
            return __generator(this, function (_k) {
                switch (_k.label) {
                    case 0:
                        data = ethers_1.utils.arrayify(dataString);
                        vaultDomain = new eth_typed_data_1.default({
                            chainId: 4,
                            verifyingContract: this.address,
                        });
                        VaultTx = vaultDomain.createType('Transaction', [
                            { type: "address", name: "to" },
                            { type: "uint256", name: "value" },
                            { type: "bytes", name: "data" },
                            { type: "uint8", name: "operation" },
                            { type: "uint256", name: "minAvailableGas" },
                            { type: "uint256", name: "nonce" },
                            { type: "bytes32", name: "metaHash" },
                        ]);
                        minAvailableGas = 0;
                        vaultTx = new VaultTx({
                            to: to,
                            value: value.toHexString(),
                            data: data,
                            operation: operation,
                            minAvailableGas: minAvailableGas,
                            nonce: nonce.toNumber(),
                            metaHash: "0x"
                        });
                        // data
                        console.log("Publish data");
                        _k.label = 1;
                    case 1:
                        _k.trys.push([1, 6, 7, 12]);
                        _d = __asyncValues(ipfs.add(data, { hashAlg: "keccak-256" }));
                        _k.label = 2;
                    case 2: return [4 /*yield*/, _d.next()];
                    case 3:
                        if (!(_e = _k.sent(), !_e.done)) return [3 /*break*/, 5];
                        res = _e.value;
                        console.log("metadata: " + res.path);
                        _k.label = 4;
                    case 4: return [3 /*break*/, 2];
                    case 5: return [3 /*break*/, 12];
                    case 6:
                        e_2_1 = _k.sent();
                        e_2 = { error: e_2_1 };
                        return [3 /*break*/, 12];
                    case 7:
                        _k.trys.push([7, , 10, 11]);
                        if (!(_e && !_e.done && (_a = _d.return))) return [3 /*break*/, 9];
                        return [4 /*yield*/, _a.call(_d)];
                    case 8:
                        _k.sent();
                        _k.label = 9;
                    case 9: return [3 /*break*/, 11];
                    case 10:
                        if (e_2) throw e_2.error;
                        return [7 /*endfinally*/];
                    case 11: return [7 /*endfinally*/];
                    case 12:
                        // TX_TYPEHASH, to, value, keccak256(data), operation, minAvailableGas, nonce
                        console.log("Publish tx");
                        _k.label = 13;
                    case 13:
                        _k.trys.push([13, 18, 19, 24]);
                        _f = __asyncValues(ipfs.add(vaultTx.encodeData(), { hashAlg: "keccak-256" }));
                        _k.label = 14;
                    case 14: return [4 /*yield*/, _f.next()];
                    case 15:
                        if (!(_g = _k.sent(), !_g.done)) return [3 /*break*/, 17];
                        res = _g.value;
                        console.log("metadata: " + res.path);
                        _k.label = 16;
                    case 16: return [3 /*break*/, 14];
                    case 17: return [3 /*break*/, 24];
                    case 18:
                        e_3_1 = _k.sent();
                        e_3 = { error: e_3_1 };
                        return [3 /*break*/, 24];
                    case 19:
                        _k.trys.push([19, , 22, 23]);
                        if (!(_g && !_g.done && (_b = _f.return))) return [3 /*break*/, 21];
                        return [4 /*yield*/, _b.call(_f)];
                    case 20:
                        _k.sent();
                        _k.label = 21;
                    case 21: return [3 /*break*/, 23];
                    case 22:
                        if (e_3) throw e_3.error;
                        return [7 /*endfinally*/];
                    case 23: return [7 /*endfinally*/];
                    case 24:
                        // byte(0x19), byte(0x01), domainSeparator, txHash
                        console.log("Publish tx hash");
                        txHash = "0x" + vaultTx.signHash().toString('hex');
                        _k.label = 25;
                    case 25:
                        _k.trys.push([25, 30, 31, 36]);
                        _h = __asyncValues(ipfs.add(vaultTx.encode(), { hashAlg: "keccak-256" }));
                        _k.label = 26;
                    case 26: return [4 /*yield*/, _h.next()];
                    case 27:
                        if (!(_j = _k.sent(), !_j.done)) return [3 /*break*/, 29];
                        res = _j.value;
                        console.log("metadata: " + res.path);
                        _k.label = 28;
                    case 28: return [3 /*break*/, 26];
                    case 29: return [3 /*break*/, 36];
                    case 30:
                        e_4_1 = _k.sent();
                        e_4 = { error: e_4_1 };
                        return [3 /*break*/, 36];
                    case 31:
                        _k.trys.push([31, , 34, 35]);
                        if (!(_j && !_j.done && (_c = _h.return))) return [3 /*break*/, 33];
                        return [4 /*yield*/, _c.call(_h)];
                    case 32:
                        _k.sent();
                        _k.label = 33;
                    case 33: return [3 /*break*/, 35];
                    case 34:
                        if (e_4) throw e_4.error;
                        return [7 /*endfinally*/];
                    case 35: return [7 /*endfinally*/];
                    case 36: return [2 /*return*/, txHash];
                }
            });
        });
    };
    Vault.prototype.signUpdate = function (newSigners, newThreshold, nonce) {
        return __awaiter(this, void 0, void 0, function () {
            var config, dataHash;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.loadConfig()];
                    case 1:
                        config = _a.sent();
                        return [4 /*yield*/, this.vaultInstance.generateConfigChangeHash(config.implementation, ethers_1.utils.solidityPack(["address[]"], [newSigners]), newThreshold, config.signatureChecker, config.requestGuard, config.fallbackHandler, "0x", nonce)];
                    case 2:
                        dataHash = _a.sent();
                        return [4 /*yield*/, this.signer.signMessage(ethers_1.utils.arrayify(dataHash))];
                    case 3: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    Vault.prototype.formatSignature = function (config, hashProvider, signatures) {
        return __awaiter(this, void 0, void 0, function () {
            var sigs, signers, dataHash_1, prevIndex_1, singleSigner;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!signatures) return [3 /*break*/, 2];
                        return [4 /*yield*/, hashProvider()];
                    case 1:
                        dataHash_1 = _a.sent();
                        sigs = signatures.map(function (sig) { return sig.slice(2).replace(/00$/, "1f").replace(/1b$/, "1f").replace(/01$/, "20").replace(/1c$/, "20"); });
                        prevIndex_1 = -1;
                        signers = signatures.map(function (sig) {
                            var signer = ethers_1.utils.verifyMessage(ethers_1.utils.arrayify(dataHash_1), sig);
                            var signerIndex = config.signers.indexOf(signer, prevIndex_1 + 1);
                            if (signerIndex <= prevIndex_1)
                                throw Error("Invalid signer");
                            prevIndex_1 = signerIndex;
                            return signer;
                        });
                        return [3 /*break*/, 5];
                    case 2:
                        if (!(config.signers.length == 1)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.signer.getAddress()];
                    case 3:
                        singleSigner = _a.sent();
                        if (config.signers.indexOf(singleSigner) < 0)
                            throw Error("Signer is not an owner");
                        sigs = [ethers_1.utils.solidityPack(["uint256", "uint256", "bytes1"], [singleSigner, 0, "0x01"]).slice(2)];
                        signers = [singleSigner];
                        return [3 /*break*/, 5];
                    case 4: throw Error("Cannot execute transaction due to missing confirmation");
                    case 5: return [2 /*return*/, { signaturesString: "0x" + sigs.join(""), signers: signers }];
                }
            });
        });
    };
    Vault.prototype.update = function (newSigners, newThreshold, nonce, signatures) {
        return __awaiter(this, void 0, void 0, function () {
            var config, _a, signaturesString, signers, validationData, _b, _c;
            var _this = this;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0: return [4 /*yield*/, this.loadConfig()];
                    case 1:
                        config = _d.sent();
                        if (!config.nonce.eq(nonce))
                            throw Error("Invalid nonce");
                        return [4 /*yield*/, this.formatSignature(config, function () {
                                return _this.vaultInstance.generateConfigChangeHash(config.implementation, ethers_1.utils.solidityPack(["address[]"], [newSigners]), newThreshold, config.signatureChecker, config.requestGuard, config.fallbackHandler, "0x", nonce);
                            }, signatures)];
                    case 2:
                        _a = _d.sent(), signaturesString = _a.signaturesString, signers = _a.signers;
                        return [4 /*yield*/, proof_1.buildValidationData(config, signaturesString, signers)];
                    case 3:
                        validationData = _d.sent();
                        _c = (_b = console).log;
                        return [4 /*yield*/, this.vaultInstance.callStatic.updateConfig(config.implementation, newSigners, newThreshold, config.signatureChecker, config.requestGuard, config.fallbackHandler, "0x", nonce, validationData)];
                    case 4:
                        _c.apply(_b, [_d.sent()]);
                        return [4 /*yield*/, this.vaultInstance.updateConfig(config.implementation, newSigners, newThreshold, config.signatureChecker, config.requestGuard, config.fallbackHandler, "0x", nonce, validationData)];
                    case 5:
                        _d.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Vault.prototype.exec = function (to, value, data, operation, nonce, signatures) {
        return __awaiter(this, void 0, void 0, function () {
            var config, _a, signaturesString, signers, validationData;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.loadConfig()];
                    case 1:
                        config = _b.sent();
                        if (!config.nonce.eq(nonce))
                            throw Error("Invalid nonce");
                        return [4 /*yield*/, this.formatSignature(config, function () {
                                return _this.vaultInstance.generateTxHash(to, value, data, operation, 0, nonce);
                            }, signatures)];
                    case 2:
                        _a = _b.sent(), signaturesString = _a.signaturesString, signers = _a.signers;
                        return [4 /*yield*/, proof_1.buildValidationData(config, signaturesString, signers)
                            //console.log(await this.vaultInstance.callStatic.execTransaction(to, value, data, operation, 0, config.nonce, validationData, true))
                        ];
                    case 3:
                        validationData = _b.sent();
                        //console.log(await this.vaultInstance.callStatic.execTransaction(to, value, data, operation, 0, config.nonce, validationData, true))
                        return [4 /*yield*/, this.vaultInstance.execTransaction(to, value, data, operation, 0, config.nonce, validationData, true)];
                    case 4:
                        //console.log(await this.vaultInstance.callStatic.execTransaction(to, value, data, operation, 0, config.nonce, validationData, true))
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return Vault;
}());
exports.Vault = Vault;
var ipfs = ipfs_http_client_1.default({
    host: 'ipfs.infura.io',
    port: 5001,
    protocol: 'https'
});
var provider = new ethers_1.ethers.providers.JsonRpcProvider(rpcUrl);
var signer = ethers_1.Wallet.fromMnemonic(mnemonic).connect(provider);
var signer2 = ethers_1.Wallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/1").connect(provider);
var test = function () { return __awaiter(void 0, void 0, void 0, function () {
    var factory, vault, _a, _b, _c, vault2, config, _d, _e, txHash;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                factory = new VaultFactory({
                    factoryAddress: "0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B",
                    vaultImplementationAddress: StatelessVault_json_1.default.networks[4].address,
                    signer: signer
                });
                _b = (_a = factory).create;
                _c = {};
                return [4 /*yield*/, signer.getAddress()];
            case 1: return [4 /*yield*/, _b.apply(_a, [(_c.signers = [_f.sent()],
                        _c.threshold = ethers_1.BigNumber.from(1),
                        _c), "test_vault"])];
            case 2:
                vault = _f.sent();
                console.log("Vault @ " + browserUrlAddress.replace("{}", vault.address));
                vault2 = new Vault(signer2, vault.address);
                return [4 /*yield*/, vault.loadConfig()];
            case 3:
                config = _f.sent();
                console.log({ config: config });
                _e = (_d = console).log;
                return [4 /*yield*/, vault.loadTransactions()];
            case 4:
                _e.apply(_d, [_f.sent()]);
                return [4 /*yield*/, vault.publishExec(ipfs, vault.address, ethers_1.BigNumber.from(42), "0xbaddad", 1, config.nonce)];
            case 5:
                txHash = _f.sent();
                console.log({ txHash: txHash });
                return [4 /*yield*/, vault.signExecFromHash(ipfs, txHash)
                    /*
                    const sig1 = await vault.signUpdate([await signer.getAddress(), await signer2.getAddress()], BigNumber.from(2), config.nonce)
                    const sig2 = await vault2.signUpdate([await signer.getAddress(), await signer2.getAddress()], BigNumber.from(2), config.nonce)
                    await vault.update([await signer.getAddress(), await signer2.getAddress()], BigNumber.from(2), config.nonce, [sig1, sig2])
                    */
                    /*
                    const sig1 = await vault.signExec(vault.address, BigNumber.from(0), "0x", 0, config.nonce)
                    const sig2 = await vault2.signExec(vault.address, BigNumber.from(0), "0x", 0, config.nonce)
                    await vault.exec(vault.address, BigNumber.from(0), "0x", 0, config.nonce, [sig1, sig2])
                    */
                ];
            case 6:
                _f.sent();
                return [2 /*return*/];
        }
    });
}); };
test();
//# sourceMappingURL=index.js.map