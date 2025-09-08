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

    // Initialize table interactions
    initializeTableInteractions();
}

function handleProcessCredits() {
    // Handle process credits button click
    console.log('Process Credits clicked');
    openNumpadPopup();
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

// Numpad Popup Functions
function createNumpadOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', function (event) {
        if (event.target === overlay) {
            document.body.removeChild(overlay);
            document.body.style.overflow = '';
        }
    });
    const content = document.createElement('div');
    content.className = 'modal-content';
    overlay.appendChild(content);
    return { overlay, content };
}

function wireNumpadButtons(container, overlay) {
    const backBtn = container.querySelector('.back-btn');
    const clearBtn = container.querySelector('.clear-btn');
    const confirmBtn = container.querySelector('.confirm-btn');
    const numpadBtns = container.querySelectorAll('.numpad-btn');
    const amountInput = container.querySelector('#amount-input');

    // Close popup when clicking back/cancel button
    if (backBtn) {
        backBtn.addEventListener('click', function () {
            if (overlay.parentNode) {
                document.body.removeChild(overlay);
                document.body.style.overflow = '';
            }
        });
    }

    // Clear input when clicking clear button
    if (clearBtn) {
        clearBtn.addEventListener('click', function () {
            if (amountInput) {
                amountInput.value = '';
            }
        });
    }

    // Handle confirm button
    if (confirmBtn) {
        confirmBtn.addEventListener('click', function () {
            handleConfirmAmount(amountInput, overlay);
        });
    }

    // Handle numpad button clicks
    numpadBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const value = this.getAttribute('data-value');
            const action = this.getAttribute('data-action');
            
            if (value) {
                addDigit(value, amountInput);
            } else if (action) {
                handleNumpadAction(action, amountInput);
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

function openNumpadPopup() {
    fetch('numpad-popup.html', { cache: 'no-cache' })
        .then(function (response) { return response.text(); })
        .then(function (html) {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            const formContainer = temp.querySelector('.form-container');
            if (!formContainer) throw new Error('No form-container in fetched HTML');

            const { overlay, content } = createNumpadOverlay();
            content.appendChild(formContainer);
            document.body.appendChild(overlay);
            document.body.style.overflow = 'hidden';
            wireNumpadButtons(formContainer, overlay);
            
            // Focus on input after a short delay
            setTimeout(() => {
                const amountInput = formContainer.querySelector('#amount-input');
                if (amountInput) {
                    amountInput.focus();
                }
            }, 100);
        })
        .catch(function (error) {
            console.error('Error loading numpad popup, using fallback template:', error);
            // Use fallback template when fetch fails (e.g., when not using live server)
            const template = document.getElementById('numpad-popup-template');
            if (!template) {
                alert('Error loading numpad popup - no fallback template found');
                return;
            }
            
            const clone = template.content.cloneNode(true);
            const formContainer = clone.querySelector('.form-container');
            if (!formContainer) {
                alert('Error loading numpad popup - invalid template structure');
                return;
            }
            
            const { overlay, content } = createNumpadOverlay();
            content.appendChild(formContainer);
            document.body.appendChild(overlay);
            document.body.style.overflow = 'hidden';
            wireNumpadButtons(formContainer, overlay);
            
            // Focus on input after a short delay
            setTimeout(() => {
                const amountInput = formContainer.querySelector('#amount-input');
                if (amountInput) {
                    amountInput.focus();
                }
            }, 100);
        });
}

function addDigit(digit, amountInput) {
    if (amountInput) {
        const currentValue = amountInput.value;
        // Limit to 6 digits
        if (currentValue.length < 6) {
            amountInput.value = currentValue + digit;
        }
    }
}

function handleNumpadAction(action, amountInput) {
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

function handleConfirmAmount(amountInput, overlay) {
    const amount = amountInput ? amountInput.value : '';
    
    if (amount && !isNaN(amount) && parseInt(amount) > 0) {
        console.log('Confirmed amount:', amount);
        // Here you would typically process the credit amount
        alert(`Processing credits for amount: $${amount}`);
        
        // Close the popup
        if (overlay.parentNode) {
            document.body.removeChild(overlay);
            document.body.style.overflow = '';
        }
        
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
