/***************************************
 * MONI_MONITOR — BACKEND FOUNDATION
 * CLEAN START (NO EXISTING DATA)
 ***************************************/

/**
 * Runs when spreadsheet opens
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Moni Monitor")
    .addItem("Initialize Database", "ensureExtendedSchema")
    .addToUi();
}

/**
 * Web app entry (placeholder for later)
 */
function doGet(e) {
  return HtmlService
    .createHtmlOutputFromFile("customer")
    .setTitle("Moni Monitor")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Create base sheets
 */
function ensureSchema() {
  const ss = SpreadsheetApp.getActive();

  const baseSchemas = {
    Customers: [
      "CustomerID",
      "FullName",
      "Phone",
      "Email",
      "Status",
      "CreatedAt"
    ],

    Wallets: [
      "CustomerID",
      "Balance",
      "LastUpdated"
    ],

    Transactions: [
      "TransactionID",
      "CustomerID",
      "TransactionType",
      "Amount",
      "Reference",
      "TransactionDate"
    ]
  };

  Object.keys(baseSchemas).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(baseSchemas[name]);
    }
  });
}

/**
 * Create extended financial schemas
 */
function ensureExtendedSchema() {
  ensureSchema();

  const ss = SpreadsheetApp.getActive();

  const extendedSchemas = {
    Loans: [
      "LoanID",
      "CustomerID",
      "Principal",
      "OutstandingBalance",
      "InterestRate",
      "DueDate",
      "Status",
      "CreatedAt"
    ],

    LoanRepayments: [
      "RepaymentID",
      "LoanID",
      "CustomerID",
      "Amount",
      "PaymentDate"
    ]
  };

  Object.keys(extendedSchemas).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(extendedSchemas[name]);
    }
  });
}
/***************************************
 * CORE CUSTOMER OPERATIONS
 ***************************************/

/**
 * Add a new customer and initialize wallet
 */
function addCustomer(fullName, phone, email) {
  const ss = SpreadsheetApp.getActive();

  const customers = ss.getSheetByName("Customers");
  const wallets = ss.getSheetByName("Wallets");

  const customerId = Utilities.getUuid();
  const createdAt = new Date();

  customers.appendRow([
    customerId,
    fullName,
    phone,
    email || "",
    "ACTIVE",
    createdAt
  ]);

  // Initialize wallet with zero balance
  wallets.appendRow([
    customerId,
    0,
    createdAt
  ]);

  return customerId;
}

/**
 * Fetch all customers
 */
function getAllCustomers() {
  const sheet = SpreadsheetApp.getActive().getSheetByName("Customers");
  const data = sheet.getDataRange().getValues();

  data.shift(); // remove header

  return data.map(r => ({
    customerId: r[0],
    fullName: r[1],
    phone: r[2],
    email: r[3],
    status: r[4],
    createdAt: r[5]
  }));
}

/***************************************
 * TRANSACTION ENGINE (SINGLE SOURCE)
 ***************************************/

/**
 * Record ANY financial activity
 */
function recordTransaction(customerId, type, amount, reference) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("Transactions");

  sheet.appendRow([
    Utilities.getUuid(),
    customerId,
    type,
    amount,
    reference || "",
    new Date()
  ]);
}
/***************************************
 * WALLET OPERATIONS
 ***************************************/

/**
 * Internal helper to get wallet row index
 */
function getWalletRow_(customerId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("Wallets");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === customerId) {
      return { sheet, row: i + 1, balance: data[i][1] };
    }
  }
  throw new Error("Wallet not found for customer: " + customerId);
}

/**
 * Record a deposit (e.g. Mobile Money, Cash)
 */
function recordMobileMoneyDeposit(customerId, amount, reference) {
  if (amount <= 0) throw new Error("Deposit amount must be positive");

  const wallet = getWalletRow_(customerId);
  const newBalance = wallet.balance + amount;

  wallet.sheet.getRange(wallet.row, 2).setValue(newBalance);
  wallet.sheet.getRange(wallet.row, 3).setValue(new Date());

  recordTransaction(customerId, "DEPOSIT", amount, reference);
}

/**
 * Record a withdrawal
 */
function recordWithdrawal(customerId, amount, reference) {
  if (amount <= 0) throw new Error("Withdrawal amount must be positive");

  const wallet = getWalletRow_(customerId);
  if (wallet.balance < amount) {
    throw new Error("Insufficient wallet balance");
  }

  const newBalance = wallet.balance - amount;

  wallet.sheet.getRange(wallet.row, 2).setValue(newBalance);
  wallet.sheet.getRange(wallet.row, 3).setValue(new Date());

  recordTransaction(customerId, "WITHDRAWAL", amount, reference);
}

/***************************************
 * CUSTOMER SUMMARY (UI DEPENDS ON THIS)
 ***************************************/

/**
 * Get wallet balance + transaction history
 */
function getCustomerSummary(customerId) {
  const ss = SpreadsheetApp.getActive();

  /* ---------- WALLET ---------- */
  const walletInfo = getWalletRow_(customerId);
  const balance = Number(walletInfo.balance) || 0;

  /* ---------- TRANSACTIONS ---------- */
  const txnSheet = ss.getSheetByName("Transactions");
  if (!txnSheet) {
    throw new Error("Transactions sheet not found");
  }

  const txData = txnSheet.getDataRange().getValues();
  txData.shift(); // remove header row

  const transactions = txData
    .filter(r => r[1] === customerId)
    .map(r => ({
      transactionId: r[0],
      type: r[2],                         // TransactionType
      amount: Number(r[3]) || 0,          // Amount
      reference: r[4],                    // Reference
      date: r[5] instanceof Date          // TransactionDate
        ? r[5].toISOString()
        : r[5]
    }));

  return {
    customerId: customerId,
    balance: balance,
    transactions: transactions
  };
}

/***************************************
 * BACKEND TEST UTILITIES
 ***************************************/

/***************************************
 * LOAN ENGINE
 ***************************************/

/**
 * Create a loan (does NOT disburse)
 */
function createLoan(customerId, principal, interestRate, dueDate) {
  if (principal <= 0) throw new Error("Principal must be positive");

  const sheet = SpreadsheetApp.getActive().getSheetByName("Loans");
  const loanId = Utilities.getUuid();

  sheet.appendRow([
    loanId,
    customerId,
    principal,
    principal,          // outstanding balance
    interestRate,
    new Date(dueDate),
    "PENDING",
    new Date()
  ]);

  return loanId;
}

/**
 * Fetch loan row helper
 */
function getLoanRow_(loanId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("Loans");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === loanId) {
      return {
        sheet,
        row: i + 1,
        customerId: data[i][1],
        outstanding: data[i][3],
        status: data[i][6]
      };
    }
  }
  throw new Error("Loan not found: " + loanId);
}

/**
 * Disburse loan to customer's wallet
 */
function disburseLoan(loanId, reference) {
  const loan = getLoanRow_(loanId);

  if (loan.status !== "PENDING") {
    throw new Error("Loan already disbursed or closed");
  }

  // Mark loan active
  loan.sheet.getRange(loan.row, 7).setValue("ACTIVE");

  // Credit wallet
  recordMobileMoneyDeposit(
    loan.customerId,
    loan.outstanding,
    reference || "LOAN_DISBURSEMENT"
  );
}

/**
 * Record loan repayment (external payment)
 */
function recordLoanRepayment(loanId, amount, reference) {
  if (amount <= 0) throw new Error("Repayment amount must be positive");

  const ss = SpreadsheetApp.getActive();
  const loan = getLoanRow_(loanId);

  if (loan.status !== "ACTIVE") {
    throw new Error("Loan is not active");
  }

  const repaymentSheet = ss.getSheetByName("LoanRepayments");
  const payment = Math.min(amount, loan.outstanding);
  const newBalance = loan.outstanding - payment;

  // Update loan balance
  loan.sheet.getRange(loan.row, 4).setValue(newBalance);

  if (newBalance === 0) {
    loan.sheet.getRange(loan.row, 7).setValue("CLOSED");
  }

  // Log repayment
  repaymentSheet.appendRow([
    Utilities.getUuid(),
    loanId,
    loan.customerId,
    payment,
    new Date()
  ]);

  recordTransaction(
    loan.customerId,
    "LOAN_REPAYMENT",
    payment,
    reference || "LOAN_REPAYMENT"
  );
}

/**
 * Pay loan from wallet balance
 */
function payLoanFromWallet(loanId, amount) {
  const loan = getLoanRow_(loanId);

  // Withdraw from wallet
  recordWithdrawal(
    loan.customerId,
    amount,
    "LOAN_REPAYMENT_FROM_WALLET"
  );

  // Apply to loan
  recordLoanRepayment(
    loanId,
    amount,
    "LOAN_REPAYMENT_FROM_WALLET"
  );
}
/***************************************
 * LOAN QUERIES & ALERTS
 ***************************************/

/**
 * Get all loans for a customer
 */
function getLoansByCustomer(customerId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("Loans");
  const data = sheet.getDataRange().getValues();
  data.shift(); // header

  return data
    .filter(r => r[1] === customerId)
    .map(r => ({
      loanId: r[0],
      principal: r[2],
      outstanding: r[3],
      interestRate: r[4],
      dueDate: r[5],
      status: r[6],
      createdAt: r[7]
    }));
}

/**
 * Send alerts for overdue loans (foundation)
 */
function sendLoanDueAlerts() {
  const sheet = SpreadsheetApp.getActive().getSheetByName("Loans");
  const data = sheet.getDataRange().getValues();
  data.shift(); // header

  const today = new Date();

  data.forEach(r => {
    const dueDate = new Date(r[5]);
    const status = r[6];

    if (status === "ACTIVE" && dueDate < today) {
      Logger.log(
        "⚠️ Loan overdue | Customer: " +
        r[1] +
        " | LoanID: " +
        r[0] +
        " | Outstanding: " +
        r[3]
      );

      // Email/SMS hooks will plug in here later
    }
  });
}

/**
 * Search transaction by MoMo reference
 */
function searchTransactionByReference(reference) {
  const sheet = SpreadsheetApp.getActive()
    .getSheetByName("Transactions");

  const data = sheet.getDataRange().getValues();
  data.shift();

  return data
    .filter(r => r[4] === reference)
    .map(r => ({
      transactionId: r[0],
      customerId: r[1],
      type: r[2],
      amount: r[3],
      reference: r[4],
      date: r[5]
    }))[0] || null;
}
function uploadReceipt(name, data) {
  const blob = Utilities.newBlob(
    Utilities.base64Decode(data.split(",")[1]),
    null,
    name
  );

  const file = DriveApp.createFile(blob);
  return file.getUrl();
}
/***************************************
 * CUSTOMER AUTH (PHONE + PIN)
 ***************************************/

/**
 * Ensure Customers sheet has a PIN_HASH column
 */
function ensureCustomerPinColumn_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName("Customers");
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (headers.indexOf("PIN_HASH") === -1) {
    sheet.insertColumnAfter(lastCol);
    sheet.getRange(1, lastCol + 1).setValue("PIN_HASH");
  }
}

/**
 * Hash PIN (simple SHA-256, stored as hex)
 */
function hashPin_(pin) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(pin)
  );
  return bytes.map(function (b) {
    const v = (b & 0xFF).toString(16);
    return v.length === 1 ? "0" + v : v;
  }).join("");
}

/**
 * Register customer WITH PIN
 */
function registerCustomerWithPin(fullName, phone, email, pin) {
  ensureCustomerPinColumn_();

  const sheet = SpreadsheetApp.getActive().getSheetByName("Customers");
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0];

  const row = new Array(headers.length).fill("");

  const customerId = Utilities.getUuid();
  const createdAt = new Date();
  const pinHash = hashPin_(pin);

  row[headers.indexOf("CustomerID")] = customerId;
  row[headers.indexOf("FullName")] = fullName;
  row[headers.indexOf("Phone")] = phone;
  row[headers.indexOf("Email")] = email || "";
  row[headers.indexOf("Status")] = "ACTIVE";
  row[headers.indexOf("CreatedAt")] = createdAt;
  row[headers.indexOf("PIN_HASH")] = pinHash;

  sheet.appendRow(row);

  // also init wallet
  const wallets = SpreadsheetApp.getActive().getSheetByName("Wallets");
  wallets.appendRow([customerId, 0, createdAt]);

  return customerId;
}

/**
 * Authenticate customer by phone + PIN
 * Returns { customerId, fullName } or null
 */
function authenticateCustomer(phone, pin) {
  ensureCustomerPinColumn_();

  const sheet = SpreadsheetApp.getActive().getSheetByName("Customers");
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();

  const phoneIdx = headers.indexOf("Phone");
  const statusIdx = headers.indexOf("Status");
  const pinIdx = headers.indexOf("PIN_HASH");
  const idIdx = headers.indexOf("CustomerID");
  const nameIdx = headers.indexOf("FullName");

  if (phoneIdx === -1 || statusIdx === -1 || pinIdx === -1) {
    throw new Error("Required columns missing");
  }

  const hash = hashPin_(pin);

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    const storedPhone = String(row[phoneIdx]).trim();
    const inputPhone = String(phone).trim();

    if (
      storedPhone === inputPhone &&
      row[statusIdx] === "ACTIVE" &&
      row[pinIdx] === hash
    ) {
      return {
        customerId: row[idIdx],
        fullName: row[nameIdx]
      };
    }
  }
  return null;
}
/***************************************
 * AGENT / FIELD OFFICER ENGINE
 ***************************************/

/**
 * Ensure Agents + AgentActivity sheets exist
 */
function ensureAgentSchemas_() {
  const ss = SpreadsheetApp.getActive();

  let agents = ss.getSheetByName("Agents");
  if (!agents) {
    agents = ss.insertSheet("Agents");
    agents.appendRow([
      "AgentID",
      "FullName",
      "Phone",
      "PIN_HASH",
      "Role",
      "Status",
      "CreatedAt"
    ]);
  }

  let activity = ss.getSheetByName("AgentActivity");
  if (!activity) {
    activity = ss.insertSheet("AgentActivity");
    activity.appendRow([
      "ActivityID",
      "AgentID",
      "CustomerID",
      "Type",
      "Amount",
      "Reference",
      "DateTime"
    ]);
  }
}

/**
 * Register agent / field officer
 */
function registerAgent(fullName, phone, pin, role) {
  ensureAgentSchemas_();

  const sheet = SpreadsheetApp.getActive().getSheetByName("Agents");
  const agentId = Utilities.getUuid();
  const createdAt = new Date();
  const pinHash = hashPin_(pin);

  sheet.appendRow([
    agentId,
    fullName,
    phone,
    pinHash,
    role || "FIELD_OFFICER",
    "ACTIVE",
    createdAt
  ]);

  return agentId;
}

/**
 * Authenticate agent by phone + PIN
 * Returns { agentId, fullName, role } or null
 */
function authenticateAgent(phone, pin) {
  ensureAgentSchemas_();

  const sheet = SpreadsheetApp.getActive().getSheetByName("Agents");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const data = sheet.getDataRange().getValues();
  data.shift(); // headers

  const hash = hashPin_(pin);

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (row[2] === phone && row[3] === hash && row[5] === "ACTIVE") {
      return {
        agentId: row[0],
        fullName: row[1],
        role: row[4]
      };
    }
  }
  return null;
}

/**
 * Log agent-originated activity (does not touch balances)
 */
function logAgentActivity_(agentId, customerId, type, amount, reference) {
  ensureAgentSchemas_();
  const sheet = SpreadsheetApp.getActive().getSheetByName("AgentActivity");
  sheet.appendRow([
    Utilities.getUuid(),
    agentId,
    customerId,
    type,
    amount,
    reference || "",
    new Date()
  ]);
}

/**
 * Example: agent records a MoMo deposit on behalf of a customer
 */
function agentRecordDeposit(agentId, customerId, amount, reference) {
  recordMobileMoneyDeposit(customerId, amount, reference);
  logAgentActivity_(agentId, customerId, "DEPOSIT", amount, reference);
}
function logout() {
  document.getElementById("app").style.display = "none";
  document.getElementById("login").style.display = "block";

  document.getElementById("phone").value = "";
  document.getElementById("pin").value = "";
}
/***************************************
 * ROLE & ACCESS GUARDS (BACKEND ONLY)
 ***************************************/

/**
 * Ensure customer is active
 */
function assertActiveCustomer_(customerId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("Customers");
  const data = sheet.getDataRange().getValues();
  data.shift();

  for (let r of data) {
    if (r[0] === customerId) {
      if (r[4] !== "ACTIVE") {
        throw new Error("Customer is not active");
      }
      return true;
    }
  }
  throw new Error("Customer not found");
}

/**
 * Ensure agent is active and return role
 */
function assertActiveAgent_(agentId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("Agents");
  const data = sheet.getDataRange().getValues();
  data.shift();

  for (let r of data) {
    if (r[0] === agentId) {
      if (r[5] !== "ACTIVE") {
        throw new Error("Agent not active");
      }
      return r[4]; // role
    }
  }
  throw new Error("Agent not found");
}
/***************************************
 * AUDIT TRAIL (BACKEND ONLY)
 ***************************************/

/**
 * Ensure AuditLog sheet exists
 */
function ensureAuditLog_() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName("AuditLog");

  if (!sheet) {
    sheet = ss.insertSheet("AuditLog");
    sheet.appendRow([
      "AuditID",
      "ActorType",   // CUSTOMER | AGENT | SYSTEM | ADMIN
      "ActorID",
      "CustomerID",
      "Action",
      "Amount",
      "Reference",
      "Timestamp"
    ]);
  }
}

/**
 * Record audit entry
 */
function recordAudit_(
  actorType,
  actorId,
  customerId,
  action,
  amount,
  reference
) {
  ensureAuditLog_();

  const sheet = SpreadsheetApp.getActive().getSheetByName("AuditLog");

  sheet.appendRow([
    Utilities.getUuid(),
    actorType,
    actorId || "",
    customerId || "",
    action,
    amount || "",
    reference || "",
    new Date()
  ]);
}
/***************************************
 * ACCOUNT CONTROL (BACKEND ONLY)
 ***************************************/

/**
 * Update customer status (ACTIVE / SUSPENDED)
 */
function setCustomerStatus(customerId, newStatus, actorId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("Customers");
  const data = sheet.getDataRange().getValues();
  data.shift();

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === customerId) {
      sheet.getRange(i + 2, 5).setValue(newStatus); // Status column

      recordAudit_(
        "ADMIN",
        actorId || "SYSTEM",
        customerId,
        "CUSTOMER_STATUS_CHANGE",
        "",
        newStatus
      );
      return;
    }
  }
  throw new Error("Customer not found");
}

/**
 * Update agent status (ACTIVE / SUSPENDED)
 */
function setAgentStatus(agentId, newStatus, actorId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("Agents");
  const data = sheet.getDataRange().getValues();
  data.shift();

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === agentId) {
      sheet.getRange(i + 2, 6).setValue(newStatus); // Status column

      recordAudit_(
        "ADMIN",
        actorId || "SYSTEM",
        "",
        "AGENT_STATUS_CHANGE",
        "",
        newStatus
      );
      return;
    }
  }
  throw new Error("Agent not found");
}
/***************************************
 * PIN MANAGEMENT (BACKEND ONLY)
 ***************************************/

/**
 * Change PIN (customer-initiated)
 */
function changeCustomerPin(customerId, oldPin, newPin) {
  assertActiveCustomer_(customerId);

  const sheet = SpreadsheetApp.getActive().getSheetByName("Customers");
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const pinIdx = headers.indexOf("PIN_HASH");
  const idIdx = headers.indexOf("CustomerID");

  if (pinIdx === -1) throw new Error("PIN column not found");

  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const oldHash = hashPin_(oldPin);
  const newHash = hashPin_(newPin);

  for (let i = 0; i < data.length; i++) {
    if (data[i][idIdx] === customerId) {
      if (data[i][pinIdx] !== oldHash) {
        throw new Error("Old PIN incorrect");
      }

      sheet.getRange(i + 2, pinIdx + 1).setValue(newHash);

      recordAudit_(
        "CUSTOMER",
        customerId,
        customerId,
        "PIN_CHANGED",
        "",
        ""
      );
      return true;
    }
  }
  throw new Error("Customer not found");
}

/**
 * Reset PIN (admin/system)
 */
function resetCustomerPin(customerId, newPin, actorId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("Customers");
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const pinIdx = headers.indexOf("PIN_HASH");
  const idIdx = headers.indexOf("CustomerID");

  if (pinIdx === -1) throw new Error("PIN column not found");

  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const newHash = hashPin_(newPin);

  for (let i = 0; i < data.length; i++) {
    if (data[i][idIdx] === customerId) {
      sheet.getRange(i + 2, pinIdx + 1).setValue(newHash);

      recordAudit_(
        "ADMIN",
        actorId || "SYSTEM",
        customerId,
        "PIN_RESET",
        "",
        ""
      );
      return true;
    }
  }
  throw new Error("Customer not found");
}
/***************************************
 * HARDENED FINANCIAL OPERATIONS
 * (Use these for real usage)
 ***************************************/

/**
 * Customer self-service deposit
 */
function customerDepositSecure(customerId, amount, reference) {
  assertActiveCustomer_(customerId);

  recordMobileMoneyDeposit(customerId, amount, reference);

  recordAudit_(
    "CUSTOMER",
    customerId,
    customerId,
    "DEPOSIT",
    amount,
    reference
  );
}

/**
 * Customer self-service withdrawal
 */
function customerWithdrawalSecure(customerId, amount, reference) {
  assertActiveCustomer_(customerId);

  recordWithdrawal(customerId, amount, reference);

  recordAudit_(
    "CUSTOMER",
    customerId,
    customerId,
    "WITHDRAWAL",
    amount,
    reference
  );
}

/**
 * Agent deposit on behalf of customer
 */
function agentDepositSecure(agentId, customerId, amount, reference) {
  const role = assertActiveAgent_(agentId);
  assertActiveCustomer_(customerId);

  recordMobileMoneyDeposit(customerId, amount, reference);

  logAgentActivity_(agentId, customerId, "DEPOSIT", amount, reference);

  recordAudit_(
    "AGENT",
    agentId,
    customerId,
    "AGENT_DEPOSIT",
    amount,
    reference
  );
}
/***************************************
 * DAILY AUTOMATED BACKUP
 ***************************************/

/**
 * Create a daily backup trigger (runs once)
 */
function setupDailyBackupTrigger() {
  // Remove existing backup triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "runDailyBackup_") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("runDailyBackup_")
    .timeBased()
    .everyDays(1)
    .atHour(2) // runs around 2am
    .create();
}

/**
 * Backup the active spreadsheet to Drive
 */
function runDailyBackup_() {
  const ss = SpreadsheetApp.getActive();
  const file = DriveApp.getFileById(ss.getId());

  const backupFolderName = "Moni_Monitor_Backups";
  let folder = DriveApp.getFoldersByName(backupFolderName);
  folder = folder.hasNext()
    ? folder.next()
    : DriveApp.createFolder(backupFolderName);

  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd_HH-mm"
  );

  file.makeCopy(
    ss.getName() + "_BACKUP_" + timestamp,
    folder
  );
}
/***************************************
 * SAFE API SURFACE (UI-FACING)
 ***************************************/

/**
 * Customer login API
 */
function apiCustomerLogin(phone, pin) {
  const res = authenticateCustomer(phone, pin);
  if (!res) throw new Error("Authentication failed");
  return res;
}

/**
 * Customer deposit API
 */
function apiCustomerDeposit(customerId, amount, reference) {
  customerDepositSecure(customerId, amount, reference);
  return true;
}

/**
 * Customer withdrawal API
 */
function apiCustomerWithdrawal(customerId, amount, reference) {
  customerWithdrawalSecure(customerId, amount, reference);
  return true;
}

/**
 * Agent login API
 */
function apiAgentLogin(phone, pin) {
  const res = authenticateAgent(phone, pin);
  if (!res) throw new Error("Agent authentication failed");
  return res;
}

/**
 * Agent deposit API
 */
function apiAgentDeposit(agentId, customerId, amount, reference) {
  agentDepositSecure(agentId, customerId, amount, reference);
  return true;
}

function apiGetCustomerDashboard(customerId) {
  return getCustomerSummary(customerId);
}


