function validateTransfer(data) {
    const { amount, currency, beneficiaryBankDetails, transactionId, accountId } = data;
    if (!amount || typeof amount !== 'string') return 'Amount is required and must be a string.';
    if (!currency || typeof currency !== 'string') return 'Currency is required and must be a string.';
    if (!beneficiaryBankDetails || typeof beneficiaryBankDetails !== 'object') return 'Beneficiary bank details are required.';
    if (!transactionId || typeof transactionId !== 'string') return 'Transaction ID is required and must be a string.';
    if (!accountId || typeof accountId !== 'string') return 'Account ID is required and must be a string.';
    return null; // No errors
}

module.exports = { validateTransfer };