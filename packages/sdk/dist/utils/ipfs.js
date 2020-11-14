import CID from 'cids';
const removeHexPrefix = (input) => input.toLowerCase().startsWith("0x") ? input.slice(2) : input;
export const pullWithKeccak = async (ipfs, hashPart, encoding) => {
    const multhash = Buffer.concat([Buffer.from("1b20", "hex"), Buffer.from(removeHexPrefix(hashPart), "hex")]);
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