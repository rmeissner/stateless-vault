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
exports.pullWithKeccak = void 0;
var cids_1 = __importDefault(require("cids"));
var ethers_1 = require("ethers");
var addHexPrefix = function (input) { return input.toLowerCase().startsWith("0x") ? input : "0x" + input; };
exports.pullWithKeccak = function (ipfs, hashPart) { return __awaiter(void 0, void 0, void 0, function () {
    var multhash, cid, out, _a, _b, file, content, _c, _d, chunk, e_1_1, e_2_1;
    var e_2, _e, e_1, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                multhash = Buffer.concat([ethers_1.utils.arrayify("0x1b20"), ethers_1.utils.arrayify(addHexPrefix(hashPart))]);
                cid = new cids_1.default(1, "raw", multhash, "base32");
                out = "";
                _g.label = 1;
            case 1:
                _g.trys.push([1, 18, 19, 24]);
                _a = __asyncValues(ipfs.get(cid.toString()));
                _g.label = 2;
            case 2: return [4 /*yield*/, _a.next()];
            case 3:
                if (!(_b = _g.sent(), !_b.done)) return [3 /*break*/, 17];
                file = _b.value;
                if (!file.content)
                    return [3 /*break*/, 16];
                content = [];
                _g.label = 4;
            case 4:
                _g.trys.push([4, 9, 10, 15]);
                _c = (e_1 = void 0, __asyncValues(file.content));
                _g.label = 5;
            case 5: return [4 /*yield*/, _c.next()];
            case 6:
                if (!(_d = _g.sent(), !_d.done)) return [3 /*break*/, 8];
                chunk = _d.value;
                content.push(chunk);
                _g.label = 7;
            case 7: return [3 /*break*/, 5];
            case 8: return [3 /*break*/, 15];
            case 9:
                e_1_1 = _g.sent();
                e_1 = { error: e_1_1 };
                return [3 /*break*/, 15];
            case 10:
                _g.trys.push([10, , 13, 14]);
                if (!(_d && !_d.done && (_f = _c.return))) return [3 /*break*/, 12];
                return [4 /*yield*/, _f.call(_c)];
            case 11:
                _g.sent();
                _g.label = 12;
            case 12: return [3 /*break*/, 14];
            case 13:
                if (e_1) throw e_1.error;
                return [7 /*endfinally*/];
            case 14: return [7 /*endfinally*/];
            case 15:
                out += content.map(function (c) { return c.toString('hex'); }).join();
                _g.label = 16;
            case 16: return [3 /*break*/, 2];
            case 17: return [3 /*break*/, 24];
            case 18:
                e_2_1 = _g.sent();
                e_2 = { error: e_2_1 };
                return [3 /*break*/, 24];
            case 19:
                _g.trys.push([19, , 22, 23]);
                if (!(_b && !_b.done && (_e = _a.return))) return [3 /*break*/, 21];
                return [4 /*yield*/, _e.call(_a)];
            case 20:
                _g.sent();
                _g.label = 21;
            case 21: return [3 /*break*/, 23];
            case 22:
                if (e_2) throw e_2.error;
                return [7 /*endfinally*/];
            case 23: return [7 /*endfinally*/];
            case 24: return [2 /*return*/, out];
        }
    });
}); };
//# sourceMappingURL=ipfs.js.map