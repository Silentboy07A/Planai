document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const API_URL = 'http://localhost:3000/api/chat';

    // --- DOM Elements ---
    const chatToggleBtn = document.getElementById('chat-toggle-btn');
    const chatWindow = document.getElementById('chat-window');
    const chatCloseBtn = document.getElementById('chat-close-btn');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');

    // Create Typing Indicator Element
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
    chatMessages.appendChild(typingIndicator);

    // --- State ---
    let isChatOpen = false;
    let isProcessing = false;

    // --- Event Listeners ---
    chatToggleBtn.addEventListener('click', toggleChat);
    chatCloseBtn.addEventListener('click', toggleChat);

    chatSendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // --- Functions ---

    function toggleChat() {
        isChatOpen = !isChatOpen;
        if (isChatOpen) {
            chatWindow.classList.add('open');
            chatToggleBtn.classList.add('hidden');
            setTimeout(() => chatInput.focus(), 300); // Focus input after animation
        } else {
            chatWindow.classList.remove('open');
            chatToggleBtn.classList.remove('hidden');
        }
    }

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || isProcessing) return;

        // 1. Add User Message (Optimistic UI)
        addMessage(text, 'user');
        chatInput.value = '';
        chatInput.focus();

        // 2. Show Typing Indicator
        showTyping(true);
        isProcessing = true;
        chatSendBtn.disabled = true;

        try {
            // 3. Call Backend API
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: text,
                    mode: "default" // or "expert" if we add a toggle later
                })
            });

            const data = await response.json();

            // 4. Hide Typing & Add Bot Response
            showTyping(false);

            if (response.ok) {
                addMessage(data.reply, 'bot');
            } else {
                addMessage(`Error: ${data.error || 'Something went wrong.'}`, 'error');
                if (data.suggestion) {
                    addMessage(`Tip: ${data.suggestion}`, 'error');
                }
            }

        } catch (error) {
            showTyping(false);
            console.error('Chat Error:', error);
            addMessage('Could not connect to the server. Is the backend running?', 'error');
        } finally {
            isProcessing = false;
            chatSendBtn.disabled = false;
        }
    }

    function addMessage(text, type) {
        const bubble = document.createElement('div');
        bubble.classList.add('message-bubble');

        if (type === 'user') bubble.classList.add('msg-user');
        else if (type === 'bot') bubble.classList.add('msg-bot');
        else if (type === 'error') bubble.classList.add('msg-error');

        // Allow basic HTML line breaks, but sanitize somewhat by using innerText first for user content if needed.
        // For simplicity here, we'll use innerHTML to support the <br> we might inject, 
        // but for user input standard text node is safer.
        if (type === 'user') {
            bubble.textContent = text;
        } else {
            // Bot/System messages might have formatting
            bubble.innerHTML = text.replace(/\n/g, '<br>');
        }

        // Insert before typing indicator
        chatMessages.insertBefore(bubble, typingIndicator);
        scrollToBottom();
    }

    function showTyping(show) {
        typingIndicator.style.display = show ? 'flex' : 'none';
        scrollToBottom();
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});
