const { execFile } = require("child_process");

function isWhatsAppSendEnabled() {
  return String(process.env.ENABLE_WHATSAPP_SEND || "true").toLowerCase() === "true";
}

function sendWhatsAppMessage(message) {
  return new Promise((resolve, reject) => {
    const target = process.env.WHATSAPP_TARGET;
    const openclawBin = process.env.OPENCLAW_BIN || "openclaw";

    if (!message || !message.trim()) {
      return reject(new Error("Message is empty"));
    }

    if (!isWhatsAppSendEnabled()) {
      console.log("[WhatsApp disabled] Message not sent:");
      console.log(message);
      return resolve("WhatsApp send disabled by ENABLE_WHATSAPP_SEND=false");
    }

    if (!target) {
      return reject(new Error("WHATSAPP_TARGET is not set in .env"));
    }

    execFile(
      openclawBin,
      [
        "message",
        "send",
        "--channel",
        "whatsapp",
        "--target",
        target,
        "--message",
        message,
      ],
      { windowsHide: true },
      (error, stdout, stderr) => {
        const output = `${stdout || ""}\n${stderr || ""}`.trim();

        if (error) {
          return reject(new Error(output || error.message || "OpenClaw send failed"));
        }

        const lowerOutput = output.toLowerCase();

        if (
          !lowerOutput.includes("sent") &&
          !lowerOutput.includes("message id")
        ) {
          return reject(
            new Error(
              output ||
                "OpenClaw command finished, but no send confirmation was detected."
            )
          );
        }

        resolve(output);
      }
    );
  });
}

module.exports = {
  sendWhatsAppMessage,
};