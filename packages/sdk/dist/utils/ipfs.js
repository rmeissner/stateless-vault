import CID from 'cids';
import { utils } from 'ethers';
const addHexPrefix = (input) => input.toLowerCase().startsWith("0x") ? input : "0x" + input;
export const pullWithKeccak = async (ipfs, hashPart, encoding) => {
    const multhash = Buffer.concat([utils.arrayify("0x1b20"), utils.arrayify(addHexPrefix(hashPart))]);
    const cid = new CID(1, "raw", multhash, "base32");
    let out = "";
    for await (const file of ipfs.get(cid.toString())) {
        if (!file.content)
            continue;
        const content = [];
        for await (const chunk of file.content) {
            content.push(chunk);
        }
        out += content.map(c => c.toString(encoding || 'hex')).join();
    }
    return out;
};
//# sourceMappingURL=ipfs.js.map