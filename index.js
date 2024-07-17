// ERC-20 USDT Transaction Mainnet
const express = require('express');
const bodyParser = require('body-parser');
const winston = require('winston');
const mongoose = require('mongoose');
const moment = require('moment');
require('dotenv').config();
const { createAlchemyWeb3 } = require('@alch/alchemy-web3');

const app = express();
const PORT = process.env.PORT;
const ALCHEMY_API_URL = process.env.ALCHEMY_API_URL;
const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS;
const USDT_DEPOSIT_ADDRESS = process.env.USDT_DEPOSIT_ADDRESS;
const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS;
const MONGO_URI = process.env.MONGO_URI;

const web3 = createAlchemyWeb3(ALCHEMY_API_URL);

// MongoDB connection
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err));

// Define a message schema and model
const messageSchema = new mongoose.Schema({
  text: String,
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

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
app.post('/sendData', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    logger.warn('No message provided');
    return res.status(400).json({ success: false, message: 'Message is required' });
  }

  try {
    const newMessage = new Message({ text: message });
    await newMessage.save();
    logger.info('Message saved successfully');
    res.json({ success: true, message: 'Message saved successfully' });
  } catch (err) {
    logger.error('Error saving message:', err.message);
    res.status(500).json({ success: false, message: 'Failed to save message' });
  }
});

// Endpoint to retrieve messages
app.get('/data', async (req, res) => {
  try {
    const messages = await Message.find();
    res.json({ success: true, messages });
  } catch (err) {
    logger.error('Error retrieving messages:', err.message);
    res.status(500).json({ success: false, message: 'Failed to retrieve messages' });
  }
});

// New Endpoint to receive text messages
app.post('/receiveText', (req, res) => {
  const { text } = req.body;

  if (!text) {
    logger.warn('No text provided');
    return res.status(400).json({ success: false, message: 'Text is required' });
  }

  const logEntry = `Received text at ${moment().format('YYYY-MM-DD HH:mm:ss')}: ${text}\n`;

  const newMessage = new Message({ text: text });

  newMessage.save((err) => {
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
  try {
    if (transaction.to && transaction.to.toLowerCase() === USDT_DEPOSIT_ADDRESS.toLowerCase()) {
      logger.info(`Detected transaction to USDT_DEPOSIT_ADDRESS: ${transaction.hash}`);

      const receipt = await web3.eth.getTransactionReceipt(transaction.hash);
      logger.info(`Transaction receipt: ${JSON.stringify(receipt)}`);

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
    }
  } catch (error) {
    logger.error(`Error handling transaction: ${error.message}`);
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
      await handleNewTransaction(transaction);
    }
  } catch (error) {
    logger.error(`Error fetching transaction: ${error.message}`);
  }
});

// Function to send a test USDT transaction with amount to a specific address
async function sendTestTransaction(senderAddress, senderPrivateKey, recipientAddress, amount) {
  try {
    const nonce = await web3.eth.getTransactionCount(senderAddress, 'latest');
    logger.info(`Nonce for address ${senderAddress}: ${nonce}`);

    // USDT typically has 6 decimal places
    const tokenAmount = web3.utils.toHex(amount * (10 ** 6));

    const transaction = {
      'to': USDT_CONTRACT_ADDRESS, // The USDT contract address
      'value': '0', // Value should be 0 for ERC-20 token transfer
      'gas': 2000000,
      'nonce': nonce,
      'data': web3.eth.abi.encodeFunctionCall({
        name: 'transfer',
        type: 'function',
        inputs: [{
          type: 'address',
          name: '_to'
        }, {
          type: 'uint256',
          name: '_value'
        }]
      }, [recipientAddress, tokenAmount]),
      'maxFeePerGas': web3.utils.toWei('2', 'gwei'), // Adjust gas fees if needed
      'maxPriorityFeePerGas': web3.utils.toWei('1', 'gwei'),
      'chainId': 1 // Mainnet chain ID
    };

    const signedTx = await web3.eth.accounts.signTransaction(transaction, senderPrivateKey);
    logger.info('Signed transaction:', signedTx);

    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    logger.info('Transaction receipt:', receipt);
    return receipt;
  } catch (error) {
    logger.error('Error sending transaction:', error);
    throw error;
  }
}

// Endpoint to send a test USDT transaction
app.post('/sendTestTransaction', async (req, res) => {
  const { senderAddress, senderPrivateKey, recipientAddress, amount } = req.body;

  if (!senderAddress || !senderPrivateKey || !recipientAddress || !amount) {
    logger.warn('Sender address, private key, recipient address, and amount are required');
    return res.status(400).json({ success: false, message: 'Sender address, private key, recipient address, and amount are required' });
  }

  try {
    const receipt = await sendTestTransaction(senderAddress, senderPrivateKey, recipientAddress, amount);
    res.json({ success: true, message: 'Test transaction sent successfully', transactionHash: receipt.transactionHash });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Endpoint to get transaction by block hash and index
app.post('/getTransactionByBlockHashAndIndex', async (req, res) => {
  const { blockHash, transactionIndex } = req.body;

  if (!blockHash || transactionIndex === undefined) {
    logger.warn('Block hash and transaction index are required');
    return res.status(400).json({ success: false, message: 'Block hash and transaction index are required' });
  }

  try {
    const transaction = await web3.eth.getTransactionFromBlock(blockHash, transactionIndex);
    res.json({ success: true, transaction });
  } catch (error) {
    logger.error(`Error fetching transaction by block hash and index: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch transaction. Please check the inputs and try again.' });
  }
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
logger.info("RECEIVER_ADDRESS:", RECEIVER_ADDRESS);
