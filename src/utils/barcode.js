import bwipjs from "bwip-js";

export const generateBarcodeBase64 = async (text) => {
  try {
    const png = await bwipjs.toBuffer({
      bcid: "code128",
      text,
      scale: 3,
      height: 10,
      includetext: true
    });

    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (err) {
    console.error("Barcode Error:", err);
    return null;
  }
};
