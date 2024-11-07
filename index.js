const express = require('express');
const axios = require('axios');
const { logger } = require('./utils/logger'); // Assuming you have a logger utility
const { validateTransfer } = require('./utils/validator');
require('dotenv').config(); // To load environment variables from .env file

const app = express();
const PORT = process.env.PORT;

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

// Show sender and receiver details when the server starts
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // Display sender and receiver details
    console.log("Sender Bank Details:");
    console.log(senderBankDetails);

    console.log("Receiver Bank Details:");
    console.log(receiverBankDetails);
});
