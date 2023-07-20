const characters = "123456789abcdef";
const charactersLength = characters.length;

export default function makeRandomHex(length = 64) {
    let result = [];
    for (let i = 0; i < length; i++) {
        result.push(
            characters.charAt(Math.floor(Math.random() * charactersLength))
        );
    }
    return result.join("");
}
