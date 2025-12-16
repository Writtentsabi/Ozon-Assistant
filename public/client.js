// public/client.js  
  
// Κρατάμε το ιστορικό στον client, καθώς ο server είναι stateless (δεν θυμάται)  
const historyArray = [];   
  
// --- INTERNATIONALIZATION (i18n) & Language Handling ---
const DEFAULT_LANG = 'el'; // Προεπιλεγμένη γλώσσα
const currentLang = localStorage.getItem('appLang') || DEFAULT_LANG;

const i18n = {
    el: {
        placeholders: [
            'Πες μου τη γνώμη σου',  
            'Πώς είσαι σήμερα;',  
            'Τι θα ήθελες να μοιραστείς;',  
            'Πες μου για την ημέρα σου',  
            'Πες μου τις βαθύτερες σκέψεις σου'  
        ],
        thoughts: ['Σκέφτομαι...', 'Χμμμ...', 'Αφήστε με να αποφασίσω...', 'Φορτώνω Μπιπ Μποπ'],
        image_prompt_default: "Ανάλυσε αυτήν την εικόνα.",
        file_prefix: "🖼️ (Αρχείο: ",
        file_suffix: "): ",
        error_server: "❌ Σφάλμα Server:",
        error_network: "❌ Σφάλμα Δικτύου:",
        thought_prefix: "(Σκέψη):"
    },
    en: {
        placeholders: [
            'Tell me your opinion',  
            'How are you today?',  
            'What would you like to share?',  
            'Tell me about your day',  
            'Tell me your deepest thoughts'  
        ],
        thoughts: ['Thinking...', 'Hmmm...', 'Let me decide...', 'LoAdInG BiP BoP'],
        image_prompt_default: "Analyze this image.",
        file_prefix: "🖼️ (File: ",
        file_suffix: "): ",
        error_server: "❌ Server Error:",
        error_network: "❌ Network Error:",
        thought_prefix: "(Thought):"
    }
};

// 1. Βρες τα DOM στοιχεία  
const askButton = document.getElementById('ask');  
const searchInput = document.getElementById('search');  
const promptsContainer = document.querySelector('.prompt-list');  
const imageButton = document.getElementById('image');  
const imageUploadInput = document.getElementById('image-upload'); 
// ΝΕΟ: Κουμπί εναλλαγής γλώσσας (Πρέπει να υπάρχει στο HTML: <button id="language-toggle">EN/EL</button>)
const languageToggle = document.getElementById('language-toggle'); 
  
const thoughtPattern = /<div class=['"]thought['"]>(.*?)<\/div>/s; // RegEx για εξαγωγή της σκέψης (s flag for multi-line)
  
  
// 2. Συνάρτηση Εκκίνησης  
function initialize() {  
    const langData = i18n[currentLang];
    
    // Επαναφορά Placeholder με βάση τη γλώσσα
    if (searchInput) {  
        const input = langData.placeholders;
        searchInput.placeholder = input[Math.floor(Math.random() * input.length)];  
    }
    
    // Ενημέρωση κειμένου στο κουμπί εναλλαγής γλώσσας
    if (languageToggle) {
        languageToggle.textContent = currentLang === 'el' ? 'English (EN)' : 'Ελληνικά (EL)';
    }
}  

// 3. Λογική εναλλαγής γλώσσας
if (languageToggle) {
    languageToggle.addEventListener('click', () => {
        const newLang = currentLang === 'el' ? 'en' : 'el';
        localStorage.setItem('appLang', newLang);
        window.location.reload(); // Ανανέωση της σελίδας για εφαρμογή των αλλαγών
    });
}
  
/**
 * Βοηθητική συνάρτηση για την εμφάνιση των Thoughts
 * @param {string} thoughtText - Το καθαρό κείμενο της σκέψης.
 * @returns {HTMLElement} Το στοιχείο div που δημιουργήθηκε.
 */
function createThoughtDiv(thoughtText) {
    const thoughtDiv = document.createElement('div');
    // Εφαρμογή CSS για να ξεχωρίζει η σκέψη
    thoughtDiv.style.cssText = 'border-left: 3px solid #66b3ff; padding: 5px 10px; margin-top: 10px; font-style: italic; font-size: 0.9em; color: #555; background-color: #f7f7f7; border-radius: 0 5px 5px 0;';
    thoughtDiv.innerHTML = `<strong>${i18n[currentLang].thought_prefix}</strong> ${thoughtText}`;
    return thoughtDiv;
}

/**
 * Βοηθητική συνάρτηση για την ανάλυση της απάντησης και τον διαχωρισμό της σκέψης.
 * @param {string} fullResponse - Η πλήρης απάντηση από τον server.
 * @returns {{answerText: string, thoughtText: string}}
 */
function parseResponse(fullResponse) {
    const match = fullResponse.match(thoughtPattern);
    let answerText = fullResponse;
    let thoughtText = '';

    if (match) {
        thoughtText = match[1].trim(); // Το περιεχόμενο της σκέψης (Group 1)
        answerText = fullResponse.replace(match[0], '').trim(); // Η απάντηση (αφαιρούμε όλο το div)
    }
    return { answerText, thoughtText };
}


// *** ΛΟΓΙΚΗ IMAGE BUTTON *** // Όταν πατηθεί το κουμπί εικόνας, κάνε κλικ στο κρυφό input file 
imageButton.addEventListener('click', () => {  
    imageUploadInput.click(); 
});  
  
  
// *** ΛΟΓΙΚΗ: Όταν επιλεγεί αρχείο (Multimodal Chat) *** imageUploadInput.addEventListener('change', async (event) => { 
    const file = event.target.files[0]; 
    if (!file) return; 
    
    const langData = i18n[currentLang];
  
    // Εμφάνιση ερωτήματος (με το όνομα του αρχείου) 
    const promptText = searchInput.value || langData.image_prompt_default; 
    let inputLi = document.createElement('li');  
    inputLi.setAttribute('class', 'input-prompt');  
    inputLi.innerHTML = `${langData.file_prefix}${file.name}${langData.file_suffix}${promptText}`;  
    promptsContainer.appendChild(inputLi); 
  
    // --- 1. Διαβάζουμε το αρχείο ως Base64 --- 
    const reader = new FileReader(); 
    reader.readAsDataURL(file); 
  
    reader.onloadend = async () => { 
        const base64Data = reader.result.split(',')[1]; // Αφαίρεση του "data:..." prefix 
  
        // --- 2. Εμφάνιση μηνύματος φόρτωσης --- 
        let outputLi = document.createElement('li');  
        outputLi.setAttribute('class', 'output-prompt');  
        outputLi.setAttribute('id', 'output');  
        const thoughts = langData.thoughts;
        outputLi.innerHTML = `<i class=\"fa fa-spinner fa-spin\"></i> ${thoughts[Math.floor(Math.random() * thoughts.length)]}`; 
        promptsContainer.appendChild(outputLi);  
  
        // --- 3. Αλλαγή UI State --- 
        searchInput.disabled = true; 
        askButton.disabled = true; 
        imageButton.disabled = true; 
  
        // --- 4. Fetch to new Multimodal API --- 
        try { 
            const response = await fetch('/api/multimodal-chat', { // ΝΕΟ ENDPOINT 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({  
                    prompt: promptText, 
                    image: base64Data, 
                    mimeType: file.type, 
                    history: historyArray  
                }) 
            }); 
  
            const data = await response.json(); 
            const { answerText, thoughtText } = parseResponse(data.text || '');
  
            // --- 5. ΧΕΙΡΙΣΜΟΣ ΑΠΟΤΕΛΕΣΜΑΤΩΝ --- 
            if (data.error) { 
                outputLi.innerHTML = `${langData.error_server} ${data.error}`; 
            } else { 
                
                // Εμφάνιση της εικόνας που στάλθηκε για επιβεβαίωση 
                let imagePreview = document.createElement('img'); 
                imagePreview.src = reader.result; // Χρησιμοποιούμε το πλήρες DataURL 
                imagePreview.style.maxWidth = '100px';  
                imagePreview.style.borderRadius = '5px'; 
                imagePreview.style.marginBottom = '10px'; 
 
                // Προσθήκη απάντησης στο ιστορικό 
                historyArray.push({ role: "user", parts: [{ text: promptText, inlineData: { mimeType: file.type, data: base64Data } }] }); 
                // Αποθηκεύουμε την καθαρή απάντηση και τη σκέψη ξεχωριστά
                historyArray.push({ role: "model", parts: [{ text: answerText, thought: thoughtText }] }); 
 
                // Ενημέρωση της απάντησης στην οθόνη (πρώτα η εικόνα, μετά η απάντηση)
                outputLi.innerHTML = answerText; 
                outputLi.prepend(imagePreview); // Τοποθετούμε την εικόνα πριν το κείμενο 

                // Εμφάνιση Thoughts, αν υπάρχουν
                if (thoughtText) {
                    outputLi.appendChild(createThoughtDiv(thoughtText));
                }
            } 
  
        } catch (error) { 
            console.error('Fetch/Multimodal Error:', error); 
            outputLi.innerHTML = `${langData.error_network} ${error.message}`; 
        } finally { 
            // --- 6. Επαναφορά UI State --- 
            searchInput.value = ""; 
            searchInput.disabled = false; 
            askButton.disabled = false; 
            imageButton.disabled = false; 
            outputLi.removeAttribute('id');  
            promptsContainer.scrollTo(0, promptsContainer.scrollHeight); 
            imageUploadInput.value = null; // Καθαρισμός του input file 
            initialize(); 
        } 
    }; 
}); 
  
// *** ΛΟΓΙΚΗ CHAT *** // 3. Λογική Κλικ για Chat 
askButton.addEventListener('click', async () => {  
  
    const prompt = searchInput.value;  
    if (!prompt) return;  
    
    const langData = i18n[currentLang];
  
    // --- 1. Εμφάνιση ερωτήματος χρήστη (DOM Logic) ---  
    let inputLi = document.createElement('li');  
    inputLi.setAttribute('class', 'input-prompt');  
    inputLi.innerHTML = prompt;  
    promptsContainer.appendChild(inputLi);  
  
    // --- 2. Εμφάνιση μηνύματος φόρτωσης (DOM Logic) ---  
    let outputLi = document.createElement('li');  
    outputLi.setAttribute('class', 'output-prompt');  
    outputLi.setAttribute('id', 'output');  
    const thoughts = langData.thoughts;
    outputLi.innerHTML = `<i class=\"fa fa-spinner fa-spin\"></i> ${thoughts[Math.floor(Math.random() * thoughts.length)]}`; 
    promptsContainer.appendChild(outputLi);  
  
    // --- 3. Αλλαγή UI State --- 
    searchInput.disabled = true; 
    askButton.disabled = true; 
    imageButton.disabled = true; 
  
    // --- 4. Fetch the Chat API --- 
    try { 
        const response = await fetch('/api/chat', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({  
                prompt: prompt, 
                history: historyArray  
            }) 
        }); 
  
        const data = await response.json(); 
        const { answerText, thoughtText } = parseResponse(data.text || '');

        // 5. ΧΕΙΡΙΣΜΟΣ ΑΠΟΤΕΛΕΣΜΑΤΩΝ (DOM Logic) 
        if (data.error) { 
            outputLi.innerHTML = `${langData.error_server} ${data.error}`; 
        } else { 
            // Προσθήκη απάντησης στο ιστορικό 
            historyArray.push({ role: "user", parts: [{ text: prompt }] }); 
            // Αποθηκεύουμε την καθαρή απάντηση και τη σκέψη ξεχωριστά
            historyArray.push({ role: "model", parts: [{ text: answerText, thought: thoughtText }] }); 
 
            // Ενημέρωση της απάντησης στην οθόνη 
            outputLi.innerHTML = answerText; 

            // Εμφάνιση Thoughts, αν υπάρχουν
            if (thoughtText) {
                outputLi.appendChild(createThoughtDiv(thoughtText));
            }
        } 
  
    } catch (error) { 
        console.error('Fetch/Chat Error:', error); 
        outputLi.innerHTML = `${langData.error_network} ${error.message}`; 
    } finally { 
        // --- 5. Επαναφορά UI State --- 
        searchInput.value = ""; 
        searchInput.disabled = false; 
        askButton.disabled = false; 
        imageButton.disabled = false; 
        outputLi.removeAttribute('id'); // Αφαιρούμε το ID από την τελευταία απάντηση 
        promptsContainer.scrollTo(0, promptsContainer.scrollHeight); // Scroll to bottom 
        initialize(); // Επαναφορά placeholder 
    } 
}); 
  
// 5. Λογική Enter Key  
searchInput.addEventListener('keydown', (event) => {  
    if (event.key === 'Enter') {  
        if (imageButton.disabled) return; 
        askButton.click(); 
    }  
});  
  
// 6. Εκκίνηση  
initialize();
