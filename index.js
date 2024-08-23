// Import necessary modules
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { createAlchemyWeb3 } = require('@alch/alchemy-web3');
const mongoose = require('mongoose');
const { ChainId, Fetcher, Route, Trade, TokenAmount, TradeType, Percent } = require('@uniswap/sdk');
const multer = require('multer');
const fs = require('fs').promises; // Use fs.promises for async file operations
const path = require('path');

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Alchemy API setup
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_API_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
const web3 = createAlchemyWeb3(ALCHEMY_API_URL);

// Binance API setup
const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_SECRET_KEY = process.env.BINANCE_SECRET_KEY;
const BINANCE_CONVERT_URL = 'https://api.binance.com/sapi/v1/convert/getQuote';

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

// Wallet setup
const SENDER_ADDRESS = process.env.SENDER_ADDRESS; // The address from which funds are sent
const SENDER_PRIVATE_KEY = process.env.SENDER_PRIVATE_KEY; // Private key for signing transactions
const recipientAddress = process.env.RECEIVER_ADDRESS; // The address to which funds are sent

// USDT contract setup
const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS;
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

// Function to fetch live ETH price in specified fiat currency
async function fetchETHPrice(currency) {
    try {
        const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price`, {
            params: {
                ids: 'ethereum',
                vs_currencies: currency.toLowerCase()
            }
        });

        const price = response.data.ethereum[currency.toLowerCase()];
        if (!price) {
            throw new Error(`Price for ${currency} not available.`);
        }
        console.log(`Current ETH price in ${currency.toUpperCase()}: $${price}`);
        return price;
    } catch (error) {
        console.error('Error fetching ETH price:', error.message);
        throw new Error('Error fetching ETH price.');
    }
}

// Helper function to check if USDT conversion already exists
async function checkUSDTConversion(transaction_reference, transaction_id, transactionCode, transferCode, accessCode, interbankBlockingCode, finalBlockCode, globalServerIp) {
    const url = `http://${globalServerIp}/check-usdt-conversion`;
    try {
        const response = await axios.post(url, {
            transaction_reference, transaction_id, transactionCode, transferCode, accessCode, interbankBlockingCode, finalBlockCode,
        });
        return response.data.usdtAmount;
    } catch (error) {
        console.error('Error checking USDT conversion:', error.message);
        return null;
    }
}

// Function to send transaction details to the global server
async function sendTransactionToGlobalServer(transaction) {
    const { amount, currency, transaction_reference, transaction_id, transactionCode, transferCode, accessCode, interbankBlockingCode, finalBlockCode, globalServerIp } = transaction;
    const url = `http://${globalServerIp}/verify-transaction`;

    console.log('Connecting to global server at:', globalServerIp);

    const retries = 3;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await axios.post(url, {
                amount,
                currency,
                transaction_reference,
                transaction_id,
                transactionCode,
                transferCode,
                accessCode,
                interbankBlockingCode,
                finalBlockCode,
            }, {
                timeout: 20000 // Set timeout to 20 seconds
            });

            console.log('Global server verification response:', response.data);
            return response.data;

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
                return null;
            }
        }
    }
}

// Function to convert fiat to ETH using Binance Convert API
async function convertFiatToETHViaBinance(amount, currency) {
    try {
        console.log('Converting fiat to ETH:', { amount, currency });

        if (!['USD', 'EUR', 'GBP'].includes(currency.toUpperCase())) {
            throw new Error('Unsupported fiat currency for conversion');
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

// Convert fiat to ETH using Uniswap
async function convertFiatToETHUniswap(amount, currency) {
    try {
        console.log('Attempting to convert fiat to ETH via Uniswap:', { amount, currency });

        const ethPrice = await fetchETHPrice(currency);
        const amountInETH = amount / ethPrice;

        // Return the ETH amount
        return amountInETH;
    } catch (error) {
        console.error('Error converting fiat to ETH via Uniswap:', error.message);
        throw new Error('Error converting fiat to ETH via Uniswap');
    }
}

// Function to convert ETH to USDT using Uniswap
async function convertETHToUSDTViaUniswap(ethAmountIn) {
    const WETH = await Fetcher.fetchTokenData(ChainId.MAINNET, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'); // WETH token address
    const USDT = await Fetcher.fetchTokenData(ChainId.MAINNET, '0xdAC17F958D2ee523a2206206994597C13D831ec7'); // USDT token address

    const pair = await Fetcher.fetchPairData(WETH, USDT);
    const route = new Route([pair], WETH);
    const trade = new Trade(route, new TokenAmount(WETH, web3.utils.toWei(ethAmountIn.toString(), 'ether')), TradeType.EXACT_INPUT);

    const slippageTolerance = new Percent('50', '10000'); // 0.5% slippage
    const amountOutMin = trade.minimumAmountOut(slippageTolerance).raw; // Min amount of USDT to receive
    const path = [WETH.address, USDT.address];
    const to = SENDER_ADDRESS; // Receiver address
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now
    const value = trade.inputAmount.raw;

    const uniswap = new web3.eth.Contract([
        {
            name: 'swapExactETHForTokens',
            type: 'function',
            inputs: [
                { type: 'uint256', name: 'amountOutMin' },
                { type: 'address[]', name: 'path' },
                { type: 'address', name: 'to' },
                { type: 'uint256', name: 'deadline' }
            ],
            outputs: [{ type: 'uint256[]', name: 'amounts' }]
        }
    ], process.env.UNISWAP_ROUTER_ADDRESS); // Uniswap router address

    const tx = await web3.eth.accounts.signTransaction({
        from: SENDER_ADDRESS,
        to: uniswap.options.address,
        data: uniswap.methods.swapExactETHForTokens(web3.utils.toHex(amountOutMin), path, to, deadline).encodeABI(),
        gas: '200000',
        value: value.toString()
    }, SENDER_PRIVATE_KEY);

    const receipt = await web3.eth.sendSignedTransaction(tx.rawTransaction);
    console.log('Uniswap conversion receipt:', receipt);

    const amountOut = web3.utils.fromWei(amountOutMin.toString(), 'ether');
    return parseFloat(amountOut);
}

// Function to transfer USDT to recipient
async function transferUSDT(recipientAddress, usdtAmount) {
    console.log('Initiating USDT transfer:', { recipientAddress, usdtAmount });

    const contract = new web3.eth.Contract(USDT_CONTRACT_ABI, USDT_CONTRACT_ADDRESS);

    const amount = web3.utils.toWei(usdtAmount.toString(), 'mwei'); // USDT has 6 decimals
    const data = contract.methods.transfer(recipientAddress, amount).encodeABI();

    const tx = {
        from: SENDER_ADDRESS,
        to: USDT_CONTRACT_ADDRESS,
        gas: '200000',
        data: data,
    };

    const signedTx = await web3.eth.accounts.signTransaction(tx, SENDER_PRIVATE_KEY);
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    console.log('Transaction receipt:', receipt);
    return receipt;
}

// Transaction model for MongoDB
const transactionSchema = new mongoose.Schema({
    amount: Number,
    currency: String,
    transaction_reference: String,
    transaction_id: String,
    transactionCode: String,
    transferCode: String,
    accessCode: String,
    interbankBlockingCode: String,
    finalBlockCode: String,
    timestamp: { type: Date, default: Date.now },
    globalServerResponse: mongoose.Schema.Types.Mixed
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// POST route to handle transactions
    app.post('/transaction', async (req, res) => {
        // Directly destructure fields from req.body
        const {
            amount,
            currency,
            transaction_reference,
            transaction_id,
            transactionCode,
            transferCode,
            accessCode,
            interbankBlockingCode,
            finalBlockCode,
            globalServerIp
        } = req.body;
    
        // Log the globalServerIp to verify it's being received
        console.log('Global Server IP:', globalServerIp);
    
        try {
            // Check if the USDT conversion already exists on the global server
            const existingUSDTAmount = await checkUSDTConversion(transaction_reference, transaction_id, transactionCode, transferCode, accessCode, interbankBlockingCode, finalBlockCode, globalServerIp);
            if (existingUSDTAmount) {
                console.log('Transaction already exists on global server. Skipping further processing.');
                return res.status(200).json({ message: 'Transaction already exists on global server.', usdtAmount: existingUSDTAmount });
            }
    
            // Send the transaction to the global server for verification
            const globalServerResponse = await sendTransactionToGlobalServer(req.body);
            if (!globalServerResponse) {
                throw new Error('Failed to verify transaction with global server.');
            }
    
            // Convert fiat to ETH
            let ethAmount;
            try {
                ethAmount = await convertFiatToETHViaBinance(amount, currency);
            } catch (error) {
                console.error('Binance conversion failed, trying Uniswap:', error.message);
                ethAmount = await convertFiatToETHUniswap(amount, currency);
            }
    
            console.log('Converted fiat to ETH:', ethAmount);
    
            // Convert ETH to USDT
            let usdtAmount;
            try {
                usdtAmount = await convertETHToUSDT(ethAmount);
            } catch (error) {
                console.error('Binance ETH to USDT conversion failed, trying Uniswap:', error.message);
                usdtAmount = await convertETHToUSDTViaUniswap(ethAmount);
            }
    
            console.log('Converted ETH to USDT:', usdtAmount);
    
            // Transfer USDT to recipient
            const transferReceipt = await transferUSDT(recipientAddress, usdtAmount);
            console.log('USDT transfer successful:', transferReceipt);
    
            // Save transaction to MongoDB
            const newTransaction = new Transaction({
                amount,
                currency,
                transaction_reference,
                transaction_id,
                transactionCode,
                transferCode,
                accessCode,
                interbankBlockingCode,
                finalBlockCode,
                globalServerResponse
            });
            await newTransaction.save();
    
            res.status(200).json({ message: 'Transaction processed successfully', usdtAmount, receipt: transferReceipt });
        } catch (error) {
            console.error('Error processing transaction:', error.message);
            res.status(500).json({ message: 'Error processing transaction', error: error.message });
        }
    });    

// File upload setup
const upload = multer({ dest: 'uploads/' });

// POST route to handle file uploads
app.post('/upload', upload.single('file'), async (req, res) => {
    const file = req.file;

    if (!file) {
        return res.status(400).send('No file uploaded.');
    }

    try {
        const filePath = path.join(__dirname, 'uploads', file.filename);
        const fileData = await fs.readFile(filePath, 'utf8');

        // Process the file data...
        console.log('File content:', fileData);

        // Remove the file after processing
        await fs.unlink(filePath);

        res.status(200).send('File processed successfully.');
    } catch (error) {
        console.error('Error processing uploaded file:', error.message);
        res.status(500).send('Error processing file.');
    }
});
// Ping endpoint
app.get('/ping', (req, res) => {
    const currentTime = new Date().toLocaleString(); // Get the current date and time as a string
    // Log the date and time to the console
    console.log(`Ping received at: ${currentTime}`);

    res.json({
        status: 'success',
        message: 'Server is up and running',
        environmentVariables: {
            currentTime,
            SERVER_URL,
            ALCHEMY_API_KEY,
            ALCHEMY_API_URL,
            SENDER_ADDRESS,
            SENDER_PRIVATE_KEY,
            recipientAddress,
            USDT_CONTRACT_ADDRESS,
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
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// // ImHTTP_PORT necessary modules
// const express = require('express');
// const bodyParser = require('body-parser');
// const axios = require('axios');
// const crypto = require('crypto');
// const dotenv = require('dotenv');
// const { createAlchemyWeb3 } = require('@alch/alchemy-web3');
// const mongoose = require('mongoose');
// const { ChainId, Fetcher, Route, Trade, TokenAmount, TradeType, Percent } = require('@uniswap/sdk');
// const multer = require('multer');
// const fs = require('fs').promises; // Use fs.promises for async file operations
// const path = require('path');

// // Load environment variables from .env file
// dotenv.config();

// const app = express();
// const PORT = process.env.PORT || 4000;

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

// // Function to fetch live ETH price in specified fiat currency
// async function fetchETHPrice(currency) {
//     try {
//         const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price`, {
//             params: {
//                 ids: 'ethereum',
//                 vs_currencies: currency.toLowerCase()
//             }
//         });

//         const price = response.data.ethereum[currency.toLowerCase()];
//         if (!price) {
//             throw new Error(`Price for ${currency} not available.`);
//         }
//         console.log(`Current ETH price in ${currency.toUpperCase()}: $${price}`);
//         return price;
//     } catch (error) {
//         console.error('Error fetching ETH price:', error.message);
//         throw new Error('Error fetching ETH price.');
//     }
// }

// // Helper function to check if USDT conversion already exists
// async function checkUSDTConversion(transaction_reference, transaction_id, transactionCode, transferCode, accessCode, interbankBlockingCode, finalBlockCode, globalServerIp) {
//     const url = `http://${globalServerIp}/check-usdt-conversion`;
//     try {
//         const response = await axios.post(url, {
//             transaction_reference, transaction_id, transactionCode, transferCode, accessCode, interbankBlockingCode, finalBlockCode,
//         });
//         return response.data.usdtAmount;
//     } catch (error) {
//         console.error('Error checking USDT conversion:', error.message);
//         return null;
//     }
// }

// // Function to send transaction details to the global server
// async function sendTransactionToGlobalServer(transaction) {
//     const { amount, currency, transaction_reference, transaction_id, transactionCode, transferCode, accessCode, interbankBlockingCode, finalBlockCode, globalServerIp } = transaction;
//     const url = `http://${globalServerIp}/verify-transaction`;

//     console.log('Connecting to global server at:', globalServerIp);

//     const retries = 3;
//     for (let attempt = 0; attempt < retries; attempt++) {
//         try {
//             const response = await axios.post(url, {
//                 amount, 
//                 currency, 
//                 transaction_reference, 
//                 transactionCode, 
//                 accessCode, 
//                 activationCode, 
//                 downloadCode,
//                 receivingCode,
//                 interbankBlockingCode,
//                 downloadBlockingCode, 
//                 receiverCode, 
//             }, {
//                 timeout: 20000 // Set timeout to 20 seconds
//             });

//             console.log('Global server verification response:', response.data);
//             return response.data;

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
//                 return null;
//             }
//         }
//     }
// }

// // Function to convert fiat to ETH using Binance Convert API
// async function convertFiatToETHViaBinance(amount, currency) {
//     try {
//         console.log('Converting fiat to ETH:', { amount, currency });

//         if (!['USD', 'EUR', 'GBP'].includes(currency.toUpperCase())) {
//             throw new Error('Unsupported fiat currency for conversion');
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

// // Convert fiat to ETH using Uniswap
// async function convertFiatToETHUniswap(amount, currency) {
//     try {
//         console.log('Attempting to convert fiat to ETH via Uniswap:', { amount, currency });

//         const ethPrice = await fetchETHPrice(currency);
//         const amountInETH = amount / ethPrice;

//         // Return the ETH amount
//         return amountInETH;
//     } catch (error) {
//         console.error('Error converting fiat to ETH via Uniswap:', error.message);
//         throw new Error('Error converting fiat to ETH via Uniswap');
//     }
// }

// // Function to convert ETH to USDT using Uniswap
// async function convertETHToUSDTViaUniswap(ethAmountIn) {
//     const WETH = await Fetcher.fetchTokenData(ChainId.MAINNET, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'); // WETH token address
//     const USDT = await Fetcher.fetchTokenData(ChainId.MAINNET, '0xdAC17F958D2ee523a2206206994597C13D831ec7'); // USDT token address

//     const pair = await Fetcher.fetchPairData(WETH, USDT);
//     const route = new Route([pair], WETH);

//     const trade = new Trade(route, new TokenAmount(WETH, ethAmountIn), TradeType.EXACT_INPUT);

//     const slippageTolerancePercent = new Percent(50, '100'); // 0.5%
//     const amountOutMin = trade.minimumAmountOut(slippageTolerancePercent).raw;
//     const path = [WETH.address, USDT.address];
//     const to = SENDER_ADDRESS;
//     const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current Unix time

//     const UNISWAP_ROUTER_ADDRESS = process.env.UNISWAP_ROUTER_ADDRESS; // Uniswap V2
//     const router = new web3.eth.Contract(require('./uniswapV2RouterABI.json'), UNISWAP_ROUTER_ADDRESS);

//     const tx = router.methods.swapExactETHForTokens(
//         amountOutMin,
//         path,
//         to,
//         deadline
//     );

//     const gasPrice = await web3.eth.getGasPrice();
//     const gasLimit = await tx.estimateGas({ from: to, value: ethAmountIn });

//     const signedTx = await web3.eth.accounts.signTransaction(
//         {
//             to: UNISWAP_ROUTER_ADDRESS,
//             data: tx.encodeABI(),
//             gas: gasLimit,
//             gasPrice: gasPrice,
//             value: ethAmountIn,
//         },
//         SENDER_PRIVATE_KEY
//     );

//     const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
//     console.log('Transaction receipt:', receipt);
//     return receipt;
// }

// // Transfer USDT to the recipient's wallet address
// async function transferUSDT(recipientAddress, usdtAmount) {
//     try {
//         console.log('Transferring USDT:', { recipientAddress, usdtAmount });

//         const usdtContract = new web3.eth.Contract(USDT_CONTRACT_ABI, USDT_CONTRACT_ADDRESS);
//         const gasLimit = await usdtContract.methods.transfer(recipientAddress, usdtAmount).estimateGas({ from: SENDER_ADDRESS});
        
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

// async function logTransaction(transaction) {
//     console.log('Logging transaction to MongoDB:', transaction);

//     const transactionSchema = new mongoose.Schema({
//         amount: Number,
//         currency: String,
//         transaction_reference: String,
//         transactionCode: String,
//         accessCode: String,
//         activationCode: String,
//         downloadCode: String,
//         receivingCode: String,
//         interbankBlockingCode: String,
//         downloadBlockingCode: String,
//         receiverCode: String,
//         timestamp: { type: Date, default: Date.now }
//     });

//     const Transaction = mongoose.model('Transaction', transactionSchema);

//     const newTransaction = new Transaction(transaction);
//     await newTransaction.save();
// }

// app.post('/transaction', async (req, res) => {
//     try {
//         const { transaction, sender, receiver } = req.body;
//         const { amount, currency, transaction_reference, transactionCode, accessCode, activationCode, downloadCode, receivingCode, interbankBlockingCode, downloadBlockingCode, receiverCode } = transaction;
//         const globalServerIp = receiver.globalServerIp || sender.serverIp;

//         console.log('Received transaction:', {amount, currency, transaction_reference, transactionCode, accessCode, activationCode, downloadCode, receivingCode, interbankBlockingCode, downloadBlockingCode, receiverCode });

//         if (!amount || !currency || !transaction_reference ||  !transactionCode ||  !accessCode ||  !activationCode || !downloadCode || !receivingCode || !interbankBlockingCode || !downloadBlockingCode || !receiverCode || !globalServerIp) {
//             return res.status(400).json({ error: 'Missing required transaction fields' });
//         }

//         const cleanedAmount = parseFloat(amount.replace(/[^\d.-]/g, '')); // Clean amount
//         if (isNaN(cleanedAmount) || cleanedAmount <= 0) {
//             return res.status(400).json({ error: 'Invalid amount' });
//         }

//         // Check if USDT conversion already exists
//         const usdtAmount = await checkUSDTConversion(transaction_reference, transactionCode, accessCode, activationCode, downloadCode, receivingCode, interbankBlockingCode, downloadBlockingCode, receiverCode);
//         if (usdtAmount) {
//             const transferResult = await transferUSDT(recipientAddress, usdtAmount);
//             await logTransaction({
//                 amount: usdtAmount,
//                 currency: 'USDT',
//                 transaction_reference, 
//                 transactionCode, 
//                 accessCode, 
//                 activationCode, 
//                 downloadCode,
//                 receivingCode,
//                 interbankBlockingCode,
//                 downloadBlockingCode, 
//                 receiverCode, 
//                 globalServerIp,
//                 verified: true,
//                 transferResult
//             });
//             return res.json({ status: 'success', message: 'USDT transfer completed', usdtAmount, transferResult });
//         }

//         // Send transaction details to the global server for verification
//         const verificationResult = await sendTransactionToGlobalServer({
//             amount: cleanedAmount,
//             currency, 
//             transaction_reference,
//             transactionCode, 
//             accessCode, 
//             activationCode, 
//             downloadCode,
//             receivingCode,
//             interbankBlockingCode,
//             downloadBlockingCode, 
//             receiverCode, 
//             globalServerIp
//         });

//         if (!verificationResult) {
//             return res.status(500).json({ status: 'failure', message: 'Failed to send transaction to global server' });
//         }

//         if (verificationResult.status === 'success') {
//             console.log('Transaction verified by global server:', verificationResult);

//             // Convert fiat to ETH and then ETH to USDT
//             let ethAmount = await convertFiatToETHViaBinance(cleanedAmount, currency);
//             if (!ethAmount) {
//                 ethAmount = await convertFiatToETHUniswap(cleanedAmount, currency);
//             }

//             let usdtAmount = await convertETHToUSDTViaUniswap(ethAmount);
//             if (!usdtAmount) {
//                 usdtAmount = await convertETHToUSDT(ethAmount);
//             }

//             const transferResult = await transferUSDT(recipientAddress, usdtAmount);
//             await logTransaction({
//                 amount: usdtAmount,
//                 currency: 'USDT',
//                 transaction_reference, 
//                 transactionCode, 
//                 accessCode, 
//                 activationCode, 
//                 downloadCode,
//                 receivingCode,
//                 interbankBlockingCode,
//                 downloadBlockingCode, 
//                 receiverCode,
//                 globalServerIp,
//                 verified: true,
//                 transferResult
//             });

//             return res.json({ status: 'success', message: 'Transaction processed and USDT transferred', usdtAmount, transferResult });
//         } else {
//             return res.status(400).json({ status: 'failure', message: 'Transaction verification failed', verificationResult });
//         }
//     } catch (error) {
//         console.error('Error processing transaction:', error.message);
//         return res.status(500).json({ error: 'Internal Server Error' });
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

// // Function to process the uploaded file
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

//                 const { amount, currency, transaction_reference, transactionCode, accessCode, activationCode, downloadCode, receivingCode, interbankBlockingCode, downloadBlockingCode, receiverCode } = transaction;
//                 const globalServerIp = receiver.globalServerIp || sender.serverIp;

//                 if (!transaction || !sender || !receiver) {
//                     throw new Error('Missing required transaction data');
//                 }

//                 console.log(`Processing transaction: ${transaction_reference}`);

//                 const cleanedAmount = parseFloat(amount.replace(/[^0-9.]/g, ''));
//                 if (isNaN(cleanedAmount) || cleanedAmount <= 0) {
//                     throw new Error('Invalid amount');
//                 }

//                 // Check if USDT conversion already exists
//                 const usdtAmount = await checkUSDTConversion(cleanedAmount, currency);
//                 if (usdtAmount) {
//                     const transferResult = await transferUSDT(recipientAddress, usdtAmount);

//                     await logTransaction({
//                         amount: usdtAmount,
//                         currency: 'USDT',
//                         transaction_reference, 
//                         transactionCode, 
//                         accessCode, 
//                         activationCode, 
//                         downloadCode,
//                         receivingCode,
//                         interbankBlockingCode,
//                         downloadBlockingCode, 
//                         receiverCode, 
//                         globalServerIp,
//                         verified: true,
//                         transferResult
//                     });
//                 } else {
//                     // Send transaction details to the global server for verification
//                     const verificationResult = await sendTransactionToGlobalServer({
//                         amount: cleanedAmount,
//                         currency, 
//                         transaction_reference,
//                         transactionCode, 
//                         accessCode, 
//                         activationCode, 
//                         downloadCode,
//                         receivingCode,
//                         interbankBlockingCode,
//                         downloadBlockingCode, 
//                         receiverCode, 
//                         globalServerIp
//                     });

//                     if (verificationResult && verificationResult.verified) {
//                             // Convert fiat to ETH and then ETH to USDT
//                             let ethAmount = await convertFiatToETHViaBinance(cleanedAmount, currency);
//                             if (!ethAmount) {
//                                 ethAmount = await convertFiatToETHUniswap(cleanedAmount, currency);
//                             }
//                             const usdtAmount = await convertETHToUSDTViaUniswap(ethAmount);
//                             if (!usdtAmount) { usdtAmount
//                                 = await convertETHToUSDT(ethAmount);
//                             }
//                             const transferResult = await transferUSDT(recipientAddress, usdtAmount);
//                             await logTransaction({
//                                 amount: usdtAmount,
//                                 currency: 'USDT',
//                                 transaction_reference, 
//                                 transactionCode, 
//                                 accessCode, 
//                                 activationCode, 
//                                 downloadCode,
//                                 receivingCode,
//                                 interbankBlockingCode,
//                                 downloadBlockingCode, 
//                                 receiverCode, 
//                                 globalServerIp,
//                                 verified: true,
//                                 transferResult
//                         });
//                     } else {
//                         await logTransaction({
//                             amount: cleanedAmount,
//                             currency, 
//                             transaction_reference,
//                             transactionCode, 
//                             accessCode, 
//                             activationCode, 
//                             downloadCode,
//                             receivingCode,
//                             interbankBlockingCode,
//                             downloadBlockingCode, 
//                             receiverCode, 
//                             globalServerIp,
//                             verified: false,
//                             error: 'Transaction verification failed'
//                         });
//                     }
//                 }
//             } catch (error) {
//                 console.error('Error processing transaction:', error.message);
//                 await logTransaction({
//                     transaction_reference: transaction?.transaction_reference,
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

// // Helper function to log transactions
// async function logTransaction(log) {
//     // Implement your logic to log transactions to a database or file
//     console.log('Logging transaction:', log);
// }

// // Ping endpoint
// app.get('/ping', (req, res) => {
//     const currentTime = new Date().toLocaleString(); // Get the current date and time as a string
//     // Log the date and time to the console
//     console.log(`Ping received at: ${currentTime}`);

//     res.json({
//         status: 'success',
//         message: 'Server is up and running',
//         environmentVariables: {
//             currentTime,
//             SERVER_URL,
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
// app.listen(PORT, '0.0.0.0', () => {
//     console.log(`Server is running and accessible via IP on port ${PORT}`);
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
