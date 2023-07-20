import memoize from "lodash/memoize";

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

function getBrightness(rgb) {
    const sum =
        parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114;
    return Math.round(sum / 1000);
}

function colorDifference(a, b) {
    var d0, d1, d2, max, min;
    max = Math.max;
    min = Math.min;
    d0 = max(a[0], b[0]) - min(a[0], b[0]);
    d1 = max(a[1], b[1]) - min(a[1], b[1]);
    d2 = max(a[2], b[2]) - min(a[2], b[2]);
    return d0 + d1 + d2;
}

function colorContrast(a, b) {
    var b0, b1, contrast;
    b0 = getBrightness(a);
    b1 = getBrightness(b);
    contrast = {
        brightness: Math.abs(b0 - b1),
        difference: colorDifference(a, b),
    };
    return contrast;
}

const pickBlackOrWhiteForeground = memoize((_color) => {
    const color = hexToRgb(_color);
    const contrastWhite = colorContrast(color, [255, 255, 255]);
    const contrastBlack = colorContrast(color, [0, 0, 0]);
    if (contrastBlack.brightness > contrastWhite.brightness) {
        return "#000000";
    } else {
        return "#FFFFFF";
    }
});

const highlighterColors = [
    "#ff6797",
    "#ffb801",
    "#eeff00",
    "#7ae400",
    "#02b5e1",
    "#812dff",
];

export {darkenColor, highlighterColors, pickBlackOrWhiteForeground};
