// Store Credits Management JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize store credits functionality
    initializeStoreCredits();
});

function initializeStoreCredits() {
    // Add event listeners for action buttons
    const processCreditsBtn = document.querySelector('.process-credits-btn');
    const payWithCreditsBtn = document.querySelector('.pay-with-credits-btn');
    const showTerminalBtn = document.querySelector('.show-terminal-btn');

    if (processCreditsBtn) {
        processCreditsBtn.addEventListener('click', handleProcessCredits);
    }

    if (payWithCreditsBtn) {
        payWithCreditsBtn.addEventListener('click', handlePayWithCredits);
    }

    if (showTerminalBtn) {
        showTerminalBtn.addEventListener('click', handleShowTerminal);
    }

    // Initialize numpad modal
    initializeNumpadModal();

    // Initialize table interactions
    initializeTableInteractions();
}

function handleProcessCredits() {
    // Handle process credits button click
    console.log('Process Credits clicked');
    showNumpadModal();
}

function handlePayWithCredits() {
    // Handle pay with credits button click
    console.log('Pay with Credits clicked');
    // Add your pay with credits logic here
    alert('Pay with Credits functionality will be implemented here');
}

function handleShowTerminal() {
    // Handle show terminal button click
    console.log('Show Terminal clicked');
    // Add your terminal logic here
    alert('Terminal functionality will be implemented here');
}


function initializeTableInteractions() {
    // Add hover effects and click handlers for table rows
    const tableRows = document.querySelectorAll('.transactions-table tbody tr');
    
    tableRows.forEach(row => {
        row.addEventListener('click', function() {
            // Remove active class from all rows
            tableRows.forEach(r => r.classList.remove('active'));
            // Add active class to clicked row
            this.classList.add('active');
            
            // Get transaction data
            const cells = this.querySelectorAll('td');
            const transactionData = {
                id: cells[0].textContent,
                username: cells[1].textContent,
                type: cells[2].textContent,
                amount: cells[3].textContent,
                time: cells[4].textContent,
                balance: cells[5].textContent
            };
            
            console.log('Selected transaction:', transactionData);
        });
    });
}

// Utility functions for store credits management
function addTransaction(transactionData) {
    const tableBody = document.querySelector('.transactions-table tbody');
    const newRow = document.createElement('tr');
    
    newRow.innerHTML = `
        <td>${transactionData.id}</td>
        <td>${transactionData.username}</td>
        <td>${transactionData.type}</td>
        <td>${transactionData.amount}</td>
        <td>${transactionData.time}</td>
        <td>${transactionData.balance}</td>
    `;
    
    // Add click handler to new row
    newRow.addEventListener('click', function() {
        const tableRows = document.querySelectorAll('.transactions-table tbody tr');
        tableRows.forEach(r => r.classList.remove('active'));
        this.classList.add('active');
    });
    
    tableBody.appendChild(newRow);
}

function updateStats() {
    // Update dashboard statistics
    const totalTransactions = document.querySelectorAll('.transactions-table tbody tr').length;
    const totalCredits = Array.from(document.querySelectorAll('.transactions-table tbody tr'))
        .reduce((sum, row) => {
            const amount = parseInt(row.querySelector('td:nth-child(4)').textContent);
            return sum + (isNaN(amount) ? 0 : amount);
        }, 0);
    
    // Update credits transacted in dashboard
    const creditsTransactedElement = document.querySelector('.stat-item:nth-child(2) .stat-value');
    if (creditsTransactedElement) {
        creditsTransactedElement.textContent = totalCredits;
    }
}

// Numpad Modal Functions
function initializeNumpadModal() {
    const modal = document.getElementById('numpadModal');
    const closeBtn = document.getElementById('closeNumpadModal');
    const confirmBtn = document.getElementById('confirmAmount');
    const amountInput = document.getElementById('amountInput');
    const numpadBtns = document.querySelectorAll('.numpad-btn');

    // Close modal when clicking close button
    if (closeBtn) {
        closeBtn.addEventListener('click', hideNumpadModal);
    }

    // Close modal when clicking outside
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                hideNumpadModal();
            }
        });
    }

    // Handle confirm button
    if (confirmBtn) {
        confirmBtn.addEventListener('click', handleConfirmAmount);
    }

    // Handle numpad button clicks
    numpadBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const value = this.getAttribute('data-value');
            const action = this.getAttribute('data-action');
            
            if (value) {
                addDigit(value);
            } else if (action) {
                handleNumpadAction(action);
            }
        });
    });

    // Handle keyboard input
    if (amountInput) {
        amountInput.addEventListener('keydown', function(e) {
            // Allow only numbers and backspace
            if (!/[0-9]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete') {
                e.preventDefault();
            }
        });
    }
}

function showNumpadModal() {
    const modal = document.getElementById('numpadModal');
    const amountInput = document.getElementById('amountInput');
    
    if (modal) {
        modal.classList.add('show');
        // Clear input when opening
        if (amountInput) {
            amountInput.value = '';
        }
        // Focus on input
        setTimeout(() => {
            if (amountInput) {
                amountInput.focus();
            }
        }, 100);
    }
}

function hideNumpadModal() {
    const modal = document.getElementById('numpadModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function addDigit(digit) {
    const amountInput = document.getElementById('amountInput');
    if (amountInput) {
        const currentValue = amountInput.value;
        // Limit to 6 digits
        if (currentValue.length < 6) {
            amountInput.value = currentValue + digit;
        }
    }
}

function handleNumpadAction(action) {
    const amountInput = document.getElementById('amountInput');
    
    if (action === 'clear') {
        if (amountInput) {
            amountInput.value = '';
        }
    } else if (action === 'backspace') {
        if (amountInput) {
            const currentValue = amountInput.value;
            amountInput.value = currentValue.slice(0, -1);
        }
    }
}

function handleConfirmAmount() {
    const amountInput = document.getElementById('amountInput');
    const amount = amountInput ? amountInput.value : '';
    
    if (amount && !isNaN(amount) && parseInt(amount) > 0) {
        console.log('Confirmed amount:', amount);
        // Here you would typically process the credit amount
        alert(`Processing credits for amount: $${amount}`);
        hideNumpadModal();
        
        // You could add the transaction to the table here
        // addTransaction({
        //     id: generateTransactionId(),
        //     username: 'Current User',
        //     type: 'Card',
        //     amount: amount,
        //     time: getCurrentTime(),
        //     balance: amount
        // });
    } else {
        alert('Please enter a valid amount');
    }
}

function generateTransactionId() {
    // Generate a simple transaction ID
    const existingIds = Array.from(document.querySelectorAll('.transactions-table tbody tr'))
        .map(row => parseInt(row.querySelector('td').textContent))
        .filter(id => !isNaN(id));
    
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    return String(maxId + 1).padStart(3, '0');
}

function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
    });
}
