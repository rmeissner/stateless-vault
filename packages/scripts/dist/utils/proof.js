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
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildValidationData = exports.buildProof = void 0;
var ethers_1 = require("ethers");
exports.buildProof = function (txSigners, allSigners) { return __awaiter(void 0, void 0, void 0, function () {
    var ownersCopy, indeces, hashes, nodes, nodesCount, i, left, right;
    return __generator(this, function (_a) {
        ownersCopy = __spreadArrays(allSigners);
        indeces = txSigners.map(function (signer) {
            var i = ownersCopy.indexOf(signer);
            ownersCopy[i] = null;
            return i;
        });
        hashes = [];
        nodes = allSigners.map(function (signer) { return txSigners.indexOf(signer) < 0 ? ethers_1.utils.solidityKeccak256(["uint256"], [signer]) : "0x0"; });
        nodesCount = nodes.length;
        while (nodesCount > 1) {
            for (i = 0; i < nodesCount; i += 2) {
                left = nodes[i];
                right = void 0;
                if (i + 1 < nodesCount) {
                    right = nodes[i + 1];
                }
                else {
                    right = ethers_1.utils.solidityKeccak256(["uint256"], ["0x0"]);
                }
                if (left == "0x0" && right == "0x0") {
                    nodes[Math.floor(i / 2)] = "0x0";
                    continue;
                }
                if (left == "0x0") {
                    hashes.push(right);
                    nodes[Math.floor(i / 2)] = "0x0";
                    continue;
                }
                if (right == "0x0") {
                    hashes.push(left);
                    nodes[Math.floor(i / 2)] = "0x0";
                    continue;
                }
                nodes[Math.floor(i / 2)] = ethers_1.utils.solidityKeccak256(["bytes32", "bytes32"], [left, right]);
            }
            nodesCount = Math.ceil(nodesCount / 2);
        }
        return [2 /*return*/, { indeces: indeces, hashes: hashes }];
    });
}); };
exports.buildValidationData = function (vaultConfig, signatures, signers) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, indeces, hashes, validationData;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, exports.buildProof(signers, vaultConfig.signers)];
            case 1:
                _a = _b.sent(), indeces = _a.indeces, hashes = _a.hashes;
                validationData = ethers_1.utils.defaultAbiCoder.encode(["uint256", "uint256", "address", "address", "uint256[]", "bytes32[]", "bytes"], [vaultConfig.threshold, vaultConfig.signers.length, ethers_1.constants.AddressZero, ethers_1.constants.AddressZero, indeces, hashes, signatures]);
                return [2 /*return*/, validationData];
        }
    });
}); };
//# sourceMappingURL=proof.js.map