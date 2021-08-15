const hexToRgb = (hex) =>
  hex
    .replace(
      /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
      (m, r, g, b) => "#" + r + r + g + g + b + b
    )
    .substring(1)
    .match(/.{2}/g)
    .map((x) => parseInt(x, 16));

const rgbToHex = (r, g, b) =>
  "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");

function darkenColor(color) {
  const rgb = hexToRgb(color);
  for (let rgbKey in rgb) {
    if (!rgb.hasOwnProperty(rgbKey)) continue;
    rgb[rgbKey] = Math.round(rgb[rgbKey] * 0.8);
  }
  return rgbToHex(...rgb);
}

const highlighterColors = [
  "#ff558d",
  "#ffb801",
  "#fff302",
  "#7ae400",
  "#02b5e1",
];

export { darkenColor, highlighterColors };
