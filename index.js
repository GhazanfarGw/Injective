const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();
const { createAlchemyWeb3 } = require('@alch/alchemy-web3');

const app = express();
const port = process.env.PORT || 4000;
const ALCHEMY_API_URL = process.env.ALCHEMY_API_URL;
const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS;
const USDT_DEPOSIT_ADDRESS = process.env.USDT_DEPOSIT_ADDRESS;

const web3 = createAlchemyWeb3(ALCHEMY_API_URL);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Endpoint to check server connectivity
app.post('/ping', (req, res) => {
  res.json({ success: true, message: 'Server is running and connected' });
});

// API Endpoint to receive USDT
app.post('/receive', async (req, res) => {
  const { senderAddress, amount } = req.body;

  try {
    // Check if senderAddress and amount are provided
    if (!senderAddress || !amount) {
      return res.status(400).json({ success: false, message: 'Sender address and amount are required' });
    }

    // Example validation: Ensure senderAddress is a valid Ethereum address
    if (!web3.utils.isAddress(senderAddress)) {
      return res.status(400).json({ success: false, message: 'Invalid sender address' });
    }

    // Example: Log the incoming transaction
    console.log(`Incoming USDT transaction from ${senderAddress}: ${amount} USDT`);

    // Example: Process the transaction (optional)
    // Replace this with your actual logic to handle the incoming transaction

    res.json({ success: true, message: `Received ${amount} USDT from ${senderAddress}` });
  } catch (error) {
    console.error('Error receiving USDT:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});

// Logging environment variables for verification
console.log("ALCHEMY_API_URL:", ALCHEMY_API_URL);
console.log("USDT_CONTRACT_ADDRESS:", USDT_CONTRACT_ADDRESS);
console.log("USDT_DEPOSIT_ADDRESS:", USDT_DEPOSIT_ADDRESS);



// const express = require('express');
// const cors = require('cors');
// const mongoose = require('mongoose');

// require('dotenv').config();

// const app = express();
// const port = process.env.PORT || 4000;

// app.use(cors());
// app.use(express.json());



// const uri = process.env.ATLAS_URI;
// mongoose.connect(uri, { useNewUrlParser: true, useCreateIndex: true });

// const connection = mongoose.connection;
// connection.once('open', () => {
//   console.log("MongoDB database connection established successfully");
// });


// const userRouter = require('./routes/user');

// app.listen(port, () => {
// 	console.log("Sever is listening on port 4000")
// })

// app.use('/user', userRouter);


// // const express = require('express');
// // const cors = require('cors');
// // const mongoose = require('mongoose');
// // const { resolve } = require("path");

// // // Replace if using a different env file or config
// // const env = require("dotenv").config({ path: "./.env" });


// // (process.env.STRIPE_SECRET_KEY); // Import Stripe package

// // const app = express();
// // const port = process.env.PORT || 5252;

// // app.use(cors());
// // app.use(express.json());

// // const uri = process.env.ATLAS_URI;
// // mongoose.connect(uri, { useNewUrlParser: true, useCreateIndex: true });

// // const connection = mongoose.connection;
// // connection.once('open', () => {
// //   console.log("MongoDB database connection established successfully");
// // });

// // const userRouter = require('./routes/user');

// // app.use('/user', userRouter);

// // const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY, {
// //   apiVersion: "2022-08-01",
// // });

// // app.use(express.static(process.env.STATIC_DIR));

// // app.get("/", (req, res) => {
// //   const path = resolve(process.env.STATIC_DIR + "/index.html");
// //   res.sendFile(path);
// // });

// // app.get("/config", (req, res) => {
// //   res.send({
// //     publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
// //   });
// // });

// // app.post("/create-payment-intent", async (req, res) => {
// //   try {
// //     const paymentIntent = await stripe.paymentIntents.create({
// //       currency: "EUR",
// //       amount: 100,
// //       automatic_payment_methods: { enabled: true },
// //     });

// //     // Send publishable key and PaymentIntent details to client
// //     res.send({
// //       clientSecret: paymentIntent.client_secret,
// //     });
// //   } catch (e) {
// //     return res.status(400).send({
// //       error: {
// //         message: e.message,
// //       },
// //     });
// //   }
// // });



// // app.listen(port, () => {
// //   console.log(`App listening at http://localhost:${port}`);
// // });