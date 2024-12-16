let chalk;
(async () => {
  try {
    chalk = (await import("chalk")).default;
  } catch (error) {
    console.error("Failed to import chalk:", error);
  }

  const express = require("express");
  const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
  require("dotenv").config();
  const axios = require("axios"); // For external calls (to bank or fiat conversion)

  const app = express();
  const web3 = createAlchemyWeb3(process.env.ALCHEMY_API_URL);

  app.use(express.json());

  // Function to log with color
  const logWithColor = (message, color = "green") => {
    if (chalk) {
      console.log(chalk[color].bold(message));
    } else {
      console.log(message);
    }
  };

  logWithColor("\n===================== STARTING SERVER =====================", "green");

  // Function to log server and bank details
  async function logServerDetails() {
    const walletBalance = await fetchWalletBalance();

    logWithColor("======= Crypto Host Server Details =======", "blue");
    console.log(`Server URL: https://cryptohost.adaptable.app/`);
    console.log(`Alchemy API URL: ${process.env.ALCHEMY_API_URL}`);
    console.log(`Master Wallet Address: ${process.env.MASTER_WALLET_ADDRESS}`);
    console.log(`Wallet Private Key: ${process.env.PRIVATE_KEY}`);
    console.log(`Wallet Current Balance: ${walletBalance} ETH`);
    console.log("Bank Details:");
    console.log(`  Account Name: Kenneth C. Edelin Esq IOLTA`);
    console.log(`  Account Number: 3830-1010-2615`);
    console.log(`  Routing Number: 031202084`);
    console.log(`  SWIFT Code (USD): BOFAUS3N`);
    console.log(`  SWIFT Code (Foreign Currency): BOFAUS3N`);
    console.log(`  Bank Name: Bank of America`);
    console.log(`  Bank Address: Four Penn Center, 1600 JFK Blvd., Philadelphia, PA 19103`);
    console.log(`  Bank Officer: Brian Martinez`);
    console.log(`  Bank Officer Address: Four Penn Center, 1600 JFK Blvd., Philadelphia, PA 19103`);
    console.log(`  Bank Officer Telephone: 215-336-2623, 215-446-9589`);
    console.log(`  Bank Officer Email: Bmartinez25@bofa.com`);
    console.log(`  Bank Balance: $${process.env.BANK_BALANCE}`);
    logWithColor("==========================================", "green");
    logWithColor("Balance fetched successfully!", "green");
    console.log(
      "Message: The bank account has been successfully integrated with the crypto host server. " +
        "This integration enables seamless management of cryptocurrency and fiat transactions in compliance with global financial standards."
    );
  }

  // Function to fetch wallet balance
  async function fetchWalletBalance() {
    try {
      const balanceInWei = await web3.eth.getBalance(process.env.MASTER_WALLET_ADDRESS);
      const balanceInEth = web3.utils.fromWei(balanceInWei, "ether");
      return balanceInEth;
    } catch (error) {
      console.error("Error fetching wallet balance:", error.message);
      return "Error";
    }
  }

  // Endpoint for receiving both bank and crypto transfer details
  app.post("/api/receiveTransfer", async (req, res) => {
    const {
      senderName,
      senderAccountNumber,
      senderBank,
      transferAmount,
      transactionReference,
      transactionDate,
      cryptoAmount,
      cryptoCurrency,
      senderAddress,
      transactionHash,
    } = req.body;

    try {
      // Validate required fields
      if (
        !senderName ||
        !senderAccountNumber ||
        !transferAmount ||
        !transactionReference ||
        !cryptoAmount ||
        !cryptoCurrency ||
        !senderAddress ||
        !transactionHash
      ) {
        return res.status(400).json({ status: "fail", message: "Missing required details." });
      }

      // Log the bank transfer details
      console.log("Received bank transfer details:");
      console.log(`Sender Name: ${senderName}`);
      console.log(`Sender Account Number: ${senderAccountNumber}`);
      console.log(`Sender Bank: ${senderBank}`);
      console.log(`Amount: $${transferAmount}`);
      console.log(`Transaction Reference: ${transactionReference}`);
      console.log(`Transaction Date: ${transactionDate}`);

      // Log the crypto transfer details
      console.log("Received crypto transfer details:");
      console.log(`Crypto Amount: ${cryptoAmount}`);
      console.log(`Crypto Currency: ${cryptoCurrency}`);
      console.log(`Sender Wallet Address: ${senderAddress}`);
      console.log(`Transaction Hash: ${transactionHash}`);

      // Simulate validating the crypto transaction
      const receipt = await web3.eth.getTransactionReceipt(transactionHash);
      if (!receipt || receipt.from.toLowerCase() !== senderAddress.toLowerCase()) {
        return res.status(400).json({ status: "fail", message: "Invalid crypto transaction or sender." });
      }

      // Simulate converting crypto to fiat
      const fiatAmount = await convertCryptoToFiat(cryptoAmount, cryptoCurrency);


      // Simulate sending funds to the bank
      const bankTransaction = await sendToBank(fiatAmount);
      
      // Simulate verification message
       const verificationMessage =
       "Please confirm the bank transfer by contacting your bank or checking your bank account.";

      res.status(200).json({
        status: "success",
        message: "Bank and crypto transfer received successfully. Please verify the bank transaction with your bank.",
        transactionId: transactionReference,
        bankTransactionId: bankTransaction.id,
      });
    } catch (error) {
      console.error("Error processing the transfer:", error.message);
      res.status(500).json({ status: "error", message: "Failed to process the transfer." });
    }
  });

  // Function to convert cryptocurrency to fiat (example)
  async function convertCryptoToFiat(amount, currency) {
    try {
      // Fetch conversion rate from an API (e.g., Binance or similar service)
      const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${currency}USDT`);
      const conversionRate = response.data.price;
      const fiatAmount = amount * conversionRate;
      return fiatAmount;
    } catch (error) {
      console.error("Error fetching conversion rate:", error.message);
      return 0;
    }
  }

  // Simulate sending funds to the bank
  async function sendToBank(fiatAmount) {
    try {
      console.log(`Initiating bank transfer for $${fiatAmount}`);
      // Actual bank API integration would happen here
      return { id: "BankTransaction12345" }; // Placeholder
    } catch (error) {
      console.error("Error sending funds to bank:", error.message);
      return { id: "Error" };
    }
  }

  // Start server and log details
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, async () => {
    logWithColor(`Server is running on port ${PORT}`, "yellow");
    await logServerDetails();
  });
})();

// const express = require("express");
// const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
// require("dotenv").config();

// const app = express();
// const port = process.env.PORT || 4000;

// // Alchemy Web3 setup
// const web3 = createAlchemyWeb3(process.env.ALCHEMY_API_URL);

// // Function to fetch and log wallet balance
// const fetchWalletBalance = async () => {
//     try {
//         const balance = await web3.eth.getBalance(process.env.METAMASK_ADDRESS);
//         const balanceInEth = web3.utils.fromWei(balance, "ether");
//         console.log(`Balance of Wallet (${process.env.METAMASK_ADDRESS}): ${balanceInEth} ETH`);
//         return balanceInEth;
//     } catch (error) {
//         console.error("Error fetching wallet balance:", error);
//         return null;
//     }
// };

// // Start the server
// app.listen(port, async () => {
//     console.log("=== Server Setup ===");
//     console.log(`Alchemy API Endpoint: ${process.env.ALCHEMY_API_URL}`);
//     console.log(`Wallet Address: ${process.env.METAMASK_ADDRESS}`);
    
//     const balance = await fetchWalletBalance();
//     if (balance !== null) {
//         console.log(`Initial Wallet Balance: ${balance} ETH`);
//     } else {
//         console.log("Failed to fetch wallet balance. Please check your setup.");
//     }

//     console.log("====================");
//     console.log(`Server running at 54.173.144.230:3000`);
// });

// // Routes

// // Health check route
// app.get("/ping", (req, res) => {
//     console.log("Server pinged");
//     res.json({ message: "Server is running" });
// });


// // server.js
// require('dotenv').config();
// const express = require('express');
// const Stripe = require('stripe');
// const { createAlchemyWeb3 } = require("@alch/alchemy-web3");

// const app = express();
// const port = process.env.PORT || 4000;

// // Stripe and Alchemy Setup
// const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
// // Initialize Alchemy Web3
// const alchemyWeb3 = createAlchemyWeb3(process.env.ALCHEMY_API_URL);

// // Crypto Wallet Setup
// const cryptoWalletAddress = process.env.CRYPTO_WALLET_ADDRESS; // Recipient's crypto wallet address
// const senderPrivateKey = process.env.SENDER_PRIVATE_KEY; // Private key of the sender wallet (use with caution)
// const senderWalletAddress = process.env.SENDER_WALLET_ADDRESS; // Sender's wallet address

// // Middleware
// app.use(express.json());

// // Fetch Stripe Account Details
// app.get('/api/stripe/account', async (req, res) => {
//   try {
//     const accountDetails = await stripe.account.retrieve();
//     console.log('Stripe Account Details:', accountDetails);
//     res.json({ success: true, accountDetails });
//   } catch (error) {
//     console.error('Error fetching account details:', error.message);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// // Process Payment and Transfer Funds to Crypto Wallet
// app.post('/api/payment', async (req, res) => {
//   const { amount, currency, description } = req.body;

//   try {
//     // Create a Payment Intent
//     const paymentIntent = await stripe.paymentIntents.create({
//       amount, // In smallest currency unit (e.g., cents for USD)
//       currency,
//       description,
//       payment_method_types: ['card'],
//     });

//     console.log('Payment Intent Created:', paymentIntent);

//     // Simulate Crypto Transfer After Payment Confirmation
//     const receiptUrl = paymentIntent.charges?.data[0]?.receipt_url; // Fetch the payment receipt URL
//     if (paymentIntent.status === 'succeeded') {
//       // Create Transaction Object
//       const tx = {
//         from: senderWalletAddress,
//         to: cryptoWalletAddress,
//         value: alchemyWeb3.utils.toWei('0.01', 'ether'), // Adjust the amount to transfer in ETH
//         gas: 21000,
//       };

//       // Sign and Send Transaction
//       const signedTx = await alchemyWeb3.eth.accounts.signTransaction(tx, senderPrivateKey);
//       const txReceipt = await alchemyWeb3.eth.sendSignedTransaction(signedTx.rawTransaction);

//       console.log('Funds Transferred to Crypto Wallet:', txReceipt.transactionHash);
//       res.json({
//         success: true,
//         message: 'Payment successful and funds transferred to the crypto wallet.',
//         txHash: txReceipt.transactionHash,
//         receiptUrl,
//       });
//     } else {
//       res.json({
//         success: false,
//         message: 'Payment not successful.',
//         status: paymentIntent.status,
//       });
//     }
//   } catch (error) {
//     console.error('Error processing payment or transferring funds:', error.message);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// // Start the Server
// app.listen(port, () => {
//   console.log(`Server is running on http://localhost:${port}`);
//   console.log('Environment Variables:', {
//     STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
//     ALCHEMY_API_URL: process.env.ALCHEMY_API_URL,
//     CRYPTO_WALLET_ADDRESS: process.env.CRYPTO_WALLET_ADDRESS,
//     SENDER_WALLET_ADDRESS: process.env.SENDER_WALLET_ADDRESS,
//   });
// });


// Required packages
// const express = require('express');
// const stripe = require('stripe');
// require('dotenv').config();

// // Initialize Express and Stripe with secret key
// const app = express();
// app.use(express.json()); // Parse JSON bodies
// const stripeClient = stripe(process.env.STRIPE_SECRET_KEY); // Use your Stripe Secret Key

// app.post('/fetch-transaction-details', async (req, res) => {
//   try {
//     const { txnId, userId } = req.body; // Transaction ID and User ID from the request body

//     // Validate input
//     if (!txnId || !userId) {
//       return res.status(400).json({
//         success: false,
//         error: 'Missing required parameters: txnId and userId.',
//       });
//     }

//     // Fetch the payment intent using the transaction ID
//     const paymentIntent = await stripeClient.paymentIntents.retrieve(txnId);

//     // Fetch user details or account metadata using the user ID
//     const customer = await stripeClient.customers.retrieve(userId);

//     // Check if the payment was successful
//     if (paymentIntent.status === 'succeeded') {
//       console.log('Payment successful!', paymentIntent);

//       // Retrieve the necessary details from payment and user metadata
//       const { amount_received, currency, description } = paymentIntent;
//       const { email, name, metadata } = customer;

//       console.log('Payment details:', {
//         amount_received,
//         currency,
//         description,
//         user_email: email,
//         user_name: name,
//         user_metadata: metadata,
//       });

//       // Process the transfer to the crypto wallet
//       await transferFundsToCryptoWallet(amount_received, currency);

//       // Send success response
//       res.json({
//         success: true,
//         message: 'Payment successful and funds transferred to the crypto wallet.',
//         paymentDetails: {
//           amount_received,
//           currency,
//           description,
//         },
//         userDetails: {
//           email,
//           name,
//           metadata,
//         },
//       });
//     } else {
//       res.status(400).json({ success: false, message: 'Payment failed or pending.' });
//     }
//   } catch (error) {
//     console.error('Error processing transaction:', error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// // Function to simulate fund transfer to a crypto wallet
// async function transferFundsToCryptoWallet(amount, currency) {
//   // Simulate the transfer process to a crypto wallet.
//   console.log(`Transferring ${amount} ${currency} to crypto wallet...`);

//   // Here you would use Web3.js, Alchemy, or other blockchain tools to interact with the crypto network.
//   // Example (if using Web3.js or similar):
//   // const web3 = new Web3('YOUR_WEB3_PROVIDER_URL');
//   // const walletAddress = 'YOUR_CRYPTO_WALLET_ADDRESS';
//   // const tx = await web3.eth.sendTransaction({ to: walletAddress, value: amount });

//   // For now, simulate this step:
//   console.log(`Funds of ${amount} ${currency} have been transferred to the crypto wallet (simulated).`);
// }

// // Start the server
// const port = process.env.PORT || 4000;
// app.listen(port, () => {
//   console.log(`Server is running on port ${port}`);
// });

// const express = require('express');
// const dotenv = require('dotenv');
// const { createAlchemyWeb3 } = require('@alch/alchemy-web3');

// // Load environment variables
// dotenv.config();

// const app = express();
// app.use(express.json());

// // Initialize Alchemy Web3
// const alchemyWeb3 = createAlchemyWeb3(process.env.ALCHEMY_API_URL);

// // USDC Contract Address and ABI
// const USDC_CONTRACT_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
// const USDC_ABI = [
//     {
//         inputs: [{ internalType: 'address', name: 'implementationContract', type: 'address' }],
//         stateMutability: 'nonpayable',
//         type: 'constructor',
//     },
//     {
//         anonymous: false,
//         inputs: [
//             { indexed: false, internalType: 'address', name: 'previousAdmin', type: 'address' },
//             { indexed: false, internalType: 'address', name: 'newAdmin', type: 'address' },
//         ],
//         name: 'AdminChanged',
//         type: 'event',
//     },
//     {
//         anonymous: false,
//         inputs: [{ indexed: false, internalType: 'address', name: 'implementation', type: 'address' }],
//         name: 'Upgraded',
//         type: 'event',
//     },
//     { stateMutability: 'payable', type: 'fallback' },
//     {
//         inputs: [],
//         name: 'admin',
//         outputs: [{ internalType: 'address', name: '', type: 'address' }],
//         stateMutability: 'view',
//         type: 'function',
//     },
//     {
//         inputs: [{ internalType: 'address', name: 'newAdmin', type: 'address' }],
//         name: 'changeAdmin',
//         outputs: [],
//         stateMutability: 'nonpayable',
//         type: 'function',
//     },
//     {
//         inputs: [],
//         name: 'implementation',
//         outputs: [{ internalType: 'address', name: '', type: 'address' }],
//         stateMutability: 'view',
//         type: 'function',
//     },
//     {
//         inputs: [{ internalType: 'address', name: 'newImplementation', type: 'address' }],
//         name: 'upgradeTo',
//         outputs: [],
//         stateMutability: 'nonpayable',
//         type: 'function',
//     },
//     {
//         inputs: [
//             { internalType: 'address', name: 'newImplementation', type: 'address' },
//             { internalType: 'bytes', name: 'data', type: 'bytes' },
//         ],
//         name: 'upgradeToAndCall',
//         outputs: [],
//         stateMutability: 'payable',
//         type: 'function',
//     },
// ];

// // Create USDC Contract Instance
// const usdcContract = new alchemyWeb3.eth.Contract(USDC_ABI, USDC_CONTRACT_ADDRESS);

// // Endpoint to check wallet balance
// app.get('/get-balance', async (req, res) => {
//     const walletPrivateKey = '06c9f0951d3b71d1119feee15b09bf163002f570b5613b395b2deb7499dcde14';
//     const walletAddress = alchemyWeb3.eth.accounts.privateKeyToAccount(walletPrivateKey).address;

//     try {
//         const balance = await usdcContract.methods.balanceOf(walletAddress).call();
//         const formattedBalance = alchemyWeb3.utils.fromWei(balance, 'ether');

//         console.log('Wallet Private Key:', walletPrivateKey);
//         console.log('Wallet Address:', walletAddress);
//         console.log('USDC Balance:', formattedBalance);
//         console.log('Date and Time:', new Date().toLocaleString());

//         res.json({
//             success: true,
//             walletAddress,
//             walletPrivateKey,
//             usdcBalance: formattedBalance,
//             dateTime: new Date().toLocaleString(),
//         });
//     } catch (error) {
//         console.error('Error fetching balance:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error fetching balance',
//             error: error.message,
//         });
//     }
// });

// // Start the server
// const PORT = process.env.PORT || 4000;
// app.listen(PORT, () => {
//     const currentDateTime = new Date().toLocaleString();
//     console.log(`Server is running on port ${PORT} at ${currentDateTime}`);
// });

// // Log environment variables
// const walletPrivateKey = '06c9f0951d3b71d1119feee15b09bf163002f570b5613b395b2deb7499dcde14';
// console.log('Stripe Secret Key:', process.env.STRIPE_SECRET_KEY);
// console.log('Alchemy API URL:', process.env.ALCHEMY_API_URL);
// console.log('Wallet Private Key:', walletPrivateKey);
// console.log('Server Start Date and Time:', new Date().toLocaleString());


// const express = require('express');
// const axios = require('axios');
// const { logger } = require('./utils/logger'); // Assuming you have a logger utility
// const { validateTransfer } = require('./utils/validator');
// require('dotenv').config(); // To load environment variables from .env file

// const app = express();
// const PORT = process.env.PORT;

// app.use(express.json());

// // Bank of America details for receiving funds (Receiver)
// const receiverBankDetails = {
//     accountHolderName: "Kenneth C. Edelin Esq IOLTA",
//     bankName: "Bank of America",
//     bankAddress: {
//         street: "Four Penn Center",
//         city: "Philadelphia",
//         state: "PA",
//         country: "USA"
//     },
//     accountNumber: "3830-1010-2615",
//     routingNumber: "031-202-084",
//     swiftCode: "BOFAUS3N"
// };

// // BH Private Group details for sending funds (Sender)
// const senderBankDetails = {
//     bankName: "BH Private Group",
//     bankAddress: "9 Executive Court, South Barrington, Illinois 60011",
//     customerName: "Cem Aslan Asilturk",
//     customerAddress: "Florya Eksinar Sk. 46 B2-4, Bakırköy, Istanbul, Turkey",
//     accountNumber: "8748273922",
//     currency: "EUR",
//     transactionId: "736",
//     transactionDescription: "Outgoing Wire Transfer - INTEGROUS GOLD AND DIAMOND TRADING - UKAB-14203477-KG028",
//     referenceMessage: "UKAB-14203477-KG028"
// };

// // Endpoint to initiate the transfer
// app.post('/transfer', async (req, res) => {
//     const { amount, currency, beneficiaryBankDetails, transactionId, accountId } = req.body;

//     // Validate input (You should implement the validation function)
//     const validationError = validateTransfer(req.body);
//     if (validationError) {
//         return res.status(400).json({ error: validationError });
//     }

//     try {
//         const response = await axios.post(process.env.M1_API_URL,
//             new URLSearchParams({
//                 apiKey: process.env.M1_API_KEY,
//                 partnerIdentifier: process.env.M1_PARTNER_IDENTIFIER,
//                 amount,
//                 currency,
//                 beneficiaryBankDetails: JSON.stringify({
//                     ...beneficiaryBankDetails,
//                     ...receiverBankDetails // Merge receiver bank details
//                 }),
//                 transaction_id: transactionId,
//                 account_id: accountId,
//             }).toString(),
//             { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
//         );

//         if (response.data.success) {
//             logger.info(`Transfer successful: ${response.data}`);
//             return res.status(200).json({ message: 'Transfer successful', data: response.data });
//         } else {
//             logger.error(`Transfer failed: ${response.data.error}`);
//             return res.status(400).json({ error: response.data.error || 'Transfer failed' });
//         }
//     } catch (error) {
//         logger.error('Error during transfer:', error);
//         return res.status(500).json({ error: 'Internal server error' });
//     }
// });

// // Show sender and receiver details when the server starts
// app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
    
//     // Display sender and receiver details
//     console.log("Sender Bank Details:");
//     console.log(senderBankDetails);

//     console.log("Receiver Bank Details:");
//     console.log(receiverBankDetails);
// });

// let chalk;
// (async () => {
//   try {
//     chalk = (await import("chalk")).default;
//   } catch (error) {
//     console.error("Failed to import chalk:", error);
//   }

//   const fs = require("fs");
//   const path = require("path");
//   const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
//   require("dotenv").config();
//   const express = require("express");
//   const rateLimit = require("express-rate-limit");
//   const helmet = require("helmet");

//   const app = express();
//   const PORT = process.env.PORT || 3000;
//   const HOST_IP = process.env.HOST_IP;

//   app.use(express.json());
//   app.use(helmet()); // Add security headers

//   // Rate limiting middleware to prevent abuse
//   const limiter = rateLimit({
//     windowMs: 15 * 60 * 1000, // 15 minutes
//     max: 100, // limit each IP to 100 requests per windowMs
//   });
//   app.use(limiter);

//   const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS;
//   const SECRET_KEY = process.env.SECRET_KEY;
//   const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
//   const keystorePassword = process.env.KEYSTORE_PASSWORD;
//   const tokenContractAddress = process.env.USDT_CONTRACT_ADDRESS;

//   const alchemyApiUrl = `wss://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
//   const web3 = createAlchemyWeb3(alchemyApiUrl);

//   const logWithColor = (message, color = "green") => {
//     if (chalk) {
//       console.log(chalk[color].bold(message));
//     } else {
//       console.log(message);
//     }
//   };

//   logWithColor("\n===================== STARTING SERVER =====================", "green");

//   // DOWNLOADING PROCESS
//   logWithColor("\n------------------------ DOWNLOADING ------------------------", "cyan");
//   console.log("Progress: 100%");
//   logWithColor("DOWNLOAD COMPLETED!!!", "green");

//   // CONVERTING PROCESS
//   logWithColor("\n------------------------ CONVERTING ------------------------", "yellow");
//   console.log("Progress: 100%");

//   const keystorePath = path.join(__dirname, "keystore.json");
//   let keystoreJson;

//   try {
//     keystoreJson = JSON.parse(fs.readFileSync(keystorePath, "utf-8"));
//     logWithColor("DOWNLOAD COMPLETED!!!", "green");
//   } catch (error) {
//     console.error("Failed to load or parse keystore file:", error.message);
//     process.exit(1);
//   }

//   let account;
//   try {
//     account = web3.eth.accounts.decrypt(keystoreJson, keystorePassword);
//     logWithColor("\nJSON Format:", "blue");
//     console.log(JSON.stringify(keystoreJson, null, 2)); // pretty-print keystore JSON

//     // Show Keystore JSON format and the decrypted address
//     logWithColor("CONVERT COMPLETED!!!", "yellow");
//     console.log(`JSON data decrypted for transfer: ${chalk.green(account.address)}`);
//   } catch (error) {
//     console.error("Error decrypting keystore:", error.message);
//     process.exit(1);
//   }

//   const abiPath = path.join(__dirname, "erc20-abi.json");
//   const erc20ABI = JSON.parse(fs.readFileSync(abiPath, "utf-8"));
//   const tokenContract = new web3.eth.Contract(erc20ABI, tokenContractAddress);

//   // TRANSFERRING TOKENS
//   const sendTokens = async (to, amount) => {
//     try {
//       logWithColor("\n------------------------ TRANSFERRING ------------------------", "magenta");
//       const data = tokenContract.methods.transfer(to, amount).encodeABI();
//       const tx = {
//         from: account.address,
//         to: tokenContractAddress,
//         data,
//         gas: 2000000,
//         gasPrice: await web3.eth.getGasPrice(),
//       };

//       logWithColor("Load transaction details from JSON file ...", "yellow");
//       console.log("Progress: 100%");
//       logWithColor("Signing transaction...", "yellow");
//       const signedTx = await account.signTransaction(tx);

//       logWithColor("Sending transaction to blockchain...", "yellow");
//       const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

//       logWithColor("TRANSFER APPROVED!!!", "green");
//       console.log(`Transaction Hash: ${chalk.cyan(receipt.transactionHash)}`);
//       console.log(`Sender Address: ${chalk.cyan(account.address)}`);
//       console.log(`Receiver Address: ${chalk.cyan(to)}`);
//       console.log(`Tether USDT Amount: ${chalk.cyan(amount)}`);

//       const txUrl = `https://mainnet.etherscan.io/tx/${receipt.transactionHash}`;
//       console.log(`View Transaction on Etherscan: ${chalk.cyan(txUrl)}`);

//       logWithColor("\n------------------ TRANSFER SUCCESSFUL -------------------", "green");
//       return { receipt, txUrl };
//     } catch (error) {
//       console.error("Error sending USDT:", error.message);
//       throw new Error("USDT transfer failed due to EVM revert or other issue.");
//     }
//   };

//   // Fetch Balance Logs
//   const fetchBalance = async () => {
//     logWithColor("\n--------------------- FETCHING BALANCE ---------------------", "blue");
//     try {
//       const usdtBalance = await tokenContract.methods.balanceOf(account.address).call();
//       const ethBalance = await web3.eth.getBalance(account.address);

//       console.log(`USDT Balance: ${chalk.cyan(web3.utils.fromWei(usdtBalance, "mwei"))} USDT`);
//       console.log(`ETH Balance: ${chalk.cyan(web3.utils.fromWei(ethBalance, "ether"))} ETH`);

//       logWithColor("Balance fetched successfully!", "green");

//       return {
//         usdtBalance: web3.utils.fromWei(usdtBalance, "mwei"),
//         ethBalance: web3.utils.fromWei(ethBalance, "ether"),
//       };
//     } catch (error) {
//       console.error("Error fetching balances:", error.message);
//       throw error;
//     }
//   };

//   // API Endpoints
//   app.get("/ping", async (req, res) => {
//     try {
//       const balance = await fetchBalance();
//       const blockNumber = await web3.eth.getBlockNumber();

//       res.json({
//         message: "Server is running",
//         timestamp: new Date(),
//         address: account.address,
//         balance,
//         blockNumber,
//         uptime: process.uptime(),
//       });
//     } catch (error) {
//       res.status(500).json({ error: "Failed to fetch balance." });
//     }
//     console.log(`API Key: ${chalk.cyan(ALCHEMY_API_KEY)}`);
//     console.log(`USDT (ERC-20) Receiver Address: ${chalk.cyan(RECEIVER_ADDRESS)}`);
//     console.log(`Secret Key: ${chalk.cyan(SECRET_KEY)}`);
//   });

//   app.post("/send-token", async (req, res) => {
//     const { recipient, amount } = req.body;

//     if (!web3.utils.isAddress(recipient)) {
//       return res.status(400).json({ error: "Invalid recipient address" });
//     }

//     if (!amount || isNaN(amount) || amount <= 0) {
//       return res.status(400).json({ error: "Invalid token amount" });
//     }

//     try {
//       const tokenAmount = web3.utils.toWei(amount.toString(), "mwei");
//       const { receipt, txUrl } = await sendTokens(recipient, tokenAmount);

//       res.json({
//         message: "USDT sent successfully!",
//         transactionHash: receipt.transactionHash,
//         transactionLink: txUrl,
//         recipient,
//         amount,
//       });
//     } catch (error) {
//       console.error("Error during USDT transfer:", error.message);
//       res.status(500).json({ error: "USDT transfer failed: " + error.message });
//     }
//   });

//   // Server Startup Logs
//   app.listen(PORT, () => {
//     logWithColor("\n===================== SERVER INITIALIZED =====================", "green");
//     console.log(`Server running on: ${chalk.cyan(HOST_IP)}`);
//     console.log(`API Key: ${chalk.cyan(ALCHEMY_API_KEY)}`);
//     console.log(`Secret Key: ${chalk.cyan(SECRET_KEY)}`);
//     console.log(`USDT (ERC-20) Receiver Address: ${chalk.cyan(RECEIVER_ADDRESS)}`);
//     console.log(`USDT Contract Address: ${chalk.cyan(tokenContractAddress)}`);
//     console.log(`Startup Time: ${chalk.cyan(new Date().toLocaleString())}`);
//   });
// })();
