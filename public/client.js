// public/client.js

// Κρατάμε το ιστορικό στον client, καθώς ο server είναι stateless (δεν θυμάται)
const historyArray = []; 

// 1. Βρες τα DOM στοιχεία
const askButton = document.getElementById('ask');
const searchInput = document.getElementById('search');
const promptsContainer = document.querySelector('.prompt-list');
const imageButton = document.getElementById('image'); // Υποθέτουμε ότι υπάρχει

const thoughts = ['Thinking...', 'Hmmm...', 'Let me decide...', 'LoAdInG BiP BoP'];


// 2. Συνάρτηση Εκκίνησης (αντικαθιστά την παλιά async function load())
function initialize() {
    const input = [
        'Tell me what you think',
        'How are you today?',
        'What would you like to share?',
        'Tell me about you day',
        'Tell me your deepest thoughts'
    ];
    // Θέτει placeholder για το πεδίο αναζήτησης
    if (searchInput) {
        searchInput.placeholder = input[Math.floor(Math.random() * input.length)];
    }
}

// 3. Λογική Κλικ (Αντικαθιστά όλο το block του document.getElementById('ask').addEventListener...)
askButton.addEventListener('click', async () => {

    const prompt = searchInput.value;
    if (!prompt) return;

    // --- 1. Εμφάνιση ερωτήματος χρήστη (DOM Logic) ---
    let inputLi = document.createElement('li');
    inputLi.setAttribute('class', 'input-prompt');
    inputLi.setAttribute('id', 'question');
    inputLi.innerHTML = prompt;
    promptsContainer.appendChild(inputLi);
    
    // --- 2. Προσθήκη ερωτήματος στο Ιστορικό ---
    historyArray.push({
        role: "user", parts: [{ text: prompt }]
    });

    // --- 3. UI State Changes (Απενεργοποίηση, Placeholder) ---
    searchInput.value = thoughts[Math.floor(Math.random() * thoughts.length)];
    searchInput.disabled = true;
    askButton.disabled = true;
    imageButton.disabled = true;

    try {
        // --- 4. FETCH CALL (Στέλνει τα δεδομένα στον SERVER) ---
        const response = await fetch('/api/chat', { // To endpoint που δημιουργήσαμε στον server
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                prompt: prompt,
                history: historyArray 
            })
        });

        if (!response.ok) {
             throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const answer = data.text.replaceAll("```html", "").replaceAll("```", "");
        
        // --- 5. Εμφάνιση απάντησης (DOM Logic) ---
        let outputLi = document.createElement('li');
        outputLi.setAttribute('class', 'output-prompt');
        outputLi.setAttribute('id', 'output');
        outputLi.innerHTML = answer;
        promptsContainer.appendChild(outputLi);

        // --- 6. Ενημέρωση Ιστορικού ---
        historyArray.push({
            role: "model", parts: [{ text: data.text }]
        });

        // --- 7. Εκτέλεση Scripts (Αν χρειάζεται) ---
        // Προσοχή: Το eval() μπορεί να είναι επικίνδυνο, αλλά διατηρείται από τον αρχικό σας κώδικα
        const scripts = outputLi.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            eval(scripts[i].textContent);
        }

    } catch (error) {
        console.error('Fetch/Gemini Error:', error);
        alert('Σφάλμα σύνδεσης με τον server. Δοκιμάστε αργότερα.');
    } finally {
        // --- 8. Επαναφορά UI State ---
        searchInput.value = "";
        searchInput.disabled = false;
        askButton.disabled = false;
        imageButton.disabled = false;
    }
});

// 4. Λογική Κλικ για Image (Αντικαθιστά το document.getElementById('image').addEventListener...)
imageButton.addEventListener('click', async () => {
    // ... (Εδώ μπορείς να προσθέσεις την κλήση για image generation)
    console.log("Image button clicked - Functionality TBD");
});


// Καλεί τη συνάρτηση εκκίνησης
initialize();
