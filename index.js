// require('dotenv').config(); // Load environment variables from .env file
// const axios = require('axios');
// const express = require('express');

// const app = express();
// const port = 3000;

// app.use(express.json());

// // Environment variables for API details
// const apiUrl = process.env.M1_API_URL;
// const apiKey = process.env.M1_API_KEY;
// const partnerIdentifier = process.env.M1_PARTNER_IDENTIFIER;
// const accountId = process.env.ACCOUNT_ID;

// // Transfer details, including receiver's bank details
// const transferData = {
//     amount: 152200175.00,
//     currency: 'EUR',
//     accountName: 'Cem Aslan Asilturk',
//     accountNumber: '6055294364',
//     bankName: 'Nexorone Banking Systems',
//     bankAddress: {
//       street: 'Florya Eksinar Sk46B24',
//       city: 'Bakirkoy Istanbul',
//       zip: '34140',
//       country: 'Turkey'
//     },
//     referenceMessage: 'UKAB-14203477-KG028',
//     transactionId: '736',
//     partnerIdentifier: partnerIdentifier,   // Add partner identifier
//     accountId: accountId,                   // Add account ID
//     recipient: {
//         name: 'Kenneth C. Edelin Esq IOLTA',
//         bankAccount: '3830-1010-2615',
//         routingNumber: "031-202-084",
//         bankName: 'Bank of America',
//         bankAddress: {
//             street: 'Four Penn Center',
//             city: 'Philadelphia',
//             state: 'PA',
//             country: 'USA'
//         },
//         bankSWIFTCode: 'BOFAUS3N',
//     }
// };

// // Function to log API request and response
// function logTransferRequest(apiKey, data) {
//     console.log('Making transfer request...');
//     console.log('API Key:', apiKey);
//     console.log('Transfer Data:', JSON.stringify(data, null, 2));
// }

// // Function to handle the transfer
// async function initiateTransfer() {
//     try {
//         // Log transfer request
//         logTransferRequest(apiKey, transferData);

//         // Make the API request with the correct API key and transfer data
//         const response = await axios.post(apiUrl, transferData, {
//             headers: {
//                 'Authorization': `Bearer ${apiKey}`,
//                 'Content-Type': 'application/json'
//             }
//         });

//         // Log the response from the API
//         console.log('Transfer successful:');
//         console.log('Response:', response.data);

//         // Display specific response properties if available
//         console.log('Response Code:', response.data.ResponseCode || 'Not provided');
//         console.log('Response Message:', response.data.ResponseMessage || 'Not provided');
//         console.log('Transaction ID:', response.data.TransactionID || 'Not provided');

//     } catch (error) {
//         if (error.response) {
//             // Log details when the API returns an error response
//             console.error('Error Status:', error.response.status);
//             console.error('Error Headers:', error.response.headers);
//             console.error('Error Response:', error.response.data);
//         } else {
//             // Log network or other errors
//             console.error('Error:', error.message);
//         }
//     }
// }

// // Start server and initiate transfer on start
// app.listen(port, () => {
//     console.log("Server started on port " + port);
//     initiateTransfer();  // Run the transfer on server start
// });

// const axios = require('axios');
// const express = require('express');
// require('dotenv').config(); // To load environment variables from .env file

// const app = express();
// const port = 3000;

// app.use(express.json());

// // Assuming the environment variables are set for your API key and partner ID
// const apiKey = process.env.M1_API_KEY;
// const partnerId = process.env.M1_PARTNER_IDENTIFIER;

// // Replace with your actual API URL
// const apiUrl = 'https://api-services.bhprivategroup.com/soap/get_transaction_by_id_curl.php'; // Or use an external API URL

// // Example POST request with the necessary body
// axios.post(apiUrl, {
//     apiKey: apiKey,
//     partnerIdentifier: partnerId,
//     amount: '152200175.00',
//     currency: 'EUR',
//     beneficiaryBankDetails: {
//         swiftCode: 'BOFAUS3N',
//         name: 'EMIRATES NBD PJSC',
//         address: 'DUBAI, UAE',
//         accountNumber: '3830-1010-2615',
//         accountHolderName: 'Kenneth C. Edelin Esq IOLTA',
//         bankName: 'Bank of America',
//         bankAddress: { street: 'Four Penn Center', city: 'Philadelphia', state: 'PA', country: 'USA' },
//         routingNumber: '031-202-084',
//     },
//     transaction_id: '736',
//     account_id: '8748273922',
// })
// .then(response => {
//     console.log('Transfer successful:', response.data);
// })
// .catch(error => {
//     console.error('Error during transfer:', error.response ? error.response.data : error.message);
// });

// // Show sender and receiver details when the server starts
// app.listen(port, () => {
//     console.log("Server started on port " + port);
// });

const express = require('express');
const axios = require('axios');
const { logger } = require('./utils/logger'); // Assuming you have a logger utility
const { validateTransfer } = require('./utils/validator');

const app = express();
const port = 3000;

app.use(express.json());

// Bank of America details for receiving funds (Receiver)
const receiverBankDetails = {
    accountHolderName: "Kenneth C. Edelin Esq IOLTA",
    bankName: "Bank of America",
    bankAddress: {
        street: "Four Penn Center",
        city: "Philadelphia",
        state: "PA",
        country: "USA"
    },
    accountNumber: "3830-1010-2615",
    routingNumber: "031-202-084",
    swiftCode: "BOFAUS3N"
};

// BH Private Group details for sending funds (Sender)
const senderBankDetails = {
    bankName: "BH Private Group",
    bankAddress: "9 Executive Court, South Barrington, Illinois 60011",
    customerName: "Cem Aslan Asilturk",
    customerAddress: "Florya Eksinar Sk. 46 B2-4, Bakırköy, Istanbul, Turkey",
    accountNumber: "8748273922",
    currency: "EUR",
    transactionId: "736",
    transactionDescription: "Outgoing Wire Transfer - INTEGROUS GOLD AND DIAMOND TRADING - UKAB-14203477-KG028",
    referenceMessage: "UKAB-14203477-KG028"
};

// Show sender and receiver details when the server starts
app.listen(port, () => {
    logger.info("Server started on port " + port);
    console.log("Server started on port " + port);
    
    // Display sender and receiver details
    console.log("Sender Bank Details:");
    console.log(senderBankDetails);

    console.log("Receiver Bank Details:");
    console.log(receiverBankDetails);
});

// Endpoint to initiate the transfer
app.post('/transfer', async (req, res) => {
    const { amount, currency, beneficiaryBankDetails, transactionId, accountId } = req.body;

    // Validate input (You should implement the validation function)
    const validationError = validateTransfer(req.body);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    try {
        const response = await axios.post(process.env.M1_API_URL,
            new URLSearchParams({
                apiKey: process.env.M1_API_KEY,
                partnerIdentifier: process.env.M1_PARTNER_IDENTIFIER,
                amount,
                currency,
                beneficiaryBankDetails: JSON.stringify({
                    ...beneficiaryBankDetails,
                    ...receiverBankDetails // Merge receiver bank details
                }),
                transaction_id: transactionId,
                account_id: accountId,
            }).toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        if (response.data.success) {
            logger.info(`Transfer successful: ${response.data}`);
            return res.status(200).json({ message: 'Transfer successful', data: response.data });
        } else {
            logger.error(`Transfer failed: ${response.data.error}`);
            return res.status(400).json({ error: response.data.error || 'Transfer failed' });
        }
    } catch (error) {
        logger.error('Error during transfer:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
