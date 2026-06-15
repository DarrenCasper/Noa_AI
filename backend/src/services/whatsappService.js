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

    const command = `
      & $env:OPENCLAW_BIN message send `
      + `--channel whatsapp `
      + `--target $env:WHATSAPP_TARGET `
      + `--message $env:NOA_MESSAGE
    `;

    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      {
        windowsHide: true,
        env: {
          ...process.env,
          OPENCLAW_BIN: openclawBin,
          WHATSAPP_TARGET: target,
          NOA_MESSAGE: message,
        },
      },
      (error, stdout, stderr) => {
        const output = `${stdout || ""}\n${stderr || ""}`.trim();

        if (error) {
          return reject(
            new Error(output || error.message || "OpenClaw send failed")
          );
        }

        const lowerOutput = output.toLowerCase();

        if (
          !lowerOutput.includes("sent") &&
          !lowerOutput.includes("message id")
        ) {
          return reject(
            new Error(
              output || "OpenClaw command finished, but no send confirmation was detected."
            )
          );
        }

        resolve(output);
      }
    );
  });
}

module.exports = { sendWhatsAppMessage };