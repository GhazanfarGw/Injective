// ImHTTP_PORT necessary modules
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { createAlchemyWeb3 } = require('@alch/alchemy-web3');
const mongoose = require('mongoose');
// const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs').promises; // Use fs.promises for async file operations
const path = require('path');

// Load environment variables from .env file
dotenv.config();

// // Rate limiter middleware
// const limiter = rateLimit({
//     windowMs: 15 * 60 * 1000, // 15 minutes
//     max: 100, // Limit each IP to 100 requests per windowMs
//     message: 'Too many requests, please try again later.',
// });
// app.use(limiter);

const app = express();
const port = process.env.PORT || 3000;


// Alchemy API setup
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_API_URL = `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`;
const web3 = createAlchemyWeb3(ALCHEMY_API_URL);

// Binance API setup
const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_SECRET_KEY = process.env.BINANCE_SECRET_KEY;
const BINANCE_CONVERT_URL = 'https://api.binance.com/v3/convert';

// MongoDB setup
const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
    throw new Error('MongoDB URI is not defined in the environment variables');
}
mongoose.connect(MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Define a message schema and model
const messageSchema = new mongoose.Schema({
  text: String,
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// Wallet setup
const SENDER_WALLET = process.env.SENDER_WALLET; // The wallet from which funds are sent
const SENDER_PRIVATE_KEY = process.env.SENDER_PRIVATE_KEY; // Private key for signing transactions
const recipientWALLET = process.env.RECEIVER_WALLET; // The wallet to which funds are sent

// USDT contract setup
const USDT_CONTRACT_WALLET = process.env.USDT_CONTRACT_WALLET;
const USDT_CONTRACT_ABI = [
  {
    "constant": true,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "balance", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [{"name": "_to", "type": "address"}, {"name": "_value", "type": "uint256"}],
    "name": "transfer",
    "outputs": [{"name": "success", "type": "bool"}],
    "type": "function"
  }
];

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Function to convert fiat to ETH using Binance Convert API
async function convertFiatToETH(amount, currency) {
    try {
        console.log('Converting fiat to ETH:', { amount, currency });

        if (!['USD', 'EUR', 'GBP'].includes(currency.toUpperCase())) {
            throw new Error('UnsupHTTP_PORTed fiat currency for conversion');
        }

        const timestamp = Date.now();
        const queryString = `fromAsset=${currency.toUpperCase()}&toAsset=ETH&amount=${amount}&recvWindow=5000&timestamp=${timestamp}`;
        const signature = crypto.createHmac('sha256', BINANCE_SECRET_KEY).update(queryString).digest('hex');

        const response = await axios.post(BINANCE_CONVERT_URL, new URLSearchParams({
            fromAsset: currency.toUpperCase(),
            toAsset: 'ETH',
            amount: amount,
            recvWindow: 5000,
            timestamp: timestamp,
            signature: signature
        }), {
            headers: {
                'X-MBX-APIKEY': BINANCE_API_KEY,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('Binance Convert API Response:', response.data);
        return response.data.amount;
    } catch (error) {
        console.error('Error converting fiat to ETH:', error.message);
        throw new Error('Error converting fiat to ETH');
    }
}

// Function to convert ETH to USDT using Binance Convert API
async function convertETHToUSDT(ethAmount) {
    try {
        console.log('Converting ETH to USDT:', ethAmount);

        const timestamp = Date.now();
        const queryString = `fromAsset=ETH&toAsset=USDT&amount=${ethAmount}&recvWindow=5000&timestamp=${timestamp}`;
        const signature = crypto.createHmac('sha256', BINANCE_SECRET_KEY).update(queryString).digest('hex');

        const response = await axios.post(BINANCE_CONVERT_URL, new URLSearchParams({
            fromAsset: 'ETH',
            toAsset: 'USDT',
            amount: ethAmount,
            recvWindow: 5000,
            timestamp: timestamp,
            signature: signature
        }), {
            headers: {
                'X-MBX-APIKEY': BINANCE_API_KEY,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('Binance Convert API Response:', response.data);
        return parseFloat(response.data.amount);
    } catch (error) {
        console.error('ETH to USDT conversion failed:', error.message);
        throw new Error('ETH to USDT conversion failed');
    }
}

// Function to transfer USDT to the recipient's wallet WALLET
async function transferUSDT(recipientWALLET, usdtAmount) {
    try {
        console.log('Transferring USDT:', {recipientWALLET, usdtAmount});

        const usdtContract = new web3.eth.Contract(USDT_CONTRACT_ABI, USDT_CONTRACT_WALLET);
        const gasLimit = await usdtContract.methods.transfer(recipientWALLET, usdtAmount).estimateGas({ from: SENDER_WALLET })
        
        const nonce = await web3.eth.getTransactionCount(SENDER_WALLET, 'latest');
        const gasPrice = await web3.eth.getGasPrice();

        const signedTx = await web3.eth.accounts.signTransaction({
            to: USDT_CONTRACT_WALLET,
            data: usdtContract.methods.transfer(recipientWALLET, usdtAmount).encodeABI(),
            gas: gasLimit,
            gasPrice: gasPrice,
            nonce: nonce,
        }, SENDER_PRIVATE_KEY);

        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log('Transaction receipt:', receipt);
        return { status: 'success', transactionHash: receipt.transactionHash };
    } catch (error) {
        console.error('USDT transfer failed:', error.message);
        return { status: 'error', error: error.message };
    }
}

// Function to send transaction details to the global server
async function sendTransactionToGlobalServer(transaction) {
    const { amount, currency, reference, accessCode, globalServerIp } = transaction;
    const url = `http://${globalServerIp}/verify-transaction`;

    console.log('Connecting to global server at:', globalServerIp);

    const retries = 3;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await axios.post(url, {
                amount,
                currency,
                reference,
                accessCode,
                // Add any additional fields here
            }, {
                timeout: 20000 // Set timeout to 20 seconds
            });

            console.log('Global server verification response:', response.data);
            return response.data.verified;

        } catch (error) {
            if (error.response) {
                console.error('Error response from server:', error.response.data);
            } else if (error.request) {
                console.error('No response received:', error.request);
            } else {
                console.error('Error in setup:', error.message);
            }

            if (attempt === retries - 1) {
                console.error('Error sending transaction to global server after retries:', error.message);
                return false;
            }
        }
    }
}

// API endpoint to receive and process transaction details
app.post('/transaction', async (req, res) => {
    try {
        const { transaction, sender,  receiver } = req.body;
        const { amount, currency, reference, accessCode } = transaction;
        const globalServerIp = receiver.globalServerIp || sender.serverIp// Ensure it's accessed correctly
        
        console.log('Received transaction:', { amount, currency, globalServerIp, reference, accessCode });

        if (!amount || !currency || !globalServerIp || !reference || !accessCode) {
            return res.status(400).json({ error: 'Missing required transaction fields' });
        }

        const cleanedAmount = parseFloat(amount);
        if (isNaN(cleanedAmount) || cleanedAmount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }
        
        // Send transaction details to the global server for verification
        const isVerified = await sendTransactionToGlobalServer({ 
            amount, 
                currency, 
                globalServerIp, 
                reference, 
                accessCode 
        });

        if (isVerified) {
            const ethAmount = await convertFiatToETH(cleanedAmount, currency);
            const usdtAmount = await convertETHToUSDT(ethAmount);
            const transferResult = await transferUSDT(recipientWALLET, usdtAmount);

            res.json({
                status: 'success',
                usdtAmount: usdtAmount,
                transferResult: transferResult
            });
        } else {
            res.json({ status: 'failure', message: 'Transaction verification failed' });
        }
    } catch (error) {
        console.error('Error processing transaction:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Multer setup for handling file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadPath = path.join(__dirname, 'uploads');
        try {
            await fs.mkdir(uploadPath, { recursive: true }); // Ensure uploads directory exists
        } catch (err) {
            return cb(err);
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage });

// Endpoint to handle file uploads
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = path.join(__dirname, 'uploads', req.file.filename);
    processFile(filePath)
        .then(() => res.json({ message: 'File processed successfully' }))
        .catch(err => {
            console.error('Error processing file:', err.message);
            res.status(500).json({ error: 'Error processing file' });
        });
});

// Updated function to process the uploaded file
async function processFile(filePath) {
    console.log('Processing file:', filePath);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        let transactions = JSON.parse(data);

        if (!Array.isArray(transactions)) {
            transactions = [transactions];
        }

        for (const transactionData of transactions) {
            try {
                const transaction = transactionData.transaction;
                const sender = transactionData.sender;
                const receiver = transactionData.receiver;

                const { amount, currency, reference, accessCode } = transaction;
                // const globalServerIp = sender.globalServerIp;
                const globalServerIp = receiver.globalServerIp || sender.serverIp; // Get the global server IP

                if (!transaction || !sender || !receiver) {
                    throw new Error('Missing required transaction data');
                }

                console.log(`Processing transaction: ${reference}`);

                const cleanedAmount = parseFloat(amount);
                    if (isNaN(cleanedAmount) || cleanedAmount <= 0) {
                    return res.status(400).json({ error: 'Invalid amount' });
                }
                // Send transaction details to the global server for verification
                const isVerified = await sendTransactionToGlobalServer({ 
                    amount, 
                    currency, 
                    globalServerIp, 
                    reference, 
                    accessCode 
                });

                if (isVerified) {
                    // Convert fiat to ETH
                    const ethAmount = await convertFiatToETH(amount, currency);
                    // Convert ETH to USDT
                    const usdtAmount = await convertETHToUSDT(ethAmount);
                    // Transfer USDT to the recipient's wallet
                    const transferResult = await transferUSDT(recipientWALLET, usdtAmount);

                    // Log the successful transaction
                    await Message.create({
                        transactionReference: reference,
                        amount: usdtAmount,
                        currency: currency,
                        globalServerIp: globalServerIp,
                        accessCode: accessCode,
                        verified: true,
                        transferResult: transferResult
                    });
                } else {
                    throw new Error('Verification failed');
                }
            } catch (error) {
                console.error('Error processing transaction:', error);
                await Message.create({
                    transactionReference: transaction?.reference,
                    amount: transaction?.amount,
                    currency: transaction?.currency,
                    globalServerIp: receiver?.globalServerIp,
                    accessCode: transaction?.accessCode,
                    verified: false,
                    error: error.message
                });
            }
        }
    } catch (err) {
        console.error('Error reading file:', err.message);
    }
}

// Ping endpoint
app.get('/ping', (req, res) => {
    res.json({
        status: 'success',
        message: 'Server is up and running',
        environmentVariables: {
            port,
            ALCHEMY_API_KEY,
            ALCHEMY_API_URL,
            SENDER_WALLET,
            SENDER_PRIVATE_KEY,
            recipientWALLET,
            USDT_CONTRACT_WALLET,
        }
    });
});

// Root route to return server status
app.get('/', (req, res) => {
    res.json({
      success: true,
      message: 'Server is running and connected'
    });
  });

// Endpoint to receive and save messages
app.post('/sendData', async (req, res) => {
    try {
        const { text } = req.body;
        const message = new Message({ text });
        await message.save();
        res.status(201).json({ status: 'success', message: 'Message saved successfully' });
    } catch (error) {
        console.error('Error saving message:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Retrieve messages
app.get('/data', async (req, res) => {
    try {
        const messages = await Message.find();
        res.json({ status: 'success', messages });
    } catch (error) {
        console.error('Error retrieving messages:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
// // ImHTTP_PORT necessary modules
// const express = require('express');
// const bodyParser = require('body-parser');
// const axios = require('axios');
// const crypto = require('crypto');
// const dotenv = require('dotenv');
// const { createAlchemyWeb3 } = require('@alch/alchemy-web3');
// const mongoose = require('mongoose');
// // const rateLimit = require('express-rate-limit');
// const multer = require('multer');
// const fs = require('fs').promises; // Use fs.promises for async file operations
// const path = require('path');

// // Load environment variables from .env file
// dotenv.config();

// // // Rate limiter middleware
// // const limiter = rateLimit({
// //     windowMs: 15 * 60 * 1000, // 15 minutes
// //     max: 100, // Limit each IP to 100 requests per windowMs
// //     message: 'Too many requests, please try again later.',
// // });
// // app.use(limiter);

// const app = express();
// const port = process.env.PORT || 3000;


// // Alchemy API setup
// const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
// const ALCHEMY_API_URL = `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`;
// const web3 = createAlchemyWeb3(ALCHEMY_API_URL);

// // Binance API setup
// const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
// const BINANCE_SECRET_KEY = process.env.BINANCE_SECRET_KEY;
// const BINANCE_CONVERT_URL = 'https://api.binance.com/v3/convert';

// // MongoDB setup
// const MONGODB_URL = process.env.MONGODB_URL;

// if (!MONGODB_URL) {
//     throw new Error('MongoDB URI is not defined in the environment variables');
// }
// mongoose.connect(MONGODB_URL, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true
// })
// .then(() => console.log('MongoDB connected'))
// .catch(err => console.error('MongoDB connection error:', err));

// // Define a message schema and model
// const messageSchema = new mongoose.Schema({
//   text: String,
//   timestamp: { type: Date, default: Date.now }
// });

// const Message = mongoose.model('Message', messageSchema);

// // Wallet setup
// const SENDER_ADDRESS = process.env.SENDER_ADDRESS; // The address from which funds are sent
// const SENDER_PRIVATE_KEY = process.env.SENDER_PRIVATE_KEY; // Private key for signing transactions
// const recipientAddress = process.env.RECEIVER_ADDRESS; // The address to which funds are sent

// // USDT contract setup
// const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS;
// const USDT_CONTRACT_ABI = [
//   {
//     "constant": true,
//     "inputs": [{"name": "_owner", "type": "address"}],
//     "name": "balanceOf",
//     "outputs": [{"name": "balance", "type": "uint256"}],
//     "type": "function"
//   },
//   {
//     "constant": false,
//     "inputs": [{"name": "_to", "type": "address"}, {"name": "_value", "type": "uint256"}],
//     "name": "transfer",
//     "outputs": [{"name": "success", "type": "bool"}],
//     "type": "function"
//   }
// ];

// // Middleware to parse JSON bodies
// app.use(bodyParser.json());

// // Function to convert fiat to ETH using Binance Convert API
// async function convertFiatToETH(amount, currency) {
//     try {
//         console.log('Converting fiat to ETH:', { amount, currency });

//         if (!['USD', 'EUR', 'GBP'].includes(currency.toUpperCase())) {
//             throw new Error('UnsupHTTP_PORTed fiat currency for conversion');
//         }

//         const timestamp = Date.now();
//         const queryString = `fromAsset=${currency.toUpperCase()}&toAsset=ETH&amount=${amount}&recvWindow=5000&timestamp=${timestamp}`;
//         const signature = crypto.createHmac('sha256', BINANCE_SECRET_KEY).update(queryString).digest('hex');

//         const response = await axios.post(BINANCE_CONVERT_URL, new URLSearchParams({
//             fromAsset: currency.toUpperCase(),
//             toAsset: 'ETH',
//             amount: amount,
//             recvWindow: 5000,
//             timestamp: timestamp,
//             signature: signature
//         }), {
//             headers: {
//                 'X-MBX-APIKEY': BINANCE_API_KEY,
//                 'Content-Type': 'application/x-www-form-urlencoded'
//             }
//         });

//         console.log('Binance Convert API Response:', response.data);
//         return response.data.amount;
//     } catch (error) {
//         console.error('Error converting fiat to ETH:', error.message);
//         throw new Error('Error converting fiat to ETH');
//     }
// }

// // Function to convert ETH to USDT using Binance Convert API
// async function convertETHToUSDT(ethAmount) {
//     try {
//         console.log('Converting ETH to USDT:', ethAmount);

//         const timestamp = Date.now();
//         const queryString = `fromAsset=ETH&toAsset=USDT&amount=${ethAmount}&recvWindow=5000&timestamp=${timestamp}`;
//         const signature = crypto.createHmac('sha256', BINANCE_SECRET_KEY).update(queryString).digest('hex');

//         const response = await axios.post(BINANCE_CONVERT_URL, new URLSearchParams({
//             fromAsset: 'ETH',
//             toAsset: 'USDT',
//             amount: ethAmount,
//             recvWindow: 5000,
//             timestamp: timestamp,
//             signature: signature
//         }), {
//             headers: {
//                 'X-MBX-APIKEY': BINANCE_API_KEY,
//                 'Content-Type': 'application/x-www-form-urlencoded'
//             }
//         });

//         console.log('Binance Convert API Response:', response.data);
//         return parseFloat(response.data.amount);
//     } catch (error) {
//         console.error('ETH to USDT conversion failed:', error.message);
//         throw new Error('ETH to USDT conversion failed');
//     }
// }

// // Function to transfer USDT to the recipient's wallet address
// async function transferUSDT(recipientAddress, usdtAmount) {
//     try {
//         console.log('Transferring USDT:', {recipientAddress, usdtAmount});

//         const usdtContract = new web3.eth.Contract(USDT_CONTRACT_ABI, USDT_CONTRACT_ADDRESS);
//         const gasLimit = await usdtContract.methods.transfer(recipientAddress, usdtAmount).estimateGas({ from: SENDER_ADDRESS })
        
//         const nonce = await web3.eth.getTransactionCount(SENDER_ADDRESS, 'latest');
//         const gasPrice = await web3.eth.getGasPrice();

//         const signedTx = await web3.eth.accounts.signTransaction({
//             to: USDT_CONTRACT_ADDRESS,
//             data: usdtContract.methods.transfer(recipientAddress, usdtAmount).encodeABI(),
//             gas: gasLimit,
//             gasPrice: gasPrice,
//             nonce: nonce,
//         }, SENDER_PRIVATE_KEY);

//         const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

//         console.log('Transaction receipt:', receipt);
//         return { status: 'success', transactionHash: receipt.transactionHash };
//     } catch (error) {
//         console.error('USDT transfer failed:', error.message);
//         return { status: 'error', error: error.message };
//     }
// }

// // Function to send transaction details to the global server
// async function sendTransactionToGlobalServer(transaction) {
//     const { amount, currency, reference, accessCode, globalServerIp } = transaction;
//     const url = `http://${globalServerIp}/verify-transaction`;

//     console.log('Connecting to global server at:', globalServerIp);

//     const retries = 3;
//     for (let attempt = 0; attempt < retries; attempt++) {
//         try {
//             const response = await axios.post(url, {
//                 amount,
//                 currency,
//                 reference,
//                 accessCode,
//                 // Add any additional fields here
//             }, {
//                 timeout: 20000 // Set timeout to 20 seconds
//             });

//             console.log('Global server verification response:', response.data);
//             return response.data.verified;

//         } catch (error) {
//             if (error.response) {
//                 console.error('Error response from server:', error.response.data);
//             } else if (error.request) {
//                 console.error('No response received:', error.request);
//             } else {
//                 console.error('Error in setup:', error.message);
//             }

//             if (attempt === retries - 1) {
//                 console.error('Error sending transaction to global server after retries:', error.message);
//                 return false;
//             }
//         }
//     }
// }

// // API endpoint to receive and process transaction details
// app.post('/transaction', async (req, res) => {
//     try {
//         const { transaction, sender,  receiver } = req.body;
//         const { amount, currency, reference, accessCode } = transaction;
//         const globalServerIp = receiver.globalServerIp || sender.serverIp// Ensure it's accessed correctly
        
//         console.log('Received transaction:', { amount, currency, globalServerIp, reference, accessCode });

//         if (!amount || !currency || !globalServerIp || !reference || !accessCode) {
//             return res.status(400).json({ error: 'Missing required transaction fields' });
//         }

//         const cleanedAmount = parseFloat(amount);
//         if (isNaN(cleanedAmount) || cleanedAmount <= 0) {
//             return res.status(400).json({ error: 'Invalid amount' });
//         }
        
//         // Send transaction details to the global server for verification
//         const isVerified = await sendTransactionToGlobalServer({ 
//             amount, 
//                 currency, 
//                 globalServerIp, 
//                 reference, 
//                 accessCode 
//         });

//         if (isVerified) {
//             const ethAmount = await convertFiatToETH(cleanedAmount, currency);
//             const usdtAmount = await convertETHToUSDT(ethAmount);
//             const transferResult = await transferUSDT(recipientAddress, usdtAmount);

//             res.json({
//                 status: 'success',
//                 usdtAmount: usdtAmount,
//                 transferResult: transferResult
//             });
//         } else {
//             res.json({ status: 'failure', message: 'Transaction verification failed' });
//         }
//     } catch (error) {
//         console.error('Error processing transaction:', error.message);
//         res.status(500).json({ error: 'Internal Server Error' });
//     }
// });

// // Multer setup for handling file uploads
// const storage = multer.diskStorage({
//     destination: async (req, file, cb) => {
//         const uploadPath = path.join(__dirname, 'uploads');
//         try {
//             await fs.mkdir(uploadPath, { recursive: true }); // Ensure uploads directory exists
//         } catch (err) {
//             return cb(err);
//         }
//         cb(null, uploadPath);
//     },
//     filename: (req, file, cb) => {
//         cb(null, `${Date.now()}-${file.originalname}`);
//     }
// });
// const upload = multer({ storage });

// // Endpoint to handle file uploads
// app.post('/upload', upload.single('file'), (req, res) => {
//     if (!req.file) {
//         return res.status(400).json({ error: 'No file uploaded' });
//     }

//     const filePath = path.join(__dirname, 'uploads', req.file.filename);
//     processFile(filePath)
//         .then(() => res.json({ message: 'File processed successfully' }))
//         .catch(err => {
//             console.error('Error processing file:', err.message);
//             res.status(500).json({ error: 'Error processing file' });
//         });
// });

// // Updated function to process the uploaded file
// async function processFile(filePath) {
//     console.log('Processing file:', filePath);
//     try {
//         const data = await fs.readFile(filePath, 'utf8');
//         let transactions = JSON.parse(data);

//         if (!Array.isArray(transactions)) {
//             transactions = [transactions];
//         }

//         for (const transactionData of transactions) {
//             try {
//                 const transaction = transactionData.transaction;
//                 const sender = transactionData.sender;
//                 const receiver = transactionData.receiver;

//                 const { amount, currency, reference, accessCode } = transaction;
//                 // const globalServerIp = sender.globalServerIp;
//                 const globalServerIp = receiver.globalServerIp || sender.serverIp; // Get the global server IP

//                 if (!transaction || !sender || !receiver) {
//                     throw new Error('Missing required transaction data');
//                 }

//                 console.log(`Processing transaction: ${reference}`);

//                 const cleanedAmount = parseFloat(amount);
//                     if (isNaN(cleanedAmount) || cleanedAmount <= 0) {
//                     return res.status(400).json({ error: 'Invalid amount' });
//                 }
//                 // Send transaction details to the global server for verification
//                 const isVerified = await sendTransactionToGlobalServer({ 
//                     amount, 
//                     currency, 
//                     globalServerIp, 
//                     reference, 
//                     accessCode 
//                 });

//                 if (isVerified) {
//                     // Convert fiat to ETH
//                     const ethAmount = await convertFiatToETH(amount, currency);
//                     // Convert ETH to USDT
//                     const usdtAmount = await convertETHToUSDT(ethAmount);
//                     // Transfer USDT to the recipient's wallet
//                     const transferResult = await transferUSDT(recipientAddress, usdtAmount);

//                     // Log the successful transaction
//                     await Message.create({
//                         transactionReference: reference,
//                         amount: usdtAmount,
//                         currency: currency,
//                         globalServerIp: globalServerIp,
//                         accessCode: accessCode,
//                         verified: true,
//                         transferResult: transferResult
//                     });
//                 } else {
//                     throw new Error('Verification failed');
//                 }
//             } catch (error) {
//                 console.error('Error processing transaction:', error);
//                 await Message.create({
//                     transactionReference: transaction?.reference,
//                     amount: transaction?.amount,
//                     currency: transaction?.currency,
//                     globalServerIp: receiver?.globalServerIp,
//                     accessCode: transaction?.accessCode,
//                     verified: false,
//                     error: error.message
//                 });
//             }
//         }
//     } catch (err) {
//         console.error('Error reading file:', err.message);
//     }
// }

// // Ping endpoint
// app.get('/ping', (req, res) => {
//     res.json({
//         status: 'success',
//         message: 'Server is up and running',
//         environmentVariables: {
//             port,
//             ALCHEMY_API_KEY,
//             ALCHEMY_API_URL,
//             SENDER_ADDRESS,
//             SENDER_PRIVATE_KEY,
//             recipientAddress,
//             USDT_CONTRACT_ADDRESS,
//         }
//     });
// });

// // Root route to return server status
// app.get('/', (req, res) => {
//     res.json({
//       success: true,
//       message: 'Server is running and connected'
//     });
//   });

// // Endpoint to receive and save messages
// app.post('/sendData', async (req, res) => {
//     try {
//         const { text } = req.body;
//         const message = new Message({ text });
//         await message.save();
//         res.status(201).json({ status: 'success', message: 'Message saved successfully' });
//     } catch (error) {
//         console.error('Error saving message:', error.message);
//         res.status(500).json({ error: 'Internal Server Error' });
//     }
// });

// // Retrieve messages
// app.get('/data', async (req, res) => {
//     try {
//         const messages = await Message.find();
//         res.json({ status: 'success', messages });
//     } catch (error) {
//         console.error('Error retrieving messages:', error.message);
//         res.status(500).json({ error: 'Internal Server Error' });
//     }
// });

// // Start the server
// app.listen(port, () => {
//     console.log(`Server running on port ${port}`);
// });

// const express = require('express');
// const bodyParser = require('body-parser');
// const winston = require('winston');
// const mongoose = require('mongoose');
// const moment = require('moment');
// require('dotenv').config();
// const { createAlchemyWeb3 } = require('@alch/alchemy-web3');
// const path = require('path');
// const fs = require('fs');

// const app = express();
// const PORT = process.env.PORT;
// const ALCHEMY_API_URL = process.env.ALCHEMY_API_URL;
// const API_KEY = process.env.API_KEY;
// const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS;
// const USDT_DEPOSIT_ADDRESS = process.env.USDT_DEPOSIT_ADDRESS;
// const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS;
// const SECRET_KEY = process.env.SECRET_KEY;
// const MONGO_URI = process.env.MONGO_URI;

// const web3 = createAlchemyWeb3(ALCHEMY_API_URL);

// // MongoDB connection
// mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
//   .then(() => console.log('MongoDB connected'))
//   .catch(err => console.log('MongoDB connection error:', err));

// // Define a message schema and model
// const messageSchema = new mongoose.Schema({
//   text: String,
//   timestamp: { type: Date, default: Date.now }
// });

// const Message = mongoose.model('Message', messageSchema);

// // Setup logger
// const logger = winston.createLogger({
//   level: 'info',
//   format: winston.format.json(),
//   transports: [
//     new winston.transports.Console(),
//     new winston.transports.File({ filename: 'server.log' })
//   ]
// });

// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: true }));

// // Root route to return server status
// app.get('/', (req, res) => {
//   res.json({
//     success: true,
//     message: 'Server is running and connected'
//   });
// });

// // Endpoint to check server connectivity and provide server log data, time, and environment variables
// app.post('/ping', (req, res) => {
//   const serverTime = moment().format('YYYY-MM-DD HH:mm:ss');
  
//   // Retrieve server log data (last 100 lines for example)
//   const logFilePath = path.join(__dirname, 'server.log');
//   const logData = fs.readFileSync(logFilePath, 'utf8').split('\n').slice(-100).join('\n');
  
//   // Get environment variables
//   const envVariables = {
//     ALCHEMY_API_URL: process.env.ALCHEMY_API_URL,
//     API_KEY: process.env.API_KEY,
//     USDT_CONTRACT_ADDRESS: process.env.USDT_CONTRACT_ADDRESS,
//     USDT_DEPOSIT_ADDRESS: process.env.USDT_DEPOSIT_ADDRESS,
//     RECEIVER_ADDRESS: process.env.RECEIVER_ADDRESS,
//     SECRET_KEY: process.env.SECRET_KEY,
//     MONGO_URI: process.env.MONGO_URI
//   };
  
//   res.json({ 
//     success: true, 
//     message: 'Server is running and connected',
//     serverTime,
//     logData,
//     envVariables,
//     identifier: 'arashgary-110'
//   });
// });

// // Endpoint to receive and save messages
// app.post('/sendData', async (req, res) => {
//   const { message } = req.body;

//   if (!message) {
//     logger.warn('No message provided');
//     return res.status(400).json({ success: false, message: 'Message is required' });
//   }

//   try {
//     const newMessage = new Message({ text: message });
//     await newMessage.save();
//     logger.info('Message saved successfully');
//     res.json({ success: true, message: 'Message saved successfully' });
//   } catch (err) {
//     logger.error('Error saving message:', err.message);
//     res.status(500).json({ success: false, message: 'Failed to save message' });
//   }
// });

// // Endpoint to retrieve messages
// app.get('/data', async (req, res) => {
//   try {
//     const messages = await Message.find();
//     res.json({ success: true, messages });
//   } catch (err) {
//     logger.error('Error retrieving messages:', err.message);
//     res.status(500).json({ success: false, message: 'Failed to retrieve messages' });
//   }
// });

// // New Endpoint to receive text messages
// app.post('/receiveText', (req, res) => {
//   const { text } = req.body;

//   if (!text) {
//     logger.warn('No text provided');
//     return res.status(400).json({ success: false, message: 'Text is required' });
//   }

//   const logEntry = `Received text at ${moment().format('YYYY-MM-DD HH:mm:ss')}: ${text}\n`;

//   const newMessage = new Message({ text: text });

//   newMessage.save((err) => {
//     if (err) {
//       logger.error('Error saving text message:', err.message);
//       return res.status(500).json({ success: false, message: 'Failed to save text message' });
//     }

//     logger.info('Text message saved successfully');
//     res.json({ success: true, message: 'Text message saved successfully' });
//   });
// });

// // Function to handle new transactions
// async function handleNewTransaction(transaction) {
//   try {
//     if (transaction.to && transaction.to.toLowerCase() === USDT_DEPOSIT_ADDRESS.toLowerCase()) {
//       logger.info(`Detected transaction to USDT_DEPOSIT_ADDRESS: ${transaction.hash}`);

//       const receipt = await web3.eth.getTransactionReceipt(transaction.hash);
//       logger.info(`Transaction receipt: ${JSON.stringify(receipt)}`);

//       const logEntry = `
//         Transaction Hash: ${transaction.hash}
//         From: ${transaction.from}
//         To: ${transaction.to}
//         Value: ${web3.utils.fromWei(transaction.value, 'ether')} ETH
//         Block Number: ${transaction.blockNumber}
//         Timestamp: ${new Date().toISOString()}
//       `;

//       console.log(logEntry);
//       // Further processing can be done here
//     }
//   } catch (error) {
//     logger.error(`Error handling transaction: ${error.message}`);
//   }
// }

// // Listen for new pending transactions
// web3.eth.subscribe('pendingTransactions', async (error, transactionHash) => {
//   if (error) {
//     logger.error(`Error subscribing to pending transactions: ${error.message}`);
//     return;
//   }

//   try {
//     const transaction = await web3.eth.getTransaction(transactionHash);
//     if (transaction) {
//       await handleNewTransaction(transaction);
//     }
//   } catch (error) {
//     logger.error(`Error fetching transaction: ${error.message}`);
//   }
// });

// // Function to send a test USDT transaction with amount to a specific address
// async function sendTestTransaction(senderAddress, senderPrivateKey, recipientAddress, amount) {
//   try {
//     const nonce = await web3.eth.getTransactionCount(senderAddress, 'latest');
//     logger.info(`Nonce for address ${senderAddress}: ${nonce}`);

//     // USDT typically has 6 decimal places
//     const tokenAmount = web3.utils.toHex(amount * (10 ** 6));

//     const transaction = {
//       'to': USDT_CONTRACT_ADDRESS, // The USDT contract address
//       'value': '0', // Value should be 0 for ERC-20 token transfer
//       'gas': 2000000,
//       'nonce': nonce,
//       'data': web3.eth.abi.encodeFunctionCall({
//         name: 'transfer',
//         type: 'function',
//         inputs: [{
//           type: 'address',
//           name: '_to'
//         }, {
//           type: 'uint256',
//           name: '_value'
//         }]
//       }, [recipientAddress, tokenAmount]),
//       'maxFeePerGas': web3.utils.toWei('2', 'gwei'), // Adjust gas fees if needed
//       'maxPriorityFeePerGas': web3.utils.toWei('1', 'gwei'),
//       'chainId': 1 // Mainnet chain ID
//     };

//     const signedTx = await web3.eth.accounts.signTransaction(transaction, senderPrivateKey);
//     logger.info('Signed transaction:', signedTx);

//     const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
//     logger.info('Transaction receipt:', receipt);
//     return receipt;
//   } catch (error) {
//     logger.error('Error sending transaction:', error);
//     throw error;
//   }
// }

// // Endpoint to send a test USDT transaction
// app.post('/sendTestTransaction', async (req, res) => {
//   const { senderAddress, senderPrivateKey, recipientAddress, amount } = req.body;

//   if (!senderAddress || !senderPrivateKey || !recipientAddress || !amount) {
//     logger.warn('Sender address, private key, recipient address, and amount are required');
//     return res.status(400).json({ success: false, message: 'Sender address, private key, recipient address, and amount are required' });
//   }

//   try {
//     const receipt = await sendTestTransaction(senderAddress, senderPrivateKey, recipientAddress, amount);
//     res.json({ success: true, message: 'Test transaction sent successfully', transactionHash: receipt.transactionHash });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// });

// // Endpoint to fetch server environment variables detail via Alchemy
// app.get('/envDetails', (req, res) => {
//   const envVariables = {
//     ALCHEMY_API_URL: process.env.ALCHEMY_API_URL,
//     API_KEY: process.env.API_KEY,
//     USDT_CONTRACT_ADDRESS: process.env.USDT_CONTRACT_ADDRESS,
//     USDT_DEPOSIT_ADDRESS: process.env.USDT_DEPOSIT_ADDRESS,
//     RECEIVER_ADDRESS: process.env.RECEIVER_ADDRESS,
//     SECRET_KEY: process.env.SECRET_KEY,
//   };
  
//   res.json({ 
//     success: true, 
//     envVariables,
//     identifier: 'arashgary-110'
//   });
// });

// app.listen(PORT, () => {
//   logger.info(`Server is running on port ${PORT}`);
// });

// // ERC-20 USDT Transaction Mainnet
// const express = require('express');
// const bodyParser = require('body-parser');
// const winston = require('winston');
// const mongoose = require('mongoose');
// const moment = require('moment');
// require('dotenv').config();
// const { createAlchemyWeb3 } = require('@alch/alchemy-web3');

// const app = express();
// const PORT = process.env.PORT;
// const ALCHEMY_API_URL = process.env.ALCHEMY_API_URL;
// const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS;
// const USDT_DEPOSIT_ADDRESS = process.env.USDT_DEPOSIT_ADDRESS;
// const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS;
// const MONGO_URI = process.env.MONGO_URI;

// const web3 = createAlchemyWeb3(ALCHEMY_API_URL);

// // MongoDB connection
// mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
//   .then(() => console.log('MongoDB connected'))
//   .catch(err => console.log('MongoDB connection error:', err));

// // Define a message schema and model
// const messageSchema = new mongoose.Schema({
//   text: String,
//   timestamp: { type: Date, default: Date.now }
// });

// const Message = mongoose.model('Message', messageSchema);

// // Setup logger
// const logger = winston.createLogger({
//   level: 'info',
//   format: winston.format.json(),
//   transports: [
//     new winston.transports.Console(),
//     new winston.transports.File({ filename: 'server.log' })
//   ]
// });

// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: true }));

// // Endpoint to check server connectivity
// app.post('/ping', (req, res) => {
//   res.json({ success: true, message: 'Server is running and connected' });
// });

// // Root route to return server status
// app.get('/', (req, res) => {
//   res.json({
//     success: true,
//     message: 'Server is running and connected'
//   });
// });

// // Endpoint to receive and save messages
// app.post('/sendData', async (req, res) => {
//   const { message } = req.body;

//   if (!message) {
//     logger.warn('No message provided');
//     return res.status(400).json({ success: false, message: 'Message is required' });
//   }

//   try {
//     const newMessage = new Message({ text: message });
//     await newMessage.save();
//     logger.info('Message saved successfully');
//     res.json({ success: true, message: 'Message saved successfully' });
//   } catch (err) {
//     logger.error('Error saving message:', err.message);
//     res.status(500).json({ success: false, message: 'Failed to save message' });
//   }
// });

// // Endpoint to retrieve messages
// app.get('/data', async (req, res) => {
//   try {
//     const messages = await Message.find();
//     res.json({ success: true, messages });
//   } catch (err) {
//     logger.error('Error retrieving messages:', err.message);
//     res.status(500).json({ success: false, message: 'Failed to retrieve messages' });
//   }
// });

// // New Endpoint to receive text messages
// app.post('/receiveText', (req, res) => {
//   const { text } = req.body;

//   if (!text) {
//     logger.warn('No text provided');
//     return res.status(400).json({ success: false, message: 'Text is required' });
//   }

//   const logEntry = `Received text at ${moment().format('YYYY-MM-DD HH:mm:ss')}: ${text}\n`;

//   const newMessage = new Message({ text: text });

//   newMessage.save((err) => {
//     if (err) {
//       logger.error('Error saving text message:', err.message);
//       return res.status(500).json({ success: false, message: 'Failed to save text message' });
//     }

//     logger.info('Text message saved successfully');
//     res.json({ success: true, message: 'Text message saved successfully' });
//   });
// });

// // Function to handle new transactions
// async function handleNewTransaction(transaction) {
//   try {
//     if (transaction.to && transaction.to.toLowerCase() === USDT_DEPOSIT_ADDRESS.toLowerCase()) {
//       logger.info(`Detected transaction to USDT_DEPOSIT_ADDRESS: ${transaction.hash}`);

//       const receipt = await web3.eth.getTransactionReceipt(transaction.hash);
//       logger.info(`Transaction receipt: ${JSON.stringify(receipt)}`);

//       const logEntry = `
//         Transaction Hash: ${transaction.hash}
//         From: ${transaction.from}
//         To: ${transaction.to}
//         Value: ${web3.utils.fromWei(transaction.value, 'ether')} ETH
//         Block Number: ${transaction.blockNumber}
//         Timestamp: ${new Date().toISOString()}
//       `;

//       console.log(logEntry);
//       // Further processing can be done here
//     }
//   } catch (error) {
//     logger.error(`Error handling transaction: ${error.message}`);
//   }
// }

// // Listen for new pending transactions
// web3.eth.subscribe('pendingTransactions', async (error, transactionHash) => {
//   if (error) {
//     logger.error(`Error subscribing to pending transactions: ${error.message}`);
//     return;
//   }

//   try {
//     const transaction = await web3.eth.getTransaction(transactionHash);
//     if (transaction) {
//       await handleNewTransaction(transaction);
//     }
//   } catch (error) {
//     logger.error(`Error fetching transaction: ${error.message}`);
//   }
// });

// // Function to send a test USDT transaction with amount to a specific address
// async function sendTestTransaction(senderAddress, senderPrivateKey, recipientAddress, amount) {
//   try {
//     const nonce = await web3.eth.getTransactionCount(senderAddress, 'latest');
//     logger.info(`Nonce for address ${senderAddress}: ${nonce}`);

//     // USDT typically has 6 decimal places
//     const tokenAmount = web3.utils.toHex(amount * (10 ** 6));

//     const transaction = {
//       'to': USDT_CONTRACT_ADDRESS, // The USDT contract address
//       'value': '0', // Value should be 0 for ERC-20 token transfer
//       'gas': 2000000,
//       'nonce': nonce,
//       'data': web3.eth.abi.encodeFunctionCall({
//         name: 'transfer',
//         type: 'function',
//         inputs: [{
//           type: 'address',
//           name: '_to'
//         }, {
//           type: 'uint256',
//           name: '_value'
//         }]
//       }, [recipientAddress, tokenAmount]),
//       'maxFeePerGas': web3.utils.toWei('2', 'gwei'), // Adjust gas fees if needed
//       'maxPriorityFeePerGas': web3.utils.toWei('1', 'gwei'),
//       'chainId': 1 // Mainnet chain ID
//     };

//     const signedTx = await web3.eth.accounts.signTransaction(transaction, senderPrivateKey);
//     logger.info('Signed transaction:', signedTx);

//     const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
//     logger.info('Transaction receipt:', receipt);
//     return receipt;
//   } catch (error) {
//     logger.error('Error sending transaction:', error);
//     throw error;
//   }
// }

// // Endpoint to send a test USDT transaction
// app.post('/sendTestTransaction', async (req, res) => {
//   const { senderAddress, senderPrivateKey, recipientAddress, amount } = req.body;

//   if (!senderAddress || !senderPrivateKey || !recipientAddress || !amount) {
//     logger.warn('Sender address, private key, recipient address, and amount are required');
//     return res.status(400).json({ success: false, message: 'Sender address, private key, recipient address, and amount are required' });
//   }

//   try {
//     const receipt = await sendTestTransaction(senderAddress, senderPrivateKey, recipientAddress, amount);
//     res.json({ success: true, message: 'Test transaction sent successfully', transactionHash: receipt.transactionHash });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// });

// // Endpoint to get transaction by block hash and index
// app.post('/getTransactionByBlockHashAndIndex', async (req, res) => {
//   const { blockHash, transactionIndex } = req.body;

//   if (!blockHash || transactionIndex === undefined) {
//     logger.warn('Block hash and transaction index are required');
//     return res.status(400).json({ success: false, message: 'Block hash and transaction index are required' });
//   }

//   try {
//     const transaction = await web3.eth.getTransactionFromBlock(blockHash, transactionIndex);
//     res.json({ success: true, transaction });
//   } catch (error) {
//     logger.error(`Error fetching transaction by block hash and index: ${error.message}`);
//     res.status(500).json({ success: false, message: 'Failed to fetch transaction. Please check the inputs and try again.' });
//   }
// });

// // Start server and log server start-up information
// app.listen(PORT, () => {
//   const startTime = moment().format('YYYY-MM-DD HH:mm:ss');
//   const address = `http://localhost:${PORT}`;
//   logger.info(`Server started at ${startTime}`);
//   logger.info(`Server running on address: ${address}`);
//   console.log(`Server running on port ${PORT}`);
// });

// // Logging environment variables for verification
// logger.info("ALCHEMY_API_URL:", ALCHEMY_API_URL);
// logger.info("USDT_CONTRACT_ADDRESS:", USDT_CONTRACT_ADDRESS);
// logger.info("USDT_DEPOSIT_ADDRESS:", USDT_DEPOSIT_ADDRESS);
// logger.info("RECEIVER_ADDRESS:", RECEIVER_ADDRESS);
