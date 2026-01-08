import axios from "axios";

export const sendSms = async (mobile, message) => {
  try {
    const response = await axios.post("https://textbelt.com/text", {
      phone: mobile,
      message,
      key: "textbelt"
    });

    // console.log("SMS Response:", response.data);
    return response.data.success;
  } catch (err) {
    // console.error("SMS Error:", err.message);
    return false;
  }
};
