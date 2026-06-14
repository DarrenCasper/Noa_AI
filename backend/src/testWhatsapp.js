require("dotenv").config();
const { sendWhatsAppMessage } = require("./services/whatsappService");

sendWhatsAppMessage("Noa backend WhatsApp test. If this arrives, the sender service works.")
  .then(() => {
    console.log("WhatsApp test sent.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("WhatsApp test failed:", error.message);
    process.exit(1);
  });