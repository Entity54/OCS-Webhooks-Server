require('dotenv').config();

const { NeynarAPIClient } = require("@neynar/nodejs-sdk");

console.log(`process.env.YOUR_NGROK_URL: `,process.env.YOUR_NGROK_URL);

if (!process.env.NEYNAR_API_KEY) {
  throw new Error("NEYNAR_API_KEY is not set");
}

const client = new NeynarAPIClient(process.env.NEYNAR_API_KEY);

const YOUR_NGROK_URL_HERE = "https://0902-62-1-114-192.ngrok-free.app"; //process.env.YOUR_NGROK_URL;

const registerWebhook = async () => {
  console.log(`Registering New Webhook`);

  const webhook = await client.publishWebhook(
    "mainnet_abc",
    YOUR_NGROK_URL_HERE,
    {
      subscription: {
        "cast.created": {
          text: "\\$(DEGEN|degen)",
        },
      },
    }
  );

  console.log(webhook);
};


registerWebhook();