// public/client.js  
  
// Κρατάμε το ιστορικό στον client, καθώς ο server είναι stateless
const historyArray = [];   
  
// --- INTERNATIONALIZATION (i18n) ---
const i18n = {
    el: {
        placeholders: [
            'Πες μου τη γνώμη σου...',  
            'Τι σε απασχολεί σήμερα;',  
            'Αναζήτησε την εσωτερική σου γαλήνη...',  
            'Πες μου για την ημέρα σου...',  
            'Μοιράσου τις βαθύτερες σκέψεις σου...'  
        ],
        thoughts: ['Σκέφτομαι...', 'Αναζητώ την απάντηση...', 'Ευθυγράμμιση δεδομένων...', 'Ο Zen επεξεργάζεται...'],
        image_prompt_default: "Ανάλυσε αυτήν την εικόνα.",
        file_prefix: "🖼️ (Αρχείο: ",
        file_suffix: "): ",
        error_server: "❌ Σφάλμα Διακομιστή:",
        error_network: "❌ Σφάλμα Δικτύου:",
        thought_prefix: "Σκέψη:"
    },
    en: {
        placeholders: [
            'Tell me your thoughts...',  
            'What is on your mind today?',  
            'Seek your inner peace...',  
            'Tell me about your day...',  
            'Share your deepest reflections...'  
        ],
        thoughts: ['Thinking...', 'Seeking answers...', 'Aligning data...', 'Zen is processing...'],
        image_prompt_default: "Analyze this image.",
        file_prefix: "🖼️ (File: ",
        file_suffix: "): ",
        error_server: "❌ Server Error:",
        error_network: "❌ Network Error:",
        thought_prefix: "Thought:"
    }
};

// --- ΑΥΤΟΜΑΤΗ ΑΝΙΧΝΕΥΣΗ ΓΛΩΣΣΑΣ ΣΥΣΤΗΜΑΤΟΣ ---
const getSystemLanguage = () => {
    const lang = navigator.language || navigator.userLanguage; 
    // Αν η γλώσσα ξεκινάει από 'el', επέλεξε ελληνικά, αλλιώς αγγλικά
    return lang.startsWith('el') ? 'el' : 'en';
};

const currentLang = getSystemLanguage();
const langData = i18n[currentLang];

// --- DOM ELEMENTS ---
const promptsContainer = document.querySelector('.prompt-list');
const searchInput = document.getElementById('search');
const askButton = document.getElementById('ask');
const imageButton = document.getElementById('image');
const fileInput = document.getElementById('image-upload');

// --- HELPER FUNCTIONS ---

function initialize() {
    const randomPlaceholder = langData.placeholders[Math.floor(Math.random() * langData.placeholders.length)];
    searchInput.placeholder = randomPlaceholder;
}

function createThoughtDiv(text) {
    const thoughtDiv = document.createElement('div');
    thoughtDiv.className = 'thought';
    thoughtDiv.innerHTML = `<strong>${langData.thought_prefix}</strong> ${text}`;
    return thoughtDiv;
}

function parseResponse(fullText) {
    const thoughtRegex = /<div class="thought">([\s\S]*?)<\/div>/;
    const match = fullText.match(thoughtRegex);
    
    let thoughtText = match ? match[1].trim() : null;
    let answerText = fullText.replace(thoughtRegex, '').trim();
    
    return { thoughtText, answerText };
}

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
});

// --- CORE LOGIC ---

async function sendChat(prompt, imageData = null, mimeType = null) {
    const outputLi = document.createElement('li');
    outputLi.id = 'loading'; 
    outputLi.innerHTML = langData.thoughts[Math.floor(Math.random() * langData.thoughts.length)];
    promptsContainer.appendChild(outputLi);
    promptsContainer.scrollTo(0, promptsContainer.scrollHeight);

    try {
        const endpoint = imageData ? '/api/multimodal-chat' : '/api/chat';
        const body = {
            prompt,
            history: historyArray
        };

        if (imageData) {
            body.image = imageData;
            body.mimeType = mimeType;
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.error) {
            outputLi.innerHTML = `${langData.error_server} ${data.error}`;
        } else {
            const { thoughtText, answerText } = parseResponse(data.text);

            historyArray.push({ role: "user", parts: [{ text: prompt }] });
            historyArray.push({ role: "model", parts: [{ text: answerText }] });

            outputLi.innerHTML = answerText;

            if (thoughtText) {
                outputLi.prepend(createThoughtDiv(thoughtText));
            }
        }
    } catch (error) {
        console.error('Chat Error:', error);
        outputLi.innerHTML = `${langData.error_network} ${error.message}`;
    } finally {
        outputLi.removeAttribute('id');
        searchInput.value = "";
        searchInput.disabled = false;
        askButton.disabled = false;
        imageButton.disabled = false;
        initialize();
        promptsContainer.scrollTo(0, promptsContainer.scrollHeight);
    }
}

// --- EVENT LISTENERS ---

askButton.addEventListener('click', () => {
    const prompt = searchInput.value.trim();
    if (!prompt) return;

    searchInput.disabled = true;
    askButton.disabled = true;
    imageButton.disabled = true;

    const userLi = document.createElement('li');
    userLi.className = 'user-prompt';
    userLi.textContent = prompt;
    promptsContainer.appendChild(userLi);

    sendChat(prompt);
});

searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') askButton.click();
});

imageButton.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const prompt = searchInput.value.trim() || langData.image_prompt_default;
    const base64Image = await toBase64(file);

    const userLi = document.createElement('li');
    userLi.className = 'user-prompt';
    userLi.innerHTML = `${langData.file_prefix}${file.name}${langData.file_suffix}<br>${prompt}`;
    promptsContainer.appendChild(userLi);

    sendChat(prompt, base64Image, file.type);
    fileInput.value = ""; 
});

initialize();
