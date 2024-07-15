const express = require('express');
const bodyParser = require('body-parser');
const winston = require('winston');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
require('dotenv').config();
const { createAlchemyWeb3 } = require('@alch/alchemy-web3');

const app = express();
const PORT = process.env.PORT || 3000;
const ALCHEMY_API_URL = process.env.ALCHEMY_API_URL;
const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS;
const USDT_DEPOSIT_ADDRESS = process.env.USDT_DEPOSIT_ADDRESS;
const SENDER_ADDRESS = process.env.SENDER_ADDRESS;
const SENDER_PRIVATE_KEY = process.env.SENDER_PRIVATE_KEY;
const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS;

const web3 = createAlchemyWeb3(ALCHEMY_API_URL);

// Setup logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'server.log' })
  ]
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Endpoint to check server connectivity
app.post('/ping', (req, res) => {
  res.json({ success: true, message: 'Server is running and connected' });
});

// Endpoint to receive and save messages
app.post('/saveMessage', (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, message: 'Message is required' });
  }

  const filePath = path.join(__dirname, 'messages.txt');
  const logEntry = `Received message: ${message}\n`;

  fs.appendFile(filePath, logEntry, (err) => {
    if (err) {
      logger.error('Error saving message:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to save message' });
    }

    logger.info('Message saved successfully');
    res.json({ success: true, message: 'Message saved successfully' });
  });
});

// New Endpoint to receive text messages
app.post('/receiveText', (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ success: false, message: 'Text is required' });
  }

  const filePath = path.join(__dirname, 'textMessages.txt');
  const logEntry = `Received text at ${moment().format('YYYY-MM-DD HH:mm:ss')}: ${text}\n`;

  fs.appendFile(filePath, logEntry, (err) => {
    if (err) {
      logger.error('Error saving text message:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to save text message' });
    }

    logger.info('Text message saved successfully');
    res.json({ success: true, message: 'Text message saved successfully' });
  });
});

// Function to handle new transactions
async function handleNewTransaction(transaction) {
  if (transaction.to && transaction.to.toLowerCase() === USDT_DEPOSIT_ADDRESS.toLowerCase()) {
    logger.info(`Detected transaction to USDT_DEPOSIT_ADDRESS: ${transaction.hash}`);

    try {
      const receipt = await web3.eth.getTransactionReceipt(transaction.hash);
      logger.info(`Transaction receipt: ${JSON.stringify(receipt)}`);

      // Log the transaction details
      const logEntry = `
        Transaction Hash: ${transaction.hash}
        From: ${transaction.from}
        To: ${transaction.to}
        Value: ${web3.utils.fromWei(transaction.value, 'ether')} ETH
        Block Number: ${transaction.blockNumber}
        Timestamp: ${new Date().toISOString()}
      `;

      console.log(logEntry);

      // Further processing can be done here
    } catch (error) {
      logger.error(`Error fetching transaction receipt: ${error.message}`);
    }
  }
}

// Listen for new pending transactions
web3.eth.subscribe('pendingTransactions', async (error, transactionHash) => {
  if (error) {
    logger.error(`Error subscribing to pending transactions: ${error.message}`);
    return;
  }

  try {
    const transaction = await web3.eth.getTransaction(transactionHash);
    if (transaction) {
      handleNewTransaction(transaction);
    }
  } catch (error) {
    logger.error(`Error fetching transaction: ${error.message}`);
  }
});

// Function to send a test USDT transaction
async function sendTestTransaction() {
  const nonce = await web3.eth.getTransactionCount(SENDER_ADDRESS, 'latest');

  const transaction = {
    'to': RECEIVER_ADDRESS,
    'value': '0', // Value should be 0 for ERC-20 token transfer
    'gas': 2000000,
    'nonce': nonce,
    'data': web3.eth.abi.encodeFunctionCall({
      name: 'transfer',
      type: 'function',
      inputs: [{
        type: 'address',
        name: '_to'
      },{
        type: 'uint256',
        name: '_value'
      }]
    }, [RECEIVER_ADDRESS, web3.utils.toHex(web3.utils.toWei('10', 'ether'))]),
    'chainId': 5 // Use 5 for Goerli testnet
  };

  const signedTx = await web3.eth.accounts.signTransaction(transaction, SENDER_PRIVATE_KEY);

  web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    .on('receipt', console.log)
    .on('error', console.error);
}

// Endpoint to send a test USDT transaction
app.post('/sendTestTransaction', (req, res) => {
  sendTestTransaction()
    .then(() => res.json({ success: true, message: 'Test transaction sent successfully' }))
    .catch((error) => res.status(500).json({ success: false, message: error.message }));
});

// Start server and log server start-up information
app.listen(PORT, () => {
  const startTime = moment().format('YYYY-MM-DD HH:mm:ss');
  const address = `http://localhost:${PORT}`;
  logger.info(`Server started at ${startTime}`);
  logger.info(`Server running on address: ${address}`);
  console.log(`Server running on port ${PORT}`);
});

// Logging environment variables for verification
logger.info("ALCHEMY_API_URL:", ALCHEMY_API_URL);
logger.info("USDT_CONTRACT_ADDRESS:", USDT_CONTRACT_ADDRESS);
logger.info("USDT_DEPOSIT_ADDRESS:", USDT_DEPOSIT_ADDRESS);
logger.info("SENDER_ADDRESS:", SENDER_ADDRESS);
logger.info("RECEIVER_ADDRESS:", RECEIVER_ADDRESS);
