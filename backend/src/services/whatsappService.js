const { execFile } = require("child_process");

function sendWhatsAppMessage(message) {
  return new Promise((resolve, reject) => {
    const target = process.env.WHATSAPP_TARGET;
    const openclawBin = process.env.OPENCLAW_BIN || "openclaw";

    if (!target) {
      return reject(new Error("WHATSAPP_TARGET is not set in .env"));
    }

    if (!message || !message.trim()) {
      return reject(new Error("Message is empty"));
    }

    const args = [
      "/d",
      "/s",
      "/c",
      openclawBin,
      "message",
      "send",
      "--channel",
      "whatsapp",
      "--target",
      target,
      "--message",
      message,
    ];

    execFile("cmd.exe", args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        return reject(
          new Error(stderr || stdout || error.message || "OpenClaw send failed")
        );
      }

      resolve(stdout);
    });
  });
}

module.exports = {
  sendWhatsAppMessage,
};