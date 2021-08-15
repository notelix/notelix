const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
const charactersLength = characters.length;

export default function makeid(length = 64) {
  let result = [];
  for (let i = 0; i < length; i++) {
    result.push(
      characters.charAt(Math.floor(Math.random() * charactersLength))
    );
  }
  return result.join("");
}
