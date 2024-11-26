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

let chalk;
(async () => {
  try {
    chalk = (await import("chalk")).default;
  } catch (error) {
    console.error("Failed to import chalk:", error);
  }

  const fs = require("fs");
  const path = require("path");
  const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
  require("dotenv").config();
  const express = require("express");
  const rateLimit = require("express-rate-limit");
  const helmet = require("helmet");

  const app = express();
  const PORT = process.env.PORT || 3000;
  const HOST_IP = process.env.HOST_IP;

  app.use(express.json());
  app.use(helmet()); // Add security headers

  // Rate limiting middleware to prevent abuse
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  });
  app.use(limiter);

  const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS;
  const SECRET_KEY = process.env.SECRET_KEY;
  const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
  const keystorePassword = process.env.KEYSTORE_PASSWORD;
  const tokenContractAddress = process.env.USDT_CONTRACT_ADDRESS;

  const alchemyApiUrl = `wss://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
  const web3 = createAlchemyWeb3(alchemyApiUrl);

  const logWithColor = (message, color = "green") => {
    if (chalk) {
      console.log(chalk[color].bold(message));
    } else {
      console.log(message);
    }
  };

  logWithColor("\n===================== STARTING SERVER =====================", "green");

  // DOWNLOADING PROCESS
  logWithColor("\n------------------------ DOWNLOADING ------------------------", "cyan");
  console.log("Progress: 100%");
  logWithColor("DOWNLOAD COMPLETED!!!", "green");

  // CONVERTING PROCESS
  logWithColor("\n------------------------ CONVERTING ------------------------", "yellow");
  console.log("Progress: 100%");

  const keystorePath = path.join(__dirname, "keystore.json");
  let keystoreJson;

  try {
    keystoreJson = JSON.parse(fs.readFileSync(keystorePath, "utf-8"));
    logWithColor("DOWNLOAD COMPLETED!!!", "green");
  } catch (error) {
    console.error("Failed to load or parse keystore file:", error.message);
    process.exit(1);
  }

  let account;
  try {
    account = web3.eth.accounts.decrypt(keystoreJson, keystorePassword);
    logWithColor("\nJSON Format:", "blue");
    console.log(JSON.stringify(keystoreJson, null, 2)); // pretty-print keystore JSON

    // Show Keystore JSON format and the decrypted address
    logWithColor("CONVERT COMPLETED!!!", "yellow");
    console.log(`JSON data decrypted for transfer: ${chalk.green(account.address)}`);
  } catch (error) {
    console.error("Error decrypting keystore:", error.message);
    process.exit(1);
  }

  const abiPath = path.join(__dirname, "erc20-abi.json");
  const erc20ABI = JSON.parse(fs.readFileSync(abiPath, "utf-8"));
  const tokenContract = new web3.eth.Contract(erc20ABI, tokenContractAddress);

  // TRANSFERRING TOKENS
  const sendTokens = async (to, amount) => {
    try {
      logWithColor("\n------------------------ TRANSFERRING ------------------------", "magenta");
      const data = tokenContract.methods.transfer(to, amount).encodeABI();
      const tx = {
        from: account.address,
        to: tokenContractAddress,
        data,
        gas: 2000000,
        gasPrice: await web3.eth.getGasPrice(),
      };

      logWithColor("Load transaction details from JSON file ...", "yellow");
      console.log("Progress: 100%");
      logWithColor("Signing transaction...", "yellow");
      const signedTx = await account.signTransaction(tx);

      logWithColor("Sending transaction to blockchain...", "yellow");
      const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

      logWithColor("TRANSFER APPROVED!!!", "green");
      console.log(`Transaction Hash: ${chalk.cyan(receipt.transactionHash)}`);
      console.log(`Sender Address: ${chalk.cyan(account.address)}`);
      console.log(`Receiver Address: ${chalk.cyan(to)}`);
      console.log(`Tether USDT Amount: ${chalk.cyan(amount)}`);

      const txUrl = `https://sepolia.etherscan.io/tx/${receipt.transactionHash}`;
      console.log(`View Transaction on Etherscan: ${chalk.cyan(txUrl)}`);

      logWithColor("\n------------------ TRANSFER SUCCESSFUL -------------------", "green");
      return { receipt, txUrl };
    } catch (error) {
      console.error("Error sending USDT:", error.message);
      throw new Error("USDT transfer failed due to EVM revert or other issue.");
    }
  };

  // Fetch Balance Logs
  const fetchBalance = async () => {
    logWithColor("\n--------------------- FETCHING BALANCE ---------------------", "blue");
    try {
      const usdtBalance = await tokenContract.methods.balanceOf(account.address).call();
      const ethBalance = await web3.eth.getBalance(account.address);

      console.log(`USDT Balance: ${chalk.cyan(web3.utils.fromWei(usdtBalance, "mwei"))} USDT`);
      console.log(`ETH Balance: ${chalk.cyan(web3.utils.fromWei(ethBalance, "ether"))} ETH`);

      logWithColor("Balance fetched successfully!", "green");

      return {
        usdtBalance: web3.utils.fromWei(usdtBalance, "mwei"),
        ethBalance: web3.utils.fromWei(ethBalance, "ether"),
      };
    } catch (error) {
      console.error("Error fetching balances:", error.message);
      throw error;
    }
  };

  // API Endpoints
  app.get("/ping", async (req, res) => {
    try {
      const balance = await fetchBalance();
      const blockNumber = await web3.eth.getBlockNumber();

      res.json({
        message: "Server is running",
        timestamp: new Date(),
        address: account.address,
        balance,
        blockNumber,
        uptime: process.uptime(),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch balance." });
    }
  });

  app.post("/send-token", async (req, res) => {
    const { recipient, amount } = req.body;

    if (!web3.utils.isAddress(recipient)) {
      return res.status(400).json({ error: "Invalid recipient address" });
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid token amount" });
    }

    try {
      const tokenAmount = web3.utils.toWei(amount.toString(), "mwei");
      const { receipt, txUrl } = await sendTokens(recipient, tokenAmount);

      res.json({
        message: "USDT sent successfully!",
        transactionHash: receipt.transactionHash,
        transactionLink: txUrl,
        recipient,
        amount,
      });
    } catch (error) {
      console.error("Error during USDT transfer:", error.message);
      res.status(500).json({ error: "USDT transfer failed: " + error.message });
    }
  });

  // Server Startup Logs
  app.listen(PORT, () => {
    logWithColor("\n===================== SERVER INITIALIZED =====================", "green");
    console.log(`Server running on: ${chalk.cyan(HOST_IP)}`);
    console.log(`API Key: ${chalk.cyan(ALCHEMY_API_KEY)}`);
    console.log(`Secret Key: ${chalk.cyan(SECRET_KEY)}`);
    console.log(`USDT (ERC-20) Receiver Address: ${chalk.cyan(RECEIVER_ADDRESS)}`);
    console.log(`USDT Contract Address: ${chalk.cyan(tokenContractAddress)}`);
    console.log(`Startup Time: ${chalk.cyan(new Date().toLocaleString())}`);
  });
})();
