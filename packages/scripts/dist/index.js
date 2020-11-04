"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VaultFactory = exports.Vault = void 0;
var StatelessVault_json_1 = __importDefault(require("@rmeissner/stateless-vault-contracts/build/contracts/StatelessVault.json"));
var Vault = /** @class */ (function () {
    function Vault(owners, threshold) {
        console.log(owners);
        console.log(threshold);
    }
    return Vault;
}());
exports.Vault = Vault;
var VaultFactory = /** @class */ (function () {
    function VaultFactory(config) {
        console.log(config);
        console.log(StatelessVault_json_1.default.abi);
    }
    return VaultFactory;
}());
exports.VaultFactory = VaultFactory;
new VaultFactory({
    factoryAddress: "0x",
    vaultImplementationAddress: "0x"
});
//# sourceMappingURL=index.js.map